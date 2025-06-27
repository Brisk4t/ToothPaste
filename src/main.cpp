//Framework libraries
#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <esp_timer.h>
// ClipBoard libraries
#include "espHID.h"
#include "main.h"
#include "ble.h"

SecureSession sec;


void sendPublicKey(void* arg) {
  const char* pubKey = static_cast<const char*>(arg);
  Serial0.println("Sending public key: ");
  Serial0.println(pubKey); // Print the public key to Serial for debugging
  sendString(pubKey); // Send the public key to the client over HID
  led.blinkEnd(); // Stop blinking
  
  // Finish the handshake here
  led.set(Colors::Green); // Blink to indicate pairing mode
  enablePairingMode(); // Re-enter pairing mode to wait for the peer to send their public key
}

// Enter pairing mode, generate a keypair, and send the public key to the transmitter
void enterPairingMode() { 
  disconnect(); // Disconnect any existing BLE connection
  Serial0.println("Entering pairing mode...");
  led.blinkStart(1000, Colors::Purple); // Blinking Purple

  uint8_t pubKey[SecureSession::PUBKEY_SIZE];
  size_t pubLen;
  
  int ret = sec.generateKeypair(pubKey, pubLen); // Generate the public key in pairing mode

  if (!ret) { // Successful keygen returns 0

    // Base64 encode the public key for transmission
    size_t olen = 0;
    static char base64pubKey[50]; // Buffer to hold the Base64 encoded public key
    mbedtls_base64_encode((unsigned char *)base64pubKey, sizeof(base64pubKey), &olen, pubKey, SecureSession::PUBKEY_SIZE); // turn the 
    base64pubKey[olen] = '\0';  // Null-terminate the public key string
    
    // Create a one-shot timer to send the public key after 5 seconds
    esp_timer_create_args_t timer_args = {
      .callback = &sendPublicKey,
      .arg = base64pubKey,
      .dispatch_method = ESP_TIMER_TASK,
      .name = "delayedFn"
    };

    esp_timer_handle_t oneShotTimer;
    esp_timer_create(&timer_args, &oneShotTimer);
    esp_timer_start_once(oneShotTimer, 5000000); // 5 seconds
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

  // Intialize the RMT LED Driver
  led.begin();
  led.set(Colors::Orange); // Set the LED to Orange on startup
}

void loop() {
  led.blinkUpdate(); // The blink state is updated in the loop and notifies the RMT thread
  
  // Poll the button state (interrupts would cause issues with RTOS)
  int buttonEvent = checkButton();
  if (buttonEvent == 1) { // Single click event
    sendString("Button clicked!");
  } 
  else if (buttonEvent == 2) { // Hold event
    Serial0.println("Button held!");
    enterPairingMode(); // Enter pairing mode on hold
  }


}
