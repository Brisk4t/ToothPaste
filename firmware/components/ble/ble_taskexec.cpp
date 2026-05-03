#include "ble.h"
#include "StateManager.h"
#include "esp_system.h"

#include "pb_decode.h"
#include "pb_encode.h"
#include "pb_common.h"

static const char* TAG = "BLE_TASK";

// Decrypt a data packet and dispatch its payload to the appropriate HID function
void decryptSendString(toothpaste_DataPacket* packet, SecureSession* session)
{
  int64_t t0 = esp_timer_get_time();

  // Average decryption time: ~377us with key caching; ~13ms without
  // Max encryptedData field is 228 bytes; +2 matches the original buffer sizing
  uint8_t decrypted_bytes[230];
  toothpaste_EncryptedData decrypted = toothpaste_EncryptedData_init_default;

  int ret = session->decrypt(packet, decrypted_bytes, clientPubKey);
  int64_t decryptUs = esp_timer_get_time() - t0;

  if (ret != 0) {
    ESP_LOGE(TAG, "Decryption failed (err %d)", ret);
    stateManager->setState(DROP);
    return;
  }

  pb_istream_t stream = pb_istream_from_buffer(decrypted_bytes, packet->dataLen);
  if (!pb_decode(&stream, toothpaste_EncryptedData_fields, &decrypted)) {
    ESP_LOGE(TAG, "Protobuf decode failed: %s", PB_GET_ERROR(&stream));
    return;
  }

  stateManager->setState(READY);

  switch (decrypted.which_packetData) {
    case toothpaste_EncryptedData_keyboardPacket_tag:
    {
      auto& kp = decrypted.packetData.keyboardPacket;
      ESP_LOGD(TAG, "KEYBOARD  decrypt=%lldus  len=%lu  slow=%d  msg=\"%.*s\"",
        decryptUs, packet->dataLen, packet->slowMode,
        (int)kp.length, kp.message);
      sendString(kp.message, kp.length, packet->slowMode);
      break;
    }

    case toothpaste_EncryptedData_keycodePacket_tag:
    {
      auto& kc = decrypted.packetData.keycodePacket;
      char hexbuf[19];
      for (int i = 0; i < 6; i++) snprintf(hexbuf + i*3, 4, "%02X ", kc.code.bytes[i]);
      ESP_LOGD(TAG, "KEYCODE   decrypt=%lldus  slow=%d  codes=%s", decryptUs, packet->slowMode, hexbuf);
      sendKeycode(kc.code.bytes, packet->slowMode, true);
      break;
    }

    case toothpaste_EncryptedData_mousePacket_tag:
    {
      auto& mp = decrypted.packetData.mousePacket;
      ESP_LOGD(TAG, "MOUSE     decrypt=%lldus  frames=%lu  L=%ld R=%ld wheel=%ld",
        decryptUs, mp.num_frames, mp.l_click, mp.r_click, mp.wheel);
      moveMouse(mp);
      break;
    }

    case toothpaste_EncryptedData_consumerControlPacket_tag:
    {
      auto& cp = decrypted.packetData.consumerControlPacket;
      char codebuf[64] = {};
      int cpos = 0;
      for (size_t i = 0; i < cp.length && cpos < (int)sizeof(codebuf) - 7; i++)
        cpos += snprintf(codebuf + cpos, sizeof(codebuf) - cpos, "0x%04lX ", (unsigned long)cp.code[i]);
      ESP_LOGD(TAG, "CONSUMER  decrypt=%lldus  count=%lu  codes=%s", decryptUs, cp.length, codebuf);
      consumerControlPress(cp);
      break;
    }

    case toothpaste_EncryptedData_mouseJigglePacket_tag:
    {
      bool enable = decrypted.packetData.mouseJigglePacket.enable;
      ESP_LOGD(TAG, "JIGGLE    decrypt=%lldus  state=%s", decryptUs, enable ? "ON" : "OFF");
      enable ? startJiggle() : stopJiggle();
      break;
    }

    case toothpaste_EncryptedData_renamePacket_tag:
    {
      auto& rp = decrypted.packetData.renamePacket;
      ESP_LOGD(TAG, "RENAME    decrypt=%lldus  name=\"%s\"", decryptUs, rp.message);
      int renameRet = session->setDeviceName(rp.message);
      ESP_LOGI(TAG, "Rename status=%d, rebooting", renameRet);
      esp_restart();
      break;
    }

    default:
      ESP_LOGW(TAG, "UNKNOWN   decrypt=%lldus  tag=%d", decryptUs, decrypted.which_packetData);
      break;
  }
}

