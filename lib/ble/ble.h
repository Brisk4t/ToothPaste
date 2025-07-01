#ifndef BLE_H
#define BLE_H
#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#include "espHID.h"
#include "secureSession.h"

#define PACKET_DATA_SIZE 240

#define SERVICE_UUID        "19b10000-e8f2-537e-4f6c-d104768a1214"
#define INPUT_STRING_CHARACTERISTIC "6856e119-2c7b-455a-bf42-cf7ddd2c5907"
#define LED_CHARACTERISTIC_UUID "19b10002-e8f2-537e-4f6c-d104768a1214"


struct clipPacket{
    uint8_t slow = 0; // 1 byte for slowmode flag
    uint8_t packetNo = 0; // 1 byte for packet number
    uint8_t ciphertextLen = PACKET_DATA_SIZE; // 1 byte for len of each packet
    char ciphertext[PACKET_DATA_SIZE]; 
    
};

struct SharedSecretTaskParams {
      SecureSession* session;
      std::string* rawValue;
};

void bleSetup(SecureSession* session);
void generateSharedSecret(void* sessionParams);
void disconnect();
void enablePairingMode();

#endif // BLE_H