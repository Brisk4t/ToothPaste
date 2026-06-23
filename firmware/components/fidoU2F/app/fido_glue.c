/*
 * fido_glue.c – FIDO2/U2F crypto and credential helpers.
 *
 * Implements:
 *   - load_keydev / derive_key / fido_load_key / verify_key  (key management)
 *   - credential_create / _verify / _load / _free            (credential ID lifecycle)
 *   - COSE_key / COSE_public_key / COSE_read_key             (CBOR COSE encoding)
 *   - fido_get_cert_der                                      (self-attestation cert)
 *   - fido_get_sign_counter / fido_increment_sign_counter    (monotonic counter)
 *   - check_user_presence                                    (user touch gate)
 *
 * Ported/adapted from pico-fido (polhenarejos/pico-fido), AGPL-3.0.
 */

#include "fido_glue.h"
#include "u2f_store.h"
#include "u2f_presence.h"
#include "picokeys.h"
#include "esp_log.h"
#include "esp_random.h"
#include "nvs_flash.h"
#include "nvs.h"
#include "mbedtls/hkdf.h"
#include "mbedtls/sha256.h"
#include "mbedtls/md.h"
#include "mbedtls/ecp.h"
#include "mbedtls/ecdsa.h"
#include "mbedtls/chachapoly.h"
#include "mbedtls/platform_util.h"
#include "mbedtls/x509_crt.h"
#include "mbedtls/pk.h"
#include "mbedtls/bignum.h"
#include <string.h>
#include <stdio.h>

static const char *TAG = "fido_glue";

/* -----------------------------------------------------------------------
 * Global constants required by ctap2_cbor.h macros
 * ----------------------------------------------------------------------- */
const bool _btrue  = true;
const bool _bfalse = false;

/* AAGUID: first 16 bytes of SHA-256("ToothPaste FIDO2")
 * (pre-computed, fixed for this authenticator model)
 */
const uint8_t aaguid[16] = {
    0xC9, 0xAF, 0x30, 0x0E, 0xF1, 0x44, 0x57, 0x29,
    0x83, 0x62, 0x46, 0xE4, 0x95, 0x0F, 0x22, 0x31
};

/* Credential ID protocol marker – identifies ToothPaste FIDO2 v1 format.
 * Distinct from pico-fido's "\xf1\xd0\x02\x02" to avoid confusion.
 */
static const uint8_t CRED_PROTO_MAGIC[CRED_PROTO_LEN] = {
    0xf1, 0xd0, 0x54, 0x50   /* 0x54='T', 0x50='P' */
};

/* -----------------------------------------------------------------------
 * Random / entropy
 * ----------------------------------------------------------------------- */
int random_fill_iterator(void *rng_state, unsigned char *output, size_t len)
{
    (void)rng_state;
    esp_fill_random(output, (uint32_t)len);
    return 0;
}

/* -----------------------------------------------------------------------
 * Device master key
 *
 * SW path: reads the NVS attestation key (same 32-byte scalar used for
 *          both attestation signing and credential HKDF derivation).
 * HW path: derives 32 bytes from ATECC slot 9 via HMAC-SHA256, so that
 *          the credential encryption root never touches NVS.
 * ----------------------------------------------------------------------- */
int load_keydev(uint8_t key[32])
{
#ifdef USE_SOFTWARE_CRYPTO
    esp_err_t err = u2f_store_get_attestation_key(key);
#else
    esp_err_t err = u2f_store_hw_get_cred_key(key);
#endif
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "load_keydev failed: %s", esp_err_to_name(err));
        return PICOKEYS_ERR_MEMORY_FATAL;
    }
    return PICOKEYS_OK;
}

/* -----------------------------------------------------------------------
 * fido_curve_to_mbedtls
 * ----------------------------------------------------------------------- */
mbedtls_ecp_group_id fido_curve_to_mbedtls(int curve)
{
    switch (curve) {
    case FIDO2_CURVE_P256: return MBEDTLS_ECP_DP_SECP256R1;
    case FIDO2_CURVE_P384: return MBEDTLS_ECP_DP_SECP384R1;
    case FIDO2_CURVE_P521: return MBEDTLS_ECP_DP_SECP521R1;
    default:               return MBEDTLS_ECP_DP_NONE;
    }
}

/* -----------------------------------------------------------------------
 * derive_key – BIP32-like HKDF-SHA512 key derivation.
 *
 * Starts with the 32-byte device key and iterates HKDF-SHA512 once per
 * path component (8 × 4 bytes from key_handle[0..31]).  The derived
 * EC private scalar is the first key_bytes bytes of the final outk.
 * ----------------------------------------------------------------------- */
