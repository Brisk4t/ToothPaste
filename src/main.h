#include "NeoPixelRMT.h"
#include "SecureSession.h"


#define SERVICE_UUID        "19b10000-e8f2-537e-4f6c-d104768a1214"
#define INPUT_STRING_CHARACTERISTIC "6856e119-2c7b-455a-bf42-cf7ddd2c5907"
#define LED_CHARACTERISTIC_UUID "19b10002-e8f2-537e-4f6c-d104768a1214"

#define MAX_DATA_LEN 128

// Struct that defines a single packet of data (can contain whole or partial message)
struct rawDataPacket {
    int packetNumber; // Current packet number out of total
    int totalPackets; // Total packets for current message
    int dataLen; // Length of final message data
    uint8_t data[MAX_DATA_LEN]; // Array to store data, fixed size to simplify design
    uint8_t IV[SecureSession::IV_SIZE]; // The random initialization vector
    uint8_t TAG[SecureSession::TAG_SIZE]; // The AES-GCM integrity tag
    bool slowmode; // When enabled reduces the wpm and slows down HID timing to enable legacy text input compatibility (notepad)
} ;



