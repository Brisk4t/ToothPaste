#include <USBHIDKeyboard.h>

#define HID_KEY_KEYPAD_EXCLAMATION                 0xCF
#ifndef HID_H
#define HID_H

void hidSetup();
void sendString(const char* str);


#endif
