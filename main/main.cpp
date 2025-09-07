//Framework libraries
#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <esp_timer.h>

// ClipBoard libraries
#include <SerialDebug.h>
#include "espHID.h"
#include "main.h"
#include "ble.h"


SecureSession sec; // Global Secure Session
static char base64pubKey[45]; // Buffer to hold the Base64 encoded public key (44 base64 chars + 1 null)

// Send the public key over hid and wait for ble peer public key
void sendPublicKey(void* arg) {
  const char* pubKey = static_cast<const char*>(arg);
  DEBUG_SERIAL_PRINTLN("Sending public key: ");
  DEBUG_SERIAL_PRINTLN(pubKey); // Print the public key to Serial for debugging
  sendString(pubKey); // Send the public key to the client over HID
  sendString("\n");
  led.blinkEnd(); // Stop blinking
  
  // Finish the handshake here
  led.set(Colors::Purple); // Set green to indicate waiting for peer public key
  //enablePairingMode(); // Set ble to interpret the next write as a peer public key
}


// Enter pairing mode, generate a keypair, and send the public key to the transmitter
void enterPairingMode() { 
  DEBUG_SERIAL_PRINTLN("Entering pairing mode...");
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
    DEBUG_SERIAL_PRINTLN("Public Key Generated: ");
    DEBUG_SERIAL_PRINTLN(base64pubKey);
    DEBUG_SERIAL_PRINTLN();

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

    DEBUG_SERIAL_PRINTLN("Keygen failed with error: ");
    DEBUG_SERIAL_PRINTLN(retchar); // Print the error code to Serial for debugging
    stateManager->setState(ERROR);
  }
}

extern "C" void app_main() {
    // Initialize Arduino core
    initArduino();

    // Initialize Serial for debugging
    DEBUG_SERIAL_BEGIN(115200);

    // Initialize the LED driver
    led.begin();

    // Initialize the global device state manager
    stateManager = new StateManager();
    stateManager->registerLedCallbacks();
    stateManager->setState(NOT_CONNECTED);

    // Initialize devices
    hidSetup();          // HID device
    bleSetup(&sec);      // BLE device with secure session
    sec.init();          // Secure session

    // Main loop: replace Arduino loop() with while(true)
    while (true) {
        led.blinkUpdate(); // Update LED blink state

        // Poll button state
        int buttonEvent = checkButton();
        uint8_t keycode[7] = { 0x80, 'a', 0, 0, 0, 0, 0 };

        if (buttonEvent == 1) { // Single click
          printf("Single Click");
          if (stateManager->getState() == PAIRING) {
              sendString(base64pubKey);
          } else {
              //sendKeycode(keycode, true);
              sendString("Teststring1234", true);
          }
        } 
        else if (buttonEvent == 2) { // Hold
          // printf("Button held!");
          // stateManager->setState(PAIRING);
          // enterPairingMode();
          
          printf("Running stringTest");
          stringTest();
        }

        // Delay to allow FreeRTOS task switching
        vTaskDelay(10 / portTICK_PERIOD_MS); // ~10ms loop
    }
}

// void setup() {
//   DEBUG_SERIAL_BEGIN(115200); // Initialize Serial for debugging
  
//   led.begin();    // Intialize the RMT LED Driver

//   //Initialize the global device state manager
//   stateManager = new StateManager();
//   stateManager->registerLedCallbacks();
//   stateManager->setState(NOT_CONNECTED);

//   hidSetup(); // Initialize the HID device
//   bleSetup(&sec); // Initialize the BLE device with the secure session
//   sec.init(); // Initialize the secure session
// }

// // The loop is only used for gpio polling
// void loop() {
//   led.blinkUpdate(); // The blink state is updated in the loop and notifies the RMT thread
  
//   // Poll the button state (interrupts would cause issues with RTOS)
//   int buttonEvent = checkButton();
//   uint8_t keycode[7] = { 0x80, 'a', 0, 0, 0, 0, 0 }; 
  
//   if (buttonEvent == 1) { // Single click event
//     if(stateManager->getState() == PAIRING){
//       sendString(base64pubKey);
//     }
//     else
//       sendKeycode(keycode, true);
//   } 


//   else if (buttonEvent == 2) { // Hold event
//     DEBUG_SERIAL_PRINTLN("Button held!");
//     stateManager->setState(PAIRING);
//     enterPairingMode(); // Enter pairing mode on hold
//   }

// }