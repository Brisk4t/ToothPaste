#include <Preferences.h>
#include <nvs_flash.h>

#include <SerialDebug.h>
#include "SecureSession.h"

mbedtls_ecdh_context ecdh_ctx;
mbedtls_ctr_drbg_context ctr_drbg;
mbedtls_entropy_context entropy;
Preferences preferences; // Preferences for storing data (Not secure, temporary solution)

// Class constructor
SecureSession::SecureSession() : sharedReady(false)
{
    // nvsinit(); // // Initialize non-volatile storage on the ESP32
    mbedtls_ecdh_init(&ecdh_ctx);
    mbedtls_ctr_drbg_init(&ctr_drbg);
    mbedtls_entropy_init(&entropy);
    mbedtls_gcm_init(&gcm);
}

// Class destructor
SecureSession::~SecureSession()
{
    mbedtls_ecdh_free(&ecdh_ctx);
    mbedtls_ctr_drbg_free(&ctr_drbg);
    mbedtls_entropy_free(&entropy);
    mbedtls_gcm_free(&gcm);
}

// Initialize prng and define curve
int SecureSession::init()
{
    const char* personalSalt = "ecdh_session";
    // Try generating the rng seed
    int ret = mbedtls_ctr_drbg_seed(
        &ctr_drbg,
        mbedtls_entropy_func,
        &entropy,
        (const unsigned char*)personalSalt,
        strlen(personalSalt)
    );

    if (ret != 0)
        return ret;

    ret = mbedtls_ecp_group_load(&ecdh_ctx.grp, MBEDTLS_ECP_DP_SECP256R1); // Use curve secp256r1
    return ret;
}

// Generate private and public key
int SecureSession::generateKeypair(uint8_t outPublicKey[PUBKEY_SIZE], size_t& outPubLen)
{

    // Try generating the keypair
    int ret = mbedtls_ecdh_gen_public(
        &ecdh_ctx.grp, // Curve group (e.g., SECP256R1)
        &ecdh_ctx.d,   // private key
        &ecdh_ctx.Q,   // public key
        mbedtls_ctr_drbg_random,
        &ctr_drbg
    );

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
        sizeof(pubkey)
    );

    if (ret != 0)
        return ret;

    if (olen != PUBKEY_SIZE)
        return -1; // unexpected size

    return 0;
}

// Compute shared secret given the peer's public key
int SecureSession::computeSharedSecret(const uint8_t peerPublicKey[PUBKEY_SIZE * 2], size_t peerPubLen)
{ 
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
        DEBUG_SERIAL_PRINTLN("Error reading peer public key");
        DEBUG_SERIAL_PRINTF("Error code: %d\n", ret);
        return ret;
    }

    DEBUG_SERIAL_PRINTLN("Peer public key read successfully");

    // Compute the shared secret (this is a scalar)
    ret = mbedtls_ecdh_compute_shared(
        &ecdh_ctx.grp,           // Curve defined on init
        &ecdh_ctx.z,             // Pointer to shared secret
        &peerPoint,              // Peer Public Key
        &ecdh_ctx.d,             // Private Key
        mbedtls_ctr_drbg_random, // PRNG
        &ctr_drbg
    );

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
    DEBUG_SERIAL_PRINTLN("Shared Secret: ");
    printBase64(sharedSecret, sizeof(sharedSecret));
    DEBUG_SERIAL_PRINTLN();

    sharedReady = true;
    return 0;
}

// Called after computeSharedSecret succeeds to compute a symmetric AES key 
int SecureSession::deriveAESKeyFromSharedSecret(const char *base64Input)
{
    // Return if a shared secret was never generated
    if (!sharedReady)
        return -1;

    preferences.begin("security", false); // Start the preferences RW sesion (NOT SECURE, just for testing)
    preferences.clear();                  // Clear all historical data TODO: this forces single device pairing

    uint8_t aesKey[ENC_KEYSIZE];

    const uint8_t info[] = "aes-gcm-256"; // Must match JS
    size_t info_len = sizeof(info) - 1;

    // Use HKDF to create a secure AES-GCM 256-bit key
    int ret = hkdf_sha256(                  // hash function
        nullptr, 0,                         // optional salt (can be NULL/0)
        sharedSecret, sizeof(sharedSecret), // input key material (from ECDH)
        info, info_len,                     // context info (optional domain separation)
        aesKey, sizeof(aesKey)              // output key
    );

    // Debugging
    // DEBUG_SERIAL_PRINTLN("AES Key: ");
    // printBase64(aesKey, sizeof(aesKey));
    // DEBUG_SERIAL_PRINTLN();

    // If a key was successfully generated, store it
    if (!ret)
    {
        String hashedBase64 = hashKey(base64Input);
        preferences.putBytes(hashedBase64.c_str(), aesKey, sizeof(aesKey)); // Store the key in preferences for debugging
        DEBUG_SERIAL_PRINTF("AES Key stored as %s\n", hashedBase64);
    };

    preferences.end(); // Close the write session
    return ret;
}

