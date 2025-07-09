#include <Arduino.h>
#include <USBHIDKeyboard.h>
#define SLOWMODE_DELAY_MS 20

#ifndef HID_H
#define HID_H

void hidSetup();
void sendString(const char* str, bool slowMode = false);
void sendString(void* arg, bool slowMode = false);
void sendString(void *arg, bool slowMode, int delay);

#endif
