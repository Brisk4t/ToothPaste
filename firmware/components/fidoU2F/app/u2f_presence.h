#pragma once

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/*
 * User-presence API for FIDO U2F.
 *
 * The CTAP layer calls u2f_presence_wait() when it needs the user to
 * physically confirm an operation (registration or authentication).
 * The hwUI button press signals approval; a timeout or CTAPHID_CANCEL
 * signals rejection.
 *
 * LED feedback conventions (implement with rgbRMT):
 *   Waiting for touch  → slow cyan pulse
 *   Approved           → brief green flash
 *   Timeout / rejected → brief red flash
 */

/* Initialise the presence subsystem (create EventGroup, register button cb).
 * Called once from fido_u2f_init(). */
void u2f_presence_init(void);

/* Block until the user presses the button or timeout_ms elapses.
 * Returns true if approved, false on timeout or cancellation. */
bool u2f_presence_wait(uint32_t timeout_ms);

/* Non-blocking: returns true while u2f_presence_wait() is blocked
 * waiting for a button press. Used by send_keepalive() to set the
 * KEEPALIVE_STATUS_UPNEEDED flag in CTAP keepalive frames. */
bool u2f_presence_is_pending(void);

/* Cancel a pending presence request (called on CTAPHID_CANCEL).
 * Set cancel_button = true to also satisfy the CBOR-layer cancel check. */
void u2f_presence_cancel(void);

/* External flag read by ctap_hid_transport.c on CTAPHID_CANCEL.
 * Set to true here and cleared by the CBOR/CTAP2 processing path. */
extern bool cancel_button;

#ifdef __cplusplus
}
#endif
