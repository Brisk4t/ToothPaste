/*
 * CTAP2 CBOR command dispatcher.
 *
 * Implements:
 *   0x01  authenticatorMakeCredential
 *   0x02  authenticatorGetAssertion
 *   0x04  authenticatorGetInfo
 *   0x07  authenticatorReset    (always CTAP2_ERR_NOT_ALLOWED)
 *
 * Self-attestation only — no x5c certificate in makeCredential response.
 * No PIN/UV, no resident keys, no extensions.  ES256/P-256 only.
 *
 * Response layout into apdu.rdata:
 *   [0]      CTAP2 status byte
 *   [1..]    CBOR map (written by handlers into apdu.rdata+1)
 *
 * Ported/adapted from pico-fido (polhenarejos/pico-fido), AGPL-3.0.
 */

#include <string.h>
#include <stdlib.h>
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "mbedtls/sha256.h"
#include "mbedtls/ecdsa.h"
#include "mbedtls/platform_util.h"
#include "cbor.h"
#include "apdu.h"
#include "ctap_hid.h"
#include "fido_usb_compat.h"
#include "ctap2_cbor.h"
#include "fido_glue.h"

static const char *TAG = "cbor2";

/* CTAP2 command codes */
#define CTAP2_CMD_MAKE_CREDENTIAL    0x01
#define CTAP2_CMD_GET_ASSERTION      0x02
#define CTAP2_CMD_GET_INFO           0x04
#define CTAP2_CMD_CLIENT_PIN         0x06
#define CTAP2_CMD_RESET              0x07
#define CTAP2_CMD_GET_NEXT_ASSERTION 0x08

/* Maximum number of allowList entries we will scan */
#define MAX_ALLOW_LIST  16

/* -----------------------------------------------------------------------
 * Module storage for the current CBOR command
 * ----------------------------------------------------------------------- */
static uint8_t  s_cmd;
static uint8_t  s_buf[CTAP_MAX_CBOR_PAYLOAD];
static uint16_t s_len;

/* -----------------------------------------------------------------------
 * Helpers
 * ----------------------------------------------------------------------- */
static uint16_t ctap2_error_resp(uint8_t status)
{
    apdu.rdata[0] = status;
    return 1;
}

/* Write a big-endian uint32 */
static void put_be32(uint32_t v, uint8_t *b)
{
    b[0] = (v >> 24) & 0xff;
    b[1] = (v >> 16) & 0xff;
    b[2] = (v >>  8) & 0xff;
    b[3] =  v        & 0xff;
}

/* -----------------------------------------------------------------------
 * authenticatorGetInfo (0x04)
 * ----------------------------------------------------------------------- */
static uint16_t ctap2_get_info(void)
{
    apdu.rdata[0] = CTAP2_OK;
    uint8_t *out = apdu.rdata + 1;
    size_t   cap = CTAP_MAX_CBOR_PAYLOAD - 1;

    CborEncoder enc, map, arr, opts, algs, amap;
    CborError   error = CborNoError;

    cbor_encoder_init(&enc, out, cap, 0);
    CBOR_CHECK(cbor_encoder_create_map(&enc, &map, 5));

    /* 0x01 versions */
    CBOR_CHECK(cbor_encode_uint(&map, 0x01));
    CBOR_CHECK(cbor_encoder_create_array(&map, &arr, 2));
    CBOR_CHECK(cbor_encode_text_stringz(&arr, "FIDO_2_0"));
    CBOR_CHECK(cbor_encode_text_stringz(&arr, "U2F_V2"));
    CBOR_CHECK(cbor_encoder_close_container(&map, &arr));

    /* 0x03 aaguid */
    CBOR_CHECK(cbor_encode_uint(&map, 0x03));
    CBOR_CHECK(cbor_encode_byte_string(&map, aaguid, 16));

    /* 0x04 options */
    CBOR_CHECK(cbor_encode_uint(&map, 0x04));
    CBOR_CHECK(cbor_encoder_create_map(&map, &opts, 2));
    CBOR_CHECK(cbor_encode_text_stringz(&opts, "rk"));
    CBOR_CHECK(cbor_encode_boolean(&opts, false));
    CBOR_CHECK(cbor_encode_text_stringz(&opts, "up"));
    CBOR_CHECK(cbor_encode_boolean(&opts, true));
    CBOR_CHECK(cbor_encoder_close_container(&map, &opts));

    /* 0x05 maxMsgSize */
    CBOR_CHECK(cbor_encode_uint(&map, 0x05));
    CBOR_CHECK(cbor_encode_uint(&map, CTAP_MAX_CBOR_PAYLOAD));

    /* 0x08 algorithms */
    CBOR_CHECK(cbor_encode_uint(&map, 0x08));
    CBOR_CHECK(cbor_encoder_create_array(&map, &algs, 1));
    CBOR_CHECK(COSE_public_key(FIDO2_ALG_ES256, &algs, &amap));
    CBOR_CHECK(cbor_encoder_close_container(&map, &algs));

    CBOR_CHECK(cbor_encoder_close_container(&enc, &map));
err:
    if (error != CborNoError) {
        ESP_LOGE(TAG, "getInfo encode error %d", error);
        return ctap2_error_resp(CTAP2_ERR_PROCESSING);
    }
    size_t n = cbor_encoder_get_buffer_size(&enc, out);
    return (uint16_t)(1 + n);
}

