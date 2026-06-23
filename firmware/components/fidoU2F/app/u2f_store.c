/*
 * FIDO U2F credential storage -- dual-path implementation.
 *
 * Two compile-time paths share the same public API (u2f_store.h):
 *
 *   USE_SOFTWARE_CRYPTO (defined in CMakeLists / Kconfig)
 *     Attestation key  : NVS namespace "u2f_attest", key "key" (32-byte scalar).
 *                        Also used as the root material for credential HKDF/HMAC
 *                        derivation.
 *     Sign counter     : NVS namespace "u2f_ctr",    key "ctr" (uint32).
 *
 *     IMPORTANT -- the NVS counter is NOT a guaranteed monotonic counter.
 *     A power loss between nvs_set_u32() and nvs_commit() can leave the
 *     old value, and deliberate flash erasure resets it to zero.  This is
 *     acceptable for evaluation / development builds but MUST NOT be used
 *     in a production FIDO deployment where counter rollback is a security
 *     concern.  Use the hardware path for a true monotonic counter.
 *
 *   Hardware path (ATECC608B, USE_SOFTWARE_CRYPTO not defined)
 *     Attestation      : Self-attestation -- the per-credential ECC keypair
 *                        (derived by mbedTLS) signs its own registration cert.
 *                        No separate device attestation key is stored.
 *     Credential key   : ATECC608B slot U2F_HW_CRED_SLOT (ECC P-256 slot).
 *                        u2f_store_hw_get_cred_key() derives the 32-byte root
 *                        material used to encrypt credentials sent back to the RP
 *                        via static ECDH: atcab_ecdh(slot, G, pms) where G is the
 *                        P-256 generator point.  The private key never leaves the
 *                        chip; only the x-coordinate of (d * G) is returned.
 *     Sign counter     : ATECC Counter[0] -- hardware-guaranteed monotonic
 *                        counter with atomic increment semantics.  It cannot
 *                        be reset or decremented by software.
 *
 *     Counter[1] is routed via U2F_HW_COUNTER_ID below.  The value is
 *     intentionally fixed at 0 (Counter[0]) in this file.  To switch to
 *     Counter[1], change that constant and recompile.  Switching counters
 *     mid-deployment has security implications (counter regression); it
 *     requires explicit intent and cannot be done at runtime.
 *
 * atcab_init() is called by SecureSession::init() before fido_u2f_init(),
 * so the ATECC device handle is always live when u2f_store_init() runs.
 */

#include "u2f_store.h"
#include "esp_log.h"
#include "esp_check.h"
#include "nvs_flash.h"
#include "nvs.h"
#include "esp_random.h"
#include <inttypes.h>
#include <string.h>

#ifndef USE_SOFTWARE_CRYPTO
#include "cryptoauthlib.h"
#endif

static const char *TAG = "u2f_store";

/* -----------------------------------------------------------------------
 * NVS namespace and key constants (both paths)
 *
 * Two separate namespaces so each store can be managed or erased
 * independently (e.g. factory-reset only the counter without touching
 * the attestation key, or vice-versa).
 *
 * NVS namespace names are limited to 15 characters by ESP-IDF.
 * ----------------------------------------------------------------------- */
#define NVS_NS_ATTEST   "u2f_attest"   /* attestation private key, 32 bytes  */
#define NVS_NS_CTR      "u2f_ctr"      /* sign counter, uint32               */
#define NVS_KEY_ATTEST  "key"
#define NVS_KEY_CTR     "ctr"

/* -----------------------------------------------------------------------
 * Hardware path -- credential key slot and counter selection
 *
 * U2F_HW_CRED_SLOT: ATECC608B ECC P-256 slot used to protect credentials.
 *   Slot 9 holds an ECC keypair generated on first boot via atcab_genkey().
 *   At runtime, u2f_store_hw_get_cred_key() reads the slot's public key and
 *   returns the x-coordinate as the deterministic 32-byte credential wrapping
 *   key.  The private scalar never leaves the chip.
 *
 * U2F_HW_COUNTER_ID: which ATECC monotonic counter to use.
 *   0 = Counter[0]  (default, active)
 *   1 = Counter[1]  (alternate; uncomment the second #define to switch)
 *
 *   Counter[1] is intentionally unreachable without a source-level change
 *   and recompile.  Both ATECC counters are 32-bit and max out at
 *   2,097,151 (0x1FFFFF) increments before saturating; plan accordingly.
 * ----------------------------------------------------------------------- */
