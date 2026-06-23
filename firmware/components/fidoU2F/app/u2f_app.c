/*
 * U2F CTAP1 command handlers.
 *
 * Implements:
 *   INS 0x01  REGISTER
 *   INS 0x02  AUTHENTICATE
 *   INS 0x03  VERSION
 *
 * Key handles are 64 bytes: path(32) || HMAC-tag(32), created by derive_key()
 * and verified by verify_key() from fido_glue.c.
 *
 * Attestation signing: mbedTLS ECDSA with the NVS P-256 private key on both
 * SW and HW paths.  Per-credential ECC keypairs are derived by mbedTLS HKDF
 * (derive_key in fido_glue.c); on the HW path the root material comes from
 * ATECC slot 9 via u2f_store_hw_get_cred_key().
 *
 * Ported/adapted from pico-fido (polhenarejos/pico-fido), AGPL-3.0.
 */

#include "u2f_app.h"
#include "u2f_store.h"
#include "u2f_presence.h"
#include "fido_glue.h"
#include "apdu.h"
#include "picokeys.h"
#include "esp_log.h"
#include "mbedtls/sha256.h"
#include "mbedtls/ecdsa.h"
#include "mbedtls/ecp.h"
#include "mbedtls/pk.h"
#include "mbedtls/platform_util.h"
#include <string.h>
#include <stdlib.h>

static const char *TAG = "u2f_app";

/* -----------------------------------------------------------------------
 * AID (length-prefixed)
 * ----------------------------------------------------------------------- */
const uint8_t u2f_aid[]  = { 8, 0xA0,0x00,0x00,0x06,0x47,0x2F,0x00,0x01 };
const uint8_t fido_aid[] = { 8, 0xA0,0x00,0x00,0x06,0x47,0x2F,0x00,0x01 };

/* -----------------------------------------------------------------------
 * U2F command / P1 constants
 * ----------------------------------------------------------------------- */
#define INS_U2F_REGISTER        0x01
#define INS_U2F_AUTHENTICATE    0x02
#define INS_U2F_VERSION         0x03

#define U2F_AUTH_ENFORCE        0x03
#define U2F_AUTH_CHECK_ONLY     0x07
#define U2F_AUTH_NO_ENFORCE     0x08

/* -----------------------------------------------------------------------
 * Forward declarations
 * ----------------------------------------------------------------------- */
static int u2f_process_apdu(void);
static int u2f_select_aid(app_t *app, uint8_t p2);
static int cmd_register(void);
static int cmd_authenticate(void);
static int cmd_version(void);

/* -----------------------------------------------------------------------
 * DER-encode a raw 64-byte R||S ECDSA signature from ATECC (or mbedTLS
 * raw format) into buf.  Returns the encoded length, or 0 on overflow.
 * ----------------------------------------------------------------------- */
static size_t raw_rs_to_der(const uint8_t *rs, uint8_t *buf, size_t cap)
{
    /* Each coordinate may need a leading 0x00 if the high bit is set */
    uint8_t r[33], s[33];
    size_t  rlen = 32, slen = 32;

    if (rs[0] & 0x80) {
        r[0] = 0x00; memcpy(r + 1, rs,      32); rlen = 33;
    } else {
        memcpy(r, rs,      32);
    }
    if (rs[32] & 0x80) {
        s[0] = 0x00; memcpy(s + 1, rs + 32, 32); slen = 33;
    } else {
        memcpy(s, rs + 32, 32);
    }

    size_t seq_len = 2 + rlen + 2 + slen;
    size_t total   = 2 + seq_len;
    if (total > cap) return 0;

    uint8_t *p = buf;
    *p++ = 0x30;
    *p++ = (uint8_t)seq_len;
    *p++ = 0x02;
    *p++ = (uint8_t)rlen;
    memcpy(p, r, rlen); p += rlen;
    *p++ = 0x02;
    *p++ = (uint8_t)slen;
    memcpy(p, s, slen); p += slen;
    return (size_t)(p - buf);
}


/* -----------------------------------------------------------------------
 * init_fido / register_u2f_app
 * ----------------------------------------------------------------------- */
void register_u2f_app(void) {
    register_app(u2f_select_aid, u2f_aid);
}

void init_fido(void) {
    u2f_store_init();
    u2f_presence_init();
    register_u2f_app();
}

static int u2f_select_aid(app_t *app, uint8_t p2) {
    (void)p2;
    app->process_apdu = u2f_process_apdu;
    return SW_OK();
}