/* -----------------------------------------------------------------------
 * Build authenticatorData (§6.1) into buf.
 * Returns number of bytes written, or 0 on error.
 *
 * Layout:
 *   rpIdHash (32)
 *   flags    (1)
 *   counter  (4 BE)
 *   [ attested credential data — only when include_cred_data ]
 *     aaguid        (16)
 *     credIdLen     (2 BE)
 *     credId        (credIdLen)
 *     credPublicKey (CBOR COSE_Key)
 * ----------------------------------------------------------------------- */
static size_t build_auth_data(const uint8_t *rp_id_hash,
                              uint8_t flags,
                              uint32_t counter,
                              const uint8_t *cred_id, uint16_t cred_id_len,
                              mbedtls_ecp_keypair *keypair,
                              uint8_t *buf, size_t buf_cap)
{
    size_t off = 0;

    if (off + 32 > buf_cap) return 0;
    memcpy(buf + off, rp_id_hash, 32); off += 32;

    if (off + 1 > buf_cap) return 0;
    buf[off++] = flags;

    if (off + 4 > buf_cap) return 0;
    put_be32(counter, buf + off); off += 4;

    if (flags & FIDO2_AUT_FLAG_AT) {
        /* aaguid */
        if (off + 16 > buf_cap) return 0;
        memcpy(buf + off, aaguid, 16); off += 16;

        /* credIdLen (2 BE) */
        if (off + 2 > buf_cap) return 0;
        buf[off++] = (cred_id_len >> 8) & 0xff;
        buf[off++] =  cred_id_len       & 0xff;

        /* credId */
        if (off + cred_id_len > buf_cap) return 0;
        memcpy(buf + off, cred_id, cred_id_len); off += cred_id_len;

        /* credPublicKey: CBOR COSE_Key */
        CborEncoder enc, key_map;
        cbor_encoder_init(&enc, buf + off, buf_cap - off, 0);
        CborError e = COSE_key(keypair, &enc, &key_map);
        if (e != CborNoError) return 0;
        off += cbor_encoder_get_buffer_size(&enc, buf + off);
    }
    return off;
}

/* -----------------------------------------------------------------------
 * authenticatorMakeCredential (0x01)
 * ----------------------------------------------------------------------- */