#define U2F_HW_CRED_SLOT      9

#define U2F_HW_COUNTER_ID     0
/* #define U2F_HW_COUNTER_ID  1 */   /* Counter[1] -- recompile to activate */

/* -----------------------------------------------------------------------
 * u2f_store_init
 * ----------------------------------------------------------------------- */
esp_err_t u2f_store_init(void) {

#ifdef USE_SOFTWARE_CRYPTO
    /* ------------------------------------------------------------------ */
    /* Software path: attestation key                                      */
    /* ------------------------------------------------------------------ */
    nvs_handle_t h;
    esp_err_t err = nvs_open(NVS_NS_ATTEST, NVS_READWRITE, &h);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_open(%s) failed: %s", NVS_NS_ATTEST, esp_err_to_name(err));
        return err;
    }

    uint8_t key[32];
    size_t  klen = sizeof(key);
    err = nvs_get_blob(h, NVS_KEY_ATTEST, key, &klen);

    if (err == ESP_ERR_NVS_NOT_FOUND) {
        /* First boot: generate a 32-byte secp256r1 private key scalar.
         * esp_fill_random() uses the hardware RNG.  We retry on the
         * astronomically unlikely event of an all-zero output. */
        do {
            esp_fill_random(key, sizeof(key));
        } while (key[0] == 0 && key[1] == 0 && key[2] == 0 && key[3] == 0);

        err = nvs_set_blob(h, NVS_KEY_ATTEST, key, sizeof(key));
        if (err == ESP_OK) err = nvs_commit(h);
        memset(key, 0, sizeof(key));

        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Failed to persist attestation key: %s", esp_err_to_name(err));
            nvs_close(h);
            return err;
        }
        ESP_LOGI(TAG, "SW attestation key generated (first boot)");
    } else if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_get_blob(%s/%s) failed: %s",
                 NVS_NS_ATTEST, NVS_KEY_ATTEST, esp_err_to_name(err));
        memset(key, 0, sizeof(key));
        nvs_close(h);
        return err;
    } else {
        memset(key, 0, sizeof(key));
        ESP_LOGI(TAG, "SW attestation key present in NVS");
    }
    nvs_close(h);

    /* ------------------------------------------------------------------ */
    /* Software path: sign counter                                         */
    /* ------------------------------------------------------------------ */
    err = nvs_open(NVS_NS_CTR, NVS_READWRITE, &h);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_open(%s) failed: %s", NVS_NS_CTR, esp_err_to_name(err));
        return err;
    }

    uint32_t ctr;
    err = nvs_get_u32(h, NVS_KEY_CTR, &ctr);
    if (err == ESP_ERR_NVS_NOT_FOUND) {
        err = nvs_set_u32(h, NVS_KEY_CTR, 0u);
        if (err == ESP_OK) err = nvs_commit(h);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Failed to initialise counter: %s", esp_err_to_name(err));
            nvs_close(h);
            return err;
        }
        ESP_LOGI(TAG, "SW sign counter initialised to 0");
    } else if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_get_u32(%s/%s) failed: %s",
                 NVS_NS_CTR, NVS_KEY_CTR, esp_err_to_name(err));
        nvs_close(h);
        return err;
    } else {
        ESP_LOGI(TAG, "SW sign counter resumed at %" PRIu32, ctr);
    }
    nvs_close(h);
    return ESP_OK;

