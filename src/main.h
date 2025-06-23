#include "NeoPixelRMT.h"


#define RGB_LED 48 // Override the board's defined RGB
#define SERVICE_UUID        "19b10000-e8f2-537e-4f6c-d104768a1214"
#define INPUT_STRING_CHARACTERISTIC "6856e119-2c7b-455a-bf42-cf7ddd2c5907"
#define LED_CHARACTERISTIC_UUID "19b10002-e8f2-537e-4f6c-d104768a1214"


extern NeoPixelRMT led(GPIO_NUM_21);


