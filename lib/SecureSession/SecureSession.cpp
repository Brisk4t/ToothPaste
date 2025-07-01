#include <Preferences.h>
#include <nvs_flash.h>

#include "secureSession.h"

mbedtls_ecdh_context ecdh_ctx;
mbedtls_ctr_drbg_context ctr_drbg;
mbedtls_entropy_context entropy;
Preferences preferences; // Preferences for storing data (Not secure, temporary solution)

// Initialize non-volatile storage on the ESP32
void nvsinit()
{
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND)
    {
        // NVS partition was truncated or version mismatch, so erase and retry
        nvs_flash_erase();
        err = nvs_flash_init();
    }

    if (err != ESP_OK)
    {
        Serial0.printf("NVS init failed: %s\n", esp_err_to_name(err));
    }
    else
    {
        Serial0.println("NVS initialized");
    }
}

SecureSession::SecureSession() : sharedReady(false)
{ // Class constructor
    // nvsinit(); // // Initialize non-volatile storage on the ESP32
    mbedtls_ecdh_init(&ecdh_ctx);
    mbedtls_ctr_drbg_init(&ctr_drbg);
    mbedtls_entropy_init(&entropy);
    mbedtls_gcm_init(&gcm);
}

SecureSession::~SecureSession()
{ // Class destructor
    mbedtls_ecdh_free(&ecdh_ctx);
    mbedtls_ctr_drbg_free(&ctr_drbg);
    mbedtls_entropy_free(&entropy);
    mbedtls_gcm_free(&gcm);
}

int SecureSession::init()
{ // Initialize prng and define curve
    const char *personalSalt = "ecdh_session";
    // Try generating the rng seed
    int ret = mbedtls_ctr_drbg_seed(
        &ctr_drbg,
        mbedtls_entropy_func,
        &entropy,
        (const unsigned char *)personalSalt,
        strlen(personalSalt));
    if (ret != 0)
        return ret;

    ret = mbedtls_ecp_group_load(&ecdh_ctx.grp, MBEDTLS_ECP_DP_SECP256R1); // Use curve secp256r1
    return ret;
}

int SecureSession::generateKeypair(uint8_t outPublicKey[PUBKEY_SIZE], size_t &outPubLen)
{ // Generate private and public key

    // Try generating the keypair (TODO: store into memory to persist after 1 pairing)
    int ret = mbedtls_ecdh_gen_public(
        &ecdh_ctx.grp, // Curve group (e.g., SECP256R1)
        &ecdh_ctx.d,   // private key
        &ecdh_ctx.Q,   // public key
        mbedtls_ctr_drbg_random,
        &ctr_drbg);
    if (ret != 0)
        return ret;

    // Write the compressed public key to the outPublicKey array (decompression is handled on the peer)
    unsigned char pubkey[PUBKEY_SIZE];
    size_t olen = 0;
    mbedtls_ecp_point_write_binary(
        &ecdh_ctx.grp,             // Curve group (e.g., SECP256R1)
        &ecdh_ctx.Q,               // Public key point
        MBEDTLS_ECP_PF_COMPRESSED, // <-- Use compressed format
        &olen,
        outPublicKey,
        sizeof(pubkey));
    if (ret != 0)
        return ret;

    if (olen != PUBKEY_SIZE)
        return -1; // unexpected size
    return 0;
}

