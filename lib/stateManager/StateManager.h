#ifndef STATEMANAGER_H
#define STATEMANAGER_H

#include <Arduino.h>
#include <vector>
#include <functional>



enum DeviceState {
    NOT_CONNECTED,      // No bluetooth client connected (advertising)                  | 0
    UNPAIRED,           // Connected, client not recognized                             | 1
    PAIRING,            // Waiting for client public key                                | 2
    READY,              // Connected and ready to receive                               | 3
    DISCONNECTED,       // Previously connected device triggered onDisconnect callback  | 4
    ERROR,              // Transition state to print errors and return to prior state   | 5

};


using StateCallback = std::function<void(DeviceState)>; // Define StateCallback as an alias for the callback function 


class StateManager {
public:
    StateManager();
    void setState(DeviceState newState);
    DeviceState getState() const;
    void onChange(StateCallback cb);
private:
    DeviceState currentState = NOT_CONNECTED;
    std::vector<StateCallback> callbacks;

};


extern StateManager stateManager; // Global device state manager instance

#endif