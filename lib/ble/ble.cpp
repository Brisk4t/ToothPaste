#include "ble.h"
#include "NeoPixelRMT.h"

BLEServer *bluServer = NULL;                      // Pointer to the BLE Server instance
BLECharacteristic *inputCharacteristic = NULL;    // Characteristic for sensor data
BLECharacteristic *slowModeCharacteristic = NULL; // Characteristic for LED control

bool manualDisconnect = false; // Flag to indicate if the user manually disconnected
bool pairingMode = false;      // Flag to indicate if we are in pairing mode

// Decrpyt a packet and type its contents over HID
void decryptAndSend(void *sessionParams)
{ 
  // SecureSession* session, SecureSession::rawDataPacket* packet
  auto *params = static_cast<SharedSecretTaskParams *>(sessionParams);
  SecureSession *session = params->session;
  std::string *rawValue = params->rawValue;

  SecureSession::rawDataPacket packet; // Packet instance inside RTOS task

  const uint8_t *raw = reinterpret_cast<const uint8_t *>(rawValue->data()); // Pointer to the heap copy of the received data
  size_t offset = 0;
  // Extract dataLen (uint32_t, big-endian or little-endian depending on your format)
  packet.dataLen = (raw[offset] << 24) |
                   (raw[offset + 1] << 16) |
                   (raw[offset + 2] << 8) |
                   raw[offset + 3];
  offset += 4;

  Serial0.println("DataLen: ");
  Serial0.print(packet.dataLen);
  if (packet.dataLen > MAX_DATA_LEN)
  {
    Serial0.println("Invalid packet length");
    return;
  }

  // Copy IV
  memcpy(packet.IV, raw + offset, SecureSession::IV_SIZE);
  offset += SecureSession::IV_SIZE;

  // Copy ciphertext
  memcpy(packet.data, raw + offset, packet.dataLen);
  offset += packet.dataLen;

  // Copy tag
  memcpy(packet.TAG, raw + offset, SecureSession::TAG_SIZE);
  offset += SecureSession::TAG_SIZE;

  uint8_t plaintext[PACKET_DATA_SIZE];
  int ret = session->decrypt(&packet, plaintext);

  if (ret == 0)
  {
    Serial0.println("Decryption successful, sending data over HID:");
    Serial0.println((const char *)plaintext);
    sendString((const char *)plaintext); // Send the decrypted data over HID
  }
  else
  {
    Serial0.print("Decryption failed with error code: ");
    Serial0.println(ret);
  }

  // Free task memory
  delete rawValue;
  delete params;
  vTaskDelete(nullptr);
}

class MyServerCallbacks : public BLEServerCallbacks
{ // Callback handler for BLE Connection events
  void onConnect(BLEServer *bluServer)
  {
    led.blinkEnd();        // Stop blinking when a device connects
    led.set(Colors::Cyan); // Led cyan when connected
  };

  void onDisconnect(BLEServer *bluServer)
  {
    if (manualDisconnect)
    {
      manualDisconnect = false; // Reset the flag if the disconnection was manual
      led.set(Colors::Yellow);  // LED blinks yellow when disconnected manually
      return;                   // Do not blink if the disconnection was manual
    }

    else
    {
      led.blinkStart(500, Colors::Red); // Start blinking red when a device disconnects by itself
    }

    bluServer->startAdvertising(); // Restart advertising
  }
};

// Callback handler for BLE Characteristic events
class MyCharacteristicCallbacks : public BLECharacteristicCallbacks
{
public:
  MyCharacteristicCallbacks(SecureSession *session) : session(session) {}

