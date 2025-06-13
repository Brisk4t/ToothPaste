#include <Arduino.h>
#include <hid.h>
#include <main.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#include <mbedtls/ecdh.h> // Test import to confirm library compatibility

bool deviceConnected = false;
bool oldDeviceConnected = false;
const int ledPin = 2; // Use the appropriate GPIO pin for your setup

uint32_t value = 0;



BLEServer* pServer = NULL; // Pointer to the BLE Server instance
BLECharacteristic* pSensorCharacteristic = NULL; // Characteristic for sensor data
BLECharacteristic* pLedCharacteristic = NULL; // Characteristic for LED control




class MyServerCallbacks: public BLEServerCallbacks { // Callback handler for BLE Connection events
  void onConnect(BLEServer* pServer) {
    deviceConnected = true;
  };

  void onDisconnect(BLEServer* pServer) {
    deviceConnected = false;
  }
};

class MyCharacteristicCallbacks : public BLECharacteristicCallbacks { // Callback handler for BLE Characteristic events
  void onWrite(BLECharacteristic* pSensorCharacteristic) {
    String value = String(pSensorCharacteristic->getValue().c_str());
    if (value.length() > 0) {
      sendString(value.c_str());
    }

    digitalWrite(LED_BUILTIN, 1);
    delay(2000);
    digitalWrite(LED_BUILTIN, 0);
  }
};


void bleSetup(){
    pinMode(BUILTIN_LED, OUTPUT);

    // Create the BLE Device
    BLEDevice::init("ClipBoard");

    // Create the BLE Server
    pServer = BLEDevice::createServer();
    pServer->setCallbacks(new MyServerCallbacks());

    // Create the BLE Service
    BLEService *pService = pServer->createService(SERVICE_UUID);

    // Create a BLE Characteristic
    pSensorCharacteristic = pService->createCharacteristic(
                        INPUT_STRING_CHARACTERISTIC,
                        BLECharacteristic::PROPERTY_READ   |
                        BLECharacteristic::PROPERTY_WRITE  |
                        BLECharacteristic::PROPERTY_NOTIFY |
                        BLECharacteristic::PROPERTY_INDICATE
                        );

    // Create the ON button Characteristic
    pLedCharacteristic = pService->createCharacteristic(
                        LED_CHARACTERISTIC_UUID,
                        BLECharacteristic::PROPERTY_WRITE
                        );

    // Register the callback for the ON button characteristic
    pSensorCharacteristic->setCallbacks(new MyCharacteristicCallbacks());

    // https://www.bluetooth.com/specifications/gatt/viewer?attributeXmlFile=org.bluetooth.descriptor.gatt.client_characteristic_configuration.xml
    // Create a BLE Descriptor
    pSensorCharacteristic->addDescriptor(new BLE2902());
    pLedCharacteristic->addDescriptor(new BLE2902());

    // Start the service
    pService->start();

    // Start advertising
    BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setScanResponse(false);
    pAdvertising->setMinPreferred(0x0);  // set value to 0x00 to not advertise this parameter
    BLEDevice::startAdvertising();
    
    digitalWrite(BUILTIN_LED, HIGH);
}

void setup() {
  hidSetup();
  bleSetup();
  Serial.println("Waiting a client connection to notify...");
}

void loop() {
  // notify changed value
  if (deviceConnected) {
    pSensorCharacteristic->setValue(String(value).c_str());
    pSensorCharacteristic->notify();
    value++;
    delay(300); // bluetooth stack will go into congestion, if too many packets are sent, in 6 hours test i was able to go as low as 3ms
  }
  // disconnecting
  if (!deviceConnected && oldDeviceConnected) {
    Serial.println("Device disconnected.");
    pServer->startAdvertising(); // restart advertising
    Serial.println("Start advertising");
    oldDeviceConnected = deviceConnected;
  }
  // connecting
  if (deviceConnected && !oldDeviceConnected) {
    // do stuff here on connecting
    oldDeviceConnected = deviceConnected;
    Serial.println("Device Connected");
  }
}
