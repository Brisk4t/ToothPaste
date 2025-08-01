#pragma once

#if ARDUINO_USB_CDC_ON_BOOT
  #define DEBUG_SERIAL_BEGIN(...) Serial0.begin(__VA_ARGS__)
  #define DEBUG_SERIAL_PRINT(...) Serial0.print(__VA_ARGS__)
  #define DEBUG_SERIAL_PRINTLN(...) Serial0.println(__VA_ARGS__)
  #define DEBUG_SERIAL_PRINTF(...) Serial0.printf(__VA_ARGS__)
#else
  #define DEBUG_SERIAL_BEGIN(...)
  #define DEBUG_SERIAL_PRINT(...)
  #define DEBUG_SERIAL_PRINTLN(...)
#define DEBUG_SERIAL_PRINTF(...)

#endif
