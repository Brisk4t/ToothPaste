#include "ble.h"
#include "NeoPixelRMT.h"

BLEServer *bluServer = NULL;                      // Pointer to the BLE Server instance
BLECharacteristic *inputCharacteristic = NULL;    // Characteristic for sensor data
BLECharacteristic *semaphoreCharacteristic = NULL; // Characteristic for LED control

bool manualDisconnect = false; // Flag to indicate if the user manually disconnected
bool pairingMode = false;      // Flag to indicate if we are in pairing mode
const char* clientPubKey;

NotificationPacket notificationPacket = {0}; // Initialize the persistent notification packet to 0

// Handle Connect
void DeviceServerCallbacks::onConnect(BLEServer *bluServer)
{ 
  int connectedCount = bluServer->getConnectedCount();
  
  // If a device is not already connected
  if(connectedCount == 0){
    led.blinkEnd();        // Stop blinking when a device connects
    led.set(Colors::Cyan); // Led cyan when connected
  }

  // If a device is already connected, no new connections are possible until the current one disconnects 
  //(since WEB-BLE does not auto connect this means the device can be restarted for new connections)
  // TODO: This will need to be improved later
  else{
    uint16_t newClient = bluServer->getConnId();
    bluServer->disconnect(newClient);
  }
};

// Handle Disconnect
void DeviceServerCallbacks::onDisconnect(BLEServer *bluServer)
{
  // If there are no devices connected (otherwise the disconnect was a result of a new client being rejected)
  if(bluServer->getConnectedCount() <= 1){
    if (manualDisconnect)
    {
      manualDisconnect = false; // Reset the flag if the disconnection was manual
      led.blinkStart(500, Colors::Yellow);  // LED blinks yellow when disconnected manually
      return;                   // Do not blink if the disconnection was manual
    }

    else
    {
      led.blinkStart(500, Colors::Red); // Start blinking red when a device disconnects by itself
    }

    bluServer->startAdvertising(); // Restart advertising
  }
}

// Callback constructor for BLE Input Characteristic events
InputCharacteristicCallbacks::InputCharacteristicCallbacks(SecureSession *session) : session(session) {}

// Callback handler for BLE Input Characteristic onWrite events
void InputCharacteristicCallbacks::onWrite(BLECharacteristic *inputCharacteristic)
{
  std::string rawValue = inputCharacteristic->getValue(); // Gets the std::string value of the characteristic

  // Receive base64 encoded value
  if (!rawValue.empty() && session != nullptr)
  {
    auto *rawCopy = new std::string(rawValue); // allocate a heap copy of the received packet
    auto *taskParams = new SharedSecretTaskParams{session, rawCopy, clientPubKey}; // Create the parameters passed to the RTOS task
    
    // Interpret data as peer public key when in pairing mode
    if (pairingMode)
    {
      Serial0.println("Pairing mode: Uncompressed peer public key received \n");

      // Generate a shared secret once the Peer Public Key has been received
      // Create new RTOS task to prevent stack overflow in BLE callback stack
      xTaskCreatePinnedToCore(
          generateSharedSecret, // Function to run in the task
          "SharedSecretTask",   // Task name
          8192,                 // Task stack size in bytes
          taskParams,           // Params passed to generateSharedSecret
          1,
          nullptr, // Task handler, we dont care since the secret decode is 'fire-and-forget'
          1
      );
    }

    // If not in pairing mode
    else
    { 
      // Handle bad packets
      if (rawValue.length() < SecureSession::IV_SIZE + SecureSession::TAG_SIZE + SecureSession::HEADER_SIZE) {
        Serial.println("Characteristic too short!");
        led.blinkStart(500, Colors::Blue);
        return;
      }
      // Decrypt the received packet in a new RTOS task, the task then calls HID functions if applicable
      xTaskCreatePinnedToCore(
          decryptAndSend, // Function to run in the task
          "DecryptTask",  // Task name
          8192,           // Task stack size in bytes
          taskParams,
          1,
          nullptr, // Store the task handle somewhere
          1
      );
    }
  }
}