  // Callback handler for BLE Characteristic events
  void onWrite(BLECharacteristic *inputCharacteristic)
  {
    std::string rawValue = inputCharacteristic->getValue(); // Gets the std::string value of the characteristic

    // Receive base64 encoded value
    if (!rawValue.empty() && session != nullptr)
    {
      const size_t IV_SIZE = 12;
      const size_t TAG_SIZE = 16;

      // // Handle bad packets
      // if (rawValue.length() < IV_SIZE + TAG_SIZE) {
      //   Serial.println("Characteristic too short!");
      //   return;
      // }

      // Interpret data as peer public key when in pairing mode
      if (pairingMode)
      {
        Serial0.println("Pairing mode enabled, uncompressed peer public key received \n");

        auto *rawCopy = new std::string(rawValue); // allocate a heap copy of the received packet
        auto *taskParams = new SharedSecretTaskParams{session, rawCopy};

        // Generate a shared secret once the Peer Public Key has been received
        // Create new RTOS task to prevent stack overflow in BLE callback stack
        xTaskCreatePinnedToCore(
            generateSharedSecret, // Function to run in the task
            "SharedSecretTask",   // Task name
            8192,                 // Task stack size in bytes
            taskParams,
            1,
            nullptr, // Callback for task handle (TODO: use this to finish up the handshake)
            1);
      }

      // If not in pairing mode
      else
      {

        Serial0.println(rawValue.c_str());

        auto *rawCopy = new std::string(rawValue);
        auto *taskParams = new SharedSecretTaskParams{session, rawCopy};

        xTaskCreatePinnedToCore(
            decryptAndSend, // Function to run in the task
            "DecryptTask",  // Task name
            8192,           // Task stack size in bytes
            taskParams,
            1,
            nullptr, // Callback
            1);
      }
    }

    else
    {
      Serial0.println("No data received or session not initialized.");
    }
  }

private:
  SecureSession *session;
};

// Create the BLE Device
void bleSetup(SecureSession *session)
{
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
      BLECharacteristic::PROPERTY_READ |
          BLECharacteristic::PROPERTY_WRITE |
          BLECharacteristic::PROPERTY_NOTIFY |
          BLECharacteristic::PROPERTY_INDICATE);

  // Create the ON button Characteristic
  slowModeCharacteristic = pService->createCharacteristic(
      LED_CHARACTERISTIC_UUID,
      BLECharacteristic::PROPERTY_WRITE);

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
  pAdvertising->setMinPreferred(0x0); // set value to 0x00 to not advertise this parameter
  BLEDevice::startAdvertising();
}

void disconnect()
{
  manualDisconnect = true; // Set the flag to indicate manual disconnection
}

void enablePairingMode()
{
  pairingMode = true; // Enable pairing mode
  Serial0.println("Pairing mode enabled. Waiting for peer public key...");
}

// RTOS task to run once peer public key is received
void generateSharedSecret(void *sessionParams)
{
  auto *params = static_cast<SharedSecretTaskParams *>(sessionParams); // Cast the parameters back
  SecureSession *session = params->session;
  std::string *rawValue = params->rawValue;

  // Print the received data for debugging
  Serial0.println("Data Len: " + String(rawValue->length())); // Print the received peer public key length
  Serial0.println("Received data: ");
  Serial0.print(rawValue->c_str()); // Print the received peer public key to serial
  Serial0.println();

  // Store the base64 key as a byte array
  uint8_t peerKeyArray[66];
  size_t peerKeyLen = 0;
  const char *base64Input = rawValue->c_str();
  size_t base64InputLen = strlen(base64Input); // safer than rawValue->length() if input comes from external source

  // Convert the received Base64 peer public key to a byte array
  int ret = mbedtls_base64_decode(
    peerKeyArray, 
    66, 
    &peerKeyLen, 
    (const unsigned char *)rawValue->data(), 
    rawValue->length()
  );

  // If the decode fails, output failure reason to serial
  if (ret != 0)
  {
    char retchar[12];
    snprintf(retchar, 12, "%d", ret);
    Serial0.printf("Base64 decode failed, Error code: %d\n", retchar);
    return;
  }

  // Compute shared secret from peer public key array
  ret = session->computeSharedSecret(peerKeyArray, 66); 
  if (!ret)
  {
    // Derive AES key from shared secret and save it
    ret = session->deriveAESKeyFromSharedSecret(); 
    if (!ret)
    {
      Serial0.println("AES key derived successfully");
      led.set(Colors::Cyan);
    }
    // If the AES key derivation fails
    else
    {
      char retchar[12];
      snprintf(retchar, 12, "%d", ret);
      Serial0.printf("AES key derivation failed! Code: %d\n", retchar);
      led.set(Colors::Orange);
    }
  }

  // If the shared secret computation fails
  else
  {
    char retchar[12];
    snprintf(retchar, 12, "%d", ret);
    Serial0.printf("Shared Secret computation failed! Code: %d\n", retchar);
    led.set(Colors::Orange);
  }

  // Disable pairing mode after processing
  pairingMode = false; 
  Serial0.println("Pairing mode disabled.");

  // Clean up RTOS task
  delete rawValue;
  delete params;
  vTaskDelete(nullptr);
}
