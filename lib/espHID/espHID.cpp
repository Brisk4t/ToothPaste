#include <espHID.h>
#include <USB.h>

USBHIDKeyboard keyboard;

void hidSetup(){
  keyboard.begin();
  USB.begin();
}


void sendString(const char* str) {
    keyboard.print(str);
}

void sendString(void* arg) {
    const char* str = static_cast<const char*>(arg);
    keyboard.print(str);
}
