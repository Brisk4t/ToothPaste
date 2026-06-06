/*
 * Adapted from pico-keys-sdk src/apdu.c
 * Copyright (c) 2022 Pol Henarejos. AGPL-3.0.
 *
 * Changes vs upstream:
 *  - Replaced Pico SDK multicore queue API (queue_remove_blocking /
 *    queue_add_blocking) with FreeRTOS xQueueReceive / xQueueSend.
 *  - Replaced #include "usb.h" with fido_usb_compat.h.
 *  - Removed #include "led/led.h"; led_set_mode() is a weak stub –
 *    implement in u2f_presence.cpp to drive rgbRMT if desired.
 *  - Removed all #ifdef USB_ITF_CCID / ENABLE_EMULATION blocks.
 *  - Added vTaskDelete(NULL) at the end of apdu_thread (FreeRTOS tasks
 *    must not return; the Pico SDK used pthreads which can).
 *  - card_init_core1() call removed (was a no-op shim).
 */

#include "picokeys.h"
#include "apdu.h"
#include "fido_usb_compat.h"
#include "ctap_hid.h"
#include <stdio.h>

/* -----------------------------------------------------------------------
 * Weak LED hook – implement in u2f_presence.cpp to light the LED during
 * APDU processing, or leave as a no-op.
 * ----------------------------------------------------------------------- */
WEAK void led_set_mode(int mode) { (void)mode; }

/* -----------------------------------------------------------------------
 * Globals
 * ----------------------------------------------------------------------- */
uint8_t *rdata_gr = NULL;
uint16_t rdata_bk = 0x0;
bool     is_chaining = false;
uint8_t  chain_buf[2038];
uint8_t *chain_ptr = NULL;

struct apdu apdu;

uint8_t  num_apps    = 0;
app_t    apps[16]    = {0};
app_t   *current_app = NULL;

int (*button_pressed_cb)(uint8_t) = NULL;

/* -----------------------------------------------------------------------
 * App registry
 * ----------------------------------------------------------------------- */
bool app_exists(const uint8_t *aid, size_t aid_len) {
    for (int i = 0; i < num_apps; i++) {
        if (memcmp(apps[i].aid + 1, aid, aid_len) == 0) {
            return true;
        }
    }
    return false;
}

int register_app(int (*select_fn)(app_t *, uint8_t), const uint8_t *aid) {
    if (app_exists(aid + 1, aid[0])) {
        return PICOKEYS_OK;
    }
    if (num_apps >= 16) {
        return PICOKEYS_ERR_NO_MEMORY;
    }
    app_t *a = &apps[num_apps++];
    a->aid        = aid;
    a->select_aid = select_fn;
    a->process_apdu = NULL;
    a->unload       = NULL;
    return PICOKEYS_OK;
}

int select_app(const uint8_t *aid, size_t aid_len) {
    for (int i = 0; i < num_apps; i++) {
        /* apps[i].aid is length-prefixed: aid[0] = length, aid[1..] = bytes */
        if (apps[i].aid[0] == aid_len &&
            memcmp(apps[i].aid + 1, aid, aid_len) == 0) {
            if (apps[i].select_aid) {
                apps[i].select_aid(&apps[i], 0);
            }
            current_app = &apps[i];
            return PICOKEYS_OK;
        }
    }
    return PICOKEYS_ERR_FILE_NOT_FOUND;
}

/* -----------------------------------------------------------------------
 * APDU processing
 * ----------------------------------------------------------------------- */