static int u2f_process_apdu(void) {
    switch (INS(apdu)) {
        case INS_U2F_REGISTER:     return cmd_register();
        case INS_U2F_AUTHENTICATE: return cmd_authenticate();
        case INS_U2F_VERSION:      return cmd_version();
        default:                   return SW_INS_NOT_SUPPORTED();
    }
}

/* -----------------------------------------------------------------------
 * INS 0x03 – VERSION
 * ----------------------------------------------------------------------- */
static int cmd_version(void) {
    static const uint8_t ver[] = { 'U','2','F','_','V','2' };
    memcpy(res_APDU, ver, sizeof(ver));
    res_APDU_size = sizeof(ver);
    return SW_OK();
}

/* -----------------------------------------------------------------------
 * INS 0x01 – REGISTER
 *
 * Request  apdu.data[0..31]  = challenge param (SHA-256 clientData)
 *          apdu.data[32..63] = application param (SHA-256 origin)
 *
 * Response [0]       0x05
 *          [1..65]   0x04 || X || Y  (credential public key)
 *          [66]      key_handle_len  (KEY_HANDLE_LEN = 64)
 *          [67..130] key_handle
 *          [131..]   attestation cert DER
 *          [...]     DER ECDSA sig over SHA-256(
 *                      0x00 || app_param || challenge || key_handle || pubkey)
 * ----------------------------------------------------------------------- */
static int cmd_register(void) {
    if (apdu.nc != 64) return SW_WRONG_LENGTH();

    const uint8_t *challenge = apdu.data;
    const uint8_t *app_param = apdu.data + 32;

    if (u2f_presence_check(10000) > 0) return SW_CONDITIONS_NOT_SATISFIED();

    uint8_t key_handle[KEY_HANDLE_LEN];
    mbedtls_ecp_keypair kp;
    mbedtls_ecp_keypair_init(&kp);
    int ret = derive_key(app_param, true, key_handle,
                         MBEDTLS_ECP_DP_SECP256R1, &kp);
    if (ret != 0) {
        mbedtls_ecp_keypair_free(&kp);
        ESP_LOGE(TAG, "derive_key failed: %d", ret);
        return SW_UNKNOWN();
    }

    uint8_t pubkey[65];
    {
        mbedtls_ecp_point ecp_Q;
        mbedtls_ecp_point_init(&ecp_Q);
        int qret = mbedtls_ecp_export(&kp, NULL, NULL, &ecp_Q);
        if (qret != 0) {
            mbedtls_ecp_point_free(&ecp_Q);
            mbedtls_ecp_keypair_free(&kp);
            return SW_UNKNOWN();
        }
        pubkey[0] = 0x04;
        mbedtls_mpi_write_binary(&ecp_Q.X, pubkey + 1,  32);
        mbedtls_mpi_write_binary(&ecp_Q.Y, pubkey + 33, 32);
        mbedtls_ecp_point_free(&ecp_Q);
    }

    static uint8_t cert_der[1024];
    size_t cert_len = sizeof(cert_der);
    if (fido_get_cert_der(cert_der, &cert_len, &kp) != 0) {
        ESP_LOGE(TAG, "fido_get_cert_der failed");
        mbedtls_ecp_keypair_free(&kp);
        return SW_UNKNOWN();
    }

    uint8_t tbs_hash[32];
    {
        mbedtls_sha256_context sha;
        mbedtls_sha256_init(&sha);
        mbedtls_sha256_starts(&sha, 0);
        uint8_t hdr = 0x00;
        mbedtls_sha256_update(&sha, &hdr,      1);
        mbedtls_sha256_update(&sha, app_param, 32);
        mbedtls_sha256_update(&sha, challenge, 32);
        mbedtls_sha256_update(&sha, key_handle, KEY_HANDLE_LEN);
        mbedtls_sha256_update(&sha, pubkey,     65);
        mbedtls_sha256_finish(&sha, tbs_hash);
        mbedtls_sha256_free(&sha);
    }

    uint8_t sig[72];
    size_t  sig_len = sizeof(sig);
    ret = mbedtls_ecdsa_write_signature((mbedtls_ecdsa_context *)&kp,
                                        MBEDTLS_MD_SHA256,
                                        tbs_hash, sizeof(tbs_hash),
                                        sig, sizeof(sig), &sig_len,
                                        random_fill_iterator, NULL);
    mbedtls_ecp_keypair_free(&kp);
    if (ret != 0) {
        ESP_LOGE(TAG, "ecdsa_write_signature failed: %d", ret);
        return SW_UNKNOWN();
    }

    uint8_t *p = res_APDU;
    *p++ = 0x05;
    memcpy(p, pubkey, 65);          p += 65;
    *p++ = (uint8_t)KEY_HANDLE_LEN;
    memcpy(p, key_handle, KEY_HANDLE_LEN); p += KEY_HANDLE_LEN;
    memcpy(p, cert_der,   cert_len);       p += cert_len;
    memcpy(p, sig,        sig_len);        p += sig_len;

    res_APDU_size = (uint16_t)(p - res_APDU);
    return SW_OK();
}

