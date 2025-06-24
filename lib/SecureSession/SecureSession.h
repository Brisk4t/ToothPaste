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
    static constexpr size_t KEY_SIZE = 32;       // 256-bit key
    static constexpr size_t PUBKEY_SIZE = 33;    // Uncompressed point size for secp256r1
    static constexpr size_t IV_SIZE = 12;        // Recommended IV size for AES-GCM
    static constexpr size_t TAG_SIZE = 16;       // AES-GCM authentication tag size
    uint8_t sharedSecret[KEY_SIZE];

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
        uint8_t iv[IV_SIZE],
        uint8_t tag[TAG_SIZE]);

    // Decrypt ciphertext buffer using IV and auth tag
    int decrypt(
        const uint8_t* ciphertext, size_t ciphertext_len,
        const uint8_t iv[IV_SIZE],
        const uint8_t tag[TAG_SIZE],
        uint8_t* plaintext_out);

    bool isSharedSecretReady() const { return sharedReady; }

private:
    mbedtls_ecdh_context ecdh;
    mbedtls_ctr_drbg_context ctr_drbg;
    mbedtls_entropy_context entropy;
    mbedtls_gcm_context gcm;

    //uint8_t sharedSecret[KEY_SIZE];
    bool sharedReady;

    int deriveAESKeyFromSharedSecret(uint8_t key_out[KEY_SIZE]);
};

#endif