static uint16_t ctap2_make_credential(void)
{
    CborParser  parser;
    CborValue   it;
    CborError   error = CborNoError;

    /* Parsed inputs */
    CborByteString client_data_hash = {0};
    CborCharString rp_id            = {0};
    CborByteString user_id          = {0};
    CborCharString user_name        = {0};
    int64_t        chosen_alg       = 0;
    bool           alg_ok           = false;

    CBOR_CHECK(cbor_parser_init(s_buf, s_len, 0, &parser, &it));

    CBOR_PARSE_MAP_START(it, 0) {
        uint64_t key = 0;
        CBOR_FIELD_GET_UINT(key, 0);

        if (key == 0x01) {
            /* clientDataHash */
            CBOR_FIELD_GET_BYTES(client_data_hash, 0);
        } else if (key == 0x02) {
            /* rp map – extract "id" */
            CBOR_PARSE_MAP_START(_f0, 1) {
                CBOR_FIELD_GET_KEY_TEXT(1);
                CBOR_FIELD_KEY_TEXT_VAL_TEXT(1, "id", rp_id);
                CBOR_ADVANCE(1);
            }
            CBOR_PARSE_MAP_END(_f0, 1);
        } else if (key == 0x03) {
            /* user map – extract "id" and "name" */
            CBOR_PARSE_MAP_START(_f0, 2) {
                CBOR_FIELD_GET_KEY_TEXT(2);
                CBOR_FIELD_KEY_TEXT_VAL_BYTES(2, "id",   user_id);
                CBOR_FIELD_KEY_TEXT_VAL_TEXT (2, "name", user_name);
                CBOR_ADVANCE(2);
            }
            CBOR_PARSE_MAP_END(_f0, 2);
        } else if (key == 0x04) {
            /* pubKeyCredParams array – pick first ES256 entry */
            CBOR_ASSERT(cbor_value_is_array(&_f0));
            CborValue params;
            CBOR_CHECK(cbor_value_enter_container(&_f0, &params));
            while (!cbor_value_at_end(&params)) {
                if (cbor_value_is_map(&params)) {
                    CborValue pm;
                    cbor_value_enter_container(&params, &pm);
                    int64_t alg_val = 0;
                    bool    is_pk   = false;
                    while (!cbor_value_at_end(&pm)) {
                        char   k[16] = {0};
                        size_t kl    = sizeof(k);
                        if (cbor_value_is_text_string(&pm)) {
                            cbor_value_copy_text_string(&pm, k, &kl, &pm);
                            if (strcmp(k, "alg") == 0 && cbor_value_is_integer(&pm)) {
                                cbor_value_get_int64(&pm, &alg_val);
                                cbor_value_advance_fixed(&pm);
                            } else if (strcmp(k, "type") == 0 && cbor_value_is_text_string(&pm)) {
                                char tv[16] = {0};
                                size_t tvl  = sizeof(tv);
                                cbor_value_copy_text_string(&pm, tv, &tvl, &pm);
                                is_pk = (strcmp(tv, "public-key") == 0);
                            } else {
                                cbor_value_advance(&pm);
                            }
                        } else {
                            cbor_value_advance(&pm);
                        }
                    }
                    cbor_value_leave_container(&params, &pm);
                    if (is_pk && alg_val == FIDO2_ALG_ES256 && !alg_ok) {
                        chosen_alg = alg_val;
                        alg_ok     = true;
                    }
                } else {
                    cbor_value_advance(&params);
                }
            }
            CBOR_CHECK(cbor_value_leave_container(&_f0, &params));
        } else {
            CBOR_ADVANCE(0);
        }
    }
    CBOR_PARSE_MAP_END(it, 0);
err:
    if (error != CborNoError) {
        CBOR_FREE(client_data_hash.data);
        CBOR_FREE(rp_id.data);
        CBOR_FREE(user_id.data);
        CBOR_FREE(user_name.data);
        return ctap2_error_resp(CTAP2_ERR_INVALID_CBOR);
    }

    if (!client_data_hash.present || client_data_hash.len != 32 ||
        !rp_id.present) {
        CBOR_FREE(client_data_hash.data);
        CBOR_FREE(rp_id.data);
        CBOR_FREE(user_id.data);
        CBOR_FREE(user_name.data);
        return ctap2_error_resp(CTAP2_ERR_MISSING_PARAMETER);
    }
    if (!alg_ok) {
        CBOR_FREE(client_data_hash.data);
        CBOR_FREE(rp_id.data);
        CBOR_FREE(user_id.data);
        CBOR_FREE(user_name.data);
        return ctap2_error_resp(CTAP2_ERR_UNSUPPORTED_ALGORITHM);
    }

    /* User presence */
    if (!check_user_presence()) {
        CBOR_FREE(client_data_hash.data);
        CBOR_FREE(rp_id.data);
        CBOR_FREE(user_id.data);
        CBOR_FREE(user_name.data);
        return ctap2_error_resp(CTAP2_ERR_OPERATION_DENIED);
    }

    /* Hash the rp_id */
    uint8_t rp_id_hash[32];
    mbedtls_sha256((const uint8_t *)rp_id.data, rp_id.len, rp_id_hash, 0);

    /* Create credential ID */
    static uint8_t cred_id_buf[MAX_CRED_ID_LENGTH];
    uint16_t cred_id_len = 0;
    int ret = credential_create(rp_id_hash,
                                user_id.data, user_id.len,
                                user_name.present ? user_name.data : NULL,
                                (int)chosen_alg, FIDO2_CURVE_P256,
                                cred_id_buf, &cred_id_len);
    CBOR_FREE(user_id.data);
    CBOR_FREE(user_name.data);
    if (ret != 0) {
        CBOR_FREE(client_data_hash.data);
        CBOR_FREE(rp_id.data);
        return ctap2_error_resp(CTAP2_ERR_PROCESSING);
    }

    /* Re-derive keypair from the credential ID */
    mbedtls_ecp_keypair keypair;
    mbedtls_ecp_keypair_init(&keypair);
    ret = fido_load_key(FIDO2_CURVE_P256, cred_id_buf, &keypair);
    if (ret != 0) {
        mbedtls_ecp_keypair_free(&keypair);
        CBOR_FREE(client_data_hash.data);
        CBOR_FREE(rp_id.data);
        return ctap2_error_resp(CTAP2_ERR_PROCESSING);
    }

    /* Counter */
    uint32_t counter = fido_increment_sign_counter();

    /* Build authenticatorData */
    static uint8_t auth_data[512];
    uint8_t flags = FIDO2_AUT_FLAG_UP | FIDO2_AUT_FLAG_AT;
    size_t auth_data_len = build_auth_data(rp_id_hash, flags, counter,
                                           cred_id_buf, cred_id_len,
                                           &keypair,
                                           auth_data, sizeof(auth_data));
    if (auth_data_len == 0) {
        mbedtls_ecp_keypair_free(&keypair);
        CBOR_FREE(client_data_hash.data);
        CBOR_FREE(rp_id.data);
        return ctap2_error_resp(CTAP2_ERR_PROCESSING);
    }

    /* Self-attestation signature over SHA-256(authData || clientDataHash) */
    uint8_t tbs_hash[32];
    {
        mbedtls_sha256_context sha;
        mbedtls_sha256_init(&sha);
        mbedtls_sha256_starts(&sha, 0);
        mbedtls_sha256_update(&sha, auth_data, auth_data_len);
        mbedtls_sha256_update(&sha, client_data_hash.data, 32);
        mbedtls_sha256_finish(&sha, tbs_hash);
        mbedtls_sha256_free(&sha);
    }
    CBOR_FREE(client_data_hash.data);

    uint8_t sig_buf[72];
    size_t  sig_len = sizeof(sig_buf);
    ret = mbedtls_ecdsa_write_signature((mbedtls_ecdsa_context *)&keypair,
                                        MBEDTLS_MD_SHA256,
                                        tbs_hash, sizeof(tbs_hash),
                                        sig_buf, sizeof(sig_buf), &sig_len,
                                        random_fill_iterator, NULL);
    mbedtls_ecp_keypair_free(&keypair);
    CBOR_FREE(rp_id.data);

    if (ret != 0) return ctap2_error_resp(CTAP2_ERR_PROCESSING);

    /* Encode CTAP2 response map */
    apdu.rdata[0] = CTAP2_OK;
    uint8_t *out = apdu.rdata + 1;
    size_t   cap = CTAP_MAX_CBOR_PAYLOAD - 1;

    CborEncoder enc, resp_map, fmt_enc;
    error = CborNoError;
    cbor_encoder_init(&enc, out, cap, 0);

    /* Map: {0x01: fmt, 0x02: authData, 0x03: attStmt} */
    CBOR_CHECK(cbor_encoder_create_map(&enc, &resp_map, 3));

    /* 0x01 fmt = "none" (self-attestation) */
    CBOR_CHECK(cbor_encode_uint(&resp_map, 0x01));
    CBOR_CHECK(cbor_encode_text_stringz(&resp_map, "none"));

    /* 0x02 authData */
    CBOR_CHECK(cbor_encode_uint(&resp_map, 0x02));
    CBOR_CHECK(cbor_encode_byte_string(&resp_map, auth_data, auth_data_len));

    /* 0x03 attStmt = {} (empty map for "none" fmt) */
    CBOR_CHECK(cbor_encode_uint(&resp_map, 0x03));
    CBOR_CHECK(cbor_encoder_create_map(&resp_map, &fmt_enc, 0));
    CBOR_CHECK(cbor_encoder_close_container(&resp_map, &fmt_enc));

    CBOR_CHECK(cbor_encoder_close_container(&enc, &resp_map));
    {
        size_t n = cbor_encoder_get_buffer_size(&enc, out);
        return (uint16_t)(1 + n);
    }
}

