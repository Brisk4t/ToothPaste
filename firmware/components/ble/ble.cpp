#include "ble.h"
#include "NeoPixelRMT.h"
#include "StateManager.h"
#include "esp_log.h"

// Global definitions — declared extern in ble.h for use by ble_auth.cpp and ble_dispatch.cpp
BLEServer*         bluServer              = NULL;
BLECharacteristic* inputCharacteristic    = NULL;
BLECharacteristic* responseCharacteristic = NULL;
BLECharacteristic* macCharacteristic      = NULL;

QueueHandle_t packetQueue  = xQueueCreate(20, sizeof(RawPacket));
bool          manualDisconnect = false;

char   clientPubKey[70];
size_t clientPubKeyLen = 0;

static void createPacketTask(SecureSession* sec) {
  xTaskCreatePinnedToCore(
    packetTask,
    "PacketWorker",
    8192,
    sec, // persistent task shares 1 ECDH session
    1,
    nullptr,
    1
  );
}

// Handle Connect
void DeviceServerCallbacks::onConnect(BLEServer* bluServer)
{
  int connectedCount = bluServer->getConnectedCount();

  if (connectedCount == 0) {
    esp_ble_tx_power_set(ESP_BLE_PWR_TYPE_CONN_HDL0, ESP_PWR_LVL_P9); // max power once connected
    stateManager->setState(UNPAIRED);
  }
  // TODO: improve multi-client rejection strategy
  else {
    uint16_t newClient = bluServer->getConnId();
    bluServer->disconnect(newClient);
  }
}

// Handle Disconnect
void DeviceServerCallbacks::onDisconnect(BLEServer* bluServer)
{
  // getConnectedCount() hasn't decremented yet when this fires, so still shows 1 at true disconnect
  if (bluServer->getConnectedCount() <= 1) {
    if (manualDisconnect) {
      manualDisconnect = false;
      stateManager->setState(NOT_CONNECTED);
      return;
    }
    stateManager->setState(DISCONNECTED);
    bluServer->startAdvertising();
  }
}

// Callback constructor for BLE Input Characteristic events
InputCharacteristicCallbacks::InputCharacteristicCallbacks(SecureSession* session) : session(session) {}

// Receive an incoming BLE write, validate length, and push raw bytes onto the packet queue
void InputCharacteristicCallbacks::onWrite(BLECharacteristic* inputCharacteristic)
{
  int64_t t0 = esp_timer_get_time();
  const uint8_t* bleData = inputCharacteristic->getData();
  size_t bleLen = inputCharacteristic->getLength();

  if (bleLen == 0 || session == nullptr) return;

  if (bleLen < SecureSession::IV_SIZE + SecureSession::TAG_SIZE + SecureSession::HEADER_SIZE) {
    DEBUG_SERIAL_PRINTLN("Characteristic too short!");
    DEBUG_SERIAL_PRINTF("Received length: %d\n\r", bleLen);
    stateManager->setState(DROP);
    return;
  }

  DEBUG_SERIAL_PRINTF("Received data on Input Characteristic: %d bytes\n\r", bleLen);

  RawPacket pkt;
  pkt.len = (bleLen < BLE_MAX_RAW_PACKET) ? (uint16_t)bleLen : (uint16_t)BLE_MAX_RAW_PACKET;
  memcpy(pkt.data, bleData, pkt.len);

  DEBUG_SERIAL_PRINTF("Packet Queuing took %lld us\n", esp_timer_get_time() - t0);

  if (xQueueSend(packetQueue, &pkt, 0) != pdTRUE) {
    DEBUG_SERIAL_PRINTLN("Packet queue full! Dropping packet.");
    stateManager->setState(DROP);
  }
}

// Initialise BLE server, characteristics, and advertising
void bleSetup(SecureSession* session)
{
  createPacketTask(session);
  startKeyboardTask();

  String deviceName;
  session->getDeviceName(deviceName);
  DEBUG_SERIAL_PRINTF("Device Name is: %s", deviceName.c_str());

  BLEDevice::init(deviceName.length() > 0 ? deviceName.c_str() : BLE_DEVICE_DEFAULT_NAME);

  bluServer = BLEDevice::createServer();
  bluServer->setCallbacks(new DeviceServerCallbacks());

  BLEService* pService = bluServer->createService(SERVICE_UUID);

  inputCharacteristic = pService->createCharacteristic(
    TX_TO_TOOTHPASTE_CHARACTERISTIC,
    BLECharacteristic::PROPERTY_READ     |
    BLECharacteristic::PROPERTY_WRITE_NR |
    BLECharacteristic::PROPERTY_NOTIFY   |
    BLECharacteristic::PROPERTY_INDICATE);
  inputCharacteristic->setCallbacks(new InputCharacteristicCallbacks(session));

  responseCharacteristic = pService->createCharacteristic(
    RESPONSE_CHARACTERISTIC,
    BLECharacteristic::PROPERTY_NOTIFY);

  macCharacteristic = pService->createCharacteristic(
    MAC_CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ |
    BLECharacteristic::PROPERTY_NOTIFY);

  uint64_t mac = ESP.getEfuseMac();
  uint8_t initialValue[6];
  for (int i = 0; i < 6; i++) {
    initialValue[i] = (mac >> (8 * (5 - i))) & 0xFF;
  }
  macCharacteristic->setValue(initialValue, 6);

  pService->start();

  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x0);
  BLEDevice::startAdvertising();
}
