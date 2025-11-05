#include "ble.h"
#include "NeoPixelRMT.h"
#include "StateManager.h"
#include "esp_system.h"
#include "esp_log.h"

#include "pb_decode.h"
#include "pb_encode.h"
#include "pb_common.h"

BLEServer* bluServer = NULL;                      // Pointer to the BLE Server instance
BLECharacteristic* inputCharacteristic = NULL;    // Characteristic for sensor data
BLECharacteristic* semaphoreCharacteristic = NULL; // Characteristic for LED control
BLECharacteristic* macCharacteristic = NULL;

QueueHandle_t packetQueue = xQueueCreate(50, sizeof(SharedSecretTaskParams*)); // Queue to manage RTOS task parameters

bool manualDisconnect = false; // Flag to indicate if the user manually disconnected
std::string clientPubKey;  // safer than char*

// Always completely intantiate notificationPacket
NotificationPacket notificationPacket = {
    KEEPALIVE,
    AUTH_FAILED
};

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
    esp_ble_tx_power_set(ESP_BLE_PWR_TYPE_CONN_HDL0, ESP_PWR_LVL_P9); // Max power once connected (as per IDF API standard)

    stateManager->setState(UNPAIRED);
  }
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
      stateManager->setState(NOT_CONNECTED);
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
  
  const uint8_t* bleData = inputCharacteristic->getData();
  size_t bleLen = inputCharacteristic->getLength();
  //std::string rawValue = std::string(inputCharacteristic->getValue().c_str(), inputCharacteristic->getLength()); // Convert to std::string for easier handling
  // Receive base64 encoded value
  if (bleLen != 0 && session != nullptr)
  {
    std::vector<uint8_t> rawCopy(bleData, bleData + bleLen); // allocate a heap copy of the received packet
    auto* taskParams = new SharedSecretTaskParams{ session, std::move(rawCopy) }; // Create the parameters passed to the RTOS task


    DEBUG_SERIAL_PRINTF("Received data on Input Characteristic: %d bytes\n\r", bleLen);

    // Handle bad packets
    if (bleLen < SecureSession::IV_SIZE + SecureSession::TAG_SIZE + SecureSession::HEADER_SIZE) {
      DEBUG_SERIAL_PRINTLN("Characteristic too short!");
      DEBUG_SERIAL_PRINTF("Received length: %d\n\r", bleLen);
      stateManager->setState(DROP);
      return;
    }

    // Queue the received packet params in the task queue (should never failed due to BLE notification semaphore blocking, failure indicates sender is forcing data)
    if (xQueueSend(packetQueue, &taskParams, 0) != pdTRUE) {
            // Queue full, drop packet or handle error
            DEBUG_SERIAL_PRINTLN("Packet queue full! Dropping packet.");
            stateManager->setState(DROP);
            //delete taskParams->rawValue;
            delete taskParams;
    }
  }

  queuenotify(); // Immediately notify the semaphore if the queue has space for more tasks
}

// Create the BLE Device
void bleSetup(SecureSession* session)
{
  createPacketTask(session); // Create the persistent RTOS packet handler task
  
  // Get the device name and start advertising 
  String deviceName;
  session->getDeviceName(deviceName); // Get the device name from memory
  
  DEBUG_SERIAL_PRINTF("Device Name is: %s", deviceName.c_str());
  if(deviceName.length() < 1){
    BLEDevice::init(BLE_DEVICE_DEFAULT_NAME);
  }
  else{
    BLEDevice::init(deviceName.c_str()); // If the device name isn't set, fallback to default
  }
  
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
  
  // Register the callback for the input data characteristic
  inputCharacteristic->setCallbacks(new InputCharacteristicCallbacks(session));
  
  // Create the HID Ready Semaphore Characteristic
  semaphoreCharacteristic = pService->createCharacteristic(
    HID_SEMAPHORE_CHARCTERISTIC,
    BLECharacteristic::PROPERTY_NOTIFY);

  // Create a MAC address characteristic
  macCharacteristic = pService->createCharacteristic(
    MAC_CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ   |
    BLECharacteristic::PROPERTY_NOTIFY
  );

  // Initialize with 8 bytes (all zeros here)
  uint64_t mac = ESP.getEfuseMac();

  // Convert to 6-byte array
  uint8_t initialValue[6];
  for (int i = 0; i < 6; i++) {
      initialValue[i] = (mac >> (8 * (5 - i))) & 0xFF;
  }

  // Set the BLE characteristic value
  macCharacteristic->setValue(initialValue, 6);

  // Start the service
  pService->start();


  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();

  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true); // Advertise the SERVICE_UUID, i.e. devices don't need to connect to find services
  pAdvertising->setMinPreferred(0x0); // set value to 0x00 to not advertise this parameter
  BLEDevice::startAdvertising();
}