int derive_key(const uint8_t *app_id, bool new_key, uint8_t *key_handle,
               mbedtls_ecp_group_id curve, mbedtls_ecp_keypair *key)
{
    uint8_t outk[67] = {0};   /* ≥ largest private key (P-521 = 66 bytes) */
    int r = load_keydev(outk);
    if (r != PICOKEYS_OK) return r;

    const mbedtls_md_info_t *md = mbedtls_md_info_from_type(MBEDTLS_MD_SHA512);
    for (size_t i = 0; i < KEY_PATH_ENTRIES; i++) {
        if (new_key) {
            uint32_t val;
            esp_fill_random(&val, sizeof(val));
            val |= 0x80000000u;
            memcpy(key_handle + i * sizeof(uint32_t), &val, sizeof(val));
        }
        r = mbedtls_hkdf(md,
                         key_handle + i * sizeof(uint32_t), sizeof(uint32_t),
                         outk, 32,
                         outk + 32, 32,
                         outk, sizeof(outk));
        if (r != 0) {
            mbedtls_platform_zeroize(outk, sizeof(outk));
            return r;
        }
    }

    if (new_key && app_id) {
        uint8_t base[CTAP_APPID_SIZE + KEY_PATH_LEN];
        memcpy(base, app_id, CTAP_APPID_SIZE);
        memcpy(base + CTAP_APPID_SIZE, key_handle, KEY_PATH_LEN);
        r = mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256),
                            outk, 32, base, sizeof(base),
                            key_handle + KEY_PATH_LEN);
        if (r != 0) {
            mbedtls_platform_zeroize(outk, sizeof(outk));
            return r;
        }
    }

    if (key != NULL) {
        const mbedtls_ecp_curve_info *ci = mbedtls_ecp_curve_info_from_grp_id(curve);
        if (ci == NULL) {
            mbedtls_platform_zeroize(outk, sizeof(outk));
            return CTAP2_ERR_UNSUPPORTED_ALGORITHM;
        }
        size_t key_bytes = (ci->bit_size + 7) / 8;
        if (ci->bit_size % 8 != 0) {
            outk[0] >>= (8 - (ci->bit_size % 8));
        }
        r = mbedtls_ecp_read_key(curve, key, outk, key_bytes);
        mbedtls_platform_zeroize(outk, sizeof(outk));
        if (r != 0) return r;
        return mbedtls_ecp_keypair_calc_public(key, random_fill_iterator, NULL);
    }

    mbedtls_platform_zeroize(outk, sizeof(outk));
    return 0;
}

/* -----------------------------------------------------------------------
 * verify_key – Check U2F key handle HMAC tag against appId.
 * ----------------------------------------------------------------------- */
int verify_key(const uint8_t *app_id, const uint8_t *key_handle,
               mbedtls_ecp_keypair *key)
{
    /* All 8 path components must have the hardened bit set */
    for (size_t i = 0; i < KEY_PATH_ENTRIES; i++) {
        uint32_t k = 0;
        memcpy(&k, key_handle + i * sizeof(uint32_t), sizeof(k));
        if (!(k & 0x80000000u)) return -1;
    }

    /* Re-derive keypair if caller didn't provide one */
    mbedtls_ecp_keypair ctx;
    bool own_ctx = false;
    if (key == NULL) {
        mbedtls_ecp_keypair_init(&ctx);
        own_ctx = true;
        key = &ctx;
        if (derive_key(NULL, false,
                       (uint8_t *)key_handle,
                       MBEDTLS_ECP_DP_SECP256R1, &ctx) != 0) {
            mbedtls_ecp_keypair_free(&ctx);
            return -3;
        }
    }

    /* Extract private scalar d via mbedTLS 3.x export API */
    uint8_t     d[32] = {0};
    mbedtls_mpi mpi_d;
    mbedtls_mpi_init(&mpi_d);
    int ret = mbedtls_ecp_export(key, NULL, &mpi_d, NULL);
    if (ret == 0) ret = mbedtls_mpi_write_binary(&mpi_d, d, sizeof(d));
    mbedtls_mpi_free(&mpi_d);
    if (own_ctx) mbedtls_ecp_keypair_free(&ctx);
    if (ret != 0) {
        mbedtls_platform_zeroize(d, sizeof(d));
        return -2;
    }

    uint8_t base[CTAP_APPID_SIZE + KEY_PATH_LEN];
    memcpy(base, app_id, CTAP_APPID_SIZE);
    memcpy(base + CTAP_APPID_SIZE, key_handle, KEY_PATH_LEN);

    uint8_t hmac[32];
    ret = mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256),
                          d, 32, base, sizeof(base), hmac);
    mbedtls_platform_zeroize(d, sizeof(d));
    if (ret != 0) return -4;
    return memcmp(key_handle + KEY_PATH_LEN, hmac, sizeof(hmac));
}

