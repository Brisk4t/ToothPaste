/*
 * fido_glue.h – FIDO2/U2F crypto and credential helpers for ToothPaste.
 *
 * Bridges u2f_store (NVS/ATECC608B) and mbedTLS to implement FIDO2
 * credential creation, verification, and ECDSA signing.
 *
 * Ported/adapted from pico-fido (polhenarejos/pico-fido), AGPL-3.0.
 */
#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include "mbedtls/ecp.h"
#include "mbedtls/ecdsa.h"
#include "ctap2_cbor.h"

#ifdef __cplusplus
extern "C" {
#endif

/* -----------------------------------------------------------------------
 * Algorithm / curve / auth-data constants
 * ----------------------------------------------------------------------- */
#define FIDO2_ALG_ES256      -7     /* ECDSA-SHA256 (COSE) */
#define FIDO2_ALG_ES384     -35     /* ECDSA-SHA384 */
#define FIDO2_ALG_ES512     -36     /* ECDSA-SHA512 */

#define FIDO2_CURVE_P256     1      /* secp256r1 (COSE crv) */
#define FIDO2_CURVE_P384     2
#define FIDO2_CURVE_P521     3

#define FIDO2_AUT_FLAG_UP   0x01    /* User Present */
#define FIDO2_AUT_FLAG_UV   0x04    /* User Verified */
#define FIDO2_AUT_FLAG_AT   0x40    /* Attested credential data present */
#define FIDO2_AUT_FLAG_ED   0x80    /* Extension data present */

/* -----------------------------------------------------------------------
 * Key handle / credential ID sizing
 * ----------------------------------------------------------------------- */
#define CTAP_APPID_SIZE      32     /* U2F application ID (SHA-256) */
#define KEY_PATH_LEN         32     /* 8 × 4-byte BIP32 path components */
#define KEY_PATH_ENTRIES      8
#define KEY_HANDLE_LEN       64     /* path(32) + HMAC verification tag(32) */

/* Non-resident (server-side) credential ID layout:
 *   CRED_PROTO_MAGIC (4) || IV (12) || ChaCha-encrypted CBOR || tag (16)
 *   || silent-HMAC (16)
 * Total overhead = 48 bytes.  Max payload ≈ 200 bytes of CBOR.
 */
#define CRED_PROTO_LEN        4
#define CRED_IV_LEN          12
#define CRED_TAG_LEN         16
#define CRED_SILENT_TAG_LEN  16
#define CRED_HDR_OVERHEAD   (CRED_PROTO_LEN + CRED_IV_LEN + CRED_TAG_LEN + CRED_SILENT_TAG_LEN)
#define MAX_CRED_ID_LENGTH  256     /* max byte size of a credential ID */
#define MAX_CBOR_PAYLOAD    1024    /* scratch CBOR buffer */

/* -----------------------------------------------------------------------
 * FIDO2 credential data (decoded from a credential ID)
 * ----------------------------------------------------------------------- */
typedef struct Credential {
    CborCharString rpId;
    CborByteString userId;
    CborCharString userName;
    CborCharString userDisplayName;
    int64_t        alg;
    int64_t        curve;
    CborByteString id;          /* raw credential ID bytes */
    bool           present;
} Credential;

/* PublicKeyCredentialParameters entry (makeCredential input) */
typedef struct PubKeyCredParams {
    CborCharString type;
    int64_t        alg;
} PubKeyCredParams;

/* PublicKeyCredentialDescriptor entry (excludeList / allowList) */
typedef struct PubKeyCredDescriptor {
    CborCharString type;
    CborByteString id;
} PubKeyCredDescriptor;

/* -----------------------------------------------------------------------
 * Core crypto helpers (ported from pico-fido fido.c / credential.c)
 * ----------------------------------------------------------------------- */

/** Load the 32-byte credential wrapping / attestation key from NVS. */
int load_keydev(uint8_t key[32]);

/** mbedTLS f_rng callback (uses esp_fill_random). */
int random_fill_iterator(void *rng_state, unsigned char *output, size_t len);

/**
 * derive_key – BIP32-like deterministic EC keypair derivation.
 *
 * app_id    32-byte application ID (used only when new_key=true to form HMAC)
 * new_key   if true: fill key_handle[0..31] with fresh random hardened path
 *                    and write HMAC verification tag into key_handle[32..63]
 *           if false: re-derive keypair from existing key_handle[0..31]
 * key_handle 64-byte buffer (KEY_HANDLE_LEN)
 * curve     mbedtls_ecp_group_id (e.g. MBEDTLS_ECP_DP_SECP256R1)
 * key       output keypair; may be NULL (only fills key_handle)
 */
int derive_key(const uint8_t *app_id, bool new_key, uint8_t *key_handle,
               mbedtls_ecp_group_id curve, mbedtls_ecp_keypair *key);

/**
 * verify_key – Confirm that a U2F key handle belongs to this device for appId.
 * Returns 0 if valid.
 */
int verify_key(const uint8_t *app_id, const uint8_t *key_handle,
               mbedtls_ecp_keypair *key);

/**
 * fido_load_key – Reconstruct the per-credential EC keypair from its ID.
 * Uses bytes [4..31] of cred_id as HKDF path (after setting the hardened bit).
 * curve: FIDO2_CURVE_* constant.
 */
int fido_load_key(int curve, const uint8_t *cred_id, mbedtls_ecp_keypair *key);

/** fido_curve_to_mbedtls – map FIDO2_CURVE_* → mbedtls_ecp_group_id */
mbedtls_ecp_group_id fido_curve_to_mbedtls(int curve);

/** Derive the 32-byte ChaCha20 encryption key from the device key. */
int credential_derive_chacha_key(uint8_t *outk, const uint8_t *proto);

/* -----------------------------------------------------------------------
 * Credential lifecycle
 * ----------------------------------------------------------------------- */

/**
 * credential_create – Create a new non-resident credential ID.
 *
 * rp_id_hash   32-byte SHA-256(rp.id)
 * user_id      raw user handle bytes
 * user_id_len  length of user_id
 * user_name    UTF-8 display name (may be NULL)
 * alg          FIDO2_ALG_ES256 etc.
 * curve        FIDO2_CURVE_P256 etc.
 * cred_id      output buffer (≥ MAX_CRED_ID_LENGTH bytes)
 * cred_id_len  output: filled with the actual byte count
 *
 * Returns 0 on success, CTAP2_ERR_* on failure.
 */
int credential_create(const uint8_t *rp_id_hash,
                      const uint8_t *user_id, size_t user_id_len,
                      const char *user_name,
                      int alg, int curve,
                      uint8_t *cred_id, uint16_t *cred_id_len);

/**
 * credential_verify – Authenticate a credential ID against rp_id_hash.
 * Returns 0 on success (credential belongs to this device and RP).
 */
int credential_verify(const uint8_t *cred_id, size_t cred_id_len,
                      const uint8_t *rp_id_hash);

/**
 * credential_load – Decrypt and parse a credential ID.
 * Also accepts 64-byte U2F key handles (fall-through to verify_key).
 * Caller must call credential_free() when done.
 */
int credential_load(const uint8_t *cred_id, size_t cred_id_len,
                    const uint8_t *rp_id_hash, Credential *cred);

/** Free memory allocated by credential_load(). */
void credential_free(Credential *cred);

/* -----------------------------------------------------------------------
 * Sign counter
 * ----------------------------------------------------------------------- */
uint32_t fido_get_sign_counter(void);
uint32_t fido_increment_sign_counter(void);

/* -----------------------------------------------------------------------
 * User presence
 * ----------------------------------------------------------------------- */
bool check_user_presence(void);

/* -----------------------------------------------------------------------
 * COSE key encoding  (implementations in fido_glue.c, declared in ctap2_cbor.h)
 * ----------------------------------------------------------------------- */

/* Self-attestation cert, per-registration (not cached). */
int fido_get_cert_der(uint8_t *cert_der_buf, size_t *cert_der_len,
                      mbedtls_ecp_keypair *kp);

/* -----------------------------------------------------------------------
 * AAGUID (16 bytes)
 * ----------------------------------------------------------------------- */
extern const uint8_t aaguid[16];

#ifdef __cplusplus
}
#endif