// Encrypt a given text string using gcm
int SecureSession::encrypt(
    const uint8_t* plaintext, // Text data to be encrypted
    size_t plaintext_len,     // Len of plaintext
    uint8_t* ciphertext,      // Pointer to store the encrypted data
    uint8_t iv[IV_SIZE],      // prng initialization vector
    uint8_t tag[TAG_SIZE],    // Tag for GCM to ensure data integrity
    const char* base64pubKey)    

{

    String hashedKey = hashKey(base64pubKey);
    preferences.begin("security", true); // Open storage session in read only mode
    if (!preferences.isKey(hashedKey.c_str()))
    {
        DEBUG_SERIAL_PRINTLN("aesKey not found in preferences storage");
        return 1;
    }

    // Generate random initialization vector (vector of prng)
    int ret = mbedtls_ctr_drbg_random(&ctr_drbg, iv, IV_SIZE);
    if (ret != 0)
        return ret;

    uint8_t aesKey[ENC_KEYSIZE];
    preferences.getBytes(hashedKey.c_str(), aesKey, ENC_KEYSIZE); // Get the AES key from preferences (for debugging)
    
    // Import the bytearray AES key into the mbedtls context
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

// Decrypt an encrypted string
int SecureSession::decrypt(
    const uint8_t iv[IV_SIZE],
    size_t ciphertext_len,
    const uint8_t* ciphertext,
    const uint8_t tag[TAG_SIZE],
    uint8_t* plaintext_out,
    const char* base64pubKey)
{
    String hashedKey = hashKey(base64pubKey);
    preferences.begin("security", true); // Open storage session in read only mode
    if (!preferences.isKey(hashedKey.c_str()))
    {
        DEBUG_SERIAL_PRINTLN("aesKey not found in preferences storage");
        return 1;
    }

    uint8_t aesKey[ENC_KEYSIZE];
    // set the generated AES key in the GCM context
    preferences.getBytes(hashedKey.c_str(), aesKey, ENC_KEYSIZE); // Get the AES key from preferences (for debugging)

    // DEBUG_SERIAL_PRINTLN("AES KEY FROM PERFERENCES: ");
    // printBase64(aesKey, ENC_KEYSIZE);
    // DEBUG_SERIAL_PRINTLN();

    // Import the bytearray AES key into the mbedtls context
    mbedtls_gcm_init(&gcm);
    int ret = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES, aesKey, ENC_KEYSIZE * 8); // Set the AES key for the GCM context
    if (ret != 0)
        return ret;

    // Decrypt the ciphertext using the AES key
    ret = mbedtls_gcm_auth_decrypt(&gcm,
        ciphertext_len,
        iv, IV_SIZE,
        nullptr, 0,
        tag,
        TAG_SIZE,
        ciphertext,
        plaintext_out
    );
    mbedtls_gcm_free(&gcm);

    plaintext_out[ciphertext_len] = '\0';
    return ret;
}

// Decrypt a rawDataPacket
int SecureSession::decrypt(struct rawDataPacket* packet, uint8_t* plaintext_out, const char* base64pubKey)
{   
    // Decrypt the packet data
    int ret = decrypt(
        packet->IV,
        packet->dataLen,
        packet->data,
        packet->TAG,
        plaintext_out,
        base64pubKey
    ); 
    return ret;
}

// Check if a key exists in preferences storage
bool SecureSession::isEnrolled(const char* key){
    preferences.begin("security", true); // Open storage session in read only mode
    String hashedKey = hashKey(key);
    bool ret = preferences.isKey(hashedKey.c_str()); // Check if the AES key for the given public key exists
    preferences.end();
    return ret;
}

// Debugging helper to print uint8_t arrays as base64 strings to serial0
void SecureSession::printBase64(const uint8_t* data, size_t dataLen)
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
        DEBUG_SERIAL_PRINTLN((const char*)encoded);
    }
    else
    {
        DEBUG_SERIAL_PRINT("Base64 encoding failed. Error code: ");
        DEBUG_SERIAL_PRINTLN(ret);
    }
}

// Helper: HKDF-Extract and Expand using SHA-256
int SecureSession::hkdf_sha256(const uint8_t* salt, size_t salt_len,
    const uint8_t* ikm, size_t ikm_len,
    const uint8_t* info, size_t info_len,
    uint8_t* okm, size_t okm_len)
{
    int ret = 0;         // Return code to mimic other mbedTLS functions
    uint8_t pre_key[32]; // SHA-256 output size

    // Initialize the hashing context for mbedtls - use SHA256
    const mbedtls_md_info_t* md = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
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

// Hash a public key using MD5 
String SecureSession::hashKey(const char* longKey) {
  const mbedtls_md_info_t* mdInfo = mbedtls_md_info_from_type(MBEDTLS_MD_MD5);
  if (!mdInfo) return "";

  unsigned char hash[16]; // 128-bit MD5 digest
  int ret = mbedtls_md(mdInfo, (const unsigned char*)longKey, strlen(longKey), hash);
  if (ret != 0) return "";

  char hex[33]; // 32 hex chars + null terminator
  for (int i = 0; i < 16; ++i) {
    sprintf(hex + i * 2, "%02x", hash[i]);
  }
  return String(hex).substring(0, 12); // Use 12-char hash for Preferences key
}