// The Peer public key is an uncompressed ECDH point of Len = COMPRESSED_LEN*2
int SecureSession::computeSharedSecret(const uint8_t peerPublicKey[PUBKEY_SIZE * 2], size_t peerPubLen)
{ // Compute shared secret given the peer's public key
    if (peerPubLen < 65)
        return -1;

    // initialize the struct to hold the peer's public key (point on the curve)
    mbedtls_ecp_point peerPoint;
    mbedtls_ecp_point_init(&peerPoint);

    // Read the uncompressed peer public key (compressed support N/A on current ESP32 arduino core)
    int ret = mbedtls_ecp_point_read_binary(&ecdh_ctx.grp, &peerPoint, peerPublicKey, 65);
    if (ret != 0)
    {
        mbedtls_ecp_point_free(&peerPoint);
        Serial0.println("Error reading peer public key");
        Serial0.printf("Error code: %d\n", ret);
        return ret;
    }

    Serial0.println("Peer public key read successfully");

    // Compute the shared secret (this is a scalar)
    ret = mbedtls_ecdh_compute_shared(
        &ecdh_ctx.grp,           // Curve defined on init
        &ecdh_ctx.z,             // Pointer to shared secret
        &peerPoint,              // Peer Public Key
        &ecdh_ctx.d,             // Private Key
        mbedtls_ctr_drbg_random, // PRNG
        &ctr_drbg);

    mbedtls_ecp_point_free(&peerPoint);
    if (ret != 0)
        return ret;

    // Export shared secret as fixed length binary
    // Since the write_binary functions pads data > 32bytes we use PUBKEY_SIZE-1
    size_t olen = 0;
    ret = mbedtls_mpi_write_binary(&ecdh_ctx.z, sharedSecret, ENC_KEYSIZE);
    if (ret != 0)
        return ret;

    // Print the shared secret
    Serial0.println("Shared Secret: ");
    printBase64(sharedSecret, sizeof(sharedSecret));
    Serial0.println();

    sharedReady = true;
    return 0;
}

int SecureSession::deriveAESKeyFromSharedSecret()
{                                         // KDF to generate a key with entropy on every bit
    preferences.begin("security", false); // Start the preferences RW sesion (NOT SECURE, just for testing)
    preferences.clear(); // Clear all historical data TODO: this forces single device pairing

    if (!sharedReady)
        return -1;
    const uint8_t info[] = "aes-gcm-256"; // Must match JS
    size_t info_len = sizeof(info) - 1;

    // Use HKDF to create a secure AES-GCM 256-bit key
    int ret = hkdf_sha256(                  // hash function
        nullptr, 0,                         // optional salt (can be NULL/0)
        sharedSecret, sizeof(sharedSecret), // input key material (from ECDH)
        info, info_len,                     // context info (optional domain separation)
        globalAESKey, sizeof(globalAESKey)  // output key
    );

    // Debugging
    Serial0.println("AES Key: ");
    printBase64(globalAESKey, sizeof(globalAESKey));
    Serial0.println();

    // If a key was successfully generated, store it
    if (!ret)
    {   
        preferences.putBytes("aesKey", globalAESKey, sizeof(globalAESKey)); // Store the key in preferences for debugging
        Serial0.println("AES Key saved successfully");
    };

    preferences.end(); // Close the write session
    return ret;
}

int SecureSession::encrypt(   // Encrypt a given text string using gcm
    const uint8_t *plaintext, // Text data to be encrypted
    size_t plaintext_len,     // Len of plaintext
    uint8_t *ciphertext,      // Pointer to store the encrypted data
    uint8_t iv[IV_SIZE],      // prng initialization vector
    uint8_t tag[TAG_SIZE])    // Tag for GCM to ensure data integrity

{

    if (!sharedReady)
        return -1;

    // Generate random initialization vector (vector of prng)
    int ret = mbedtls_ctr_drbg_random(&ctr_drbg, iv, IV_SIZE);
    if (ret != 0)
        return ret;

    uint8_t aesKey[ENC_KEYSIZE];
    // set the generated AES key in the GCM context
    preferences.getBytes("aesKey", aesKey, ENC_KEYSIZE); // Get the AES key from preferences (for debugging)
    mbedtls_gcm_init(&gcm);
    ret = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES, aesKey, ENC_KEYSIZE * 8);
    if (ret != 0)
        return ret;

    // Generate ciphertext using GCM to ensure data integrity
    ret = mbedtls_gcm_crypt_and_tag(&gcm, MBEDTLS_GCM_ENCRYPT,
                                    plaintext_len,
                                    iv, IV_SIZE,
                                    nullptr, 0, // no additional data
                                    plaintext,
                                    ciphertext,
                                    TAG_SIZE,
                                    tag);
    mbedtls_gcm_free(&gcm);
    return ret;
}

