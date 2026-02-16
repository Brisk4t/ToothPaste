#pragma once
#define TOOTHPASTE_DEBUG_ENABLED 1

// TODO: Migrate to esp_log

#if TOOTHPASTE_DEBUG_ENABLED
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
