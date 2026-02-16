#include <Preferences.h>
#include <nvs_flash.h>
#include <psa/crypto.h>

#include <SerialDebug.h>
#include "SecureSession.h"

psa_key_id_t private_key_id = 0;  // Stores the ECDH private key ID
Preferences preferences; // Preferences for storing data

// Class constructor
SecureSession::SecureSession() : sharedReady(false), aesKeyReady(false)
{
    // PSA Crypto initialization handled in init() method
    private_key_id = 0;
    mbedtls_gcm_init(&gcm);
    memset(aesKey, 0, ENC_KEYSIZE);
}

// Class destructor
SecureSession::~SecureSession()
{
    // Destroy the PSA key if it exists
    if (private_key_id != 0) {
        psa_destroy_key(private_key_id);
        private_key_id = 0;
    }
    
    // Clear session AES key from RAM
    memset(aesKey, 0, ENC_KEYSIZE);
    aesKeyReady = false;
    
    mbedtls_gcm_free(&gcm);
}

// Initialize PSA Crypto subsystem
int SecureSession::init()
{
    // Initialize PSA Crypto (must be called once before any crypto operations)
    psa_status_t status = psa_crypto_init();
    if (status != PSA_SUCCESS) {
        DEBUG_SERIAL_PRINTF("PSA Crypto initialization failed: %ld\n", status);
        return -1;
    }
    DEBUG_SERIAL_PRINTLN("PSA Crypto initialized successfully");
    return 0;
}

// Generate private and public key using PSA
int SecureSession::generateKeypair(uint8_t outPublicKey[PUBKEY_SIZE], size_t& outPubLen)
{
    // Destroy any existing key
    if (private_key_id != 0) {
        psa_destroy_key(private_key_id);
        private_key_id = 0;
    }

    // Set up key attributes for ECDH with secp256r1 curve
    psa_key_attributes_t attributes = PSA_KEY_ATTRIBUTES_INIT;
    psa_set_key_type(&attributes, PSA_KEY_TYPE_ECC_KEY_PAIR(PSA_ECC_FAMILY_SECP_R1));
    psa_set_key_bits(&attributes, 256);  // secp256r1 is 256-bit
    psa_set_key_usage_flags(&attributes, PSA_KEY_USAGE_DERIVE);
    psa_set_key_algorithm(&attributes, PSA_ALG_ECDH);

    // Generate the keypair
    psa_status_t status = psa_generate_key(&attributes, &private_key_id);
    if (status != PSA_SUCCESS) {
        DEBUG_SERIAL_PRINTF("PSA key generation failed: %ld\n", status);
        private_key_id = 0;
        return -1;
    }

    // Export the public key in uncompressed format (65 bytes: 0x04 + 32 + 32)
    uint8_t public_key_uncompressed[65];
    size_t public_key_len = 0;
    status = psa_export_public_key(private_key_id, public_key_uncompressed, 65, &public_key_len);
    if (status != PSA_SUCCESS) {
        DEBUG_SERIAL_PRINTF("PSA public key export failed: %ld\n", status);
        return -1;
    }

    // PSA exports in uncompressed format (65 bytes), but we need compressed (33 bytes)
    // Compressed format: 0x02 or 0x03 (depending on Y parity) + X coordinate (32 bytes)
    if (public_key_len != 65) {
        DEBUG_SERIAL_PRINTF("Unexpected public key length: %d\n", public_key_len);
        return -1;
    }

    // Compress the public key: take prefix byte and X coordinate
    outPublicKey[0] = (public_key_uncompressed[64] & 0x01) ? 0x03 : 0x02;  // 0x03 if Y is odd, 0x02 if even
    memcpy(&outPublicKey[1], &public_key_uncompressed[1], 32);  // Copy X coordinate
    outPubLen = PUBKEY_SIZE;  // 33 bytes

    DEBUG_SERIAL_PRINTLN("Keypair generated successfully");
    return 0;
}

