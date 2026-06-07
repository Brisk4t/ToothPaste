#pragma once

#include <Arduino.h>
#include <functional>

#define buttonPin 0

enum class ButtonEvent {
    SINGLE_PRESS = 0,
    HOLD         = 1,
    DOUBLE_CLICK = 2,
};

using ButtonCallback = std::function<void()>;

// Register a callback to fire when the given button event occurs.
// Call before starting hwUITask. Passing nullptr clears the callback.
void registerButtonCallback(ButtonEvent event, ButtonCallback cb);

// Starts the hwUI FreeRTOS task. Call after registering all callbacks.
void hwUIBegin();

void hwUITask(void* arg);
