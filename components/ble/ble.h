#ifndef BLE_H
#define BLE_H
#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#include "SerialDebug.h"
#include "espHID.h"
#include "secureSession.h"
#include "toothpacket.pb.h"

#define BLE_DEVICE_DEFAULT_NAME     "Toothpaste"
#define SERVICE_UUID        "19b10000-e8f2-537e-4f6c-d104768a1214"

#define TX_TO_TOOTHPASTE_CHARACTERISTIC "6856e119-2c7b-455a-bf42-cf7ddd2c5907"
#define TOOTHPASTE_TO_TX_CHARACTERISTIC "6856e119-2c7b-455a-bf42-cf7ddd2c5908"
#define MAC_CHARACTERISTIC_UUID "19b10002-e8f2-537e-4f6c-d104768a1214"

enum NotificationType : uint8_t {
    KEEPALIVE,
    RECV_READY,
    RECV_NOT_READY
};

enum AuthStatus : uint8_t {
    AUTH_FAILED,
    AUTH_SUCCESS
};

struct NotificationPacket {
    NotificationType packetType;
    AuthStatus authStatus; // [0] = Failed, [1] = Succeeded
};

struct SharedSecretTaskParams {
      SecureSession* session;
      std::vector<uint8_t> rawValue;
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
void generateSharedSecret(toothpaste_DataPacket* packet, SecureSession* session);
void disconnect();
void enablePairingMode();
void packetTask(void *sessionParams);
void notifyClient(const uint8_t* data, int length);
void packetTask(void* params);
void queuenotify();

#endif // BLE_H