// Compute shared secret given the peer's public key using PSA
// Also stores the shared secret and derives the session AES key
int SecureSession::computeSharedSecret(const uint8_t peerPublicKey[PUBKEY_SIZE * 2], size_t peerPubLen, const char* base64pubKey)
{ 

    DEBUG_SERIAL_PRINTF("Computing shared secret with peer public key of length %d\n", peerPubLen);
    
    // TODO: Remove redundant checks
    // Handle null-terminated keys by skipping the null terminator
    if (peerPubLen == 66 && peerPublicKey[65] == 0x00) {
        peerPubLen = 65;  // Ignore the null terminator
    }

    if (peerPubLen != 65) {
        DEBUG_SERIAL_PRINTF("Peer public key must be 65 bytes (uncompressed), got %d\n", peerPubLen);
        return -1;
    }

    // Verify peer public key starts with 0x04 (uncompressed format marker)
    if (peerPublicKey[0] != 0x04) {
        DEBUG_SERIAL_PRINTF("Invalid peer public key format. Expected 0x04 prefix, got 0x%02x\n", peerPublicKey[0]);
        return -1;
    }

    // Perform ECDH key agreement using psa_raw_key_agreement
    // This takes the raw peer public key without needing to import it first
    size_t output_len = 0;
    psa_status_t status = psa_raw_key_agreement(PSA_ALG_ECDH, private_key_id, peerPublicKey, peerPubLen, 
                                               sharedSecret, ENC_KEYSIZE, &output_len);

    if (status != PSA_SUCCESS) {
        DEBUG_SERIAL_PRINTF("ECDH key agreement failed: %ld\n", status);
        return -1;
    }

    DEBUG_SERIAL_PRINTLN("Shared secret computed successfully");
    
    // Print the shared secret
    DEBUG_SERIAL_PRINTLN("Shared Secret: ");
    printBase64(sharedSecret, sizeof(sharedSecret));
    DEBUG_SERIAL_PRINTLN();

    sharedReady = true;
    // Store the shared secret in NVS for persistence
    int ret = storeSharedSecret(base64pubKey);
    if (ret != 0) {
        DEBUG_SERIAL_PRINTF("Failed to store shared secret: %d\n", ret);
        return ret;
    }
    
    ret = deriveAESKeyFromSecret(base64pubKey);
    if (ret != 0) {
        DEBUG_SERIAL_PRINTF("Failed to derive AES key from shared secret: %d\n", ret);
        return ret;
    }

    return 0;
}

// Store the computed shared secret to NVS for persistence across reboots
int SecureSession::storeSharedSecret(std::string base64Input)
{
    // Return if a shared secret was never generated
    if (!sharedReady)
        return -1;

    preferences.begin("security", false); // Start the preferences RW session (NOT SECURE, just for testing)

    int pairedDevices = preferences.getInt("pairedDevices", -1);

    // Clear all historical data if there is no space left
    if((pairedDevices == -1) || (pairedDevices == MAX_PAIRED_DEVICES)){
        preferences.clear(); 
        DEBUG_SERIAL_PRINT("Max paired devices reached or uninitialized, clearing all...");
        preferences.putInt("pairedDevices", 0);                 
    }

    // Store the raw shared secret (not the AES key)
    String hashedBase64 = hashKey(base64Input.c_str());
    DEBUG_SERIAL_PRINTF("Storing shared secret for hashed key: %s\n", hashedBase64.c_str());
    
    int putBytes = preferences.putBytes(hashedBase64.c_str(), sharedSecret, sizeof(sharedSecret));
    int putInt = preferences.putInt("pairedDevices", pairedDevices+1);
    
    DEBUG_SERIAL_PRINTF("Shared secret (%d bytes) stored with putBytes: %d, putInt: %d\n", sizeof(sharedSecret), putBytes, putInt);

    preferences.end(); // Close the write session
    return 0;
}

