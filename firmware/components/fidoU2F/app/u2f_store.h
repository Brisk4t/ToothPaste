#pragma once

#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/*
 * FIDO U2F credential storage – dual-path API.
 *
 * USE_SOFTWARE_CRYPTO defined (set by CMakeLists / Kconfig):
 *   Attestation key : NVS namespace "u2f_attest" – 32-byte private scalar.
 *   Sign counter    : NVS namespace "u2f_ctr"    – uint32.
 *                     NOT a guaranteed monotonic counter; flash erasure or
 *                     a crash mid-commit can roll it back.  Acceptable for
 *                     development; use the hardware path for production.
 *
 * USE_SOFTWARE_CRYPTO not defined (ATECC608B hardware path):
 *   Attestation key : ATECC608B slot 9 – ECC P-256 key pair, private key
 *                     never exported.  get/set_attestation_key() return
 *                     ESP_ERR_NOT_SUPPORTED; use hw_sign() / hw_get_pubkey().
 *   Sign counter    : ATECC Counter[0] – hardware-guaranteed monotonic,
 *                     atomic increment.  Counter[1] is available via a
 *                     compile-time constant change in u2f_store.c only.
 *
 * Key handles are derived deterministically (HMAC-SHA256) so no per-
 * credential NVS state is required.  For resident keys (discoverable
 * credentials) see pico-keys-sdk src/fs/.
 */

/* Initialise storage and generate any missing keys on first boot.
 * Call once from init_fido() after atcab_init() (hardware path) or
 * nvs_flash_init() (software path). */
esp_err_t u2f_store_init(void);

/* -----------------------------------------------------------------------
 * Credential wrapping / attestation key.
 *
 * Both paths store a 32-byte wrapping key in NVS "u2f_attest"/"key".
 * On the SW path this IS the attestation signing key.
 * On the HW path this is the ChaCha20/HKDF credential wrapping key only;
 * actual attestation signing uses ATECC slot 9 via u2f_store_hw_sign().
 * ----------------------------------------------------------------------- */

/* Load the 32-byte credential wrapping key into `out`. */
esp_err_t u2f_store_get_attestation_key(uint8_t out[32]);

/* Overwrite the stored 32-byte private key scalar. */
esp_err_t u2f_store_set_attestation_key(const uint8_t key[32]);

/* -----------------------------------------------------------------------
 * Sign counter
 *
 * increment_counter returns the NEW (post-increment) value in *out.
 * The returned value is what gets embedded in the Authenticate response.
 * ----------------------------------------------------------------------- */
esp_err_t u2f_store_get_counter(uint32_t *out);
esp_err_t u2f_store_increment_counter(uint32_t *out);

/* -----------------------------------------------------------------------
 * Hardware-path-only helpers (not compiled when USE_SOFTWARE_CRYPTO is set)
 *
 * u2f_store_hw_sign    – ECDSA-P256 sign a 32-byte SHA-256 digest with the
 *                        key in ATECC slot 9.  Returns 64-byte raw R‖S.
 *                        Caller must DER-encode before inserting into response.
 *
 * u2f_store_hw_get_pubkey – Return the 64-byte uncompressed public key
 *                        (X‖Y, no 0x04 prefix) from ATECC slot 9.
 * ----------------------------------------------------------------------- */
#ifndef USE_SOFTWARE_CRYPTO
esp_err_t u2f_store_hw_sign(const uint8_t digest[32], uint8_t sig[64]);
esp_err_t u2f_store_hw_get_pubkey(uint8_t pubkey[64]);
#endif

#ifdef __cplusplus
}
#endif
