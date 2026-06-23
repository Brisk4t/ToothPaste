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
 *   Attestation key : NVS namespace "u2f_attest" – 32-byte P-256 private
 *                     scalar.  Also serves as the HKDF/HMAC root material
 *                     for credential encryption.
 *   Sign counter    : NVS namespace "u2f_ctr"    – uint32.
 *                     NOT a guaranteed monotonic counter; flash erasure or
 *                     a crash mid-commit can roll it back.  Acceptable for
 *                     development; use the hardware path for production.
 *
 * USE_SOFTWARE_CRYPTO not defined (ATECC608B hardware path):
 *   Attestation key : NVS namespace "u2f_attest" – 32-byte P-256 private
 *                     scalar for mbedTLS attestation signing.ECC keypairs
 *                     are generated in software on both paths.
 *   Credential key  : ATECC608B slot 9 -- ECC P-256 slot.
 *                     u2f_store_hw_get_cred_key() returns the x-coordinate
 *                     of the slot's public key as the 32-byte root material
 *                     for credential encryption (ChaCha20/HKDF).
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
 * Attestation key – NVS on both paths.
 *
 * SW path: 32-byte P-256 private scalar used for both attestation signing
 *          and as the HKDF/HMAC credential root material.
 * HW path: 32-byte P-256 private scalar for attestation signing (mbedTLS).
 *          Credential root material comes from u2f_store_hw_get_cred_key().
 * ----------------------------------------------------------------------- */

/* Load the 32-byte attestation private key scalar into `out`. */
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
 * Hardware-path-only helper (not compiled when USE_SOFTWARE_CRYPTO is set)
 *
 * u2f_store_hw_get_cred_key – Return the 32-byte credential root key used
 *   to encrypt credentials sent back to the RP. * ----------------------------------------------------------------------- */
#ifndef USE_SOFTWARE_CRYPTO
esp_err_t u2f_store_hw_get_cred_key(uint8_t out[32]);
#endif

#ifdef __cplusplus
}
#endif
