#ifndef RGB_LED_PIN 
#define RGB_LED_PIN GPIO_NUM_48 // Default pin for the RGB LED, can be changed in constructor
#endif

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

    // Blinking functions
    void blinkStart(int intervalMs, uint8_t r, uint8_t g, uint8_t b);
    void blinkStart(int intervalMs, const RGB& color);
    void blinkEnd();
    void blinkUpdate();    // Call this repeatedly in loop()
    bool isBlinking() { return blinking; }

private:
    //rmt_obj_t* rmt;
    rmt_data_t led_data[24];
    gpio_num_t dataPin;

    uint8_t blinkR, blinkG, blinkB;
    unsigned long blinkInterval;
    unsigned long lastToggle;
    bool ledOn;
    bool blinking;
};

extern NeoPixelRMT led;



#endif // NEOPIXELRMT_H