/* -----------------------------------------------------------------------
 * fido_load_key – Reconstruct per-credential EC keypair from credential ID.
 *
 * Uses bytes [0..31] of cred_id as the HKDF path (after hardening each
 * 4-byte component and overriding the first 4 bytes with hardened 10022).
 * ----------------------------------------------------------------------- */
int fido_load_key(int curve, const uint8_t *cred_id, mbedtls_ecp_keypair *key)
{
    mbedtls_ecp_group_id mbedtls_curve = fido_curve_to_mbedtls(curve);
    if (mbedtls_curve == MBEDTLS_ECP_DP_NONE) {
        return CTAP2_ERR_UNSUPPORTED_ALGORITHM;
    }

    uint8_t key_path[KEY_PATH_LEN];
    memcpy(key_path, cred_id, KEY_PATH_LEN);

    /* First component: hardened path index 10022 */
    uint32_t first = 0x80000000u | 10022u;
    memcpy(key_path, &first, sizeof(first));

    /* Remaining components: set hardened bit on each */
    for (size_t i = 1; i < KEY_PATH_ENTRIES; i++) {
        uint32_t part = 0;
        memcpy(&part, key_path + i * sizeof(uint32_t), sizeof(part));
        part |= 0x80000000u;
        memcpy(key_path + i * sizeof(uint32_t), &part, sizeof(part));
    }

    return derive_key(NULL, false, key_path, mbedtls_curve, key);
}

/* -----------------------------------------------------------------------
 * credential_derive_chacha_key
 *
 * Derives the 32-byte ChaCha20 encryption key for credential IDs:
 *   outk = device_key
 *   outk = HMAC-SHA256(outk, "SLIP-0022")
 *   outk = HMAC-SHA256(outk, proto[0..3])
 *   outk = HMAC-SHA256(outk, "Encryption key")
 * ----------------------------------------------------------------------- */
int credential_derive_chacha_key(uint8_t *outk, const uint8_t *proto)
{
    memset(outk, 0, 32);
    int r = load_keydev(outk);
    if (r != PICOKEYS_OK) return r;

    const mbedtls_md_info_t *md = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    r = mbedtls_md_hmac(md, outk, 32, (const uint8_t *)"SLIP-0022", 9, outk);
    if (r) return r;
    r = mbedtls_md_hmac(md, outk, 32,
                        proto ? proto : CRED_PROTO_MAGIC, CRED_PROTO_LEN, outk);
    if (r) return r;
    return mbedtls_md_hmac(md, outk, 32,
                           (const uint8_t *)"Encryption key", 14, outk);
}

/* -----------------------------------------------------------------------
 * credential_silent_tag – Fast RP-binding HMAC without full decryption.
 * Returns 0 on success.
 * ----------------------------------------------------------------------- */
static int credential_silent_tag(const uint8_t *cred_id, size_t cred_id_len,
                                  const uint8_t *rp_id_hash, uint8_t *outk)
{
    uint8_t dev_key[32];
    int r = load_keydev(dev_key);
    if (r) return r;

    mbedtls_sha256_context ctx;
    mbedtls_sha256_init(&ctx);
    mbedtls_sha256_starts(&ctx, 0);
    mbedtls_sha256_update(&ctx, dev_key, 32);
    mbedtls_sha256_update(&ctx, rp_id_hash, 32);
    mbedtls_sha256_finish(&ctx, outk);
    mbedtls_sha256_free(&ctx);
    mbedtls_platform_zeroize(dev_key, sizeof(dev_key));

    /* HMAC over everything except the silent tag slot itself */
    return mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256),
                           outk, 32,
                           cred_id, cred_id_len - CRED_SILENT_TAG_LEN,
                           outk);
}

/* -----------------------------------------------------------------------
 * credential_create
 * ----------------------------------------------------------------------- */
