#include "ble.h"
#include "StateManager.h"

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
    DEBUG_SERIAL_PRINTF("Base64 decode failed, Error code: %d\n", ret);
    stateManager->setState(ERROR);
    return;
  }

  if (!session->computeSharedSecret(peerKeyArray, peerKeyLen, base64Input)) {
    DEBUG_SERIAL_PRINTLN("Shared secret computed and AES key derived successfully");
    memcpy(clientPubKey, base64Input, copyLen + 1);
    clientPubKeyLen = copyLen;
    stateManager->setState(READY);
    notifyResponsePacket(toothpaste_ResponsePacket_ResponseType_CHALLENGE, session->sessionSalt, sizeof(session->sessionSalt));
  }
  else {
    DEBUG_SERIAL_PRINTF("Shared secret computation or key derivation failed!\n");
    stateManager->setState(ERROR);
  }

  stateManager->setState(READY);
  DEBUG_SERIAL_PRINTLN("Pairing mode disabled.");
}

// Check whether a reconnecting client is enrolled; derive the session key if so
void authenticateClient(toothpaste_DataPacket* packet, SecureSession* session)
{
  DEBUG_SERIAL_PRINTLN("Entered authenticateClient");

  // AUTH packets carry the unencrypted public key in the encryptedData field
  clientPubKeyLen = (packet->encryptedData.size < sizeof(clientPubKey) - 1)
                    ? packet->encryptedData.size : sizeof(clientPubKey) - 1;
  memcpy(clientPubKey, packet->encryptedData.bytes, clientPubKeyLen);
  clientPubKey[clientPubKeyLen] = '\0';

  if (!session->loadIfEnrolled(clientPubKey)) {
    DEBUG_SERIAL_PRINTLN("Client is not enrolled");
    notifyResponsePacket(toothpaste_ResponsePacket_ResponseType_PEER_UNKNOWN, nullptr, 0);
    stateManager->setState(UNPAIRED);
    return;
  }

  DEBUG_SERIAL_PRINTLN("Client is enrolled");

  // Todo: challenge-response verification before READY to prevent MITM enrollment attacks
  int ret = session->deriveAESKeyFromSecret(clientPubKey);
  if (ret != 0) {
    DEBUG_SERIAL_PRINTF("Failed to derive session AES key: %d\n", ret);
    notifyResponsePacket(toothpaste_ResponsePacket_ResponseType_PEER_UNKNOWN, nullptr, 0);
    stateManager->setState(ERROR);
    return;
  }

  notifyResponsePacket(toothpaste_ResponsePacket_ResponseType_CHALLENGE, session->sessionSalt, sizeof(session->sessionSalt));
  stateManager->setState(READY);
}