int process_apdu(void) {
    led_set_mode(1 /* MODE_PROCESSING */);
    if (CLA(apdu) & 0x10) {
        /* Command chaining: accumulate data across multiple APDUs */
        size_t chain_used = 0;
        if (!is_chaining) {
            chain_ptr = chain_buf;
        }
        chain_used = (size_t)(chain_ptr - chain_buf);
        if (chain_used + apdu.nc >= sizeof(chain_buf)) {
            memset(chain_buf, 0, sizeof(chain_buf));
            chain_ptr  = NULL;
            is_chaining = false;
            return SW_CLA_NOT_SUPPORTED();
        }
        memcpy(chain_ptr, apdu.data, apdu.nc);
        chain_ptr   += apdu.nc;
        is_chaining  = true;
        return SW_OK();
    }
    else {
        if (is_chaining) {
            memmove(apdu.data + (chain_ptr - chain_buf), apdu.data, apdu.nc);
            memcpy(apdu.data, chain_buf, chain_ptr - chain_buf);
            apdu.nc    += (uint16_t)(chain_ptr - chain_buf);
            memset(chain_buf, 0, sizeof(chain_buf));
            chain_ptr   = NULL;
            is_chaining = false;
        }
    }

    if (INS(apdu) == 0xA4 && P1(apdu) == 0x04 &&
        (P2(apdu) == 0x00 || P2(apdu) == 0x04)) {
        /* SELECT by AID */
        if (select_app(apdu.data, apdu.nc) == PICOKEYS_OK) {
            return SW_OK();
        }
        return SW_FILE_NOT_FOUND();
    }

    if (current_app && current_app->process_apdu) {
        return current_app->process_apdu();
    }
    return SW_FILE_NOT_FOUND();
}

uint16_t apdu_process(uint8_t itf, const uint8_t *buffer, uint16_t buffer_size) {
    apdu.header = (uint8_t *)buffer;
    apdu.nc = apdu.ne = 0;

    if (buffer_size == 4) {
        apdu.nc = apdu.ne = 0;
        apdu.ne = 256;
    }
    else if (buffer_size == 5) {
        apdu.nc = 0;
        apdu.ne = apdu.header[4];
        if (apdu.ne == 0) { apdu.ne = 256; }
    }
    else if (apdu.header[4] == 0x0 && buffer_size >= 7) {
        if (buffer_size == 7) {
            apdu.ne = get_uint16_be(apdu.header + 5);
            if (apdu.ne == 0) { apdu.ne = 65536; }
        }
        else {
            apdu.ne = 0;
            apdu.nc = get_uint16_be(apdu.header + 5);
            apdu.data = apdu.header + 7;
            if (apdu.nc + 7 + 2 == buffer_size) {
                apdu.ne = get_uint16_be(apdu.header + buffer_size - 2);
                if (apdu.ne == 0) { apdu.ne = 65536; }
            }
        }
    }
    else {
        apdu.nc   = apdu.header[4];
        apdu.data = apdu.header + 5;
        apdu.ne   = 0;
        if (apdu.nc + 5 + 1 == buffer_size) {
            apdu.ne = apdu.header[buffer_size - 1];
            if (apdu.ne == 0) { apdu.ne = 256; }
        }
    }

    if (apdu.header[1] == 0xc0) {
        /* GET RESPONSE continuation */
        timeout_stop();
        rdata_gr[0] = rdata_bk >> 8;
        rdata_gr[1] = rdata_bk & 0xff;
        if (apdu.rlen <= apdu.ne) {
#ifdef USB_ITF_HID
            if (itf == ITF_HID_CTAP) {
                driver_exec_finished_cont_hid(itf, apdu.rlen + 2,
                    (uint16_t)(rdata_gr - apdu.rdata));
            }
#endif
            apdu.sw   = 0;
            apdu.rlen = 0;
            rdata_gr  = apdu.rdata;
        }
        else {
            rdata_gr  += apdu.ne;
            rdata_bk   = ((uint16_t)rdata_gr[0] << 8) | rdata_gr[1];
            rdata_gr[0] = 0x61;
            rdata_gr[1] = (apdu.rlen - apdu.ne >= 256) ?
                          0 : (uint8_t)(apdu.rlen - apdu.ne);
#ifdef USB_ITF_HID
            if (itf == ITF_HID_CTAP) {
                driver_exec_finished_cont_hid(itf, (uint16_t)(apdu.ne + 2),
                    (uint16_t)(rdata_gr - apdu.ne - apdu.rdata));
            }
#endif
            apdu.rlen -= (uint16_t)apdu.ne;
        }
    }
    else {
        apdu.sw   = 0;
        apdu.rlen = 0;
        rdata_gr  = apdu.rdata;
        return 1;
    }
    return 0;
}

