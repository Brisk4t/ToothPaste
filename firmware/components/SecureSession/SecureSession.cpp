#include <Preferences.h>
#include <nvs_flash.h>
#include <psa/crypto.h>

#include "esp_log.h"
#include "SecureSession.h"

static const char* TAG = "SESSION";

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
        ESP_LOGE(TAG, "PSA Crypto init failed: %ld", (long)status);
        return -1;
    }
    // Initialize the ATECC608B secure element (identical to ATECC608A)
    cfg = cfg_ateccx08a_i2c_default;
    int ret = atcab_init(&cfg);
    if(ret != 0){
        ESP_LOGE(TAG, "ATECC608B initialization failed %d", ret);
        return -1;
    }

    ESP_LOGI(TAG, "ATECC608B initialized successfully");

    // ret = atcab_genkey(0, randombuf);
    // if (ret != 0) {
    //     ESP_LOGE(TAG, "ATECC608B genkey generation failed: %d", ret);
    //     return -1;
    // }
    // ESP_LOGD(TAG, "ATECC608B genkey generation successful: %02x%02x%02x%02x...", randombuf[0], randombuf[1], randombuf[2], randombuf[3]);
    // Test communication with the secure element by reading its serial number
    uint8_t buf[ATCA_ECC_CONFIG_SIZE];
    ret = atcab_info(buf);
    if (ret != 0) {
        ESP_LOGI(TAG, " failed\n  ! atcab_info returned %02x", ret);
        return -1;
    }
    ESP_LOGI(TAG, " ok: %02x %02x", buf[2], buf[3]);

    slotManager_.load();

    ESP_LOGI(TAG, "PSA Crypto initialized");
    return 0;
}

int SecureSession::generateKeypair(uint8_t outPublicKey[PUBKEY_SIZE], size_t& outPubLen)
{
    // Reserve an ATECC slot now; label is unknown until peer public key arrives.
    // If key exchange fails, call slotManager_.release() to free it.
    uint8_t slot = slotManager_.reserve();
    if (slot == SlotManager::INVALID_SLOT) {
        ESP_LOGE(TAG, "No ATECC slot available for keypair");
        return -1;
    }
    ESP_LOGD(TAG, "Reserved ATECC slot %u for keypair generation", slot);

    // Generate the keypair
    uint8_t public_key_uncompressed[64];

    int ret = atcab_genkey(slot, public_key_uncompressed);
    if (ret != 0) {
        ESP_LOGE(TAG, "ATECC key generation failed: %d", ret);
        slotManager_.release();
        return -1;
    }
    printBase64(public_key_uncompressed, sizeof(public_key_uncompressed));

    // Compress the public key: take prefix byte and X coordinate
    outPublicKey[0] = (public_key_uncompressed[63] & 0x01) ? 0x03 : 0x02;  // 0x03 if Y is odd, 0x02 if even
    memcpy(&outPublicKey[1], &public_key_uncompressed[0], 32);  // Copy X coordinate
    outPubLen = PUBKEY_SIZE;  // 33 bytes

    ESP_LOGI(TAG, "Keypair generated");
    return 0;
}

// Compute shared secret given the peer's public key using PSA [TODO: Moved to cryptoauthlib]
// Also stores the shared secret and derives the session AES key [This might not be possible in the ATECC608B since it can only do AES-128]
int SecureSession::computeSharedSecret(const uint8_t peerPublicKey[PUBKEY_SIZE * 2], size_t peerPubLen, const char* base64pubKey)
{
    ESP_LOGD(TAG, "Computing shared secret, peer key len=%u", (unsigned)peerPubLen);

    if (peerPubLen != 65) {
        ESP_LOGE(TAG, "Peer key must be 65 bytes (uncompressed), got %u", (unsigned)peerPubLen);
        return -1;
    }

    // Verify peer public key starts with 0x04 (uncompressed format marker)
    if (peerPublicKey[0] != 0x04) {
        ESP_LOGE(TAG, "Invalid peer key format: expected 0x04, got 0x%02x", peerPublicKey[0]);
        return -1;
    }

    // atcab_ecdh expects raw X||Y (64 bytes); skip the 0x04 uncompressed-point prefix
    uint8_t trimmedKey[64];
    memcpy(trimmedKey, peerPublicKey + 1, 64);

    // Prime TempKey register for ECDH
    uint8_t nonce_in[20] = {0};  // or actual random
    int ret = atcab_nonce(nonce_in);  // seeds TempKey, marks it valid
    if (ret != 0) { 
        ESP_LOGE(TAG, "Failed to seed TempKey for ECDH: %d", ret);
        return -1;
     }

    // Generate shared secret
    uint8_t current_slot = slotManager_.reserve(); // Get the slot reserved during keypair generation
    ESP_LOGD(TAG, "Using ATECC slot %u for ECDH computation", current_slot);
    //ret = atcab_ecdh_base(0x08, current_slot, trimmedKey, sharedSecret, nullptr); // 0x08 = output shared secret to TempKey
    
    ret = atcab_ecdh(current_slot, trimmedKey, sharedSecret); // 0x08 = output shared secret to TempKey
    if (ret != 0) {
        ESP_LOGE(TAG, "ECDH key agreement failed: %d", ret);
        slotManager_.release(); // Free the reserved slot on failure
        return -1;
    }

    ESP_LOGI(TAG, "Shared secret computed");
    sharedReady = true;
    // Store the shared secret in NVS for persistence
    ret = commitPeerKey(base64pubKey);
    if (ret != 0) {
        ESP_LOGE(TAG, "Failed to save peer key to NVS: %d", ret);
        return ret;
    }
    
    ret = deriveAESKeyFromSecret(base64pubKey);
    if (ret != 0) {
        ESP_LOGE(TAG, "Failed to derive AES key from shared secret: %d", ret);
        return ret;
    }

    return 0;
}

