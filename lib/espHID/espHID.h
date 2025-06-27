#include <USBHIDKeyboard.h>

#ifndef HID_H
#define HID_H

void hidSetup();
void sendString(const char* str);
void sendString(void* arg);


#endif
