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

SecureSession sec; // Global Secure Session
static char base64pubKey[45]; // Buffer to hold the Base64 encoded public key (44 base64 chars + 1 null)


// Send the public key over hid and wait for ble peer public key
void sendPublicKey(void* arg) {
  const char* pubKey = static_cast<const char*>(arg);
  Serial0.println("Sending public key: ");
  Serial0.println(pubKey); // Print the public key to Serial for debugging
  sendString(pubKey); // Send the public key to the client over HID
  led.blinkEnd(); // Stop blinking
  
  // Finish the handshake here
  led.set(Colors::Purple); // Set green to indicate waiting for peer public key
  //enablePairingMode(); // Set ble to interpret the next write as a peer public key
}


// Enter pairing mode, generate a keypair, and send the public key to the transmitter
void enterPairingMode() { 
  Serial0.println("Entering pairing mode...");
  stateManager->setState(PAIRING);

  uint8_t pubKey[SecureSession::PUBKEY_SIZE]; 
  size_t pubLen;
  
  int ret = sec.generateKeypair(pubKey, pubLen); // Generate the compressed public key in pairing mode
  
  // Successful keygen returns 0
  if (!ret) { 
    // Base64 encode the public key for transmission
    size_t olen = 0;
    mbedtls_base64_encode((unsigned char *)base64pubKey, sizeof(base64pubKey), &olen, pubKey, SecureSession::PUBKEY_SIZE);
    base64pubKey[olen] = '\0';  // Null-terminate the public key string
    
    // Print Public Key to Serial
    Serial0.println("Public Key Generated: ");
    Serial0.println(base64pubKey);
    Serial0.println();

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
    stateManager->setState(ERROR);
  }
}

void setup() {
  Serial0.begin(115200); // Initialize Serial for debugging
  
  led.begin();    // Intialize the RMT LED Driver

  //Initialize the global device state manager
  stateManager = new StateManager();
  stateManager->registerLedCallbacks();
  stateManager->setState(NOT_CONNECTED);

  hidSetup(); // Initialize the HID device
  bleSetup(&sec); // Initialize the BLE device with the secure session
  sec.init(); // Initialize the secure session
}

// The loop is only used for gpio polling
void loop() {
  led.blinkUpdate(); // The blink state is updated in the loop and notifies the RMT thread
  
  // Poll the button state (interrupts would cause issues with RTOS)
  int buttonEvent = checkButton();
  if (buttonEvent == 1) { // Single click event
    if(stateManager->getState() == PAIRING){
      sendString(base64pubKey);
    }
    else
      sendString("Button clicked!");
  } 


  else if (buttonEvent == 2) { // Hold event
    Serial0.println("Button held!");
    stateManager->setState(PAIRING);
    enterPairingMode(); // Enter pairing mode on hold
  }
}
