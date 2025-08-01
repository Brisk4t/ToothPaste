#include <Arduino.h>
#include <USBHIDKeyboard.h>
#include <USBHIDMouse.h>
#include <USBHIDConsumerControl.h>
#include <USBHIDSystemControl.h>


#define SLOWMODE_DELAY_MS 5

#ifndef HID_H
#define HID_H

void hidSetup();
void sendString(const char* str, bool slowMode = true);
void sendString(void* arg, bool slowMode = true);
void sendStringDelay(void *arg, int delay);
void sendKeycode(uint8_t* keys, bool slowMode);

//Mouse functions
void moveMouse(int32_t x, int32_t y, bool LClick, bool RClick);
void moveMouse(uint8_t* mousePacket);
void smoothMoveMouse(int dx, int dy, int steps, int interval);

#endif