/* -----------------------------------------------------------------------
 * INS 0x02 – AUTHENTICATE
 *
 * Request  apdu.data[0..31]   = challenge param
 *          apdu.data[32..63]  = application param
 *          apdu.data[64]      = key_handle_len  (must be KEY_HANDLE_LEN)
 *          apdu.data[65..128] = key_handle
 *
 * Response [0]    user-presence byte (0x01)
 *          [1..4] counter BE
 *          [5..]  DER ECDSA sig over SHA-256(
 *                   app_param || presence || counter || challenge)
 * ----------------------------------------------------------------------- */
static int cmd_authenticate(void) {
    if (apdu.nc < 65) return SW_WRONG_LENGTH();

    const uint8_t *challenge  = apdu.data;
    const uint8_t *app_param  = apdu.data + 32;
    uint8_t        kh_len     = apdu.data[64];

    if (kh_len != KEY_HANDLE_LEN || apdu.nc < (uint32_t)(65 + kh_len))
        return SW_WRONG_DATA();

    const uint8_t *key_handle = apdu.data + 65;

    /* Verify key handle belongs to this device for this app_param */
    if (verify_key(app_param, key_handle, NULL) != 0)
        return SW_WRONG_DATA();

    uint8_t p1 = P1(apdu);
    if (p1 == U2F_AUTH_CHECK_ONLY)
        return SW_CONDITIONS_NOT_SATISFIED();   /* valid handle, no sign */

    if (p1 == U2F_AUTH_ENFORCE || p1 == U2F_AUTH_NO_ENFORCE) {
        if (p1 == U2F_AUTH_ENFORCE && u2f_presence_check(10000) > 0)
            return SW_CONDITIONS_NOT_SATISFIED();

        /* Re-derive credential keypair */
        mbedtls_ecp_keypair kp;
        mbedtls_ecp_keypair_init(&kp);
        int ret = derive_key(NULL, false, (uint8_t *)key_handle,
                             MBEDTLS_ECP_DP_SECP256R1, &kp);
        if (ret != 0) {
            mbedtls_ecp_keypair_free(&kp);
            return SW_UNKNOWN();
        }

        uint32_t counter = fido_increment_sign_counter();
        uint8_t  presence = 0x01;
        uint8_t  ctr_be[4] = {
            (counter >> 24) & 0xff,
            (counter >> 16) & 0xff,
            (counter >>  8) & 0xff,
             counter        & 0xff
        };

        /* TBS: SHA-256(app_param || presence || counter || challenge) */
        uint8_t tbs_hash[32];
        {
            mbedtls_sha256_context sha;
            mbedtls_sha256_init(&sha);
            mbedtls_sha256_starts(&sha, 0);
            mbedtls_sha256_update(&sha, app_param, 32);
            mbedtls_sha256_update(&sha, &presence, 1);
            mbedtls_sha256_update(&sha, ctr_be,    4);
            mbedtls_sha256_update(&sha, challenge, 32);
            mbedtls_sha256_finish(&sha, tbs_hash);
            mbedtls_sha256_free(&sha);
        }

        uint8_t sig[72];
        size_t  sig_len = sizeof(sig);
        ret = mbedtls_ecdsa_write_signature((mbedtls_ecdsa_context *)&kp,
                                            MBEDTLS_MD_SHA256,
                                            tbs_hash, sizeof(tbs_hash),
                                            sig, sizeof(sig), &sig_len,
                                            random_fill_iterator, NULL);
        mbedtls_ecp_keypair_free(&kp);
        if (ret != 0) return SW_UNKNOWN();

        uint8_t *p = res_APDU;
        *p++ = presence;
        memcpy(p, ctr_be, 4); p += 4;
        memcpy(p, sig, sig_len); p += sig_len;
        res_APDU_size = (uint16_t)(p - res_APDU);
        return SW_OK();
    }

    return SW_WRONG_P1P2();
}
