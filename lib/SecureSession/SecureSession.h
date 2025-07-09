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




class SecureSession {
public:
    static constexpr size_t MAX_DATA_LEN = 200;  // Max data bytes that can be sent in 1 MTU leaving room for protocol bytes
    static constexpr size_t ENC_KEYSIZE = 32;    // 256-bit (32 byte) AES and ECDH keys
    static constexpr size_t PUBKEY_SIZE = 33;    // Uncompressed point size for secp256r1
    static constexpr size_t IV_SIZE = 12;        // Recommended IV size for AES-GCM
    static constexpr size_t TAG_SIZE = 16;       // AES-GCM authentication tag size
    static constexpr size_t HEADER_SIZE = 4;     // Size of the header  [packetId(0), slowmode(1), packetNumber(2), totalPackets(3)]
    
    uint8_t sharedSecret[ENC_KEYSIZE];

    struct rawDataPacket {
        // Header
        uint8_t packetId; // Unique ID for type of packet (0 = DATA, 1 = HANDSHAKE)
        uint8_t slowmode; // When enabled reduces the wpm and slows down HID timing to enable legacy text input compatibility (notepad)
        uint8_t packetNumber; // Current packet number out of total
        uint8_t totalPackets; // Total packets for current message
        //uint8_t datatype; // Type of data (e.g., text, image, storage0, storage1, etc.)
        
        // Cipher data
        size_t dataLen;
        uint8_t IV[IV_SIZE]; // Nonce
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
        uint8_t TAG[TAG_SIZE],
        const char* base64pubKey);

    // Decrypt ciphertext buffer using IV and auth tag
    int decrypt(
        const uint8_t IV[IV_SIZE],
        size_t ciphertext_len,
        const uint8_t* ciphertext, 
        const uint8_t TAG[TAG_SIZE],
        uint8_t* plaintext_out,
        const char* base64pubKey
    );
    
    int decrypt(struct rawDataPacket* packet, uint8_t* plaintext_out, const char* base64pubKey);

    bool isSharedSecretReady() const { return sharedReady; }

    // Check if an AUTH packet is known
    bool isEnrolled(const char* key);


    // Derive AES key from shared secret using KDF and store it in preferences
    int deriveAESKeyFromSharedSecret(const char *base64Input);
    void printBase64(const uint8_t * data, size_t dataLen);
    int hkdf_sha256(const uint8_t *salt, size_t salt_len,
                const uint8_t *ikm, size_t ikm_len,
                const uint8_t *info, size_t info_len,
                uint8_t *okm, size_t okm_len);

private:
    mbedtls_ecdh_context ecdh;
    mbedtls_ctr_drbg_context ctr_drbg;
    mbedtls_entropy_context entropy;
    mbedtls_gcm_context gcm;
    
    String hashKey(const char* longKey);
    bool sharedReady;

};

#endif