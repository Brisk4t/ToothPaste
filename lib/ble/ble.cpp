#include "ble.h"
#include "NeoPixelRMT.h"
#include "StateManager.h"

BLEServer* bluServer = NULL;                      // Pointer to the BLE Server instance
BLECharacteristic* inputCharacteristic = NULL;    // Characteristic for sensor data
BLECharacteristic* semaphoreCharacteristic = NULL; // Characteristic for LED control

QueueHandle_t packetQueue = xQueueCreate(50, sizeof(SharedSecretTaskParams*)); // Queue to manage RTOS task parameters
bool notified = false;


bool manualDisconnect = false; // Flag to indicate if the user manually disconnected
std::string clientPubKey;  // safer than char*
int count = 1;

NotificationPacket notificationPacket = { 0 }; // Initialize the persistent notification packet to 0

// Create the persistent RTOS packet handler task
void createPacketTask(SecureSession* sec){
  // Start the persistent RTOS task
  xTaskCreatePinnedToCore(
        packetTask,
        "PacketWorker",
        8192,
        sec, // Persistent task shares 1 ECDH session
        1,
        nullptr,
        1
    );
}

// Handle Connect
void DeviceServerCallbacks::onConnect(BLEServer* bluServer)
{
  int connectedCount = bluServer->getConnectedCount();
  
  // If a device is not already connected
  if (connectedCount == 0) {
    stateManager->setState(UNPAIRED);
  }

  // If a device is already connected, no new connections are possible until the current one disconnects 
  // (since WEB-BLE does not auto connect this means the device can be restarted for new connections)
  // TODO: This will need to be improved later
  else {
    uint16_t newClient = bluServer->getConnId();
    bluServer->disconnect(newClient);
  }
};

// Handle Disconnect
void DeviceServerCallbacks::onDisconnect(BLEServer* bluServer)
{
  // If there are no devices connected (otherwise the disconnect was a result of a new client being rejected)
  if (bluServer->getConnectedCount() <= 1) { // getConnectedCount() doesnt change until much later after the callback fires so clients will be 1 at disconnect time as well
    if (manualDisconnect)
    {
      manualDisconnect = false;             // Reset the flag if the disconnection was manual
      led.set(Colors::Orange);              // LED back to unpaired ready state
      return;                               // Do not blink if the disconnection was manual
    }

    else
    {
      stateManager->setState(DISCONNECTED);
    }

    bluServer->startAdvertising(); // Restart advertising
  }
}

// Callback constructor for BLE Input Characteristic events
InputCharacteristicCallbacks::InputCharacteristicCallbacks(SecureSession* session) : session(session) {}

// Callback handler for BLE Input Characteristic onWrite events
void InputCharacteristicCallbacks::onWrite(BLECharacteristic* inputCharacteristic)
{
  std::string rawValue = inputCharacteristic->getValue(); // Gets the std::string value of the characteristic

  // Receive base64 encoded value
  if (!rawValue.empty() && session != nullptr)
  {
    auto* rawCopy = new std::string(rawValue); // allocate a heap copy of the received packet
    auto* taskParams = new SharedSecretTaskParams{ session, rawCopy }; // Create the parameters passed to the RTOS task

    // Handle bad packets
    if (rawValue.length() < SecureSession::IV_SIZE + SecureSession::TAG_SIZE + SecureSession::HEADER_SIZE) {
      Serial.println("Characteristic too short!");
      led.blinkStart(500, Colors::Blue);
      return;
    }

    // Queue the received packet params in the task queue
    if (xQueueSend(packetQueue, &taskParams, 0) != pdTRUE) {
            // Queue full, drop packet or handle error
            Serial.println("Packet queue full! Dropping packet.");
            delete taskParams->rawValue;
            delete taskParams;
        }

  }

}

