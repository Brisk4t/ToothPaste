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

void enterPairingMode() { // Enter pairing mode, generate a keypair, and send the public key to the transmitter
  Serial0.println("Entering pairing mode...");
  uint8_t pubKey[SecureSession::PUBKEY_SIZE];
  size_t pubLen;
  
  led.blinkStart(1000, Colors::Purple); // Blinking Purple
  int ret = sec.generateKeypair(pubKey, pubLen); // Generate the public key in pairing mode

  if (!ret) { // Successful keygen returns 0
    size_t olen = 0;
    char base64pubKey[50]; // Buffer to hold the Base64 encoded public key

    mbedtls_base64_encode((unsigned char *)base64pubKey, sizeof(base64pubKey), &olen, pubKey, SecureSession::PUBKEY_SIZE); // turn the 
    base64pubKey[olen] = '\0';  // Null-terminate the public key string
    
    delay(5000); // Wait for 5 seconds before sending the public key (need to make non-blocking)
    sendString(base64pubKey); // Send the public key to the client over HID
    
    //led.blinkStart(500, 0, 80, 30); // Blink to indicate pairing mode
  }
  
  else{
    char retchar[12];
    snprintf(retchar, 12, "%d", ret);  

    Serial0.println("Keygen failed with error: ");
    Serial0.println(retchar); // Print the error code to Serial for debugging
    led.set(Colors::Red);  // Red
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
  led.set(Colors::Orange); // Set the LED to Orange on startup

  //enterPairingMode();
}

void loop() {
  led.blinkUpdate(); // The blink state is updated in the loop and notifies the RMT thread
}
