//Framework libraries
#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <nvs_flash.h>

// ClipBoard libraries
#include "esp_log.h"
#include "log_config.h"
#include "espHID.h"
#include "main.h"
#include "ble.h"

//#define ATCA_NO_POLL
static const char* TAG = "MAIN";

SecureSession sec; // Global Secure Session

extern "C" void app_main() {
    ESP_LOGI(TAG, "NVS Activation Status %x\n", nvs_flash_init());

    // initArduino() resets log levels back to CONFIG_LOG_DEFAULT_LEVEL internally,
    // so configure_log_levels() must run after it to take effect for all components.
    initArduino();
    configure_log_levels();
    ESP_LOGI(TAG, "Arduino initialized");
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

    // Register button callbacks — any component can call registerButtonCallback() to hook in

    // Single press callback
    registerButtonCallback(ButtonEvent::SINGLE_PRESS, []() {
        if (stateManager->getState() == PAIRING) {
            sendString(sec.base64pubKey, 45, true); // Resend public key over HID
        }
    });

    // Hold callback to enter pairing mode
    registerButtonCallback(ButtonEvent::HOLD, []() { sec.enterPairingMode(); });

    hwUIBegin(); // Start button polling task

    // Main loop: LED blink updates
    while (true) {
        led.blinkUpdate(); // Update LED blink state

        // Delay to allow FreeRTOS task switching
        vTaskDelay(10 / portTICK_PERIOD_MS); // ~10ms loop
    }
}
