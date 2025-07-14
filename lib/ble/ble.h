#ifndef BLE_H
#define BLE_H
#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#include "espHID.h"
#include "secureSession.h"

#define SERVICE_UUID        "19b10000-e8f2-537e-4f6c-d104768a1214"
#define INPUT_STRING_CHARACTERISTIC "6856e119-2c7b-455a-bf42-cf7ddd2c5907"
#define HID_SEMAPHORE_CHARCTERISTIC "6856e119-2c7b-455a-bf42-cf7ddd2c5908"
#define LED_CHARACTERISTIC_UUID "19b10002-e8f2-537e-4f6c-d104768a1214"

struct NotificationPacket {
    uint8_t packetType; // [0] = KeepAlive, [1] = Ready to Receive, [2] = Not ready to receive 
    uint8_t authStatus; // [0] = Failed, [1] = Succeeded
};

struct SharedSecretTaskParams {
      SecureSession* session;
      std::string* rawValue;
      const char* base64pubKey;
};


class DeviceServerCallbacks : public BLEServerCallbacks{
    public:
        void onConnect(BLEServer *bluServer);
        void onDisconnect(BLEServer * bluServer);
};

class InputCharacteristicCallbacks : public BLECharacteristicCallbacks{
    public:
        InputCharacteristicCallbacks(SecureSession *session);
        void onWrite(BLECharacteristic *inputCharacteristic);

    private:
        SecureSession *session;
};

void bleSetup(SecureSession* session);
void generateSharedSecret(SecureSession::rawDataPacket* packet, SecureSession* session);
void disconnect();
void enablePairingMode();
void packetTask(void *sessionParams);
void notifyClient(const uint8_t data);
void packetTask(void* params);
void queuenotify();

#endif // BLE_H