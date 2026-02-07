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
BLECharacteristic* responseCharacteristic = NULL; // Characteristic for LED control
BLECharacteristic* macCharacteristic = NULL;

QueueHandle_t packetQueue = xQueueCreate(50, sizeof(SharedSecretTaskParams*)); // Queue to manage RTOS task parameters

bool manualDisconnect = false; // Flag to indicate if the user manually disconnected
std::string clientPubKey;  // safer than char*

// Create the persistent RTOS packet handler task
void createPacketTask(SecureSession* sec) {
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
  int64_t t0 = esp_timer_get_time();
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
    int64_t elapsed = esp_timer_get_time() - t0;
    DEBUG_SERIAL_PRINTF("Packet Queuing took %lld us\n", elapsed);
    
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
  startKeyboardTask();
  // Get the device name and start advertising 
  String deviceName;
  session->getDeviceName(deviceName); // Get the device name from memory

  DEBUG_SERIAL_PRINTF("Device Name is: %s", deviceName.c_str());
  if (deviceName.length() < 1) {
    BLEDevice::init(BLE_DEVICE_DEFAULT_NAME);
  }
  else {
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
    TX_TO_TOOTHPASTE_CHARACTERISTIC,
    BLECharacteristic::PROPERTY_READ |      // Client can read
    BLECharacteristic::PROPERTY_WRITE_NR |  // Client can Write without Response
    BLECharacteristic::PROPERTY_NOTIFY |    // Server can async notify
    BLECharacteristic::PROPERTY_INDICATE);  // Server can notify with ACK

  // Register the callback for the input data characteristic
  inputCharacteristic->setCallbacks(new InputCharacteristicCallbacks(session));

  // Create the HID Ready Semaphore Characteristic
  responseCharacteristic = pService->createCharacteristic(
    RESPONSE_CHARACTERISTIC,
    BLECharacteristic::PROPERTY_NOTIFY);

  // Create a MAC address characteristic
  macCharacteristic = pService->createCharacteristic(
    MAC_CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ |
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

// Notify the semaphore characteristic if the RTOS task queue is not full
void queuenotify() {
  if (uxQueueSpacesAvailable(packetQueue) == 0) {
    DEBUG_SERIAL_PRINTLN("Queue is full!");
    return;
  }

  else {

    // Notify the client that we're ready to receive the next packet (with no challenge data since this is not an auth response)
    notifyResponsePacket(toothpaste_ResponsePacket_ResponseType_PEER_KNOWN, nullptr, 0); 

    printf("Queue has space: %d\n", uxQueueSpacesAvailable(packetQueue));
  }
}

// Notify using a toothPaste.responsePacket protobuf message
void notifyResponsePacket(toothpaste_ResponsePacket_ResponseType responseType, const uint8_t* challengeData, size_t challengeDataLen) {
  uint8_t buffer[256];
  pb_ostream_t stream = pb_ostream_from_buffer(buffer, sizeof(buffer));
  
  // Initialize the response packet
  toothpaste_ResponsePacket responsePacket = toothpaste_ResponsePacket_init_default;
  
  // Set response type
  responsePacket.responseType = (toothpaste_ResponsePacket_ResponseType)responseType;
  
  // Set challenge data (either all 0s or from the passed data)
  if (challengeData != nullptr && challengeDataLen > 0) {
    // Copy challenge data into the bytes array, ensuring we don't exceed max size
    size_t copyLen = (challengeDataLen < sizeof(responsePacket.challengeData.bytes)) 
                      ? challengeDataLen 
                      : sizeof(responsePacket.challengeData.bytes);
    memcpy(responsePacket.challengeData.bytes, challengeData, copyLen);
    responsePacket.challengeData.size = copyLen;
  }
  
  if (!pb_encode(&stream, toothpaste_ResponsePacket_fields, &responsePacket)) {
    printf("Encoding response packet failed: %s\n", PB_GET_ERROR(&stream));
    return;
  }
  
  // Send the encoded buffer to the client
  responseCharacteristic->setValue(buffer, stream.bytes_written);  // Set the data to be notified
  responseCharacteristic->notify();                      // Notify the semaphor characteristic
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

  // Compute shared secret from peer public key array (also stores it and derives session AES key)
  if (!session->computeSharedSecret(peerKeyArray, peerKeyLen, base64Input.c_str()))
  {
    DEBUG_SERIAL_PRINTLN("Shared secret computed and AES key derived successfully");
    clientPubKey = std::string((const char*)base64Input.c_str(), base64Input.length());
    stateManager->setState(READY);

    notifyPeerWithSessionSalt(session); // Notify the client with the session salt to confirm pairing and shared secret computation
  }
  // If the shared secret computation or key derivation fails
  else
  {
    DEBUG_SERIAL_PRINTF("Shared secret computation or key derivation failed!\n");
    stateManager->setState(ERROR);
  }

  // Disable pairing mode after processing
  stateManager->setState(READY);
  DEBUG_SERIAL_PRINTLN("Pairing mode disabled.");

  return;
}

// Decrypt a data packet and type the text content as a string
void decryptSendString(toothpaste_DataPacket* packet, SecureSession* session) {
  int64_t t0 = esp_timer_get_time();
 
  // Average decryption time: ~ 13000us (13ms)
  // Average decryption time: ~ 377us (0.377ms) with new SecureSession optimizations (key caching, HKDF caching, etc..)

  std::vector<uint8_t> decrypted_bytes((packet->dataLen) + 2);
  toothpaste_EncryptedData decrypted = toothpaste_EncryptedData_init_default;
 

  int ret = session->decrypt(packet, decrypted_bytes.data(), clientPubKey.c_str()); // Get the serialized form of the decrypted data

  int64_t elapsed = esp_timer_get_time() - t0;

  DEBUG_SERIAL_PRINTF("Packet Decryption took %lld us\n", elapsed);
  DEBUG_SERIAL_PRINTF("Decrypted data length: %d\n", decrypted_bytes.size());

  DEBUG_SERIAL_PRINT("Raw Data (chars): ");
  for (size_t i = 0; i < decrypted_bytes.size(); ++i) {
    DEBUG_SERIAL_PRINTF("%c", decrypted_bytes[i]);
  }

  DEBUG_SERIAL_PRINTLN("");

  // Average protobuf deserialization time: ~ 150us (0.15ms)
  // Deserialize the decrypted data into a protobuf packet
  pb_istream_t stream = pb_istream_from_buffer(decrypted_bytes.data(), decrypted_bytes.size() - 2);
  if (!pb_decode(&stream, toothpaste_EncryptedData_fields, &decrypted)) {
    printf("Decoding encrypted data failed: %s\n", PB_GET_ERROR(&stream));
    return;
  }
  
  // If the decryption succeeds type the plaintext over HID    
  if (ret == 0)
  {
    // Reset the state so that we don't blink forever in an error state
    stateManager->setState(READY);
    switch (decrypted.which_packetData) {
      // A keyboard text packet (string data)
      case toothpaste_EncryptedData_keyboardPacket_tag:
      {
        sendString(decrypted.packetData.keyboardPacket.message, decrypted.packetData.keyboardPacket.length, packet->slowMode);
        break;
      }

      case toothpaste_EncryptedData_keycodePacket_tag:
      {
        //std::vector<uint8_t> keycode(decrypted.packetData.keycodePacket.code.bytes, decrypted.packetData.keycodePacket.code.size);
        sendKeycode(decrypted.packetData.keycodePacket.code.bytes, packet->slowMode, true);
        break;
      }

      case toothpaste_EncryptedData_mousePacket_tag:
      {
        //std::vector<uint8_t> mouseCode(decrypted.packetData.mousePacket);
        moveMouse(decrypted.packetData.mousePacket);
        break;
      }

      case toothpaste_EncryptedData_renamePacket_tag:
      {
        std::string textString(decrypted.packetData.renamePacket.message, decrypted.packetData.renamePacket.length);
        int ret = session->setDeviceName(textString.c_str()); // Set the device name in preferences
        DEBUG_SERIAL_PRINTF("Device rename status code: %d\n", ret);
        DEBUG_SERIAL_PRINTLN("Rebooting Toothpaste...");
        esp_restart();
        break;
      }

      case toothpaste_EncryptedData_consumerControlPacket_tag:
      {
        //std::vector<uint8_t> keycode(decrypted.packetData.keycodePacket.code.bytes, decrypted.packetData.keycodePacket.code.size);
        consumerControlPress(decrypted.packetData.consumerControlPacket);
        break;
      }

      case toothpaste_EncryptedData_mouseJigglePacket_tag:
      {
        bool enable = decrypted.packetData.mouseJigglePacket.enable;
        if (enable) {
          startJiggle();
        }
        else {
          stopJiggle();
        }
        break;
      }

      default:
        DEBUG_SERIAL_PRINTF("Unknown Packet Type: %d", decrypted.which_packetData);
        break;
    }
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

  // The packet's "encryptedData" field contains the unencrypted public key in an AUTH packet
  clientPubKey = std::string((const char*)packet->encryptedData.bytes, packet->encryptedData.size);
  //ESP_LOGD("clientPubKey: %s\n\r", clientPubKey.c_str());


  // If we don't know the shared secret for the given public key, set Device Status to UNPAIRED
  if (!session->loadIfEnrolled(clientPubKey.c_str())) {
    DEBUG_SERIAL_PRINTLN("Client is not enrolled");

    notifyResponsePacket(toothpaste_ResponsePacket_ResponseType_PEER_UNKNOWN, nullptr, 0);
    stateManager->setState(UNPAIRED); // Set the device to the unpaired state
  }

  // Todo: Confirm that the shared secret is correct by sending an encrypted challenge packet that the client must respond to correctly before setting to ready (this would prevent a MITM attack where an attacker could enroll with their own public key and then replay packets from a victim without needing to know the victim's shared secret) - This is especially important if we allow pairing mode to be re-enabled after a client is enrolled, as an attacker could force a disconnect, re-enable pairing, and enroll with their own key to perform a MITM attack
  // If we know the shared secret set device status to PAIRED (Note: This does not gurantee that the shared secret is correct, just that it exists)
  else {
    DEBUG_SERIAL_PRINTLN("Client is enrolled");

    // Derive the session AES key from the stored shared secret
    int ret = session->deriveAESKeyFromSecret(clientPubKey.c_str());
    if (ret != 0) {
      DEBUG_SERIAL_PRINTF("Failed to derive session AES key: %d\n", ret);
      notifyResponsePacket(toothpaste_ResponsePacket_ResponseType_PEER_UNKNOWN, nullptr, 0);
      stateManager->setState(ERROR);
      return;
    }

    notifyPeerWithSessionSalt(session);
    stateManager->setState(READY);
  }
}

// Create and encode a response packet with session salt as challenge data
void notifyPeerWithSessionSalt(SecureSession* session) {
  uint8_t buffer[256];
  pb_ostream_t stream = pb_ostream_from_buffer(buffer, sizeof(buffer));
  
  // Initialize the response packet
  toothpaste_ResponsePacket responsePacket = toothpaste_ResponsePacket_init_default;
  
  // Set response type to CHALLENGE
  responsePacket.responseType = toothpaste_ResponsePacket_ResponseType_CHALLENGE;
  
  // Fill challenge data with session salt
  memcpy(responsePacket.challengeData.bytes, session->sessionSalt, sizeof(session->sessionSalt));
  responsePacket.challengeData.size = sizeof(session->sessionSalt);

  DEBUG_SERIAL_PRINTF("Session salt sent as challenge data: ");
  for (size_t i = 0; i < responsePacket.challengeData.size; ++i) {
    DEBUG_SERIAL_PRINTF("%02X", responsePacket.challengeData.bytes[i]);
  }
  DEBUG_SERIAL_PRINTLN();
  
  // Encode and send
  if (!pb_encode(&stream, toothpaste_ResponsePacket_fields, &responsePacket)) {
    printf("Encoding response packet failed: %s\n", PB_GET_ERROR(&stream));
    return;
  }

  // Debug: print the encoded bytes and size
  DEBUG_SERIAL_PRINTF("Encoded packet size: %zu bytes\n", stream.bytes_written);
  DEBUG_SERIAL_PRINT("Encoded buffer (hex): ");
  for (size_t i = 0; i < stream.bytes_written; ++i) {
    DEBUG_SERIAL_PRINTF("%02X ", buffer[i]);
  }
  DEBUG_SERIAL_PRINTLN();
  
  responseCharacteristic->setValue(buffer, stream.bytes_written);
  responseCharacteristic->notify();
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
        DEBUG_SERIAL_PRINTF("Time entering packet decode: %lld us\n", esp_timer_get_time());
        // Decode protobuf
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
          }
          else {
            authenticateClient(&toothPacket, session);
          }
        }

        DEBUG_SERIAL_PRINTF("Time exiting packet decode: %lld us\n", esp_timer_get_time());


        delete taskParams; // Free the parameter struct
      }
    }
  }
}