// Send a protobuf ResponsePacket to the client via BLE notify
void notifyResponsePacket(toothpaste_ResponsePacket_ResponseType responseType, const uint8_t* challengeData, size_t challengeDataLen)
{
  uint8_t buffer[256];
  pb_ostream_t stream = pb_ostream_from_buffer(buffer, sizeof(buffer));

  toothpaste_ResponsePacket responsePacket = toothpaste_ResponsePacket_init_default;
  strncpy(responsePacket.firmwareVersion, FIRMWARE_VERSION, sizeof(responsePacket.firmwareVersion) - 1);
  responsePacket.firmwareVersion[sizeof(responsePacket.firmwareVersion) - 1] = '\0';
  responsePacket.responseType = responseType;

  if (challengeData != nullptr && challengeDataLen > 0) {
    size_t copyLen = (challengeDataLen < sizeof(responsePacket.challengeData.bytes))
                     ? challengeDataLen : sizeof(responsePacket.challengeData.bytes);
    memcpy(responsePacket.challengeData.bytes, challengeData, copyLen);
    responsePacket.challengeData.size = copyLen;
  }

  if (!pb_encode(&stream, toothpaste_ResponsePacket_fields, &responsePacket)) {
    ESP_LOGE(TAG, "Encoding response packet failed: %s", PB_GET_ERROR(&stream));
    return;
  }

  responseCharacteristic->setValue(buffer, stream.bytes_written);
  responseCharacteristic->notify();
}

// Persistent RTOS task: receives raw BLE packets, decodes protobuf, routes to auth or data path
void packetTask(void* params)
{
  SecureSession* session = static_cast<SecureSession*>(params);
  RawPacket pkt;

  while (true) {
    if (xQueueReceive(packetQueue, &pkt, portMAX_DELAY) == pdTRUE) {
      int64_t t0 = esp_timer_get_time();

      toothpaste_DataPacket toothPacket = toothpaste_DataPacket_init_default;
      pb_istream_t istream = pb_istream_from_buffer(pkt.data, pkt.len);
      if (!pb_decode(&istream, toothpaste_DataPacket_fields, &toothPacket)) {
        ESP_LOGE(TAG, "Outer decode failed: %s", PB_GET_ERROR(&istream));
      }

      if (toothPacket.packetID == toothpaste_DataPacket_PacketID_DATA_PACKET) {
        ESP_LOGD(TAG, "DATA  raw=%uB  payload=%luB  slow=%d  pkt=%ld/%ld",
          pkt.len, toothPacket.dataLen, toothPacket.slowMode,
          toothPacket.packetNumber, toothPacket.totalPackets);
        decryptSendString(&toothPacket, session);
      }
      else if (toothPacket.packetID == toothpaste_DataPacket_PacketID_AUTH_PACKET) {
        bool pairing = (stateManager->getState() == PAIRING);
        ESP_LOGD(TAG, "AUTH  raw=%uB  mode=%s", pkt.len, pairing ? "PAIRING" : "RECONNECT");
        if (pairing) {
          generateSharedSecret(&toothPacket, session);
        }
        else {
          authenticateClient(&toothPacket, session);
        }
      }

      ESP_LOGD(TAG, "Task cycle: %lld us", esp_timer_get_time() - t0);
    }
  }
}