/* -----------------------------------------------------------------------
 * authenticatorGetAssertion (0x02)
 * ----------------------------------------------------------------------- */
static uint16_t ctap2_get_assertion(void)
{
    CborParser  parser;
    CborValue   it;
    CborError   error = CborNoError;

    CborCharString rp_id_str         = {0};
    CborByteString client_data_hash  = {0};

    /* allowList – scan up to MAX_ALLOW_LIST entries */
    uint8_t  *allow_ids[MAX_ALLOW_LIST];
    size_t    allow_lens[MAX_ALLOW_LIST];
    int       allow_count = 0;
    memset(allow_ids, 0, sizeof(allow_ids));
    memset(allow_lens, 0, sizeof(allow_lens));

    /* Declared before err: so they are valid in the error handler regardless
     * of which CBOR_CHECK fires (parsing or encoding phase). */
    Credential cred  = {0};
    bool       found = false;

    CBOR_CHECK(cbor_parser_init(s_buf, s_len, 0, &parser, &it));

    CBOR_PARSE_MAP_START(it, 0) {
        uint64_t key = 0;
        CBOR_FIELD_GET_UINT(key, 0);

        if (key == 0x01) {
            CBOR_FIELD_GET_TEXT(rp_id_str, 0);
        } else if (key == 0x02) {
            CBOR_FIELD_GET_BYTES(client_data_hash, 0);
        } else if (key == 0x03) {
            /* allowList */
            CBOR_ASSERT(cbor_value_is_array(&_f0));
            CborValue al;
            CBOR_CHECK(cbor_value_enter_container(&_f0, &al));
            while (!cbor_value_at_end(&al) && allow_count < MAX_ALLOW_LIST) {
                if (cbor_value_is_map(&al)) {
                    CborValue dm;
                    cbor_value_enter_container(&al, &dm);
                    while (!cbor_value_at_end(&dm)) {
                        char   k[16] = {0};
                        size_t kl    = sizeof(k);
                        if (cbor_value_is_text_string(&dm)) {
                            cbor_value_copy_text_string(&dm, k, &kl, &dm);
                            if (strcmp(k, "id") == 0 && cbor_value_is_byte_string(&dm)) {
                                cbor_value_dup_byte_string(&dm,
                                    &allow_ids[allow_count],
                                    &allow_lens[allow_count], &dm);
                                allow_count++;
                            } else {
                                cbor_value_advance(&dm);
                            }
                        } else {
                            cbor_value_advance(&dm);
                        }
                    }
                    cbor_value_leave_container(&al, &dm);
                } else {
                    cbor_value_advance(&al);
                }
            }
            CBOR_CHECK(cbor_value_leave_container(&_f0, &al));
        } else {
            CBOR_ADVANCE(0);
        }
    }
    CBOR_PARSE_MAP_END(it, 0);
err:
    if (error != CborNoError) {
        for (int i = 0; i < allow_count; i++) free(allow_ids[i]);
        CBOR_FREE(rp_id_str.data);
        CBOR_FREE(client_data_hash.data);
        /* CBOR_CHECK in the encoding phase jumps here too; free cred if loaded */
        if (found) credential_free(&cred);
        return ctap2_error_resp(CTAP2_ERR_INVALID_CBOR);
    }

    if (!rp_id_str.present || !client_data_hash.present ||
        client_data_hash.len != 32) {
        for (int i = 0; i < allow_count; i++) free(allow_ids[i]);
        CBOR_FREE(rp_id_str.data);
        CBOR_FREE(client_data_hash.data);
        return ctap2_error_resp(CTAP2_ERR_MISSING_PARAMETER);
    }

    /* Hash RP ID */
    uint8_t rp_id_hash[32];
    mbedtls_sha256((const uint8_t *)rp_id_str.data, rp_id_str.len, rp_id_hash, 0);
    CBOR_FREE(rp_id_str.data);

    /* Find the first valid credential in allowList */
    for (int i = 0; i < allow_count && !found; i++) {
        if (credential_load(allow_ids[i], allow_lens[i], rp_id_hash, &cred) == 0) {
            found = true;
        }
    }
    for (int i = 0; i < allow_count; i++) free(allow_ids[i]);

    if (!found) {
        CBOR_FREE(client_data_hash.data);
        return ctap2_error_resp(CTAP2_ERR_NO_CREDENTIALS);
    }

    /* User presence */
    if (!check_user_presence()) {
        credential_free(&cred);
        CBOR_FREE(client_data_hash.data);
        return ctap2_error_resp(CTAP2_ERR_OPERATION_DENIED);
    }

    /* Load private key */
    mbedtls_ecp_keypair keypair;
    mbedtls_ecp_keypair_init(&keypair);
    int kret = fido_load_key((int)cred.curve, cred.id.data, &keypair);
    if (kret != 0) {
        mbedtls_ecp_keypair_free(&keypair);
        credential_free(&cred);
        CBOR_FREE(client_data_hash.data);
        return ctap2_error_resp(CTAP2_ERR_PROCESSING);
    }

    /* Counter */
    uint32_t counter = fido_increment_sign_counter();

    /* Build authenticatorData (no attested cred data in assertion) */
    static uint8_t auth_data[64];
    uint8_t flags = FIDO2_AUT_FLAG_UP;
    size_t auth_data_len = build_auth_data(rp_id_hash, flags, counter,
                                           NULL, 0, NULL,
                                           auth_data, sizeof(auth_data));
    if (auth_data_len == 0) {
        mbedtls_ecp_keypair_free(&keypair);
        credential_free(&cred);
        CBOR_FREE(client_data_hash.data);
        return ctap2_error_resp(CTAP2_ERR_PROCESSING);
    }

    /* Signature over SHA-256(authData || clientDataHash) */
    uint8_t tbs_hash[32];
    {
        mbedtls_sha256_context sha;
        mbedtls_sha256_init(&sha);
        mbedtls_sha256_starts(&sha, 0);
        mbedtls_sha256_update(&sha, auth_data, auth_data_len);
        mbedtls_sha256_update(&sha, client_data_hash.data, 32);
        mbedtls_sha256_finish(&sha, tbs_hash);
        mbedtls_sha256_free(&sha);
    }
    CBOR_FREE(client_data_hash.data);

    uint8_t sig_buf[72];
    size_t  sig_len = sizeof(sig_buf);
    kret = mbedtls_ecdsa_write_signature((mbedtls_ecdsa_context *)&keypair,
                                         MBEDTLS_MD_SHA256,
                                         tbs_hash, sizeof(tbs_hash),
                                         sig_buf, sizeof(sig_buf), &sig_len,
                                         random_fill_iterator, NULL);
    mbedtls_ecp_keypair_free(&keypair);

    if (kret != 0) {
        credential_free(&cred);
        return ctap2_error_resp(CTAP2_ERR_PROCESSING);
    }

    /* Encode response map */
    apdu.rdata[0] = CTAP2_OK;
    uint8_t *out = apdu.rdata + 1;
    size_t   cap = CTAP_MAX_CBOR_PAYLOAD - 1;

    CborEncoder enc, resp_map;
    error = CborNoError;
    cbor_encoder_init(&enc, out, cap, 0);

    /* Map: {0x01: credential, 0x02: authData, 0x03: signature} */
    CBOR_CHECK(cbor_encoder_create_map(&enc, &resp_map, 3));

    /* 0x01 credential descriptor */
    CBOR_CHECK(cbor_encode_uint(&resp_map, 0x01));
    {
        CborEncoder desc;
        CBOR_CHECK(cbor_encoder_create_map(&resp_map, &desc, 2));
        CBOR_CHECK(cbor_encode_text_stringz(&desc, "type"));
        CBOR_CHECK(cbor_encode_text_stringz(&desc, "public-key"));
        CBOR_CHECK(cbor_encode_text_stringz(&desc, "id"));
        CBOR_CHECK(cbor_encode_byte_string(&desc, cred.id.data, cred.id.len));
        CBOR_CHECK(cbor_encoder_close_container(&resp_map, &desc));
    }

    /* 0x02 authData */
    CBOR_CHECK(cbor_encode_uint(&resp_map, 0x02));
    CBOR_CHECK(cbor_encode_byte_string(&resp_map, auth_data, auth_data_len));

    /* 0x03 signature */
    CBOR_CHECK(cbor_encode_uint(&resp_map, 0x03));
    CBOR_CHECK(cbor_encode_byte_string(&resp_map, sig_buf, sig_len));

    CBOR_CHECK(cbor_encoder_close_container(&enc, &resp_map));
    credential_free(&cred);
    {
        size_t n = cbor_encoder_get_buffer_size(&enc, out);
        return (uint16_t)(1 + n);
    }
}

