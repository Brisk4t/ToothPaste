#include <hid.h>
#include <USB.h>

USBHIDKeyboard keyboard;

void hidSetup(){
  keyboard.begin();
  USB.begin();
}


void sendString(const char* str) {
    keyboard.print(str);
}