// Store the computed shared secret to NVS for persistence across reboots
int SecureSession::commitPeerKey(std::string base64Input)
{
    if (!sharedReady){
        ESP_LOGD(TAG, "commitPeerKey called but shared secret is not ready");
        return -1;
    }
    
    // Hash the base64-encoded public key to create a fixed-length label for slot management
    String label = hashKey(base64Input.c_str());

    // Finalize the slot reserved during generateKeypair().
    // Falls back to assign() if no reservation is pending (e.g. called outside normal pairing flow).
    char evicted[SlotManager::LABEL_LEN + 1];
    uint8_t slot = slotManager_.commit(label.c_str(), evicted);
    if (slot == SlotManager::INVALID_SLOT) {
        ESP_LOGW(TAG, "No pending reservation; falling back to assign()");
        bool is_new = false;
        slot = slotManager_.assign(label.c_str(), &is_new, evicted);
    }

    if (slot == SlotManager::INVALID_SLOT) {
        ESP_LOGE(TAG, "SlotManager commit/assign failed");
        return -1;
    }

    if (evicted[0] != '\0') {
        ESP_LOGW(TAG, "Removing stale secret for evicted label: %s", evicted);
        preferences.remove(evicted);
    }

    return 0;
}

// Derive AES key from the session's shared secret
int SecureSession::deriveAESKeyFromSecret(const char* base64pubKey)
{
    // Derive AES key from the shared secret using HKDF
    const uint8_t info[] = "aes-gcm-256"; // Must match JS
    size_t info_len = sizeof(info) - 1;

    atcab_random(sessionSalt); // Generate a random salt for this session

    int ret = hkdf_sha256(
        sessionSalt, sizeof(sessionSalt),        // random salt for this session
        sharedSecret, sizeof(sharedSecret),      // session's shared secret
        info, info_len,                          // context info
        aesKey, ENC_KEYSIZE                      // output directly to member variable
    );

    // TODO: Why wont you work damn it
    // int ret = atcab_kdf(0x50, 0x00, 0x0B000002, info, aesKey, nullptr);
    if (ret == 0) {
        ESP_LOGI(TAG, "AES key derived");
        aesKeyReady = true;
    } else {
        ESP_LOGE(TAG, "AES key derivation failed: %d", ret);
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
        ESP_LOGE(TAG, "Failed to generate random IV: %ld", (long)status);
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

// Check if a key exists and load its shared secret if enrolled
bool SecureSession::loadIfEnrolled(const char* key){
    String label = hashKey(key);

    uint8_t slot = slotManager_.lookup(label.c_str());
    if (slot == SlotManager::INVALID_SLOT)
        return false;


    sharedReady = true;
    ESP_LOGD(TAG, "Loaded secret for label=%s slot=%u", label.c_str(), slot);
    return true;
}

// Debugging helper to print uint8_t arrays as base64 strings via esp_log
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

    if (ret == 0) {
        encoded[actualLen] = '\0';
        ESP_LOGD(TAG, "%s", (const char*)encoded);
    } else {
        ESP_LOGE(TAG, "Base64 encoding failed, err %d", ret);
    }
}

// Helper: HKDF-Extract and Expand using SHA-256 [TODO: Move to cryptoauthlib]
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

    ESP_LOGD(TAG, "Key deletion status: %d", ret);
    ESP_LOGI(TAG, "Saving device name: %s", deviceName);

    ret = preferences.putString("blename", deviceName);
    preferences.end();
    return ret;
}