// Notify the semaphore characteristic
void notifyClient(const uint8_t* data, int length) {
  DEBUG_SERIAL_PRINTF("Semaphore Data: %s, Data Length: %d\n", data, length);
  if(length > 32) return; // Can't send too much data through this channel

  semaphoreCharacteristic->setValue((uint8_t*) data, length);  // Set the data to be notified
  semaphoreCharacteristic->notify();                           // Notify the semaphor characteristic
}

// Notify the semaphore characteristic
void notifyClient() {
  uint8_t packed = ((notificationPacket.packetType & 0x0F) << 4) | (notificationPacket.authStatus & 0x0F);

  semaphoreCharacteristic->setValue((uint8_t*)&packed, 1);  // Set the data to be notified
  semaphoreCharacteristic->notify();                      // Notify the semaphor characteristic
}

// Notify the semaphore characteristic if the RTOS task queue is not full
void queuenotify(){
  if (uxQueueSpacesAvailable(packetQueue) == 0) {
    DEBUG_SERIAL_PRINTLN("Queue is full!");
    return;
  } 
  
  else {
    notificationPacket.packetType = RECV_READY;
    notifyClient();
    printf("Queue has space: %d\n", uxQueueSpacesAvailable(packetQueue));
  }
}

// Use the AUTH packet and peer public key to derive a new ecdh shared secret and AES key
void generateSharedSecret(toothpaste_DataPacket* packet, SecureSession* session)
{
  // Store the base64 key as a byte array
  uint8_t peerKeyArray[66];
  size_t peerKeyLen = 0;

  // The packet data for an AUTH packet is a base64 string
  std::string base64Input = std::string((const char*)packet->encryptedData.bytes, (uint8_t)packet->encryptedData.size);
  size_t base64InputLen = packet->dataLen;

  // Convert the received Base64 peer public key to a byte array
  int ret = mbedtls_base64_decode(
    peerKeyArray,
    66,
    &peerKeyLen,
    packet->encryptedData.bytes,
    base64InputLen);

  // If the decode fails, output failure reason to serial
  if (ret != 0)
  {
    DEBUG_SERIAL_PRINTF("Base64 decode failed, Error code: %d\n", ret);
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
      DEBUG_SERIAL_PRINTLN("AES key derived successfully");
      clientPubKey = std::string((const char*)base64Input.c_str(), base64Input.length());
      stateManager->setState(READY);

      // Notify once pairing is successful
      notificationPacket.authStatus = AUTH_SUCCESS;
      notifyClient();
    }
    // If the AES key derivation fails
    else
    {
      DEBUG_SERIAL_PRINTF("AES key derivation failed! Code: %d\n", ret);
      stateManager->setState(ERROR);
    }
  }

  // If the shared secret computation fails
  else
  {
    DEBUG_SERIAL_PRINTF("Shared Secret computation failed! Code: %d\n", ret);
    stateManager->setState(ERROR);
  }

  // Disable pairing mode after processing
  stateManager->setState(READY);
  DEBUG_SERIAL_PRINTLN("Pairing mode disabled.");

  return;
}

