#include <secureSession.h>

mbedtls_ecdh_context ecdh_ctx;
mbedtls_ctr_drbg_context ctr_drbg;
mbedtls_entropy_context entropy;
    

const char* personalSalt = "ecdh_session";


SecureSession::SecureSession(): sharedReady(false){ // Class constructor
    mbedtls_ecdh_init(&ecdh_ctx);
    mbedtls_ctr_drbg_init(&ctr_drbg);
    mbedtls_entropy_init(&entropy);
    mbedtls_gcm_init(&gcm);
}

SecureSession::~SecureSession(){ // Class destructor
    mbedtls_ecdh_free(&ecdh_ctx);
    mbedtls_ctr_drbg_free(&ctr_drbg);
    mbedtls_entropy_free(&entropy);
    mbedtls_gcm_free(&gcm);
}

int SecureSession::init() { // Initialize prng and define curve
    
    // Try generating the rng seed
    int ret = mbedtls_ctr_drbg_seed(&ctr_drbg, mbedtls_entropy_func, &entropy, (const unsigned char *) personalSalt, strlen(personalSalt));
    if (ret != 0) return ret;

    ret = mbedtls_ecp_group_load(&ecdh_ctx.grp, MBEDTLS_ECP_DP_SECP256R1); // Use curve secp256r1
    return ret;
}

int SecureSession::generateKeypair(uint8_t outPublicKey[PUBKEY_SIZE], size_t& outPubLen) { // Generate private and public key
    
    // Try generating the keypair (TODO: store into memory to persist after 1 pairing)
    int ret = mbedtls_ecdh_gen_public(
        &ecdh_ctx.grp, // Curve group (e.g., SECP256R1)
        &ecdh_ctx.d, // private key
        &ecdh_ctx.Q, // public key
        mbedtls_ctr_drbg_random, 
        &ctr_drbg);
    if (ret != 0) return ret;

    // Write the compressed public key to the outPublicKey array (decompression is handled on the peer)
    unsigned char pubkey[PUBKEY_SIZE];
    size_t olen = 0;
    mbedtls_ecp_point_write_binary(
        &ecdh_ctx.grp,                 // Curve group (e.g., SECP256R1)
        &ecdh_ctx.Q,                   // Public key point
        MBEDTLS_ECP_PF_COMPRESSED, // <-- Use compressed format
        &olen,
        outPublicKey,
        sizeof(pubkey)
    );
    if (ret != 0) return ret;

    if (olen != PUBKEY_SIZE) return -1; // unexpected size

    return 0;
}


int SecureSession::computeSharedSecret(const uint8_t peerPublicKey[66], size_t peerPubLen) { // Compute shared secret given the peer's public key
    if (peerPubLen < 65) return -1;

    // initialize the struct to hold the peer's public key (point on the curve)
    mbedtls_ecp_point peerPoint;
    mbedtls_ecp_point_init(&peerPoint);

    // Read the compressed (or uncompressed) peer public key 
    int ret = mbedtls_ecp_point_read_binary(&ecdh_ctx.grp, &peerPoint, peerPublicKey, 65);
    if (ret != 0) {
        mbedtls_ecp_point_free(&peerPoint);
        Serial0.println("Error reading peer public key");
        Serial0.printf("Error code: %d\n", ret);

        return ret;
    }

    Serial0.println("Peer public key read successfully");

    char buf[1000]; // large enough to hold the key in hex + null terminator
    size_t olen2 = 0;

    ret = mbedtls_mpi_write_string(&ecdh_ctx.d, 16, buf, sizeof(buf), &olen2);
    if (ret == 0) {
        Serial0.println("Private key (hex):");
        Serial0.println(buf);
    } else {
        Serial0.print("Failed to write private key string. Error: ");
        Serial0.println(ret);
    }

    
    // Compute the shared secret (this is a scalar)
    ret = mbedtls_ecdh_compute_shared(&ecdh_ctx.grp, &ecdh_ctx.z, &peerPoint, &ecdh_ctx.d,
                                      mbedtls_ctr_drbg_random, &ctr_drbg);
    mbedtls_ecp_point_free(&peerPoint);
    if (ret != 0) return ret;

    // Export shared secret as fixed length binary
    size_t olen = 0;
    ret = mbedtls_mpi_write_binary(&ecdh_ctx.z, sharedSecret, KEY_SIZE);
    if (ret != 0) return ret;

    sharedReady = true;
    return 0;
}

int SecureSession::deriveAESKeyFromSharedSecret(uint8_t key_out[KEY_SIZE]) { // KDF to generate a key with entropy on every bit
    if (!sharedReady) return -1;

    // Use SHA-256 to hash shared secret to derive AES key
    int ret = mbedtls_sha256_ret(sharedSecret, KEY_SIZE, key_out, 0);
    return ret;
}

int SecureSession::encrypt( // Encrypt a given text string using gcm
        const uint8_t* plaintext, // Text data to be encrypted
        size_t plaintext_len, // Len of plaintext
        uint8_t* ciphertext, // Pointer to store the encrypted data
        uint8_t iv[IV_SIZE], // prng initialization vector
        uint8_t tag[TAG_SIZE])  // Tag for GCM to ensure data integrity 
    
    {

    if (!sharedReady) return -1;

    // Generate random initialization vector (vector of prng)
    int ret = mbedtls_ctr_drbg_random(&ctr_drbg, iv, IV_SIZE);
    if (ret != 0) return ret;

    // Use the shared secret to generate a new key
    uint8_t aesKey[KEY_SIZE];
    ret = deriveAESKeyFromSharedSecret(aesKey);
    if (ret != 0) return ret;

    // set the generated AES key in the GCM context
    mbedtls_gcm_init(&gcm);
    ret = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES, aesKey, KEY_SIZE * 8);
    if (ret != 0) return ret;
        
    // Generate ciphertext using GCM to ensure data integrity
    ret = mbedtls_gcm_crypt_and_tag(&gcm, MBEDTLS_GCM_ENCRYPT,
                                    plaintext_len,
                                    iv, IV_SIZE,
                                    nullptr, 0,  // no additional data
                                    plaintext,
                                    ciphertext,
                                    TAG_SIZE,
                                    tag);
    mbedtls_gcm_free(&gcm);
    return ret;
}

int SecureSession::decrypt( // Decrypt an ecrypted string
    const uint8_t* ciphertext, 
    size_t ciphertext_len,
    const uint8_t iv[IV_SIZE],
    const uint8_t tag[TAG_SIZE],
    uint8_t* plaintext_out) {

    if (!sharedReady) return -1;
    
    // Get the AES key from the shared secret (KDF)
    uint8_t aesKey[KEY_SIZE];
    int ret = deriveAESKeyFromSharedSecret(aesKey);
    if (ret != 0) return ret;
    
    mbedtls_gcm_init(&gcm);
    ret = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES, aesKey, KEY_SIZE * 8); // Set the AES key for the GCM context
    if (ret != 0) return ret;

    ret = mbedtls_gcm_auth_decrypt(&gcm,
                                   ciphertext_len,
                                   iv, IV_SIZE,
                                   nullptr, 0,
                                   tag,
                                   TAG_SIZE,
                                   ciphertext,
                                   plaintext_out); 
    mbedtls_gcm_free(&gcm);
    return ret;
}