// Create the BLE Device
void bleSetup(SecureSession *session)
{
  BLEDevice::init("ClipBoard");
  BLEDevice::setPower(ESP_PWR_LVL_N3); // low power for heat
  // Create the BLE Server
  bluServer = BLEDevice::createServer();
  bluServer->setCallbacks(new DeviceServerCallbacks());

  // Create the BLE Service
  BLEService *pService = bluServer->createService(SERVICE_UUID);

  // Create a BLE Characteristic
  inputCharacteristic = pService->createCharacteristic(
      INPUT_STRING_CHARACTERISTIC,
      BLECharacteristic::PROPERTY_READ |      // Client can read
      BLECharacteristic::PROPERTY_WRITE_NR |  // Client can Write without Response
      BLECharacteristic::PROPERTY_NOTIFY |    // Server can async notify
      BLECharacteristic::PROPERTY_INDICATE);  // Server can notify with ACK

  // Create the HID Ready Semaphore Characteristic
  semaphoreCharacteristic = pService->createCharacteristic(
      HID_SEMAPHORE_CHARCTERISTIC,
      BLECharacteristic::PROPERTY_NOTIFY);

  // Register the callback for the ON button characteristic
  inputCharacteristic->setCallbacks(new InputCharacteristicCallbacks(session));

  // https://www.bluetooth.com/specifications/gatt/viewer?attributeXmlFile=org.bluetooth.descriptor.gatt.client_characteristic_configuration.xml
  // Create a BLE Descriptor
  inputCharacteristic->addDescriptor(new BLE2902());
  semaphoreCharacteristic->addDescriptor(new BLE2902());

  // Start the service
  pService->start();

  // Start advertising
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(false);
  pAdvertising->setMinPreferred(0x0); // set value to 0x00 to not advertise this parameter
  BLEDevice::startAdvertising();
}

// Manually disconnect BLE
void disconnect()
{
  manualDisconnect = true; // Set the flag to indicate manual disconnection
}

// Notify the input characteristic
void notifyClient(const uint8_t data){
  semaphoreCharacteristic->setValue((uint8_t*)&data, 1);  // Set the data to be notified
  semaphoreCharacteristic->notify();                      // Notify the semaphor characteristic
}

// Interpret the next write event as a pairing packet
void enablePairingMode()
{
  pairingMode = true; // Enable pairing mode
  Serial0.println("Pairing mode enabled. Waiting for peer public key...");
}