int SecureSession::decrypt( // Decrypt an encrypted string
    const uint8_t iv[IV_SIZE],
    size_t ciphertext_len,
    const uint8_t *ciphertext,
    const uint8_t tag[TAG_SIZE],
    uint8_t *plaintext_out)
{

    preferences.begin("security", true); // Open storage session in read only mode
    if (!preferences.isKey("aesKey")){
        Serial0.println("aesKey not found in preferences storage");   
        return 1;
    }
    
    uint8_t aesKey[ENC_KEYSIZE];
    // set the generated AES key in the GCM context
    preferences.getBytes("aesKey", aesKey, ENC_KEYSIZE); // Get the AES key from preferences (for debugging)

    Serial0.println("AES KEY FROM PERFERENCES: ");
    printBase64(aesKey, ENC_KEYSIZE);
    Serial0.println();

    Serial0.println("AES KEY FROM GLOBAL: ");
    printBase64(globalAESKey, ENC_KEYSIZE);
    Serial0.println();

    mbedtls_gcm_init(&gcm);
    int ret = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES, aesKey, ENC_KEYSIZE * 8); // Set the AES key for the GCM context
    if (ret != 0)
        return ret;

    ret = mbedtls_gcm_auth_decrypt(&gcm,
                                   ciphertext_len,
                                   iv, IV_SIZE,
                                   nullptr, 0,
                                   tag,
                                   TAG_SIZE,
                                   ciphertext,
                                   plaintext_out);
    mbedtls_gcm_free(&gcm);

    plaintext_out[ciphertext_len] = '\0';
    return ret;
}

// Decrypt a rawDataPacket and output the plaintext
int SecureSession::decrypt(struct rawDataPacket *packet, uint8_t *plaintext_out)
{
    int ret = decrypt(
        packet->IV,
        packet->dataLen,
        packet->data,
        packet->TAG,
        plaintext_out); // Decrypt the packet data
    return ret;
}

// Debugging helper to print uint8_t arrays as base64 strings to serial0
void SecureSession::printBase64(const uint8_t *data, size_t dataLen)
{
    // Calculate the output length: base64 output is ~1.37x input, so (4 * ceil(dataLen / 3))
    size_t outputLen = 4 * ((dataLen + 2) / 3);
    unsigned char encoded[outputLen + 1]; // +1 for null-terminator
    size_t actualLen = 0;

    int ret = mbedtls_base64_encode(
        encoded,
        sizeof(encoded),
        &actualLen,
        data,
        dataLen);

    if (ret == 0)
    {
        encoded[actualLen] = '\0'; // Null-terminate the string
        Serial0.println((const char *)encoded);
    }
    else
    {
        Serial0.print("Base64 encoding failed. Error code: ");
        Serial0.println(ret);
    }
}

// Helper: HKDF-Extract and Expand using SHA-256
int SecureSession::hkdf_sha256(const uint8_t *salt, size_t salt_len,
                               const uint8_t *ikm, size_t ikm_len,
                               const uint8_t *info, size_t info_len,
                               uint8_t *okm, size_t okm_len)
{
    int ret = 0;         // Return code to mimic other mbedTLS functions
    uint8_t pre_key[32]; // SHA-256 output size

    // Initialize the hashing context for mbedtls - use SHA256
    const mbedtls_md_info_t *md = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    if (!md)
        return -1;

    // IKM = Input Key Material
    // HKDF-Extract: pre_key = HMAC(salt, IKM) [IKM is shared secret in case of ECDH]
    if ((ret = mbedtls_md_hmac(md, salt, salt_len, ikm, ikm_len, pre_key)) != 0)
        return ret;

    // HKDF-Expand
    size_t hash_len = 32;
    size_t n = (okm_len + hash_len - 1) / hash_len;

    uint8_t t[32];
    size_t t_len = 0;

    uint8_t counter = 1;
    size_t pos = 0;

    //
    for (size_t i = 0; i < n; i++)
    {
        // Create a new context instance for each iteration
        mbedtls_md_context_t ctx;
        mbedtls_md_init(&ctx);
        mbedtls_md_setup(&ctx, md, 1); // HMAC

        mbedtls_md_hmac_starts(&ctx, pre_key, hash_len);

        // Update the temp key (t)
        if (i != 0)
            mbedtls_md_hmac_update(&ctx, t, t_len);

        mbedtls_md_hmac_update(&ctx, info, info_len);
        mbedtls_md_hmac_update(&ctx, &counter, 1);
        mbedtls_md_hmac_finish(&ctx, t);
        mbedtls_md_free(&ctx);

        size_t to_copy = (pos + hash_len > okm_len) ? (okm_len - pos) : hash_len;
        memcpy(okm + pos, t, to_copy);
        pos += to_copy;
        t_len = hash_len;
        counter++;
    }

    return 0;
}