int credential_create(const uint8_t *rp_id_hash,
                      const uint8_t *user_id, size_t user_id_len,
                      const char *user_name,
                      int alg, int curve,
                      uint8_t *cred_id, uint16_t *cred_id_len)
{
    /* Encode credential metadata as a small CBOR map.
     * Layout inside cred_id:
     *   [CRED_PROTO_LEN][CRED_IV_LEN][...encrypted CBOR...][tag][silent_tag]
     * We build the plaintext into the final location then encrypt in-place.
     */
    uint8_t *cbor_plain = cred_id + CRED_PROTO_LEN + CRED_IV_LEN;
    size_t   cbor_cap   = MAX_CRED_ID_LENGTH - CRED_HDR_OVERHEAD;

    CborEncoder encoder, map;
    CborError   error = CborNoError;
    cbor_encoder_init(&encoder, cbor_plain, cbor_cap, 0);

    /* Map entries: 1=rp_id_hash, 2=user_id, 3=user_name, 4=alg, 5=curve */
    int fields = 1 +                                       /* rp_id_hash always */
                 (user_id && user_id_len > 0 ? 1 : 0) +
                 (user_name && user_name[0] ? 1 : 0) +
                 (alg   != FIDO2_ALG_ES256   ? 1 : 0) +
                 (curve != FIDO2_CURVE_P256  ? 1 : 0);

    CBOR_CHECK(cbor_encoder_create_map(&encoder, &map, (size_t)fields));

    /* 0x01: rp_id_hash */
    CBOR_CHECK(cbor_encode_uint(&map, 0x01));
    CBOR_CHECK(cbor_encode_byte_string(&map, rp_id_hash, 32));

    /* 0x02: user_id */
    if (user_id && user_id_len > 0) {
        CBOR_CHECK(cbor_encode_uint(&map, 0x02));
        CBOR_CHECK(cbor_encode_byte_string(&map, user_id, user_id_len));
    }

    /* 0x03: user_name */
    if (user_name && user_name[0]) {
        CBOR_CHECK(cbor_encode_uint(&map, 0x03));
        CBOR_CHECK(cbor_encode_text_stringz(&map, user_name));
    }

    /* 0x04: algorithm (only if not the default ES256) */
    if (alg != FIDO2_ALG_ES256) {
        CBOR_CHECK(cbor_encode_uint(&map, 0x04));
        CBOR_CHECK(cbor_encode_int(&map, (int64_t)alg));
    }

    /* 0x05: curve (only if not the default P-256) */
    if (curve != FIDO2_CURVE_P256) {
        CBOR_CHECK(cbor_encode_uint(&map, 0x05));
        CBOR_CHECK(cbor_encode_int(&map, (int64_t)curve));
    }

    CBOR_CHECK(cbor_encoder_close_container(&encoder, &map));
err:
    if (error != CborNoError) {
        ESP_LOGE(TAG, "credential_create: CBOR encode error %d", error);
        return CTAP2_ERR_PROCESSING;
    }

    size_t cbor_len = cbor_encoder_get_buffer_size(&encoder, cbor_plain);

    /* Derive ChaCha20 key */
    uint8_t chacha_key[32];
    if (credential_derive_chacha_key(chacha_key, CRED_PROTO_MAGIC) != 0) {
        return CTAP2_ERR_PROCESSING;
    }

    /* Random IV */
    uint8_t iv[CRED_IV_LEN];
    esp_fill_random(iv, sizeof(iv));

    /* ChaCha20-Poly1305 encrypt in-place; AD = rp_id_hash */
    uint8_t tag[CRED_TAG_LEN];
    mbedtls_chachapoly_context chatx;
    mbedtls_chachapoly_init(&chatx);
    mbedtls_chachapoly_setkey(&chatx, chacha_key);
    int ret = mbedtls_chachapoly_encrypt_and_tag(&chatx, cbor_len,
                                                 iv,
                                                 rp_id_hash, 32,
                                                 cbor_plain,
                                                 cbor_plain,
                                                 tag);
    mbedtls_chachapoly_free(&chatx);
    mbedtls_platform_zeroize(chacha_key, sizeof(chacha_key));
    if (ret != 0) return CTAP2_ERR_PROCESSING;

    /* Assemble: MAGIC || IV || ciphertext || tag || silent_tag */
    memcpy(cred_id,                                         CRED_PROTO_MAGIC, CRED_PROTO_LEN);
    memcpy(cred_id + CRED_PROTO_LEN,                        iv,               CRED_IV_LEN);
    /* ciphertext already in place at cred_id + CRED_PROTO_LEN + CRED_IV_LEN */
    memcpy(cred_id + CRED_PROTO_LEN + CRED_IV_LEN + cbor_len, tag,          CRED_TAG_LEN);

    *cred_id_len = (uint16_t)(CRED_PROTO_LEN + CRED_IV_LEN + cbor_len +
                              CRED_TAG_LEN + CRED_SILENT_TAG_LEN);

    /* Compute silent tag last (needs final cred_id_len) */
    uint8_t stag[CRED_SILENT_TAG_LEN];
    if (credential_silent_tag(cred_id, *cred_id_len, rp_id_hash, stag) != 0) {
        return CTAP2_ERR_PROCESSING;
    }
    memcpy(cred_id + *cred_id_len - CRED_SILENT_TAG_LEN, stag, CRED_SILENT_TAG_LEN);

    return 0;
}

