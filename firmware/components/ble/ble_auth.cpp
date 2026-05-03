#include "ble.h"
#include "StateManager.h"

static const char* TAG = "BLE_AUTH";

// Derive a new ECDH shared secret and session AES key from a pairing AUTH packet
void generateSharedSecret(toothpaste_DataPacket* packet, SecureSession* session)
{
  uint8_t peerKeyArray[66];
  size_t peerKeyLen = 0;

  // Copy the base64 key bytes into a null-terminated char array
  size_t base64InputLen = packet->dataLen;
  char base64Input[70];
  size_t copyLen = (base64InputLen < sizeof(base64Input) - 1) ? base64InputLen : sizeof(base64Input) - 1;
  memcpy(base64Input, packet->encryptedData.bytes, copyLen);
  base64Input[copyLen] = '\0';

  int ret = mbedtls_base64_decode(
    peerKeyArray,
    sizeof(peerKeyArray),
    &peerKeyLen,
    packet->encryptedData.bytes,
    base64InputLen);

  if (ret != 0) {
    ESP_LOGE(TAG, "Base64 decode failed, err %d", ret);
    stateManager->setState(ERROR);
    return;
  }

  if (!session->computeSharedSecret(peerKeyArray, peerKeyLen, base64Input)) {
    ESP_LOGI(TAG, "Shared secret computed, AES key derived");
    memcpy(clientPubKey, base64Input, copyLen + 1);
    clientPubKeyLen = copyLen;
    stateManager->setState(READY);
    notifyResponsePacket(toothpaste_ResponsePacket_ResponseType_CHALLENGE, session->sessionSalt, sizeof(session->sessionSalt));
  }
  else {
    ESP_LOGE(TAG, "Shared secret computation failed");
    stateManager->setState(ERROR);
  }

  stateManager->setState(READY);
  ESP_LOGI(TAG, "Pairing mode disabled");
}

// Check whether a reconnecting client is enrolled; derive the session key if so
void authenticateClient(toothpaste_DataPacket* packet, SecureSession* session)
{
  ESP_LOGD(TAG, "Entered authenticateClient");

  // AUTH packets carry the unencrypted public key in the encryptedData field
  clientPubKeyLen = (packet->encryptedData.size < sizeof(clientPubKey) - 1)
                    ? packet->encryptedData.size : sizeof(clientPubKey) - 1;
  memcpy(clientPubKey, packet->encryptedData.bytes, clientPubKeyLen);
  clientPubKey[clientPubKeyLen] = '\0';

  if (!session->loadIfEnrolled(clientPubKey)) {
    ESP_LOGW(TAG, "Client not enrolled");
    notifyResponsePacket(toothpaste_ResponsePacket_ResponseType_PEER_UNKNOWN, nullptr, 0);
    stateManager->setState(UNPAIRED);
    return;
  }

  ESP_LOGI(TAG, "Client enrolled");

  // Todo: challenge-response verification before READY to prevent MITM enrollment attacks
  int ret = session->deriveAESKeyFromSecret(clientPubKey);
  if (ret != 0) {
    ESP_LOGE(TAG, "Failed to derive session AES key: %d", ret);
    notifyResponsePacket(toothpaste_ResponsePacket_ResponseType_PEER_UNKNOWN, nullptr, 0);
    stateManager->setState(ERROR);
    return;
  }

  notifyResponsePacket(toothpaste_ResponsePacket_ResponseType_CHALLENGE, session->sessionSalt, sizeof(session->sessionSalt));
  stateManager->setState(READY);
}