// Derive AES key from the session's shared secret
int SecureSession::deriveAESKeyFromSecret(const char* base64pubKey)
{
    // Derive AES key from the shared secret using HKDF
    const uint8_t info[] = "aes-gcm-256"; // Must match JS
    size_t info_len = sizeof(info) - 1;

    psa_status_t status = psa_generate_random(sessionSalt, sizeof(sessionSalt));
    if (status != PSA_SUCCESS) {
        DEBUG_SERIAL_PRINTF("Failed to generate random salt for HKDF: %ld\n", status);
        return -1;
    }

    DEBUG_SERIAL_PRINTF("Session Salt for HKDF: ");
    printBase64(sessionSalt, sizeof(sessionSalt));

    // Use custom HKDF to create a secure AES-GCM 256-bit key
    int ret = hkdf_sha256(
        sessionSalt, sizeof(sessionSalt),        // random salt for this session
        sharedSecret, sizeof(sharedSecret),      // session's shared secret
        info, info_len,                          // context info
        aesKey, ENC_KEYSIZE                      // output directly to member variable
    );

    if (ret == 0) {
        DEBUG_SERIAL_PRINTLN("AES key derived successfully from shared secret");
        printBase64(aesKey, sizeof(aesKey));
        // Mark as ready for this session
        aesKeyReady = true;
    } else {
        DEBUG_SERIAL_PRINTF("AES key derivation failed: %d\n", ret);
    }

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
    // Generate random initialization vector using PSA random generator
    psa_status_t status = psa_generate_random(iv, IV_SIZE);
    if (status != PSA_SUCCESS) {
        DEBUG_SERIAL_PRINTF("Failed to generate random IV: %ld\n", status);
        return -1;
    }
    
    // Use the session AES key for encryption
    mbedtls_gcm_init(&gcm);
    int ret = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES, aesKey, ENC_KEYSIZE * 8);
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
    // Use the session AES key for decryption
    mbedtls_gcm_init(&gcm);
    int ret = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES, aesKey, ENC_KEYSIZE * 8);
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

// Decrypt a toothPaste_DataPacket and return the plaintext bytes in decrypted_out
int SecureSession::decrypt(toothpaste_DataPacket* packet, uint8_t* decrypted_out, const char* base64pubKey)
{   
    // Decrypt the packet data
    int ret = decrypt(
        packet->iv.bytes,
        packet->encryptedData.size,
        packet->encryptedData.bytes,
        packet->tag.bytes,
        decrypted_out,
        base64pubKey
    ); 
    return ret;
}

// Check if a key exists in preferences storage and load its shared secret
bool SecureSession::loadIfEnrolled(const char* key){
    preferences.begin("security", true); // Open storage session in read only mode
    String hashedKey = hashKey(key); // Hash the key, since there is a char limit for keys in storage
    
    // Check if the hashed key exists in storage, 
    // If it does load the shared secret into the session variable and return true, otherwise return false
    bool ret = preferences.isKey(hashedKey.c_str());
    if (ret) {
        // Load the shared secret into the session variable
        preferences.getBytes(hashedKey.c_str(), sharedSecret, ENC_KEYSIZE);
        sharedReady = true;
    }
    
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
    int ret = 0;
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

// Get the device name from storage
bool SecureSession::getDeviceName(String &deviceNameBuffer){
    preferences.begin("identity", true);
    bool ret = preferences.isKey("blename"); // Check if the AES key for the given public key exists
    // If the name string exists return it
    if(ret){
        deviceNameBuffer = preferences.getString("blename");
    }

    preferences.end();
    return ret;
}

// Set the device name
bool SecureSession::setDeviceName(const char* deviceName){
    preferences.begin("identity", false);

    bool ret = preferences.isKey("blename"); // Check if the AES key for the given key exists
    // If the name string exists return itTTR
    if(ret){
        preferences.remove("blename");
    }

    DEBUG_SERIAL_PRINTF("Key deletion code: %d\n", ret);
    DEBUG_SERIAL_PRINTF("Attempting to save name string %s\n", deviceName);

    ret = preferences.putString("blename", deviceName);
    preferences.end();
    return ret;
}