/* -----------------------------------------------------------------------
 * credential_verify
 * ----------------------------------------------------------------------- */
int credential_verify(const uint8_t *cred_id, size_t cred_id_len,
                      const uint8_t *rp_id_hash)
{
    if (cred_id_len < (size_t)CRED_HDR_OVERHEAD) return -1;
    if (memcmp(cred_id, CRED_PROTO_MAGIC, CRED_PROTO_LEN) != 0) return -2;

    size_t  cbor_len = cred_id_len - CRED_HDR_OVERHEAD;
    const uint8_t *iv     = cred_id + CRED_PROTO_LEN;
    const uint8_t *cipher = cred_id + CRED_PROTO_LEN + CRED_IV_LEN;
    const uint8_t *tag    = cipher + cbor_len;

    uint8_t key[32];
    if (credential_derive_chacha_key(key, CRED_PROTO_MAGIC) != 0) return -3;

    /* Decrypt into a temporary buffer (don't modify the caller's bytes) */
    uint8_t *plain = (uint8_t *)malloc(cbor_len);
    if (!plain) { mbedtls_platform_zeroize(key, 32); return -4; }

    mbedtls_chachapoly_context chatx;
    mbedtls_chachapoly_init(&chatx);
    mbedtls_chachapoly_setkey(&chatx, key);
    int ret = mbedtls_chachapoly_auth_decrypt(&chatx, cbor_len,
                                              iv,
                                              rp_id_hash, 32,
                                              tag,
                                              cipher, plain);
    mbedtls_chachapoly_free(&chatx);
    mbedtls_platform_zeroize(key, 32);
    free(plain);
    return ret;
}

/* -----------------------------------------------------------------------
 * credential_load
 * ----------------------------------------------------------------------- */