#else /* !USE_SOFTWARE_CRYPTO -- ATECC608B hardware path */

    /* ------------------------------------------------------------------ */
    /* Hardware path: ECC credential key in ATECC slot U2F_HW_CRED_SLOT   */
    /*                                                                     */
    /* Probe by attempting to read the public key.  If the slot is blank   */
    /* (atcab_get_pubkey fails or returns all-zero), generate a new ECC    */
    /* keypair.  At runtime the credential wrapping key is derived via      */
    /* static ECDH (see u2f_store_hw_get_cred_key).                        */
    /* ------------------------------------------------------------------ */
    {
        uint8_t pubkey[64];
        memset(pubkey, 0, sizeof(pubkey));
        ATCA_STATUS status = atcab_get_pubkey(U2F_HW_CRED_SLOT, pubkey);
        bool key_missing = (status != ATCA_SUCCESS) ||
                           (pubkey[0] == 0 && pubkey[1] == 0 &&
                            pubkey[2] == 0 && pubkey[3] == 0);
        if (key_missing) {
            ESP_LOGI(TAG, "Generating ECC credential key in ATECC slot %d...",
                     U2F_HW_CRED_SLOT);
            status = atcab_genkey(U2F_HW_CRED_SLOT, pubkey);
            if (status != ATCA_SUCCESS) {
                ESP_LOGE(TAG, "atcab_genkey(slot %d) failed: 0x%02x",
                         U2F_HW_CRED_SLOT, (unsigned)status);
                return ESP_FAIL;
            }
            ESP_LOGI(TAG, "ATECC credential key generated in slot %d", U2F_HW_CRED_SLOT);
        } else {
            ESP_LOGI(TAG, "ATECC credential key present in slot %d", U2F_HW_CRED_SLOT);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Hardware path: verify ATECC counter[U2F_HW_COUNTER_ID] is live     */
    /* ------------------------------------------------------------------ */
    {
        uint32_t ctr_val = 0;
        ATCA_STATUS status = atcab_counter_read(U2F_HW_COUNTER_ID, &ctr_val);
        if (status != ATCA_SUCCESS) {
            ESP_LOGE(TAG, "atcab_counter_read(%d) failed: 0x%02x",
                     U2F_HW_COUNTER_ID, (unsigned)status);
            return ESP_FAIL;
        }
        ESP_LOGI(TAG, "ATECC counter[%d] = %" PRIu32, U2F_HW_COUNTER_ID, ctr_val);
    }
    return ESP_OK;

#endif /* USE_SOFTWARE_CRYPTO */
}

/* -----------------------------------------------------------------------
 * Attestation key -- NVS on both paths.
 *
 * SW path: this is the P-256 private scalar for BOTH attestation signing
 *          AND credential HKDF root material.
 * HW path: this is the P-256 private scalar for attestation signing only.
 *          Credential root material is derived from ATECC slot U2F_HW_CRED_SLOT
 *          via u2f_store_hw_get_cred_key().
 * ----------------------------------------------------------------------- */
esp_err_t u2f_store_get_attestation_key(uint8_t out[32]) {
    nvs_handle_t h;
    ESP_RETURN_ON_ERROR(nvs_open(NVS_NS_ATTEST, NVS_READONLY, &h),
                        TAG, "nvs_open(attest)");
    size_t    len = 32;
    esp_err_t err = nvs_get_blob(h, NVS_KEY_ATTEST, out, &len);
    nvs_close(h);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_get_blob(attest key) failed: %s", esp_err_to_name(err));
    }
    return err;
}

esp_err_t u2f_store_set_attestation_key(const uint8_t key[32]) {
    nvs_handle_t h;
    ESP_RETURN_ON_ERROR(nvs_open(NVS_NS_ATTEST, NVS_READWRITE, &h),
                        TAG, "nvs_open(attest)");
    esp_err_t err = nvs_set_blob(h, NVS_KEY_ATTEST, key, 32);
    if (err == ESP_OK) err = nvs_commit(h);
    nvs_close(h);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_set_blob(attest key) failed: %s", esp_err_to_name(err));
    }
    return err;
}

/* -----------------------------------------------------------------------
 * Sign counter
 *
 * Software path: NVS uint32 in namespace "u2f_ctr".
 *   NOT a guaranteed monotonic counter -- see file-level comment.
 *   The APDU task is single-threaded so no mutex is required; all calls
 *   to increment_counter originate from cbor_thread or apdu_thread,
 *   never concurrently.
 *
 * Hardware path: ATECC counter[U2F_HW_COUNTER_ID] with hardware-
 *   guaranteed atomic increment and monotonic guarantee.
 * ----------------------------------------------------------------------- */
