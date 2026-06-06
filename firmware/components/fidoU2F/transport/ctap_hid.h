/*
 * Adapted from pico-keys-sdk src/usb/hid/ctap_hid.h
 * Copyright (c) 2022 Pol Henarejos. AGPL-3.0.
 *
 * Changes vs upstream:
 *  - Replaced #include "usb.h" with local fido_usb_compat.h (provides
 *    PACK, USB_BUFFER_SIZE, write_status_t, usb_buffer_t).
 *  - Removed add_keyboard_buffer / append_keyboard_buffer declarations;
 *    keyboard is handled by the existing espHID/IDF_USB components.
 *  - Added declarations for driver_exec_finished_hid and
 *    driver_exec_finished_cont_hid (defined in ctap_hid_transport.c,
 *    called from apdu.c).
 */

#ifndef _CTAP_HID_H_
#define _CTAP_HID_H_

#include <stdint.h>
#include <stdlib.h>
#include <stdbool.h>

#include "fido_usb_compat.h"

#ifdef __cplusplus
extern "C" {
#endif

/* -----------------------------------------------------------------------
 * HID report / frame constants
 * ----------------------------------------------------------------------- */
#define HID_RPT_SIZE        64

#define CID_BROADCAST       0xffffffff

#define TYPE_MASK           0x80
#define TYPE_INIT           0x80
#define TYPE_CONT           0x00

PACK(
typedef struct {
    uint32_t cid;
    union {
        uint8_t type;
        struct {
            uint8_t cmd;
            uint8_t bcnth;
            uint8_t bcntl;
            uint8_t data[HID_RPT_SIZE - 7];
        } init;
        struct {
            uint8_t seq;
            uint8_t data[HID_RPT_SIZE - 5];
        } cont;
    };
}) CTAPHID_FRAME;

extern CTAPHID_FRAME *ctap_req, *ctap_resp;

#define FRAME_TYPE(f)  ((f)->type & TYPE_MASK)
#define FRAME_CMD(f)   ((f)->init.cmd & ~TYPE_MASK)
#define MSG_LEN(f)     ((f)->init.bcnth * 256 + (f)->init.bcntl)
#define FRAME_SEQ(f)   ((f)->cont.seq & ~TYPE_MASK)

/* -----------------------------------------------------------------------
 * HID usage page
 * ----------------------------------------------------------------------- */
#define FIDO_USAGE_PAGE     0xf1d0
#define FIDO_USAGE_CTAPHID  0x01
#define FIDO_USAGE_DATA_IN  0x20
#define FIDO_USAGE_DATA_OUT 0x21

/* -----------------------------------------------------------------------
 * Protocol constants
 * ----------------------------------------------------------------------- */
#define CTAPHID_IF_VERSION      2
#define CTAPHID_TRANS_TIMEOUT   3000

/* -----------------------------------------------------------------------
 * CTAPHID commands
 * ----------------------------------------------------------------------- */
#define CTAPHID_PING        (TYPE_INIT | 0x01)
#define CTAPHID_MSG         (TYPE_INIT | 0x03)
#define CTAPHID_LOCK        (TYPE_INIT | 0x04)
#define CTAPHID_INIT        (TYPE_INIT | 0x06)
#define CTAPHID_WINK        (TYPE_INIT | 0x08)
#define CTAPHID_CBOR        (TYPE_INIT | 0x10)
#define CTAPHID_CANCEL      (TYPE_INIT | 0x11)
#define CTAPHID_KEEPALIVE   (TYPE_INIT | 0x3B)
#define CTAPHID_SYNC        (TYPE_INIT | 0x3C)
#define CTAPHID_ERROR       (TYPE_INIT | 0x3F)

/* Vendor-range commands (kept for future use) */
#define CTAPHID_VENDOR_FIRST (TYPE_INIT | 0x40)
#define CTAPHID_VENDOR_LAST  (TYPE_INIT | 0x7F)

/* -----------------------------------------------------------------------
 * KEEPALIVE status bytes
 * ----------------------------------------------------------------------- */
#define KEEPALIVE_STATUS_PROCESSING 0x1
#define KEEPALIVE_STATUS_UPNEEDED   0x2

/* -----------------------------------------------------------------------
 * CTAPHID_INIT structures
 * ----------------------------------------------------------------------- */
#define INIT_NONCE_SIZE     8
#define CAPFLAG_WINK        0x01
#define CAPFLAG_CBOR        0x04

PACK(typedef struct {
    uint8_t nonce[INIT_NONCE_SIZE];
}) CTAPHID_INIT_REQ;

PACK(typedef struct {
    uint8_t  nonce[INIT_NONCE_SIZE];
    uint32_t cid;
    uint8_t  versionInterface;
    uint8_t  versionMajor;
    uint8_t  versionMinor;
    uint8_t  versionBuild;
    uint8_t  capFlags;
}) CTAPHID_INIT_RESP;

/* -----------------------------------------------------------------------
 * Error codes
 * ----------------------------------------------------------------------- */
#define CTAP_MAX_PACKET_SIZE    (64 - 7 + 128 * (64 - 5))
#define CTAP_MAX_CBOR_PAYLOAD   (USB_BUFFER_SIZE - 64 - 7 - 1)

#define CTAP1_ERR_NONE              0x00
#define CTAP1_ERR_INVALID_CMD       0x01
#define CTAP1_ERR_INVALID_PARAMETER 0x02
#define CTAP1_ERR_INVALID_LEN       0x03
#define CTAP1_ERR_INVALID_SEQ       0x04
#define CTAP1_ERR_MSG_TIMEOUT       0x05
#define CTAP1_ERR_CHANNEL_BUSY      0x06
#define CTAP1_ERR_LOCK_REQUIRED     0x0a
#define CTAP1_ERR_INVALID_CHANNEL   0x0b
#define CTAP1_ERR_OTHER             0x7f

/* -----------------------------------------------------------------------
 * Function declarations (implemented in ctap_hid_transport.c)
 * ----------------------------------------------------------------------- */
extern int      driver_init_hid(void);
extern int      ctap_error(uint8_t error);
extern uint16_t *get_send_buffer_size(uint8_t itf);
extern void     hid_init(void);
extern void     hid_task(void);

/* Called from apdu.c after APDU processing completes */
extern void driver_exec_finished_hid(uint16_t size_next);
extern void driver_exec_finished_cont_hid(uint8_t itf, uint16_t size_next, uint16_t offset);

extern bool is_nk;

#ifdef __cplusplus
}
#endif

#endif /* _CTAP_HID_H_ */