int credential_load(const uint8_t *cred_id, size_t cred_id_len,
                    const uint8_t *rp_id_hash, Credential *cred)
{
    if (!cred) return CTAP2_ERR_PROCESSING;
    memset(cred, 0, sizeof(*cred));
    cred->alg   = FIDO2_ALG_ES256;
    cred->curve = FIDO2_CURVE_P256;

    /* Verify credential belongs to this RP and device */
    if (credential_verify(cred_id, cred_id_len, rp_id_hash) != 0) {
        /* Might be a legacy U2F key handle (KEY_HANDLE_LEN = 64 bytes) */
        if (cred_id_len == KEY_HANDLE_LEN &&
            verify_key(rp_id_hash, cred_id, NULL) == 0) {
            /* Valid U2F key handle – fill minimal Credential */
            cred->id.data = (uint8_t *)malloc(cred_id_len);
            if (!cred->id.data) return CTAP2_ERR_PROCESSING;
            memcpy(cred->id.data, cred_id, cred_id_len);
            cred->id.len     = cred_id_len;
            cred->id.present = true;
            cred->present    = true;
            return 0;
        }
        return CTAP2_ERR_INVALID_CREDENTIAL;
    }

    /* Decrypt the CBOR payload to parse user info */
    size_t  cbor_len  = cred_id_len - CRED_HDR_OVERHEAD;
    const uint8_t *iv     = cred_id + CRED_PROTO_LEN;
    const uint8_t *cipher = cred_id + CRED_PROTO_LEN + CRED_IV_LEN;
    const uint8_t *tag    = cipher + cbor_len;

    uint8_t key[32];
    if (credential_derive_chacha_key(key, CRED_PROTO_MAGIC) != 0)
        return CTAP2_ERR_PROCESSING;

    uint8_t *plain = (uint8_t *)malloc(cbor_len);
    if (!plain) { mbedtls_platform_zeroize(key, 32); return CTAP2_ERR_PROCESSING; }

    mbedtls_chachapoly_context chatx;
    mbedtls_chachapoly_init(&chatx);
    mbedtls_chachapoly_setkey(&chatx, key);
    int ret = mbedtls_chachapoly_auth_decrypt(&chatx, cbor_len,
                                              iv, rp_id_hash, 32,
                                              tag, cipher, plain);
    mbedtls_chachapoly_free(&chatx);
    mbedtls_platform_zeroize(key, 32);
    if (ret != 0) { free(plain); return CTAP2_ERR_INVALID_CREDENTIAL; }

    /* Parse CBOR map */
    CborParser parser;
    CborValue  map;
    CborError  err = cbor_parser_init(plain, cbor_len, 0, &parser, &map);
    if (err != CborNoError || !cbor_value_is_map(&map)) {
        free(plain); return CTAP2_ERR_INVALID_CBOR;
    }

    CborValue it;
    cbor_value_enter_container(&map, &it);
    while (!cbor_value_at_end(&it)) {
        uint64_t key_id = 0;
        if (!cbor_value_is_unsigned_integer(&it)) break;
        cbor_value_get_uint64(&it, &key_id);
        cbor_value_advance_fixed(&it);

        if (key_id == 0x01) {
            /* rp_id_hash – skip (we already verified it) */
            if (cbor_value_is_byte_string(&it)) {
                cbor_value_advance(&it);
            }
        } else if (key_id == 0x02) {
            if (cbor_value_is_byte_string(&it)) {
                cbor_value_dup_byte_string(&it, &cred->userId.data,
                                           &cred->userId.len, &it);
                cred->userId.present = true;
            }
        } else if (key_id == 0x03) {
            if (cbor_value_is_text_string(&it)) {
                cbor_value_dup_text_string(&it, &cred->userName.data,
                                           &cred->userName.len, &it);
                cred->userName.present = true;
            }
        } else if (key_id == 0x04) {
            if (cbor_value_is_integer(&it)) {
                cbor_value_get_int64(&it, &cred->alg);
                cbor_value_advance_fixed(&it);
            }
        } else if (key_id == 0x05) {
            if (cbor_value_is_integer(&it)) {
                cbor_value_get_int64(&it, &cred->curve);
                cbor_value_advance_fixed(&it);
            }
        } else {
            cbor_value_advance(&it);
        }
    }
    free(plain);

    cred->id.data = (uint8_t *)malloc(cred_id_len);
    if (!cred->id.data) return CTAP2_ERR_PROCESSING;
    memcpy(cred->id.data, cred_id, cred_id_len);
    cred->id.len     = cred_id_len;
    cred->id.present = true;
    cred->present    = true;
    return 0;
}

/* -----------------------------------------------------------------------
 * credential_free
 * ----------------------------------------------------------------------- */
void credential_free(Credential *cred)
{
    if (!cred) return;
    if (cred->rpId.data)            { free(cred->rpId.data);           cred->rpId.data = NULL; }
    if (cred->userId.data)          { free(cred->userId.data);         cred->userId.data = NULL; }
    if (cred->userName.data)        { free(cred->userName.data);       cred->userName.data = NULL; }
    if (cred->userDisplayName.data) { free(cred->userDisplayName.data);cred->userDisplayName.data = NULL; }
    if (cred->id.data)              { free(cred->id.data);             cred->id.data = NULL; }
    cred->present = false;
}

/* -----------------------------------------------------------------------
 * Sign counter (wraps u2f_store)
 * ----------------------------------------------------------------------- */
uint32_t fido_get_sign_counter(void)
{
    uint32_t ctr = 0;
    u2f_store_get_counter(&ctr);
    return ctr;
}

uint32_t fido_increment_sign_counter(void)
{
    uint32_t ctr = 0;
    u2f_store_increment_counter(&ctr);
    return ctr;
}

/* -----------------------------------------------------------------------
 * User presence (wraps u2f_presence_wait)
 * ----------------------------------------------------------------------- */
bool check_user_presence(void)
{
    return u2f_presence_wait(10000);   /* 10-second timeout */
}

/* -----------------------------------------------------------------------
 * COSE_key – Encode an EC keypair as a COSE_Key map.
 *
 * Supports P-256, P-384, P-521 (and falls through gracefully for others).
 * The map has 5 entries: kty(1), alg(3), crv(-1), x(-2), y(-3).
 * ----------------------------------------------------------------------- */
