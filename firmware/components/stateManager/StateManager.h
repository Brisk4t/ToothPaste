#ifndef STATEMANAGER_H
#define STATEMANAGER_H

#include <Arduino.h>
#include <vector>
#include <functional>

#include <SerialDebug.h>



enum DeviceState {
    NOT_CONNECTED,      // No bluetooth client connected (advertising)                  | 0
    UNPAIRED,           // Connected, client not recognized                             | 1
    PAIRING,            // Waiting for client public key                                | 2
    READY,              // Connected and ready to receive                               | 3
    DISCONNECTED,       // Previously connected device triggered onDisconnect callback  | 4
    ERROR,              // Terminate and reset device                                   | 5
    DROP,               // Transition to normal state after indicating error            | 6
};


using StateCallback = std::function<void(DeviceState)>; // Define StateCallback as an alias for the callback function 


class StateManager {
public:
    void registerLedCallbacks();
    void setState(DeviceState newState);
    DeviceState getState() const;
    void onChange(StateCallback cb);
private:
    DeviceState currentState = ERROR;
    StateCallback callback = nullptr;  // Only one callback

};


extern StateManager* stateManager; // Global device state manager instance

#endif