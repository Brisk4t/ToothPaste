#include "NeoPixelRMT.h"
#include "SecureSession.h"
#include "hwUI.h"

#define SERVICE_UUID        "19b10000-e8f2-537e-4f6c-d104768a1214"
#define INPUT_STRING_CHARACTERISTIC "6856e119-2c7b-455a-bf42-cf7ddd2c5907"
#define LED_CHARACTERISTIC_UUID "19b10002-e8f2-537e-4f6c-d104768a1214"


// Struct that defines a single packet of data (can contain whole or partial message)
// Packet is signed with private key and its data is encrypted with AES-GCM using the shared secret