esp_err_t u2f_store_get_counter(uint32_t *out) {
#ifdef USE_SOFTWARE_CRYPTO
    nvs_handle_t h;
    ESP_RETURN_ON_ERROR(nvs_open(NVS_NS_CTR, NVS_READONLY, &h),
                        TAG, "nvs_open(ctr)");
    esp_err_t err = nvs_get_u32(h, NVS_KEY_CTR, out);
    nvs_close(h);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_get_u32(ctr) failed: %s", esp_err_to_name(err));
    }
    return err;
#else
    ATCA_STATUS status = atcab_counter_read(U2F_HW_COUNTER_ID, out);
    if (status != ATCA_SUCCESS) {
        ESP_LOGE(TAG, "atcab_counter_read(%d) failed: 0x%02x",
                 U2F_HW_COUNTER_ID, (unsigned)status);
        return ESP_FAIL;
    }
    return ESP_OK;
#endif
}

esp_err_t u2f_store_increment_counter(uint32_t *out) {
#ifdef USE_SOFTWARE_CRYPTO
    /* NOTE: this is a read-modify-write in NVS, not atomic.
     * A crash between nvs_set_u32 and nvs_commit leaves the old value.
     * For a production deployment requiring strict monotonicity, use the
     * hardware crypto path (ATECC counter[0]). */
    nvs_handle_t h;
    ESP_RETURN_ON_ERROR(nvs_open(NVS_NS_CTR, NVS_READWRITE, &h),
                        TAG, "nvs_open(ctr)");

    uint32_t  ctr = 0;
    esp_err_t err = nvs_get_u32(h, NVS_KEY_CTR, &ctr);
    if (err != ESP_OK && err != ESP_ERR_NVS_NOT_FOUND) {
        ESP_LOGE(TAG, "nvs_get_u32(ctr) failed: %s", esp_err_to_name(err));
        nvs_close(h);
        return err;
    }

    ctr++;
    err = nvs_set_u32(h, NVS_KEY_CTR, ctr);
    if (err == ESP_OK) err = nvs_commit(h);
    nvs_close(h);

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_set_u32/commit(ctr) failed: %s", esp_err_to_name(err));
        return err;
    }
    if (out) *out = ctr;
    return ESP_OK;
#else
    /* ATECC counter_increment is atomic and monotonic.
     * Counter[U2F_HW_COUNTER_ID] saturates at 2,097,151 (0x1FFFFF). */
    ATCA_STATUS status = atcab_counter_increment(U2F_HW_COUNTER_ID, out);
    if (status != ATCA_SUCCESS) {
        ESP_LOGE(TAG, "atcab_counter_increment(%d) failed: 0x%02x",
                 U2F_HW_COUNTER_ID, (unsigned)status);
        return ESP_FAIL;
    }
    return ESP_OK;
#endif
}

/* -----------------------------------------------------------------------
 * Hardware-path-only helper
 *
 * u2f_store_hw_get_cred_key -- Return the 32-byte credential root key.
 *   Reads the public key from ATECC slot U2F_HW_CRED_SLOT and copies
 *   the x-coordinate (first 32 bytes) into `out`.
 *
 *   All credential encryption (ChaCha20-Poly1305) and HKDF derivation
 *   paths use this as their root material on the hardware path.
 * ----------------------------------------------------------------------- */
#ifndef USE_SOFTWARE_CRYPTO

esp_err_t u2f_store_hw_get_cred_key(uint8_t out[32]) {
    /* d*G = the slot's public key; take the x-coordinate as the credential
     * wrapping root.  The private scalar never leaves the chip. */
    uint8_t pubkey[64];
    ATCA_STATUS status = atcab_get_pubkey(U2F_HW_CRED_SLOT, pubkey);
    if (status != ATCA_SUCCESS) {
        ESP_LOGE(TAG, "atcab_get_pubkey(slot %d) failed: 0x%02x",
                 U2F_HW_CRED_SLOT, (unsigned)status);
        return ESP_FAIL;
    }
    memcpy(out, pubkey, 32);
    return ESP_OK;
}

#endif /* !USE_SOFTWARE_CRYPTO */