CborError COSE_key(mbedtls_ecp_keypair *key,
                   CborEncoder *mapEncoderParent,
                   CborEncoder *mapEncoder)
{
    CborError error = CborNoError;
    int crv = 0, alg = 0;

    /* mbedTLS 3.x: keypair fields are private; use export API */
    mbedtls_ecp_group kgrp;
    mbedtls_ecp_point kQ;
    mbedtls_ecp_group_init(&kgrp);
    mbedtls_ecp_point_init(&kQ);
    if (mbedtls_ecp_export(key, &kgrp, NULL, &kQ) != 0) {
        mbedtls_ecp_group_free(&kgrp);
        mbedtls_ecp_point_free(&kQ);
        return CborErrorUnknownType;
    }

    switch (kgrp.id) {
    case MBEDTLS_ECP_DP_SECP256R1:
        crv = FIDO2_CURVE_P256; alg = FIDO2_ALG_ES256; break;
    case MBEDTLS_ECP_DP_SECP384R1:
        crv = FIDO2_CURVE_P384; alg = FIDO2_ALG_ES384; break;
    case MBEDTLS_ECP_DP_SECP521R1:
        crv = FIDO2_CURVE_P521; alg = FIDO2_ALG_ES512; break;
    default:
        mbedtls_ecp_group_free(&kgrp);
        mbedtls_ecp_point_free(&kQ);
        return CborErrorUnknownType;
    }

    size_t  plen = mbedtls_mpi_size(&kgrp.P);
    /* Export uncompressed point: 0x04 || X (plen bytes) || Y (plen bytes) */
    uint8_t pub[135] = {0};   /* 1 + 2*67 covers up to P-521 */
    size_t  pub_len;
    if (mbedtls_ecp_point_write_binary(&kgrp, &kQ,
            MBEDTLS_ECP_PF_UNCOMPRESSED, &pub_len, pub, sizeof(pub)) != 0) {
        mbedtls_ecp_group_free(&kgrp);
        mbedtls_ecp_point_free(&kQ);
        return CborErrorUnknownType;
    }

    CBOR_CHECK(cbor_encoder_create_map(mapEncoderParent, mapEncoder, 5));
    /* kty = 2 (EC2) */
    CBOR_CHECK(cbor_encode_uint(mapEncoder, 1));
    CBOR_CHECK(cbor_encode_uint(mapEncoder, 2));
    /* alg */
    CBOR_CHECK(cbor_encode_uint(mapEncoder, 3));
    CBOR_CHECK(cbor_encode_int(mapEncoder, (int64_t)alg));
    /* crv */
    CBOR_CHECK(cbor_encode_negative_int(mapEncoder, 0));   /* key -1 */
    CBOR_CHECK(cbor_encode_uint(mapEncoder, (uint64_t)crv));
    /* x */
    CBOR_CHECK(cbor_encode_negative_int(mapEncoder, 1));   /* key -2 */
    CBOR_CHECK(cbor_encode_byte_string(mapEncoder, pub + 1, plen));
    /* y */
    CBOR_CHECK(cbor_encode_negative_int(mapEncoder, 2));   /* key -3 */
    CBOR_CHECK(cbor_encode_byte_string(mapEncoder, pub + 1 + plen, plen));

    CBOR_CHECK(cbor_encoder_close_container(mapEncoderParent, mapEncoder));
err:
    mbedtls_ecp_group_free(&kgrp);
    mbedtls_ecp_point_free(&kQ);
    return error;
}

/* -----------------------------------------------------------------------
 * COSE_public_key – Encode an algorithm descriptor map {type, alg}.
 * Used in getInfo's "algorithms" list.
 * ----------------------------------------------------------------------- */
CborError COSE_public_key(int alg, CborEncoder *mapEncoderParent,
                           CborEncoder *mapEncoder)
{
    CborError error = CborNoError;
    CBOR_CHECK(cbor_encoder_create_map(mapEncoderParent, mapEncoder, 2));
    CBOR_CHECK(cbor_encode_text_stringz(mapEncoder, "type"));
    CBOR_CHECK(cbor_encode_text_stringz(mapEncoder, "public-key"));
    CBOR_CHECK(cbor_encode_text_stringz(mapEncoder, "alg"));
    CBOR_CHECK(cbor_encode_int(mapEncoder, (int64_t)alg));
    CBOR_CHECK(cbor_encoder_close_container(mapEncoderParent, mapEncoder));
err:
    return error;
}

