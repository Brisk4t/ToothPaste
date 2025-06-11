#include <Arduino.h>
#include <bluefruit.h>
#include <Adafruit_nRFCrypto.h>
#include <Adafruit_TinyUSB.h>

#define LED PIN_015
#define SERVICE_UUID        "19b10000-e8f2-537e-4f6c-d104768a1214"
#define INPUT_STRING_CHARACTERISTIC "6856e119-2c7b-455a-bf42-cf7ddd2c5907"
#define LED_CHARACTERISTIC_UUID "19b10002-e8f2-537e-4f6c-d104768a1214"



bool deviceConnected = false;
bool oldDeviceConnected = false;
uint32_t value = 0;
uint8_t const desc_hid_report[] = {
    TUD_HID_REPORT_DESC_KEYBOARD()
};


Adafruit_USBD_HID keyboard;

BLEService pService = BLEService(SERVICE_UUID); // Create a BLE Service
BLECharacteristic inputStringCharacteristic = BLECharacteristic(INPUT_STRING_CHARACTERISTIC); // Create a BLE Characteristic for the sensor
BLECharacteristic ledCharacteristic = BLECharacteristic(LED_CHARACTERISTIC_UUID); // Create a BLE Characteristic for the sensor

void onConnect(uint16_t conn_handle) { // Callback handler for BLE Connection events
    deviceConnected = true;
    BLEConnection* connection = Bluefruit.Connection(conn_handle);
    Serial.println("Device Connected");
};


void onDisconnect(uint16_t conn_handle, uint8_t reason) { // Callback handler for BLE Connection events
    deviceConnected = false;
    Serial.println("Device Disconnected");
    Serial.println(reason, HEX);
};

// Basic ascii to HID keycode (very minimal, only lowercase a-z here)
uint8_t asciiToHID(char c) {
  if (c >= 'a' && c <= 'z') {
    return (c - 'a') + 4; // HID usage for 'a' starts at 4
  }
  // TODO: Add uppercase, numbers, symbols...
  return 0;
}

void sendKey(uint8_t keycode) {
  uint8_t report[8] = {0};
  report[2] = keycode;  // keycode position

  keyboard.keyboardReport(0, 0, report); // key press
  delay(5);

  memset(report, 0, sizeof(report));
  keyboard.keyboardReport(0, 0, report); // key release
  delay(5);
}

void sendString(const char *str) {
  while (*str) {
    uint8_t keycode = asciiToHID(*str);
    sendKey(keycode);
    str++;
  }
}



void onWrite(uint16_t conn_hdl, BLECharacteristic* chr, uint8_t* data, uint16_t len) {
  Serial.print("Received: ");
  Serial.write(data, len); // Print exactly what was written
  sendString((const char*)data); // Send the received string as keystrokes

  Serial.print("Keystrokes sent.");
  Serial.println();
}

void setup() {
  Serial.begin(115200);
  delay(100);

  // Manual begin() is required on core without built-in support e.g. mbed rp2040
  Serial.println("Starting TinyUSB Device...");
  TinyUSBDevice.begin(0);

  keyboard.setBootProtocol(HID_ITF_PROTOCOL_KEYBOARD);
  keyboard.setPollInterval(2);
  keyboard.setReportDescriptor(desc_hid_report, sizeof(desc_hid_report));
  keyboard.setStringDescriptor("TinyUSB Keyboard");

  // Initialize HID keyboard
  if (!keyboard.begin()) {
    Serial.println("Failed to start HID keyboard");
    while (1);
  }

  // If already enumerated, additional class driverr begin() e.g msc, hid, midi won't take effect until re-enumeration
  if (TinyUSBDevice.mounted()) {
    TinyUSBDevice.detach();
    delay(10);
    TinyUSBDevice.attach();
  }

  Serial.println("Setting up BLE...");
  pinMode(LED, OUTPUT);

  // Create the BLE Device
  Bluefruit.begin();
  Bluefruit.setTxPower(4); // Set the transmit power to 4 dBm
  Bluefruit.setName("Clipboard NRF");

  // Bluefruit Connection Callbacks
  Bluefruit.Periph.setConnectCallback(onConnect);
  Bluefruit.Periph.setDisconnectCallback(onDisconnect);



  pService.begin(); // Initialize the BLE Service

  // Set the inputString Characteristic properties
  inputStringCharacteristic.setProperties(CHR_PROPS_READ | CHR_PROPS_WRITE | CHR_PROPS_NOTIFY | CHR_PROPS_INDICATE);
  inputStringCharacteristic.setPermission(SECMODE_OPEN, SECMODE_OPEN); // No security
  inputStringCharacteristic.setFixedLen(20); // Fixed-length characteristic
  inputStringCharacteristic.setWriteCallback(onWrite); // Register the write callback
  inputStringCharacteristic.begin();

  // // Set the led Characteristic properties
  // led.setProperties(CHR_PROPS_WRITE);
  // led.setPermission(SECMODE_OPEN, SECMODE_NO_ACCESS); // No read access, only write
  // led.begin();

  // // Create a BLE Characteristic
  // pSensorCharacteristic = pService->createCharacteristic(
  //                     INPUT_STRING_CHARACTERISTIC,
  //                     BLECharacteristic::PROPERTY_READ   |
  //                     BLECharacteristic::PROPERTY_WRITE  |
  //                     BLECharacteristic::PROPERTY_NOTIFY |
  //                     BLECharacteristic::PROPERTY_INDICATE
  //                   );

  // Create the ON button Characteristic
  // pLedCharacteristic = pService->createCharacteristic(
  //                     LED_CHARACTERISTIC_UUID,
  //                     BLECharacteristic::PROPERTY_WRITE
  //                   );

  // Register the callback for the ON button characteristic
  //pLedCharacteristic->setCallbacks(new MyCharacteristicCallbacks());

  // https://www.bluetooth.com/specifications/gatt/viewer?attributeXmlFile=org.bluetooth.descriptor.gatt.client_characteristic_configuration.xml

  // Setup advertising
  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addTxPower();
  Bluefruit.Advertising.addName();
  Bluefruit.Advertising.addService(pService);
  

  //Start advertising
  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.setInterval(32, 244);    // in unit of 0.625 ms
  Bluefruit.Advertising.setFastTimeout(30);      // number of seconds in fast mode
  Bluefruit.Advertising.start(0); // Start advertising with no timeout
  Serial.println("Waiting a client connection to notify...");
}

void loop() {
  #ifdef TINYUSB_NEED_POLLING_TASK
    // Manual call tud_task since it isn't called by Core's background
    TinyUSBDevice.task();
  #endif
}