uint16_t set_res_sw(uint8_t sw1, uint8_t sw2) {
    apdu.sw = make_uint16_be(sw1, sw2);
    if (sw1 != 0x90) {
        res_APDU_size = 0;
    }
    return make_uint16_be(sw1, sw2);
}

/* -----------------------------------------------------------------------
 * APDU thread – FreeRTOS task; blocks on hid_to_ctap_q.
 *
 * NOTE: This function is cast to TaskFunction_t (void(*)(void*)) in
 * ctap_task_start(). It must call vTaskDelete(NULL) before returning.
 * ----------------------------------------------------------------------- */
void *apdu_thread(void *arg) {
    (void)arg;
    while (1) {
        uint32_t m = 0;
        xQueueReceive(hid_to_ctap_q, &m, portMAX_DELAY);

        uint32_t flag = m + 1;
        if (m != EV_CMD_AVAILABLE) {
            xQueueSend(ctap_to_hid_q, &flag, portMAX_DELAY);
        }

        if (m == EV_VERIFY_CMD_AVAILABLE || m == EV_MODIFY_CMD_AVAILABLE) {
            set_res_sw(0x6f, 0x00);
            goto done;
        }
        else if (m == EV_EXIT) {
            break;
        }

        process_apdu();

done:
        apdu_finish();
        finished_data_size = apdu_next();
        flag = EV_EXEC_FINISHED;
        xQueueSend(ctap_to_hid_q, &flag, portMAX_DELAY);
    }

    if (current_app && current_app->unload) {
        current_app->unload();
        current_app = NULL;
    }

    vTaskDelete(NULL);
    return NULL; /* unreachable */
}

void apdu_finish(void) {
    put_uint16_be(apdu.sw, apdu.rdata + apdu.rlen);
}

uint16_t apdu_next(void) {
    if (apdu.sw != 0) {
        if (apdu.rlen <= apdu.ne) {
            return apdu.rlen + 2;
        }
        else {
            rdata_gr    = apdu.rdata + apdu.ne;
            rdata_bk    = ((uint16_t)rdata_gr[0] << 8) | rdata_gr[1];
            rdata_gr[0] = 0x61;
            rdata_gr[1] = (apdu.rlen - apdu.ne >= 256) ?
                          0 : (uint8_t)(apdu.rlen - apdu.ne);
            apdu.rlen  -= (uint16_t)apdu.ne;
        }
        return (uint16_t)(apdu.ne + 2);
    }
    return 0;
}

int bulk_cmd(int (*cmd)(void)) {
    uint8_t  *p         = apdu.data;
    uint8_t  *rapdu     = apdu.rdata;
    uint16_t  rapdu_size = 0;
    uint8_t  *top       = apdu.data + apdu.nc;

    while (p < top) {
        P1(apdu)   = p[0];
        P2(apdu)   = p[1];
        apdu.nc    = p[2];
        apdu.data  = p + 3;
        *apdu.rdata++ = p[0];
        *apdu.rdata++ = p[1];
        *apdu.rdata++ = 0;
        *apdu.rdata++ = 0;
        apdu.rlen  = 0;
        cmd();
        put_uint16_be(apdu.rlen, apdu.rdata - 2);
        put_uint16_be(apdu.sw,   apdu.rdata + apdu.rlen);
        rapdu_size += 4 + apdu.rlen + 2;
        apdu.rdata += apdu.rlen + 2;
        p          += 3 + apdu.nc;
    }
    apdu.rlen  = rapdu_size;
    apdu.rdata = rapdu;
    return SW_OK();
}