// Create the BLE Device
void bleSetup(SecureSession* session)
{
  createPacketTask(session);
  BLEDevice::init("ClipBoard");
  //BLEDevice::setPower(ESP_PWR_LVL_N3); // low power for heat
  // Create the BLE Server
  bluServer = BLEDevice::createServer();
  bluServer->setCallbacks(new DeviceServerCallbacks());

  // Create the BLE Service
  BLEService* pService = bluServer->createService(SERVICE_UUID);

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
  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
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

// Notify the semaphore characteristic
void notifyClient(const uint8_t data) {
  semaphoreCharacteristic->setValue((uint8_t*)&data, 1);  // Set the data to be notified
  semaphoreCharacteristic->notify();                      // Notify the semaphor characteristic
}

// Notify the semaphore characteristic
void notifyClient() {
  uint8_t packed = ((notificationPacket.packetType & 0x0F) << 4) | (notificationPacket.authStatus & 0x0F);

  semaphoreCharacteristic->setValue((uint8_t*)&packed, 1);  // Set the data to be notified
  semaphoreCharacteristic->notify();                      // Notify the semaphor characteristic
}

// Use the AUTH packet and peer public key to derive a new ecdh shared secret and AES key
void generateSharedSecret(SecureSession::rawDataPacket* packet, SecureSession* session)
{
  // Store the base64 key as a byte array
  uint8_t peerKeyArray[66];
  size_t peerKeyLen = 0;

  // The packet data for an AUTH packet is a base64 string
  const char* base64Input = (const char*)packet->data;
  size_t base64InputLen = packet->dataLen;

  // Convert the received Base64 peer public key to a byte array
  int ret = mbedtls_base64_decode(
    peerKeyArray,
    66,
    &peerKeyLen,
    packet->data,
    base64InputLen);

  // If the decode fails, output failure reason to serial
  if (ret != 0)
  {
    Serial0.printf("Base64 decode failed, Error code: %d\n", ret);
    stateManager->setState(ERROR);
    return;
  }

  // TODO: Can probably be moved to SecureSession for clarity
  // Compute shared secret from peer public key array
  if (!session->computeSharedSecret(peerKeyArray, 66))
  {
    // Derive AES key from shared secret and save it
    if (!session->deriveAESKeyFromSharedSecret(base64Input))
    {
      Serial0.println("AES key derived successfully");
      clientPubKey = std::string((const char*)base64Input, base64InputLen);
      stateManager->setState(READY);

      // Notify once pairing is successful
      notificationPacket.authStatus = 1;
      uint8_t packed = ((notificationPacket.packetType & 0x0F) << 4) | (notificationPacket.authStatus & 0x0F);
      notifyClient(packed);
    }
    // If the AES key derivation fails
    else
    {
      Serial0.printf("AES key derivation failed! Code: %d\n", ret);
      stateManager->setState(ERROR);
    }
  }

  // If the shared secret computation fails
  else
  {
    Serial0.printf("Shared Secret computation failed! Code: %d\n", ret);
    stateManager->setState(ERROR);
  }

  // Disable pairing mode after processing
  stateManager->setState(READY);
  Serial0.println("Pairing mode disabled.");

  return;
}

// Turns a BLE callback bytestring into a ClipBoard packet
SecureSession::rawDataPacket unpack(void* rawPacketBytes) {
  std::string* rawValue = reinterpret_cast<std::string*>(rawPacketBytes);
  const uint8_t* raw = reinterpret_cast<const uint8_t*>(rawValue->data()); // Pointer to the heap copy of the received data

  Serial0.printf("rawValue Length: %d\n\r", rawValue->length());
  //Serial0.printf("raw Length: %d\n\r", rawValue->length());

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

  return packet;
}

// Decrypt a data packet and type the text content as a string
void decryptSendString(SecureSession::rawDataPacket* packet, SecureSession* session) {
  // Allocate plaintext buffer and decrypt
  uint8_t* plaintext = new uint8_t[SecureSession::MAX_DATA_LEN];
  int ret = session->decrypt(packet, plaintext, clientPubKey.c_str());

  // If the decryption succeeds type the plaintext over HID    
  if (ret == 0)
  {
    Serial0.printf("Decryption successful: %s\n\r\n\r", plaintext);
    sendString((const char*)plaintext, packet->slowmode); // Send the decrypted data over HID

    // Set the ready confirmation notification
    //notificationPacket.packetType = 1;
  }
  // If the decryption fails
  else
  {
    Serial0.print("Decryption failed with error code: ");
    Serial0.println(ret);

    led.blinkStart(500, Colors::Blue);
    //stateManager->setState(ERROR);
  }
  
  delete[] plaintext;  // Free heap memory
}

// Read an AUTH packet and check if the client public key and AES key are known
void authenticateClient(SecureSession::rawDataPacket* packet, SecureSession* session) {
  Serial0.println("Entered authenticateClient");
  clientPubKey = std::string((const char*)packet->data, packet->dataLen);  // if you're using std::string

  Serial0.printf("clientPubKey: %s\n\r", clientPubKey);
  // If we don't know the AES key for the given public key, set Device Status to UNPAIRED
  if (!session->isEnrolled(clientPubKey.c_str())) {
    Serial0.println("Client is not enrolled");
    // Lower bits of notification are auth status to tell if we recognize the pubkey of the sender
    // Upper bits are the notification itself ([0] = KeepAlive, [1] = Ready to Receive, [2] = Not ready to receive )
    notificationPacket.packetType = 2;
    notificationPacket.authStatus = 0;
    stateManager->setState(UNPAIRED); // Set the device to the unpaired state
  }

  // If we know the AES key set device status to PAIRED (Note: This does not gurantee that the AES key is correct, just that it exists)
  else {
    Serial0.println("Client is enrolled");

    notificationPacket.packetType = 1;
    notificationPacket.authStatus = 1;
    stateManager->setState(READY);
  }
}

// Persistent RTOS that waits for packets
void packetTask(void* params)
{

    // Share the same securesession for the whole task
    SecureSession* session = static_cast<SecureSession*>(params);
    while (true) {
        SharedSecretTaskParams* taskParams = nullptr; // The queue fills in this pointer as packets become available

        // If the client has not been notified and there is space in the queue
        if(notified == false && uxQueueSpacesAvailable(packetQueue) == 0){
          notificationPacket.packetType = 1;
          notifyClient();
          notified = true;
        }

        // Wait indefinitely for next packet pointer
        if (xQueueReceive(packetQueue, &taskParams, portMAX_DELAY) == pdTRUE) {
            if (taskParams) {
                std::string* rawValue = taskParams->rawValue;

                SecureSession::rawDataPacket packet = unpack(rawValue);
                delete rawValue; // Free string memory

                // Debug prints...
                Serial0.println("BLE Data Received.");
                Serial0.printf("Data length: %d\r\n", packet.dataLen);
                Serial0.printf("ID: %d\r\nSlowMode: %d\r\nPacket Number: %d\r\nTotal Packets: %d\r\n",
                    packet.packetId,
                    packet.slowmode,
                    packet.packetNumber,
                    packet.totalPackets
                );
                Serial0.println();

                if (packet.packetId == 0) {
                    decryptSendString(&packet, session);
                }
                else if (packet.packetId == 1) {
                    if (stateManager->getState() == PAIRING) {
                        generateSharedSecret(&packet, session);
                    } else {
                        authenticateClient(&packet, session);
                    }
                }


                delete taskParams; // Free the parameter struct
            }
        }
    }
}