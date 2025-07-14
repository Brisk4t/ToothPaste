#include <Arduino.h>
#include <USBHIDKeyboard.h>
#define SLOWMODE_DELAY_MS 5

#ifndef HID_H
#define HID_H

void hidSetup();
void sendString(const char* str, bool slowMode = true);
void sendString(void* arg, bool slowMode = true);
void sendStringDelay(void *arg, int delay);

#endif
