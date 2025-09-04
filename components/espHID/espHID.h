#include <Arduino.h>
#include <SerialDebug.h>

// #define CFG_TUD_CDC        
// #define CONFIG_TINYUSB_CDC_ENABLED
#define USB_MANUFACTURER   "Brisk4t"
#define USB_PRODUCT        "ToothPaste Receiver"
#define USB_SERIAL         "" // Empty string for MAC adddress

#define SLOWMODE_DELAY_MS 5

#ifndef HID_H
#define HID_H


void hidSetup();
void sendString(const char* str, bool slowMode = true);
void sendString(void* arg, bool slowMode = true);
void sendStringDelay(void *arg, int delay);
void sendKeycode(uint8_t* keys, bool slowMode);

//Mouse functions
void moveMouse(int32_t x, int32_t y, int32_t LClick, int32_t RClick);
void moveMouse(uint8_t* mousePacket);
void smoothMoveMouse(int dx, int dy, int steps, int interval);

#endif
