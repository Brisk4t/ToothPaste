//Framework libraries
#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <Preferences.h>
// ClipBoard libraries
#include "espHID.h"
#include "main.h"
#include "ble.h"

SecureSession sec;
Preferences preferences; // Preferences for storing data
void enterPairingMode() {

  uint8_t pubKey[SecureSession::PUBKEY_SIZE];
  size_t pubLen;

  int ret = sec.generateKeypair(pubKey, pubLen); // Generate the public key in pairing mode

  if (!ret) { // Successful keygen returns 0
    size_t olen = 0;
    char base64pubKey[50]; // Buffer to hold the Base64 encoded public key

    mbedtls_base64_encode((unsigned char *)base64pubKey, sizeof(base64pubKey), &olen, pubKey, SecureSession::PUBKEY_SIZE); // turn the 
    base64pubKey[olen] = '\0';  // Null-terminate the public key string
    
    delay(5000); // Wait for 5 seconds before sending the public key
    sendString(base64pubKey); // Send the public key to the client over HID
    
    led.blinkStart(500, 0, 30, 30); // Blink to indicate pairing mode
  }
  
  else{
    char retchar[12];
    snprintf(retchar, 12, "%d", ret);  

    sendString("Something went wrong: ");
    sendString(retchar);
    led.setColor(255, 0,0);  // Red
    led.show();
  }
}

void setup() {
  Serial0.begin(115200); // Initialize Serial for debugging
  hidSetup(); // Initialize the HID device
  bleSetup(&sec); // Initialize the BLE device with the secure session
  sec.init(); // Initialize the secure session
  preferences.begin("security", false); // Start the preferences storage (NOT SECURE, just for testing)

  // Intialize the RMT LED Driver
  led.begin();
  led.setColor(10,0,10); // Set the LED to purple
  //led.blinkStart(1000,10,0,10); // Blinking Purple
  led.show();
  
  enterPairingMode();
}

void loop() {
  led.blinkUpdate(); // The blink state is updated in the loop and notifies the RMT thread

  // notify changed value
  if (deviceConnected) {
    //inputCharacteristic->setValue(String(value).c_str());
    led.set(10,10,10); // Set the LED to white when connected
    inputCharacteristic->notify();
    delay(300); // bluetooth stack will go into congestion, if too many packets are sent, in 6 hours test i was able to go as low as 3ms
  }

  // disconnecting  
  if (!deviceConnected) {
    led.blinkStart(1000,10,5,0); // Device was connected, then disconnected
    Serial.println("Device disconnected.");
    bluServer->startAdvertising(); // restart advertising
    Serial.println("Start advertising");
    oldDeviceConnected = deviceConnected;
  }
}


