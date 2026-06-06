#pragma once

#include "class/hid/hid_device.h"

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Public API for the fidoU2F component.
 *
 * tudconfig.cpp owns ALL tud_hid_* callbacks. For the FIDO interface
 * (instance FIDO_TUD_ITF) it delegates to the three dispatch functions
 * below. Other interfaces (keyboard, mouse, consumer) are handled entirely
 * within tudconfig.cpp.
 *
 * Integration checklist for tudconfig.cpp:
 *   1. Call fido_u2f_init() once after tinyusb_driver_install().
 *   2. In tud_hid_get_report_cb: call ctap_hid_get_report() for instance == FIDO_TUD_ITF.
 *   3. In tud_hid_set_report_cb: call ctap_hid_set_report() for instance == FIDO_TUD_ITF.
 *   4. In tud_hid_report_complete_cb: call ctap_hid_report_complete() for instance == FIDO_TUD_ITF.
 *   5. tud_hid_descriptor_report_cb stays in tudconfig.cpp (handles all 4 interfaces).
 */

/* TinyUSB instance number for the FIDO U2F HID interface in ToothPaste.
 * 0=keyboard 1=mouse 2=consumer 3=FIDO. Defined here so tudconfig.cpp
 * does not need to reach into fidoU2F internal headers. */
#define FIDO_TUD_ITF 3

/* Initialise queues, buffer allocations, and background tasks.
 * Must be called after nvs_flash_init() and tinyusb_driver_install(). */
void fido_u2f_init(void);

/* -----------------------------------------------------------------------
 * CTAP HID dispatch – called from tud_hid_* callbacks in tudconfig.cpp.
 * Only call these for instance == FIDO_TUD_ITF.
 * ----------------------------------------------------------------------- */
uint16_t ctap_hid_get_report(uint8_t instance, uint8_t report_id,
                              hid_report_type_t report_type,
                              uint8_t *buffer, uint16_t reqlen);

void ctap_hid_set_report(uint8_t instance, uint8_t report_id,
                          hid_report_type_t report_type,
                          uint8_t const *buffer, uint16_t bufsize);

void ctap_hid_report_complete(uint8_t instance,
                               uint8_t const *report, uint16_t len);

#ifdef __cplusplus
}
#endif
