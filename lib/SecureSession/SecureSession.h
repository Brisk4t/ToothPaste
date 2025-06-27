#include <Arduino.h>
#include <mbedtls/ecdh.h>
#include <mbedtls/ctr_drbg.h>
#include <mbedtls/entropy.h>
#include <mbedtls/gcm.h>
#include <mbedtls/md.h>
#include <mbedtls/sha256.h>
#include <mbedtls/base64.h>

#ifndef SECURESESSION_H
#define SECURESESSION_H


#define MAX_DATA_LEN 128





class SecureSession {
public:
    static constexpr size_t KEY_SIZE = 32;       // 256-bit key
    static constexpr size_t PUBKEY_SIZE = 33;    // Uncompressed point size for secp256r1
    static constexpr size_t IV_SIZE = 12;        // Recommended IV size for AES-GCM
    static constexpr size_t TAG_SIZE = 16;       // AES-GCM authentication tag size
    uint8_t sharedSecret[KEY_SIZE];

    struct rawDataPacket {
        int packetId; // Unique ID for type of packet (0 = RESERVED, 1 = DATA, 2 = ACK, 3 = HANDSHAKE, 4=KEEPALIVE)
        int sourceId; // Unique ID for the source of the packet (e.g., device ID)
        bool slowmode; // When enabled reduces the wpm and slows down HID timing to enable legacy text input compatibility (notepad)

        int totalDataLen; // Total length of the data in the final message
        int packetNumber; // Current packet number out of total
        int totalPackets; // Total packets for current message
        
        uint8_t IV[IV_SIZE]; // Nonce
        uint8_t datatype; // Type of data (e.g., text, image, storage0, storage1, etc.)
        uint8_t data[MAX_DATA_LEN]; // Array to store data, fixed size to simplify design
        uint8_t TAG[TAG_SIZE]; // The AES-GCM integrity tag

    };


    SecureSession();
    ~SecureSession();

    // Initialize RNG and ECDH context; must be called before other operations
    int init();

    // Generate ECDH keypair, output public key bytes
    int generateKeypair(uint8_t outPublicKey[PUBKEY_SIZE], size_t& outPubLen);

    // Compute shared secret given peer public key bytes
    int computeSharedSecret(const uint8_t peerPublicKey[PUBKEY_SIZE], size_t peerPubLen);

    // Encrypt plaintext buffer, outputs ciphertext and auth tag
    int encrypt(
        const uint8_t* plaintext, size_t plaintext_len,
        uint8_t* ciphertext,
        uint8_t IV[IV_SIZE],
        uint8_t TAG[TAG_SIZE]);

    // Decrypt ciphertext buffer using IV and auth tag
    int decrypt(
        const uint8_t IV[IV_SIZE],
        size_t ciphertext_len,
        const uint8_t* ciphertext, 
        const uint8_t TAG[TAG_SIZE],
        uint8_t* plaintext_out);
    
    int decrypt(struct rawDataPacket* packet, uint8_t* plaintext_out);

    bool isSharedSecretReady() const { return sharedReady; }

    // Derive AES key from shared secret using KDF and store it in preferences
    int deriveAESKeyFromSharedSecret();


private:
    mbedtls_ecdh_context ecdh;
    mbedtls_ctr_drbg_context ctr_drbg;
    mbedtls_entropy_context entropy;
    mbedtls_gcm_context gcm;

    //uint8_t sharedSecret[KEY_SIZE];
    bool sharedReady;

};

#endif