// Turns a BLE callback bytestring into a ClipBoard packet
SecureSession::rawDataPacket unpack(void* rawPacketBytes) {
  std::string* rawValue = reinterpret_cast<std::string*>(rawPacketBytes);
  const uint8_t* raw = reinterpret_cast<const uint8_t*>(rawValue->data()); // Pointer to the heap copy of the received data

  DEBUG_SERIAL_PRINTF("rawValue Length: %d\n\r", rawValue->length());
  //DEBUG_SERIAL_PRINTF("raw Length: %d\n\r", rawValue->length());

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
void decryptSendString(toothpaste_DataPacket* packet, SecureSession* session) {
  // Allocate plaintext buffer and decrypt
  //uint8_t* plaintext = new uint8_t[SecureSession::MAX_DATA_LEN];
  
  // Todo: Decode encrypted BYTES into an encrypted data packet 
  // Params: ciphertext, tag, iv, public key (to get private key from storage)

  std::vector<uint8_t> decrypted_bytes((packet->dataLen)+2);
  toothpaste_EncryptedData decrypted = toothpaste_EncryptedData_init_default;
  
  int ret = session->decrypt(packet, decrypted_bytes.data(), clientPubKey.c_str()); // Get the serialized form of the decrypted data

  DEBUG_SERIAL_PRINTF("Decryption return code: %d\n", ret);
  DEBUG_SERIAL_PRINTF("Decrypted data length: %d\n", decrypted_bytes.size());
  DEBUG_SERIAL_PRINT("Decrypted data: ");



  DEBUG_SERIAL_PRINT("Raw Data (chars): ");
  for (size_t i = 0; i < decrypted_bytes.size(); ++i) {
    DEBUG_SERIAL_PRINTF("%c", decrypted_bytes[i]);
  }
  
  DEBUG_SERIAL_PRINTLN("");
  
  // Deserialize the decrypted data into a protobuf packet
  pb_istream_t stream = pb_istream_from_buffer(decrypted_bytes.data(), decrypted_bytes.size()-2); 
  if (!pb_decode(&stream, toothpaste_EncryptedData_fields, &decrypted)) {
    printf("Decoding encrypted data failed: %s\n", PB_GET_ERROR(&stream));
    return;
  }


  // If the decryption succeeds type the plaintext over HID    
  if (ret == 0)
  {
    // Reset the state so that we don't blink forever in an error state
    stateManager->setState(READY);
    switch(decrypted.which_packetData){
      case toothpaste_EncryptedData_keyboardPacket_tag: {
        std::string textString(decrypted.packetData.keyboardPacket.message, decrypted.packetData.keyboardPacket.length);
        sendString(textString.data(), packet->slowMode);
        break;
      }

      case toothpaste_EncryptedData_keycodePacket_tag: {
        //std::vector<uint8_t> keycode(decrypted.packetData.keycodePacket.code.bytes, decrypted.packetData.keycodePacket.code.size);
        sendKeycode(decrypted.packetData.keycodePacket.code.bytes, packet->slowMode);
        break;
      }

      case toothpaste_EncryptedData_mousePacket_tag: {
        //std::vector<uint8_t> mouseCode(decrypted.packetData.mousePacket);
        moveMouse(decrypted.packetData.mousePacket);
        break;
      }
      
      case toothpaste_EncryptedData_renamePacket_tag: {
        std::string textString(decrypted.packetData.renamePacket.message, decrypted.packetData.renamePacket.length);
        int ret = session->setDeviceName(textString.c_str()); // Set the device name in preferences
        DEBUG_SERIAL_PRINTF("Device rename status code: %d\n", ret);
        DEBUG_SERIAL_PRINTLN("Rebooting Toothpaste...");
        esp_restart();
        break;  
      }

      default:
        DEBUG_SERIAL_PRINTF("Unknown Packet Type: %d", decrypted.which_packetData);
        break;
    }
    notificationPacket.packetType = RECV_READY;
  }

  // If the decryption fails
  else
  {
    DEBUG_SERIAL_PRINT("Decryption failed with error code: ");
    DEBUG_SERIAL_PRINTLN(ret);
    stateManager->setState(DROP);
  }
}

// Read an AUTH packet and check if the client public key and AES key are known
void authenticateClient(toothpaste_DataPacket* packet, SecureSession* session) {
  DEBUG_SERIAL_PRINTLN("Entered authenticateClient");

  String deviceName;
  session->getDeviceName(deviceName);
  DEBUG_SERIAL_PRINTF("Device Name is: %s\n\r", deviceName.c_str());

  clientPubKey = std::string((const char*)packet->encryptedData.bytes, packet->encryptedData.size);

  DEBUG_SERIAL_PRINTF("clientPubKey: %s\n\r", clientPubKey.c_str());
  // If we don't know the AES key for the given public key, set Device Status to UNPAIRED
  if (!session->isEnrolled(clientPubKey.c_str())) {
    DEBUG_SERIAL_PRINTLN("Client is not enrolled");
    // Lower bits of notification are auth status to tell if we recognize the pubkey of the sender
    // Upper bits are the notification itself ([0] = KeepAlive, [1] = Ready to Receive, [2] = Not ready to receive )
    notificationPacket.packetType = RECV_NOT_READY;
    notificationPacket.authStatus = AUTH_FAILED;
    stateManager->setState(UNPAIRED); // Set the device to the unpaired state
  }

  // If we know the AES key set device status to PAIRED (Note: This does not gurantee that the AES key is correct, just that it exists)
  else {
    DEBUG_SERIAL_PRINTLN("Client is enrolled");

    notificationPacket.packetType = RECV_READY;
    notificationPacket.authStatus = AUTH_SUCCESS;
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

        // Wait indefinitely for next packet pointer
        if (xQueueReceive(packetQueue, &taskParams, portMAX_DELAY) == pdTRUE) {
            if (taskParams) {
                //std::string* rawValue = taskParams->rawValue;
                //SecureSession::rawDataPacket packet = unpack(rawValue);

                // Decode protobuf
                DEBUG_SERIAL_PRINTF("Decoding protobuf from %d bytes\n\r", taskParams->rawValue.size());

                DEBUG_SERIAL_PRINT("Raw Data (chars): ");
                for (size_t i = 0; i < taskParams->rawValue.size(); ++i) {
                    DEBUG_SERIAL_PRINTF("%c", taskParams->rawValue[i]);
                }
                DEBUG_SERIAL_PRINTLN("");

                toothpaste_DataPacket toothPacket = toothpaste_DataPacket_init_default;
                pb_istream_t istream = pb_istream_from_buffer(taskParams->rawValue.data(), taskParams->rawValue.size());
                if (!pb_decode(&istream, toothpaste_DataPacket_fields, &toothPacket)) {
                    printf("Decoding toothPacket failed: %s\n", PB_GET_ERROR(&istream));
                }

                //delete rawValue; // Free string memory

                // Debug prints...
                DEBUG_SERIAL_PRINTLN("BLE Data Received.");
                DEBUG_SERIAL_PRINTF("Data length: %ld\r\n", toothPacket.dataLen);
                DEBUG_SERIAL_PRINTF("ID: %d\r\nSlowMode: %d\r\nPacket Number: %ld\r\nTotal Packets: %ld\r\n",
                    toothPacket.packetID,
                    toothPacket.slowMode,
                    toothPacket.packetNumber,
                    toothPacket.totalPackets
                );
                DEBUG_SERIAL_PRINTLN();
              
                // Print raw data as characters (not useful for excrypted data but good for debugging using unencrypted packets)
                DEBUG_SERIAL_PRINT("Raw Data (chars): ");
                for (size_t i = 0; i < toothPacket.dataLen; ++i) {
                    DEBUG_SERIAL_PRINTF("%c", toothPacket.encryptedData.bytes[i]);
                }
                DEBUG_SERIAL_PRINTLN("");

                
                // Handle different types of packets
                if (toothPacket.packetID == toothpaste_DataPacket_PacketID_DATA_PACKET) {
                    decryptSendString(&toothPacket, session);
                }
                else if (toothPacket.packetID == toothpaste_DataPacket_PacketID_AUTH_PACKET) {
                    if (stateManager->getState() == PAIRING) {
                        generateSharedSecret(&toothPacket, session);
                    } else {
                        authenticateClient(&toothPacket, session);
                    }
                }

                delete taskParams; // Free the parameter struct
            }
          
          queuenotify(); // Trigger the notification now that a spot in the queue is freed

        }
    }
}