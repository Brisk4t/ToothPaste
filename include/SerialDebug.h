#pragma once

#if ARDUINO_USB_CDC_ON_BOOT
  #define DEBUG_SERIAL_BEGIN(...) Serial.begin(__VA_ARGS__)
  #define DEBUG_SERIAL_PRINT(...) Serial.print(__VA_ARGS__)
  #define DEBUG_SERIAL_PRINTLN(...) Serial.println(__VA_ARGS__)
  #define DEBUG_SERIAL_PRINTF(...) Serial.printf(__VA_ARGS__)
#else
  #define DEBUG_SERIAL_BEGIN(...)
  #define DEBUG_SERIAL_PRINT(...)
  #define DEBUG_SERIAL_PRINTLN(...)
#define DEBUG_SERIAL_PRINTF(...)

#endif
