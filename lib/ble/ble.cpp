#include "ble.h"
#include "NeoPixelRMT.h"

BLEServer* bluServer = NULL; // Pointer to the BLE Server instance
BLECharacteristic* inputCharacteristic = NULL; // Characteristic for sensor data
BLECharacteristic* slowModeCharacteristic = NULL; // Characteristic for LED control

bool manualDisconnect = false; // Flag to indicate if the user manually disconnected
bool pairingMode = false; // Flag to indicate if we are in pairing mode

class MyServerCallbacks: public BLEServerCallbacks { // Callback handler for BLE Connection events
  void onConnect(BLEServer* bluServer) {
    led.blinkEnd(); // Stop blinking when a device connects
    led.set(Colors::Cyan); // Led cyan when connected
  };

  void onDisconnect(BLEServer* bluServer) {
    if(manualDisconnect) {
      manualDisconnect = false; // Reset the flag if the disconnection was manual
      led.set(Colors::Yellow); // LED blinks yellow when disconnected manually
      return; // Do not blink if the disconnection was manual
    }
    
    else{
      led.blinkStart(500, Colors::Red); // Start blinking red when a device disconnects by itself
    }
    
    bluServer->startAdvertising(); // Restart advertising
  }
};

// Callback handler for BLE Characteristic events
class MyCharacteristicCallbacks : public BLECharacteristicCallbacks {
  public:
    MyCharacteristicCallbacks(SecureSession* session) : session(session) {}

    // Callback handler for BLE Characteristic events
    void onWrite(BLECharacteristic* inputCharacteristic) {
      //String value = String(inputCharacteristic->getValue().c_str());
      std::string rawValue = inputCharacteristic->getValue(); // Gets the std::strig value of the characteristic
      // Receive base64 encoded value
      if (!rawValue.empty() && session != nullptr) {
        const size_t IV_SIZE = 12;
        const size_t TAG_SIZE = 16;

        if (rawValue.length() < IV_SIZE + TAG_SIZE) {
          Serial.println("Characteristic too short!");
          return;
        }

        // Interpret data as peer public key when in pairing mode
        if(pairingMode) {
          Serial0.println("Pairing mode active, waiting for peer to send public key...");

          const uint8_t* raw = reinterpret_cast<const uint8_t*>(rawValue.data()); // Gets the raw data pointer from the std::string
          auto* rawCopy = new std::string(rawValue);  // allocate a heap copy
          auto* taskParams = new SharedSecretTaskParams{session, rawCopy};
        
          // Create new RTOS task to prevent stack overflow in BLE callback stack
          xTaskCreatePinnedToCore(
            generateSharedSecret, // Function to run in the task
            "SharedSecretTask", // Task name
            8192, // Task stack size in bytes
            taskParams, 
            1,
            nullptr, // Callback for task handle (TODO: use this to finish up the handshake)
            1
          );
        }

        else{

        }
      }

      else{
        sendString("No data received or session not initialized.");
      }
    }

  private:
    SecureSession* session;
};


void bleSetup(SecureSession* session){
    // Create the BLE Device
    BLEDevice::init("ClipBoard");
    BLEDevice::setPower(ESP_PWR_LVL_N3); // low power for heat
    // Create the BLE Server
    bluServer = BLEDevice::createServer();
    bluServer->setCallbacks(new MyServerCallbacks());

    // Create the BLE Service
    BLEService *pService = bluServer->createService(SERVICE_UUID);

    // Create a BLE Characteristic
    inputCharacteristic = pService->createCharacteristic(
                        INPUT_STRING_CHARACTERISTIC,
                        BLECharacteristic::PROPERTY_READ   |
                        BLECharacteristic::PROPERTY_WRITE  |
                        BLECharacteristic::PROPERTY_NOTIFY |
                        BLECharacteristic::PROPERTY_INDICATE
                        );

    // Create the ON button Characteristic
    slowModeCharacteristic = pService->createCharacteristic(
                        LED_CHARACTERISTIC_UUID,
                        BLECharacteristic::PROPERTY_WRITE
                        );

    // Register the callback for the ON button characteristic
    inputCharacteristic->setCallbacks(new MyCharacteristicCallbacks(session));

    // https://www.bluetooth.com/specifications/gatt/viewer?attributeXmlFile=org.bluetooth.descriptor.gatt.client_characteristic_configuration.xml
    // Create a BLE Descriptor
    inputCharacteristic->addDescriptor(new BLE2902());
    slowModeCharacteristic->addDescriptor(new BLE2902());

    // Start the service
    pService->start();

    // Start advertising
    BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setScanResponse(false);
    pAdvertising->setMinPreferred(0x0);  // set value to 0x00 to not advertise this parameter
    BLEDevice::startAdvertising();
}

void disconnect() {
    manualDisconnect = true; // Set the flag to indicate manual disconnection
}

void enablePairingMode() {
    pairingMode = true; // Enable pairing mode
    Serial0.println("Pairing mode enabled. Waiting for peer public key...");
}

void generateSharedSecret(void* sessionParams){
    auto* params = static_cast<SharedSecretTaskParams*>(sessionParams);
    SecureSession* session = params->session;
    std::string* rawValue = params->rawValue;

    // Print the received data for debugging
    Serial0.println("Received data:");
    Serial0.println(rawValue->c_str()); 
    Serial0.println(); 
    Serial0.println("Data Len: " + String(rawValue->length()));

    // Convert the received Base64 peer public key to a byte array
    uint8_t peerKey[66];
    size_t peerKeyLen = 0;
    int ret = mbedtls_base64_decode(peerKey, 66, &peerKeyLen, (const unsigned char *)rawValue->data(), rawValue->length()); // Decode the base64 public key

    if(ret != 0){
      delay(5000);
      sendString("Base64 decode failed");
      sendString("Error code: ");
      char retchar[12];
      snprintf(retchar, 12, "%d", ret);

      sendString(retchar);
      return;
    }

    // Serial0.println("Decode Successful");
    // Serial0.println((char*) peerKey); // Send the received public key over HID for debugging
    

   

    // int ret = session->decrypt(ciphertext, ciphertext_len, iv, tag, plaintext_out); // Decrypt the received data
    ret = session->computeSharedSecret(peerKey, 66); // Compute shared secret first


    if (!ret) {
      Serial0.println("Shared secret computed successfully");

      ret = session->deriveAESKeyFromSharedSecret(); // Derive AES key from shared secret

      if(!ret){
        Serial0.println("AES key derived successfully");
      }
      else {
        char retchar[12];
        snprintf(retchar, 12, "%d", ret);
        Serial0.print("AES key derivation failed! Code: ");
        Serial0.println(ret);
      }

    } 
    
    else {
      char retchar[12];
      snprintf(retchar, 12, "%d", ret);
      Serial0.print("Decryption failed! Code: ");
      Serial0.println(ret);
    }

    pairingMode = false; // Disable pairing mode after processing
    Serial0.println("Pairing mode disabled.");

    delete rawValue;
    delete params;
    vTaskDelete(nullptr);
    //delete[] plaintext_out;
}


void decryptAndSend(SecureSession* session, SecureSession::rawDataPacket* packet) {  
    uint8_t plaintext[PACKET_DATA_SIZE];
    int ret = session->decrypt(packet, plaintext);

    if (ret == 0) {
        Serial0.println("Decryption successful, sending data over HID:");
        sendString((const char*)  plaintext); // Send the decrypted data over HID

    } else {
        Serial0.print("Decryption failed with error code: ");
        Serial0.println(ret);
    }
}


