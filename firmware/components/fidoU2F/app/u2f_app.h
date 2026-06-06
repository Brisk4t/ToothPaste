#pragma once

#include <stdint.h>
#include "apdu.h"

#ifdef __cplusplus
extern "C" {
#endif

/*
 * FIDO U2F application layer.
 *
 * Implements the three U2F commands defined in the FIDO U2F Raw Message
 * Formats specification v1.2:
 *
 *   INS 0x01  U2F_REGISTER      – generate key pair + key handle, return
 *                                  public key + attestation signature
 *   INS 0x02  U2F_AUTHENTICATE  – sign a challenge with the credential
 *                                  private key and increment the counter
 *   INS 0x03  U2F_VERSION       – return the ASCII string "U2F_V2"
 *
 * The application is registered in the APDU dispatch table under the
 * U2F AID (A0 00 00 06 47 2F 00 01) by calling register_u2f_app(),
 * which is invoked from init_fido() on each CTAPHID_INIT.
 *
 * Key handle format (32 bytes, deterministic derivation):
 *   key_handle = HMAC-SHA256(attestation_key, app_param || challenge_param)
 *   The private key is re-derived on Authenticate using the same HMAC.
 *   This avoids storing per-credential state on the device.
 *
 * Attestation:
 *   The attestation key pair is generated once and stored in NVS via
 *   u2f_store. Optionally use an ATECC608B slot for the private key.
 */

/* Register the U2F application with the APDU dispatch system.
 * Called from init_fido() on every CTAPHID_INIT. */
void register_u2f_app(void);

#ifdef __cplusplus
}
#endif
