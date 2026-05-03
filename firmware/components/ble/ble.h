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

#define FIRMWARE_VERSION "0.9.0"
#define BLE_DEVICE_DEFAULT_NAME     "Toothpaste"
#define SERVICE_UUID        "19b10000-e8f2-537e-4f6c-d104768a1214"


#define TX_TO_TOOTHPASTE_CHARACTERISTIC "6856e119-2c7b-455a-bf42-cf7ddd2c5907"
#define RESPONSE_CHARACTERISTIC "6856e119-2c7b-455a-bf42-cf7ddd2c5908"
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

// Max serialized DataPacket: IV(14) + encryptedData(231) + authTag(22) + scalars(~11) ≈ 278 bytes
#define BLE_MAX_RAW_PACKET 320

struct RawPacket {
    uint8_t  data[BLE_MAX_RAW_PACKET];
    uint16_t len;
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
void packetTask(void* params);
void notifyResponsePacket(toothpaste_ResponsePacket_ResponseType responseType, const uint8_t* challengeData, size_t challengeDataLen);


#endif // BLE_H