// TODO: Refactor
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
      rawValue->length());

  // If the decode fails, output failure reason to serial
  if (ret != 0)
  {
    char retchar[12];
    snprintf(retchar, 12, "%d", ret);
    Serial0.printf("Base64 decode failed, Error code: %d\n", retchar);
    return;
  }

  // TODO: Can probably be moved to SecureSession for clarity
  // Compute shared secret from peer public key array
  ret = session->computeSharedSecret(peerKeyArray, 66);
  if (!ret)
  {
    // Derive AES key from shared secret and save it
    ret = session->deriveAESKeyFromSharedSecret(base64Input);
    if (!ret)
    {
      Serial0.println("AES key derived successfully");
      clientPubKey = base64Input;
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



// TODO: Refactor
// RTOS task to decrpyt a packet and type its contents over HID
void decryptAndSend(void *sessionParams)
{
  // Unpack the parameter pointer into the SecureSession and Packet
  auto *params = static_cast<SharedSecretTaskParams *>(sessionParams);
  SecureSession *session = params->session;
  std::string *rawValue = params->rawValue;
  //const char* base64PubKey = params->base64pubKey;

  const uint8_t *raw = reinterpret_cast<const uint8_t *>(rawValue->data()); // Pointer to the heap copy of the received data

  SecureSession::rawDataPacket packet; // Packet instance inside RTOS task
  size_t offset = 0;
  
  // Unpack the first 4 bytes (header) into packet vars
  packet.packetId = raw[0];      // Unique ID for type of packet (0 = DATA, 1 = HANDSHAKE)
  packet.slowmode = raw[1];      // When enabled reduces the wpm and slows down HID timing to enable legacy text input compatibility (notepad)
  packet.packetNumber = raw[2];  // Current packet number out of total
  packet.totalPackets = raw[3];  // Total packets for current message
  offset += SecureSession::HEADER_SIZE;

  // Copy IV
  memcpy(packet.IV, raw + offset, SecureSession::IV_SIZE);
  offset += SecureSession::IV_SIZE;

  // Copy ciphertext
  size_t dataLength = (rawValue->length()) - (SecureSession::IV_SIZE + SecureSession::TAG_SIZE + SecureSession::HEADER_SIZE);
  packet.dataLen = dataLength;
  memcpy(packet.data, raw + offset, dataLength);
  offset += dataLength;

  // Copy tag
  memcpy(packet.TAG, raw + offset, SecureSession::TAG_SIZE);
  offset += SecureSession::TAG_SIZE;

  // Debugging data
  Serial0.printf("Data length: %d\r\n", dataLength);
  Serial0.printf("ID: %d\r\nSlowMode: %d\r\nPacket Number: %d\r\nTotal Packets: %d\r\n",
    packet.packetId, 
    packet.slowmode, 
    packet.packetNumber, 
    packet.totalPackets
  );

  // If the packet is an AUTH packet, the data is the pubKey of the client
  // TODO: Severe refactoring needed
  if(packet.packetId == 1){
    clientPubKey = (const char*) packet.data;
    
    //led.set(Colors::White);

    // If we don't know the AES key for the given public key, display 'unpaired' status led
    if(!session->isEnrolled(clientPubKey)){
      // Lower bits of notification are auth status to tell if we recognize the pubkey of the sender
      // Upper bits are the notification itself ([0] = KeepAlive, [1] = Ready to Receive, [2] = Not ready to receive )
      notificationPacket.packetType = 2;
      notificationPacket.authStatus = 0;
      uint8_t packed = ((notificationPacket.packetType & 0x0F) << 4) | (notificationPacket.authStatus & 0x0F);
      notifyClient(packed);

      led.set(Colors::Orange);
    }

    else{
      notificationPacket.packetType = 0;
      notificationPacket.authStatus = 1;
      uint8_t packed = ((notificationPacket.packetType & 0x0F) << 4) | (notificationPacket.authStatus & 0x0F);
      notifyClient(packed);
      led.set(Colors::White);
    }
    
    // Clean up RTOS task
    delete rawValue;
    delete params;
    vTaskDelete(nullptr);
    return;

  }

  // Allocate plaintext buffer and decrypt
  uint8_t plaintext[SecureSession::MAX_DATA_LEN];
  int ret = session->decrypt(&packet, plaintext, clientPubKey);

  // If the decryption succeeds type the plaintext over HID    
  if (ret == 0)
  {
    Serial0.println("Decryption successful");
    Serial0.println((const char *)plaintext);


    

    switch(packet.packetId){
      case 0:
        sendString((const char *)plaintext, packet.slowmode); // Send the decrypted data over HID
        break;

      case 1:
        // Valid the AES_key:PeerID relationship  
        break;

      default:
        led.blinkStart(500, Colors::Green);
        break;
    } 
  }

  // If the decryption fails
  else
  {
    Serial0.print("Decryption failed with error code: ");
    Serial0.println(ret);
    led.blinkStart(300, Colors::Blue);
  }

  notificationPacket.packetType = 1;
  uint8_t packed = ((notificationPacket.packetType & 0x0F) << 4) | (notificationPacket.authStatus & 0x0F);
  notifyClient(packed); // Once a HID report has been sent, notify that we are ready to receive another
  //led.blinkEnd();

  // Free task memory
  delete rawValue;
  delete params;
  vTaskDelete(nullptr);
}