/* -----------------------------------------------------------------------
 * Dispatcher
 * ----------------------------------------------------------------------- */
static uint16_t ctap2_dispatch(void)
{
    ESP_LOGD(TAG, "cmd=0x%02x len=%u", s_cmd, s_len);
    switch (s_cmd) {
    case CTAP2_CMD_MAKE_CREDENTIAL:    return ctap2_make_credential();
    case CTAP2_CMD_GET_ASSERTION:      return ctap2_get_assertion();
    case CTAP2_CMD_GET_INFO:           return ctap2_get_info();
    case CTAP2_CMD_RESET:              return ctap2_error_resp(CTAP2_ERR_NOT_ALLOWED);
    default:
        ESP_LOGW(TAG, "cmd=0x%02x not implemented", s_cmd);
        return ctap2_error_resp(CTAP1_ERR_INVALID_CMD);
    }
}

/* -----------------------------------------------------------------------
 * cbor_process – called from ctap_hid_transport.c on CTAPHID_CBOR
 * ----------------------------------------------------------------------- */
int cbor_process(uint8_t last_cmd, const uint8_t *data, size_t len)
{
    (void)last_cmd;
    if (len < 1) return -CTAP1_ERR_INVALID_LEN;
    s_cmd = data[0];
    s_len = (uint16_t)(len > 1 ? len - 1 : 0);
    if (s_len > sizeof(s_buf)) return -CTAP1_ERR_INVALID_LEN;
    if (s_len > 0) memcpy(s_buf, data + 1, s_len);
    return 2;
}

/* -----------------------------------------------------------------------
 * cbor_thread – FreeRTOS task for CTAP2 processing
 * ----------------------------------------------------------------------- */
void *cbor_thread(void *arg)
{
    (void)arg;
    for (;;) {
        uint32_t m = 0;
        xQueueReceive(hid_to_ctap_q, &m, portMAX_DELAY);
        if (m == EV_EXIT) break;
        if (m == EV_CMD_AVAILABLE) {
            finished_data_size = ctap2_dispatch();
            apdu.sw = 0;
        }
        uint32_t done = EV_EXEC_FINISHED;
        xQueueSend(ctap_to_hid_q, &done, portMAX_DELAY);
    }
    vTaskDelete(NULL);
    return NULL;
}
