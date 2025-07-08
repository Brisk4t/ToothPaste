#include "StateManager.h"
#include "NeoPixelRMT.h"

static void changeLed(DeviceState state); // Forward declaration
StateManager stateManager;

// On instantiation register the led driver as a callback
StateManager::StateManager() {
    // Register callback(s) here
    onChange([](DeviceState state) {
        changeLed(state);
    });
}

// If setState() is called, trigger the respective state's callbacks
void StateManager::setState(DeviceState newState) {
    if (newState != currentState) {
        currentState = newState;
        // Call all registered callbacks
        for (auto& cb : callbacks) {
            if (cb) cb(currentState);
        }
    }
}

// Add a callback function to the list of callbacks
void StateManager::onChange(StateCallback cb) {
    callbacks.push_back(cb);  // Add new callback
    Serial0.printf("Device State: %s\n\r", currentState);
}

// Get the current device state
DeviceState StateManager::getState() const {
    return currentState;
}

static void setNotConnected(void* args){
    stateManager.setState(NOT_CONNECTED);
}

// Each state has its own led color / mode
static void changeLed(DeviceState state){
    switch(state){
        case NOT_CONNECTED:
            led.blinkEnd();
            led.set(Colors::Orange);
            break;

        case UNPAIRED:
            led.blinkEnd();
            led.set(Colors::Yellow);
            break;

        case PAIRING:
            led.blinkStart(1000, Colors::Purple);
            break;

        case READY:
            led.blinkEnd();
            led.set(Colors::Cyan);
            break;

        case DISCONNECTED:
            led.blinkStart(500, Colors::Red);
            break;

        case ERROR:
        {
            led.set(Colors::Red);

            // Create a one-shot timer to reset the device state on error
            esp_timer_create_args_t timer_args = {
            .callback = &setNotConnected,
            .dispatch_method = ESP_TIMER_TASK,
            .name = "delayedReset"
            };
            esp_timer_handle_t oneShotTimer;
            esp_timer_create(&timer_args, &oneShotTimer);
            esp_timer_start_once(oneShotTimer, 3000000); // 3 seconds
            break;
        }

        default:
            break;

    }
}