/* -----------------------------------------------------------------------
 * COSE_read_key – Parse a COSE_Key map value.
 * ----------------------------------------------------------------------- */
CborError COSE_read_key(CborValue *f, int64_t *kty, int64_t *alg, int64_t *crv,
                        CborByteString *kax, CborByteString *kay)
{
    CborError error = CborNoError;
    CBOR_PARSE_MAP_START(*f, 0)
    {
        int64_t kkey = 0;
        CBOR_FIELD_GET_INT(kkey, 0);
        if (kkey == 1) {
            CBOR_FIELD_GET_INT(*kty, 0);
        } else if (kkey == 3) {
            CBOR_FIELD_GET_INT(*alg, 0);
        } else if (kkey == -1) {
            CBOR_FIELD_GET_INT(*crv, 0);
        } else if (kkey == -2) {
            CBOR_FIELD_GET_BYTES(*kax, 0);
        } else if (kkey == -3) {
            CBOR_FIELD_GET_BYTES(*kay, 0);
        } else {
            CBOR_ADVANCE(0);
        }
    }
    CBOR_PARSE_MAP_END(*f, 0);
err:
    return error;
}

/* Self-attestation cert — signed by the credential's own keypair, not cached. */
int fido_get_cert_der(uint8_t *cert_der_buf, size_t *cert_der_len,
                      mbedtls_ecp_keypair *kp)
{
    mbedtls_mpi d;
    mbedtls_mpi_init(&d);
    int ret = mbedtls_ecp_export(kp, NULL, &d, NULL);
    if (ret != 0) { mbedtls_mpi_free(&d); return ret; }

    uint8_t d_buf[32];
    ret = mbedtls_mpi_write_binary(&d, d_buf, sizeof(d_buf));
    mbedtls_mpi_free(&d);
    if (ret != 0) return ret;

    mbedtls_pk_context pk;
    mbedtls_pk_init(&pk);
    ret = mbedtls_pk_setup(&pk, mbedtls_pk_info_from_type(MBEDTLS_PK_ECKEY));
    if (ret != 0) { mbedtls_platform_zeroize(d_buf, sizeof(d_buf)); return ret; }

    ret = mbedtls_ecp_read_key(MBEDTLS_ECP_DP_SECP256R1, mbedtls_pk_ec(pk),
                                d_buf, sizeof(d_buf));
    mbedtls_platform_zeroize(d_buf, sizeof(d_buf));
    if (ret != 0) { mbedtls_pk_free(&pk); return ret; }

    ret = mbedtls_ecp_keypair_calc_public(mbedtls_pk_ec(pk), random_fill_iterator, NULL);
    if (ret != 0) { mbedtls_pk_free(&pk); return ret; }

    mbedtls_x509write_cert crt;
    mbedtls_x509write_crt_init(&crt);
    mbedtls_x509write_crt_set_version(&crt, MBEDTLS_X509_CRT_VERSION_3);
    mbedtls_x509write_crt_set_md_alg(&crt, MBEDTLS_MD_SHA256);
    mbedtls_x509write_crt_set_validity(&crt, "20220901000000", "20720831235959");
    mbedtls_x509write_crt_set_issuer_name (&crt, "C=XX,O=ToothPaste,CN=ToothPaste FIDO");
    mbedtls_x509write_crt_set_subject_name(&crt, "C=XX,O=ToothPaste,CN=ToothPaste FIDO");

    uint8_t serial[16];
    esp_fill_random(serial, sizeof(serial));
    mbedtls_x509write_crt_set_serial_raw(&crt, serial, sizeof(serial));

    mbedtls_x509write_crt_set_subject_key(&crt, &pk);
    mbedtls_x509write_crt_set_issuer_key (&crt, &pk);
    mbedtls_x509write_crt_set_basic_constraints(&crt, 0, 0);

    uint8_t scratch[1024];
    int n = mbedtls_x509write_crt_der(&crt, scratch, sizeof(scratch),
                                       random_fill_iterator, NULL);
    mbedtls_x509write_crt_free(&crt);
    mbedtls_pk_free(&pk);
    if (n <= 0) {
        ESP_LOGE(TAG, "x509write_crt_der failed: %d", n);
        return n ? n : -1;
    }
    if ((size_t)n > *cert_der_len) return -1;
    memcpy(cert_der_buf, scratch + sizeof(scratch) - n, (size_t)n);
    *cert_der_len = (size_t)n;
    return 0;
}
