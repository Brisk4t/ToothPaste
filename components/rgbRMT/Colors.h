
#include <Arduino.h>

#ifndef COLOR_H
#define COLOR_H



struct RGB {
    uint8_t r;
    uint8_t g;
    uint8_t b;
};


namespace Colors {
    constexpr RGB Red     = {10, 0, 0};
    constexpr RGB Green   = {0, 10, 0};
    constexpr RGB Blue    = {0, 0, 10};
    constexpr RGB Yellow  = {10, 10, 0};
    constexpr RGB Cyan    = {0, 10, 10};
    constexpr RGB Purple  = {10, 0, 10};
    constexpr RGB White   = {10, 10, 10};
    constexpr RGB Off     = {0, 0, 0};
    constexpr RGB Orange  = {30, 3, 0};
}

#endif
