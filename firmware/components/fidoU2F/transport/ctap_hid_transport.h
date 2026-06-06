#pragma once

#include <stdint.h>
#include "class/hid/hid_device.h"

#ifdef __cplusplus
extern "C" {
#endif

/*
 * CTAP HID transport dispatch functions.
 *
 * tudconfig.cpp owns the tud_hid_* callbacks and calls these for the FIDO
 * interface (instance 3). Instance routing is done in tudconfig; these
 * functions assume they are only called for FIDO traffic.
 */

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
