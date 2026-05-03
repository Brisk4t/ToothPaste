#include "ble.h"
#include "StateManager.h"
#include "esp_system.h"

#include "pb_decode.h"
#include "pb_encode.h"
#include "pb_common.h"

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
    DEBUG_SERIAL_PRINTF("[BLE] Decryption failed (err %d)\n", ret);
    stateManager->setState(DROP);
    return;
  }

  pb_istream_t stream = pb_istream_from_buffer(decrypted_bytes, packet->dataLen);
  if (!pb_decode(&stream, toothpaste_EncryptedData_fields, &decrypted)) {
    DEBUG_SERIAL_PRINTF("[BLE] Protobuf decode failed: %s\n", PB_GET_ERROR(&stream));
    return;
  }

  stateManager->setState(READY);

  switch (decrypted.which_packetData) {
    case toothpaste_EncryptedData_keyboardPacket_tag:
    {
      auto& kp = decrypted.packetData.keyboardPacket;
      DEBUG_SERIAL_PRINTF("[BLE] KEYBOARD  decrypt=%lldus  len=%lu  slow=%d  msg=\"%.*s\"\n",
        decryptUs, packet->dataLen, packet->slowMode,
        (int)kp.length, kp.message);
      sendString(kp.message, kp.length, packet->slowMode);
      break;
    }

    case toothpaste_EncryptedData_keycodePacket_tag:
    {
      auto& kc = decrypted.packetData.keycodePacket;
      DEBUG_SERIAL_PRINTF("[BLE] KEYCODE   decrypt=%lldus  slow=%d  codes=",
        decryptUs, packet->slowMode);
      for (int i = 0; i < 6; i++) {
        DEBUG_SERIAL_PRINTF("%02X ", kc.code.bytes[i]);
      }
      DEBUG_SERIAL_PRINTLN("");
      sendKeycode(kc.code.bytes, packet->slowMode, true);
      break;
    }

    case toothpaste_EncryptedData_mousePacket_tag:
    {
      auto& mp = decrypted.packetData.mousePacket;
      DEBUG_SERIAL_PRINTF("[BLE] MOUSE     decrypt=%lldus  frames=%lu  L=%ld R=%ld wheel=%ld\n",
        decryptUs, mp.num_frames, mp.l_click, mp.r_click, mp.wheel);
      moveMouse(mp);
      break;
    }

    case toothpaste_EncryptedData_consumerControlPacket_tag:
    {
      auto& cp = decrypted.packetData.consumerControlPacket;
      DEBUG_SERIAL_PRINTF("[BLE] CONSUMER  decrypt=%lldus  count=%lu  codes=",
        decryptUs, cp.length);
      for (size_t i = 0; i < cp.length; i++) {
        DEBUG_SERIAL_PRINTF("0x%04X ", cp.code[i]);
      }
      DEBUG_SERIAL_PRINTLN("");
      consumerControlPress(cp);
      break;
    }

    case toothpaste_EncryptedData_mouseJigglePacket_tag:
    {
      bool enable = decrypted.packetData.mouseJigglePacket.enable;
      DEBUG_SERIAL_PRINTF("[BLE] JIGGLE    decrypt=%lldus  state=%s\n",
        decryptUs, enable ? "ON" : "OFF");
      enable ? startJiggle() : stopJiggle();
      break;
    }

    case toothpaste_EncryptedData_renamePacket_tag:
    {
      auto& rp = decrypted.packetData.renamePacket;
      DEBUG_SERIAL_PRINTF("[BLE] RENAME    decrypt=%lldus  name=\"%s\"\n",
        decryptUs, rp.message);
      int renameRet = session->setDeviceName(rp.message);
      DEBUG_SERIAL_PRINTF("[BLE] Rename status=%d  rebooting...\n", renameRet);
      esp_restart();
      break;
    }

    default:
      DEBUG_SERIAL_PRINTF("[BLE] UNKNOWN   decrypt=%lldus  tag=%d\n",
        decryptUs, decrypted.which_packetData);
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
    DEBUG_SERIAL_PRINTF("Encoding response packet failed: %s\n", PB_GET_ERROR(&stream));
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
        DEBUG_SERIAL_PRINTF("[BLE] Outer decode failed: %s\n", PB_GET_ERROR(&istream));
      }

      if (toothPacket.packetID == toothpaste_DataPacket_PacketID_DATA_PACKET) {
        DEBUG_SERIAL_PRINTF("[BLE] DATA  raw=%uB  payload=%luB  slow=%d  pkt=%ld/%ld\n",
          pkt.len, toothPacket.dataLen, toothPacket.slowMode,
          toothPacket.packetNumber, toothPacket.totalPackets);
        decryptSendString(&toothPacket, session);
      }
      else if (toothPacket.packetID == toothpaste_DataPacket_PacketID_AUTH_PACKET) {
        bool pairing = (stateManager->getState() == PAIRING);
        DEBUG_SERIAL_PRINTF("[BLE] AUTH  raw=%uB  mode=%s\n",
          pkt.len, pairing ? "PAIRING" : "RECONNECT");
        if (pairing) {
          generateSharedSecret(&toothPacket, session);
        }
        else {
          authenticateClient(&toothPacket, session);
        }
      }

      DEBUG_SERIAL_PRINTF("[BLE] Task cycle: %lld us\n", esp_timer_get_time() - t0);
    }
  }
}
