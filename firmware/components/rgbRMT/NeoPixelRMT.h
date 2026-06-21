#ifndef NEOPIXELRMT_H
#define NEOPIXELRMT_H

#include "Colors.h" // Import the RGB struct and Colors namespace



class NeoPixelRMT {
public:
    explicit NeoPixelRMT(gpio_num_t pin); 


    // Basic RGB LED functions
    void begin();
    void show();

    // Set the color of the LED wihout call to show()
    void setColor(uint8_t r, uint8_t g, uint8_t b);
    void setColor(const RGB& color);
    
    // Set the color of the LED and call show()
    void set(uint8_t r, uint8_t g, uint8_t b);
    void set(const RGB& color);

    // Blinking functions.
    //
    // State ownership lives here, not in the caller: blinkStart() snapshots
    // the current persistent LED state (the solid color or blink set by the
    // device-state manager) and blinkEnd() restores it. A transient consumer
    // (e.g. FIDO user-presence feedback) just blinks while it works and ends
    // the blink when done; the previous device-state color comes back on its
    // own instead of being lost.
    void blinkStart(int intervalMs, uint8_t r, uint8_t g, uint8_t b);
    void blinkStart(int intervalMs, const RGB& color);
    void blinkEnd();
    void blinkUpdate();    // Call this repeatedly in loop()
    bool isBlinking() { return blinking; }

private:
    //rmt_obj_t* rmt;
    rmt_data_t led_data[24];
    gpio_num_t dataPin;

    uint8_t blinkR = 0, blinkG = 0, blinkB = 0;
    unsigned long blinkInterval = 0;
    unsigned long lastToggle = 0;
    bool ledOn = false;
    bool blinking = false;

    // Logical "current" solid color (last set() request), distinct from the
    // transient on/off frames blinkUpdate() pushes to the hardware.
    uint8_t curR = 0, curG = 0, curB = 0;

    // Saved snapshot, captured by blinkStart() and reapplied by blinkEnd().
    bool    savedValid    = false;
    bool    savedBlinking = false;
    int     savedInterval = 0;
    uint8_t savedR = 0, savedG = 0, savedB = 0;

    // Internal blink setup with no snapshot (used by blinkStart and by
    // restoreState so a restore never overwrites the saved snapshot).
    void startBlink(int intervalMs, uint8_t r, uint8_t g, uint8_t b);
    void saveState();
    void restoreState();
};

extern NeoPixelRMT led;



#endif // NEOPIXELRMT_H
