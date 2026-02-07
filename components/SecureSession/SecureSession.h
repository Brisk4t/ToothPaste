#include <Arduino.h>
#include <string>
#include <esp_log.h>
#include <psa/crypto.h>
#include <mbedtls/gcm.h>
#include <mbedtls/md.h>
#include <mbedtls/sha256.h>
#include <mbedtls/base64.h>
#include "toothpacket.pb.h"


#ifndef SECURESESSION_H
#define SECURESESSION_H




class SecureSession {
public:
    static constexpr size_t ENC_KEYSIZE = 32;    // 256-bit (32 byte) AES and ECDH keys
    static constexpr size_t PUBKEY_SIZE = 33;    // Uncompressed point size for secp256r1
    
    static constexpr size_t IV_SIZE = 12;        // Recommended IV size for AES-GCM
    static constexpr size_t TAG_SIZE = 16;       // AES-GCM authentication tag size
    static constexpr size_t HEADER_SIZE = 4;     // Size of the header  [packetId(0), slowmode(1), packetNumber(2), totalPackets(3)]
    
    static constexpr size_t MAX_PAIRED_DEVICES = 5; // Number of devices that can be registered as 'transmitters' at once

    SecureSession();
    ~SecureSession();


    unsigned char sessionSalt[16] = {0}; // Salt for the current session


    // Initialize PSA Crypto subsystem; must be called before other operations
    int init();

    // Generate ECDH keypair, output public key bytes
    int generateKeypair(uint8_t outPublicKey[PUBKEY_SIZE], size_t& outPubLen);

    // Compute shared secret given peer public key bytes
    int computeSharedSecret(const uint8_t peerPublicKey[PUBKEY_SIZE], size_t peerPubLen, const char* base64pubKey);

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
    
    int decrypt(toothpaste_DataPacket* packet, uint8_t* decrypted_out, const char* base64pubKey);

    bool isSharedSecretReady() const { return sharedReady; }

    // Check if an AUTH packet is known
    bool loadIfEnrolled(const char* key);

    // Device name functions 
    bool getDeviceName(String &deviceName);
    bool setDeviceName(const char* deviceName);

    // Derive AES key from stored shared secret on-demand
    int deriveAESKeyFromSecret(const char* base64pubKey);

private:

    // The gcm context 
    mbedtls_gcm_context gcm;
    uint8_t sharedSecret[ENC_KEYSIZE]; // Shared secret in cache

    // Shared secret and session key management
    String hashKey(const char* longKey);
    bool sharedReady;
    
    // Session AES key - generated once per session from shared secret, used for all packets
    uint8_t aesKey[ENC_KEYSIZE];
    bool aesKeyReady;


    // Internal helper functions
    
    // Store shared secret to NVS after ECDH computation
    int storeSharedSecret(std::string base64Input);
    

    
    // HKDF key derivation using SHA-256
    int hkdf_sha256(const uint8_t *salt, size_t salt_len,
                const uint8_t *ikm, size_t ikm_len,
                const uint8_t *info, size_t info_len,
                uint8_t *okm, size_t okm_len);
    
    // Debug helper to print bytes as base64
    void printBase64(const uint8_t * data, size_t dataLen);

};

#endif