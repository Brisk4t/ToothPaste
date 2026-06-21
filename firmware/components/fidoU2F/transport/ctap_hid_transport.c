/*
 * Adapted from pico-keys-sdk src/usb/hid/hid.c
 * Copyright (c) 2022 Pol Henarejos. AGPL-3.0.
 *
 * Changes vs upstream:
 *  - ITF_HID_CTAP = 0 for internal buffer arrays; FIDO_TUD_ITF = 3 for
 *    actual TinyUSB instance calls (FIDO is the 4th HID iface in ToothPaste).
 *  - tud_hid_* callbacks are NOT defined here; tudconfig.cpp owns them and
 *    calls ctap_hid_set_report / ctap_hid_get_report / ctap_hid_report_complete
 *    for the FIDO interface. See ctap_hid_transport.h.
 *  - Keyboard buffer code removed; keyboard is handled by espHID/IDF_USB.
 *  - sleep_ms(1000) replaced with vTaskDelay(pdMS_TO_TICKS(1000)).
 *  - Removed CCID, emulation, OTP, admin, provisioner, UUID, reboot,
 *    and firmware-update command paths (deferred / not applicable).
 *  - cbor_process / cbor_thread implemented in protocol/cbor_dispatch.c.
 *  - CTAPHID_CANCEL delegates to u2f_presence_cancel() (app/u2f_presence.cpp).
 *  - init_fido() declared extern; implemented in u2f_app.c.
 *  - pico_serial replaced with TODO placeholder in UUID handler.
 *  - Replaced #include "serial.h" / "pico_time.h" with ESP equivalents
 *    from fido_usb_compat.h.
 */

#include <string.h>
#include "esp_log.h"
#include "tinyusb.h"
#include "class/hid/hid_device.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "picokeys.h"
#include "picokeys_version.h"
#include "fido_usb_compat.h"
#include "ctap_hid.h"
#include "ctap_hid_transport.h"
#include "apdu.h"
#include "u2f_presence.h"

/* -----------------------------------------------------------------------
 * Externals provided by other files
 * ----------------------------------------------------------------------- */

/* Implemented in u2f_app.c – registers the U2F application */
extern void init_fido(void);

/* Implemented in protocol/cbor_dispatch.c */
int  cbor_process(uint8_t last_cmd, const uint8_t *data, size_t len);
void *cbor_thread(void *arg);

/* AID definitions; length-prefixed byte arrays, first byte = length.
 * Defined in u2f_app.c. */
extern const uint8_t u2f_aid[];
extern const uint8_t fido_aid[];

/* -----------------------------------------------------------------------
 * Transport state
 * ----------------------------------------------------------------------- */
bool is_nk = false;

uint8_t (*get_version_major)(void) = NULL;
uint8_t (*get_version_minor)(void) = NULL;

static usb_buffer_t hid_rx[ITF_HID_TOTAL];
static usb_buffer_t hid_tx[ITF_HID_TOTAL];

PACK(
typedef struct msg_packet {
    uint16_t len;
    uint16_t current_len;
    uint8_t  data[CTAP_MAX_PACKET_SIZE];
}) msg_packet_t;

static msg_packet_t msg_packet = { 0 };

static uint16_t       send_buffer_size[ITF_HID_TOTAL];
static write_status_t last_write_result[ITF_HID_TOTAL];

CTAPHID_FRAME *ctap_req  = NULL;
CTAPHID_FRAME *ctap_resp = NULL;

static portMUX_TYPE hid_mux = portMUX_INITIALIZER_UNLOCKED;

static uint32_t last_cmd_time = 0, last_packet_time = 0;
static uint8_t  last_cmd = 0;
static uint8_t  last_seq = 0;
static uint32_t lock     = 0;
static uint8_t  thread_type = 0; /* 1 = APDU/MSG, 2 = CBOR */

static CTAPHID_FRAME last_req = { 0 };

/* -----------------------------------------------------------------------
 * Helpers
 * ----------------------------------------------------------------------- */

static void send_keepalive(void);

static uint32_t hid_write_offset(uint16_t size, uint16_t offset) {
    hid_tx[ITF_HID_CTAP].w_ptr += size + offset;
    hid_tx[ITF_HID_CTAP].r_ptr += offset;
    return size;
}

static uint32_t hid_write(uint16_t size) {
    return hid_write_offset(size, 0);
}

/* -----------------------------------------------------------------------
 * Public init
 * ----------------------------------------------------------------------- */

void hid_init(void) {
    ctap_req  = (CTAPHID_FRAME *)(hid_rx[ITF_HID_CTAP].buffer);
    ctap_resp = (CTAPHID_FRAME *)(hid_tx[ITF_HID_CTAP].buffer);
    init_fido();
}

int driver_init_hid(void) {
    ctap_req  = (CTAPHID_FRAME *)(hid_rx[ITF_HID_CTAP].buffer +
                                  hid_rx[ITF_HID_CTAP].r_ptr);
    apdu.header = ctap_req->init.data;

    ctap_resp   = (CTAPHID_FRAME *)(hid_tx[ITF_HID_CTAP].buffer);
    apdu.rdata  = ctap_resp->init.data;
    /* Skip zero-fill when a USB IN transfer is in-flight: TinyUSB's DMA
     * engine holds a direct pointer to this buffer, so zeroing it now
     * would corrupt the packet currently being transmitted. */
    if (last_write_result[ITF_HID_CTAP] != WRITE_PENDING) {
        memset(ctap_resp, 0, sizeof(CTAPHID_FRAME));
    }

    usb_set_timeout_counter(ITF_HID, 200);

    is_nk = false;
    hid_tx[ITF_HID_CTAP].w_ptr = hid_tx[ITF_HID_CTAP].r_ptr = 0;
    send_buffer_size[ITF_HID_CTAP] = 0;
    return 0;
}

/* -----------------------------------------------------------------------
 * Write helpers
 * ----------------------------------------------------------------------- */

int driver_write_hid(uint8_t itf, const uint8_t *buffer, uint16_t buffer_size) {
    (void)itf; /* internal index; always use FIDO_TUD_ITF for tinyusb */
    if (last_write_result[ITF_HID_CTAP] == WRITE_PENDING) {
        return 0;
    }
    bool r = tud_hid_n_report(FIDO_TUD_ITF, 0, buffer, buffer_size);
    last_write_result[ITF_HID_CTAP] = r ? WRITE_PENDING : WRITE_FAILED;
    return r ? MIN(64, buffer_size) : 0;
}

uint16_t *get_send_buffer_size(uint8_t itf) {
    return &send_buffer_size[itf];
}

/* -----------------------------------------------------------------------
 * Error frame
 * ----------------------------------------------------------------------- */

int ctap_error(uint8_t error) {
    memset((uint8_t *)ctap_resp, 0, sizeof(CTAPHID_FRAME));
    ctap_resp->cid            = ctap_req->cid;
    ctap_resp->init.cmd       = CTAPHID_ERROR;
    ctap_resp->init.bcntl     = 1;
    ctap_resp->init.data[0]   = error;
    hid_write(64);
    last_packet_time = 0;
    return 0;
}

/* -----------------------------------------------------------------------
 * Keepalive
 * ----------------------------------------------------------------------- */

static void send_keepalive(void) {
    if (thread_type == 1) {
        return;
    }
    CTAPHID_FRAME *resp = (CTAPHID_FRAME *)(
        hid_tx[ITF_HID_CTAP].buffer +
        sizeof(hid_tx[ITF_HID_CTAP].buffer) - 64);
    resp->cid          = ctap_req->cid;
    resp->init.cmd     = CTAPHID_KEEPALIVE;
    resp->init.bcnth   = 0;
    resp->init.bcntl   = 1;
    resp->init.data[0] = is_req_button_pending() ?
                         KEEPALIVE_STATUS_UPNEEDED :
                         KEEPALIVE_STATUS_PROCESSING;
    driver_write_hid(ITF_HID_CTAP, (const uint8_t *)resp, 64);
}

/* -----------------------------------------------------------------------
 * Response dispatch (called from apdu.c after APDU processing completes)
 * ----------------------------------------------------------------------- */

void driver_exec_finished_hid(uint16_t size_next) {
    if (size_next > 0) {
        if (thread_type == 2 && apdu.sw != 0) {
            ctap_error(apdu.sw & 0xff);
        }
        else {
            if (is_nk) {
                memmove(apdu.rdata + 2, apdu.rdata, size_next - 2);
                put_uint16_be(apdu.sw, apdu.rdata);
            }
            driver_exec_finished_cont_hid(ITF_HID_CTAP, size_next, 7);
        }
    }
    apdu.sw = 0;
}

void driver_exec_finished_cont_hid(uint8_t itf, uint16_t size_next, uint16_t offset) {
    offset -= 7;
    ctap_resp = (CTAPHID_FRAME *)(hid_tx[itf].buffer + offset);
    ctap_resp->cid        = ctap_req->cid;
    ctap_resp->init.bcnth = size_next >> 8;
    ctap_resp->init.bcntl = size_next & 0xff;
    send_buffer_size[itf] = size_next;
    ctap_resp->init.cmd   = last_cmd;
    hid_write_offset(size_next + 7, offset);
}

/* -----------------------------------------------------------------------
 * Report complete callback
 * Called by TinyUSB after a 64-byte IN report has been transmitted.
 * Advances the TX read pointer and sends the next continuation frame.
 * ----------------------------------------------------------------------- */
void ctap_hid_report_complete(uint8_t instance, uint8_t const *report, uint16_t len) {
    (void)instance;
    if (len > 0) {
        taskENTER_CRITICAL(&hid_mux);
        CTAPHID_FRAME *req = (CTAPHID_FRAME *)report;
        if (last_write_result[ITF_HID_CTAP] == WRITE_PENDING) {
            last_write_result[ITF_HID_CTAP] = WRITE_SUCCESS;
            if (FRAME_TYPE(req) == TYPE_INIT) {
                if (req->init.cmd != CTAPHID_KEEPALIVE) {
                    send_buffer_size[ITF_HID_CTAP] -=
                        MIN(64 - 7, send_buffer_size[ITF_HID_CTAP]);
                }
            }
            else {
                send_buffer_size[ITF_HID_CTAP] -=
                    MIN(64 - 5, send_buffer_size[ITF_HID_CTAP]);
            }
        }
        if (last_write_result[ITF_HID_CTAP] == WRITE_SUCCESS) {
            if (FRAME_TYPE(req) != TYPE_INIT || req->init.cmd != CTAPHID_KEEPALIVE) {
                if (send_buffer_size[ITF_HID_CTAP] > 0) {
                    ctap_resp = (CTAPHID_FRAME *)((uint8_t *)ctap_resp + 64 - 5);
                    uint8_t seq = (FRAME_TYPE(req) == TYPE_INIT) ?
                                  0 : FRAME_SEQ(req) + 1;
                    ctap_resp->cid      = req->cid;
                    ctap_resp->cont.seq = seq;
                    hid_tx[ITF_HID_CTAP].r_ptr += 64 - 5;
                }
                else {
                    hid_tx[ITF_HID_CTAP].r_ptr += 64;
                }
            }
        }
        if (hid_tx[ITF_HID_CTAP].r_ptr >= hid_tx[ITF_HID_CTAP].w_ptr) {
            hid_tx[ITF_HID_CTAP].r_ptr = hid_tx[ITF_HID_CTAP].w_ptr = 0;
        }
        taskEXIT_CRITICAL(&hid_mux);
    }
}

/* -----------------------------------------------------------------------
 * Packet timeout check (called from hid_task when no new packets arrive)
 * ----------------------------------------------------------------------- */
static int driver_process_usb_nopacket_hid(void) {
    if (last_packet_time > 0 &&
        last_packet_time + 500 < board_millis()) {
        ctap_error(CTAP1_ERR_MSG_TIMEOUT);
        last_packet_time = 0;
        msg_packet.len = msg_packet.current_len = 0;
    }
    return 0;
}

/* -----------------------------------------------------------------------
 * Main packet dispatcher
 * Called every time a complete 64-byte HID OUT frame arrives on FIDO_TUD_ITF.
 * ----------------------------------------------------------------------- */
int driver_process_usb_packet_hid(uint16_t read) {
    int apdu_sent = 0;

    if (read < 5) {
        return 0;
    }

    driver_init_hid();

    hid_rx[ITF_HID_CTAP].r_ptr += 64;
    if (hid_rx[ITF_HID_CTAP].r_ptr >= hid_rx[ITF_HID_CTAP].w_ptr) {
        hid_rx[ITF_HID_CTAP].r_ptr = hid_rx[ITF_HID_CTAP].w_ptr = 0;
    }

    last_packet_time = board_millis();
    DEBUG_PAYLOAD((uint8_t *)ctap_req, 64);

    /* Reject null and unexpected broadcast CIDs */
    if (ctap_req->cid == 0x0 ||
        (ctap_req->cid == CID_BROADCAST &&
         (FRAME_TYPE(ctap_req) != TYPE_INIT ||
          ctap_req->init.cmd != CTAPHID_INIT))) {
        return ctap_error(CTAP1_ERR_INVALID_CHANNEL);
    }

    /* Channel busy check */
    if (board_millis() < lock &&
        ctap_req->cid != last_req.cid &&
        last_cmd_time + 100 > board_millis()) {
        return ctap_error(CTAP1_ERR_CHANNEL_BUSY);
    }

    /* ---- Frame reassembly -------------------------------------------- */
    if (FRAME_TYPE(ctap_req) == TYPE_INIT) {
        if (MSG_LEN(ctap_req) > CTAP_MAX_PACKET_SIZE) {
            return ctap_error(CTAP1_ERR_INVALID_LEN);
        }
        if (msg_packet.len > 0 &&
            last_cmd_time + 100 > board_millis() &&
            ctap_req->init.cmd != CTAPHID_INIT) {
            if (last_req.cid != ctap_req->cid) {
                return ctap_error(CTAP1_ERR_CHANNEL_BUSY);
            }
            else {
                return ctap_error(CTAP1_ERR_INVALID_SEQ);
            }
        }
        ESP_LOGD("ctap_hid", "cmd=0x%02x len=%d", FRAME_CMD(ctap_req), MSG_LEN(ctap_req));

        msg_packet.len = msg_packet.current_len = 0;
        if (MSG_LEN(ctap_req) > 64 - 7) {
            msg_packet.len = MSG_LEN(ctap_req);
            memcpy(msg_packet.data + msg_packet.current_len,
                   ctap_req->init.data, 64 - 7);
            msg_packet.current_len += 64 - 7;
        }
        memcpy(&last_req, ctap_req, sizeof(CTAPHID_FRAME));
        last_cmd      = ctap_req->init.cmd;
        last_seq      = 0;
        last_cmd_time = board_millis();
    }
    else {
        /* Continuation frame */
        if (msg_packet.len == 0) {
            return 0; /* no prior INIT frame */
        }
        if (last_seq != ctap_req->cont.seq) {
            return ctap_error(CTAP1_ERR_INVALID_SEQ);
        }
        if (last_req.cid == ctap_req->cid) {
            size_t copy = MIN(64 - 5, msg_packet.len - msg_packet.current_len);
            memcpy(msg_packet.data + msg_packet.current_len,
                   ctap_req->cont.data, copy);
            msg_packet.current_len += (uint16_t)copy;
            memcpy(&last_req, ctap_req, sizeof(CTAPHID_FRAME));
            last_seq++;
        }
        else if (last_cmd_time + 100 > board_millis()) {
            return ctap_error(CTAP1_ERR_CHANNEL_BUSY);
        }
    }

    /* ---- Command dispatch -------------------------------------------- */

    if (ctap_req->init.cmd == CTAPHID_INIT) {
        ctap_task_reset();
        thread_type = 0;   /* cancel any stale CBOR session so keepalives stop */
        hid_tx[ITF_HID_CTAP].r_ptr = hid_tx[ITF_HID_CTAP].w_ptr = 0;

        CTAPHID_INIT_REQ  *req  = (CTAPHID_INIT_REQ  *)ctap_req->init.data;
        CTAPHID_INIT_RESP *resp = (CTAPHID_INIT_RESP *)ctap_resp->init.data;
        memcpy(resp->nonce, req->nonce, sizeof(resp->nonce));
        resp->cid              = 0x01000000;
        resp->versionInterface = CTAPHID_IF_VERSION;
        resp->versionMajor     = get_version_major ?
                                 get_version_major() : PICOKEYS_SDK_VERSION_MAJOR;
        resp->versionMinor     = get_version_minor ?
                                 get_version_minor() : PICOKEYS_SDK_VERSION_MINOR;
        resp->versionBuild     = 0;
        resp->capFlags         = CAPFLAG_WINK | CAPFLAG_CBOR;

        /* CTAPHID spec §11.2.9.1: "responds on the broadcast channel" —
         * the frame CID echoes the request (0xFFFFFFFF); the newly
         * allocated channel ID lives only in the payload resp->cid. */
        ctap_resp->cid          = ctap_req->cid;
        ctap_resp->init.cmd     = CTAPHID_INIT;
        ctap_resp->init.bcntl   = 17;
        ctap_resp->init.bcnth   = 0;
        driver_write_hid(ITF_HID_CTAP, (const uint8_t *)ctap_resp, 64);
        msg_packet.len = msg_packet.current_len = 0;
        last_packet_time = 0;
    }
    else if (ctap_req->init.cmd == CTAPHID_WINK) {
        if (MSG_LEN(ctap_req) != 0) {
            return ctap_error(CTAP1_ERR_INVALID_LEN);
        }
        last_packet_time = 0;
        memcpy(ctap_resp, ctap_req, sizeof(CTAPHID_FRAME));
        ESP_LOGD("ctap_hid", "WINK received");
        //vTaskDelay(pdMS_TO_TICKS(1000));
        driver_write_hid(ITF_HID_CTAP, (const uint8_t *)ctap_resp, 64);
        msg_packet.len = msg_packet.current_len = 0;
    }
    else if ((last_cmd == CTAPHID_PING || last_cmd == CTAPHID_SYNC) &&
             (msg_packet.len == 0 ||
              (msg_packet.len == msg_packet.current_len && msg_packet.len > 0))) {
        if (msg_packet.current_len == msg_packet.len && msg_packet.len > 0) {
            memcpy(ctap_resp->init.data, msg_packet.data, msg_packet.len);
            driver_exec_finished_hid(msg_packet.len);
        }
        else {
            memcpy(ctap_resp->init.data, ctap_req->init.data, MSG_LEN(ctap_req));
            ctap_resp->cid          = ctap_req->cid;
            ctap_resp->init.cmd     = last_cmd;
            ctap_resp->init.bcnth   = MSG_LEN(ctap_req) >> 8;
            ctap_resp->init.bcntl   = MSG_LEN(ctap_req) & 0xff;
            driver_write_hid(ITF_HID_CTAP, (const uint8_t *)ctap_resp, 64);
        }
        msg_packet.len = msg_packet.current_len = 0;
        last_packet_time = 0;
    }
    else if (ctap_req->init.cmd == CTAPHID_LOCK) {
        if (MSG_LEN(ctap_req) != 1) {
            return ctap_error(CTAP1_ERR_INVALID_LEN);
        }
        if (ctap_req->init.data[0] > 10) {
            return ctap_error(CTAP1_ERR_INVALID_PARAMETER);
        }
        lock = board_millis() + (uint32_t)ctap_req->init.data[0] * 1000;
        ctap_resp->cid      = ctap_req->cid;
        ctap_resp->init.cmd = ctap_req->init.cmd;
        driver_write_hid(ITF_HID_CTAP, (const uint8_t *)ctap_resp, 64);
        msg_packet.len = msg_packet.current_len = 0;
        last_packet_time = 0;
    }
    else if ((last_cmd == CTAPHID_MSG) &&
             (msg_packet.len == 0 ||
              (msg_packet.len == msg_packet.current_len && msg_packet.len > 0))) {
        /* U2F MSG (CTAP1) path. The worker thread is reused across host
         * polls (ctap_task_start only relaunches when switching between
         * apdu_thread and cbor_thread), so a Windows retry no longer kills
         * a worker that is waiting for / processing a button press. */
        select_app(u2f_aid + 1, u2f_aid[0]);
        thread_type = 1;

        if (msg_packet.current_len == msg_packet.len && msg_packet.len > 0) {
            apdu_sent = apdu_process(ITF_HID_CTAP, msg_packet.data,
                                     msg_packet.len);
        }
        else {
            apdu_sent = apdu_process(ITF_HID_CTAP, ctap_req->init.data,
                                     MSG_LEN(ctap_req));
        }
        DEBUG_PAYLOAD(apdu.data, (int)apdu.nc);
        msg_packet.len = msg_packet.current_len = 0;
        last_packet_time = 0;
    }
    else if ((last_cmd == CTAPHID_CBOR || last_cmd >= CTAPHID_VENDOR_FIRST) &&
             (msg_packet.len == 0 ||
              (msg_packet.len == msg_packet.current_len && msg_packet.len > 0))) {
        /* CTAP2 / CBOR path (deferred) */
        thread_type = 2;
        select_app(fido_aid + 1, fido_aid[0]);

        if (msg_packet.current_len == msg_packet.len && msg_packet.len > 0) {
            apdu_sent = cbor_process(last_cmd, msg_packet.data,
                                     msg_packet.len);
        }
        else {
            apdu_sent = cbor_process(last_cmd, ctap_req->init.data,
                                     MSG_LEN(ctap_req));
        }
        msg_packet.len = msg_packet.current_len = 0;
        last_packet_time = 0;

        if (apdu_sent < 0) {
            return ctap_error((uint8_t)(-apdu_sent));
        }
        send_keepalive();
    }
    else if (ctap_req->init.cmd == CTAPHID_CANCEL) {
        ctap_error(0x2D);
        msg_packet.len = msg_packet.current_len = 0;
        last_packet_time = 0;
        u2f_presence_cancel();
        hid_tx[ITF_HID_CTAP].r_ptr = hid_tx[ITF_HID_CTAP].w_ptr = 0;
    }
    else {
        if (msg_packet.len == 0) {
            return ctap_error(CTAP1_ERR_INVALID_CMD);
        }
    }

    if (apdu_sent > 0) {
        if (apdu_sent == 1) {
            ctap_task_start(ITF_HID, apdu_thread);
        }
        else if (apdu_sent == 2) {
            ctap_task_start(ITF_HID, cbor_thread);
        }
        usb_send_event(EV_CMD_AVAILABLE);
    }

    return apdu_sent;
}

/* -----------------------------------------------------------------------
 * HID poll task body – called every 1 ms from fido_hid_poll_task()
 * ----------------------------------------------------------------------- */
void hid_task(void) {
    /* --- Check for completed APDU processing --- */
    const uint32_t poll_interval_ms = 1;
    static uint32_t last_poll_ms = 0;

    uint32_t now_ms = board_millis();
    if (now_ms - last_poll_ms >= poll_interval_ms) {
        last_poll_ms = now_ms;
        int status = ctap_task_poll(ITF_HID);
        if (status == PICOKEYS_OK) {
            driver_exec_finished_hid(finished_data_size);
            thread_type = 0;
        }
        else if (status == PICOKEYS_ERR_BLOCKED) {
            send_keepalive();
        }
    }

    /* --- Timeout check --- */
    int proc_pkt = 0;
    if (proc_pkt == 0) {
        driver_process_usb_nopacket_hid();
    }

    /* --- Flush TX buffer --- */
    taskENTER_CRITICAL(&hid_mux);
    bool has_pending = (hid_tx[ITF_HID_CTAP].w_ptr >
                        hid_tx[ITF_HID_CTAP].r_ptr) &&
                       (last_write_result[ITF_HID_CTAP] != WRITE_PENDING);
    taskEXIT_CRITICAL(&hid_mux);

    if (has_pending) {
        driver_write_hid(ITF_HID_CTAP,
                         hid_tx[ITF_HID_CTAP].buffer +
                         hid_tx[ITF_HID_CTAP].r_ptr,
                         64);
    }
}

/* -----------------------------------------------------------------------
 * CTAP HID dispatch functions – called from tudconfig.cpp callbacks.
 * Instance routing (FIDO vs keyboard/mouse) is done in tudconfig.
 * ----------------------------------------------------------------------- */

uint16_t ctap_hid_get_report(uint8_t instance, uint8_t report_id,
                              hid_report_type_t report_type,
                              uint8_t *buffer, uint16_t reqlen) {
    (void)instance; (void)report_id; (void)report_type;
    /* FIDO U2F does not use GET_REPORT; return zeros */
    memset(buffer, 0, reqlen);
    return reqlen;
}

void ctap_hid_set_report(uint8_t instance, uint8_t report_id,
                          hid_report_type_t report_type,
                          uint8_t const *buffer, uint16_t bufsize) {
    (void)instance; (void)report_id; (void)report_type;

    /* Buffer the incoming 64-byte CTAP frame and process it */
    memcpy(hid_rx[ITF_HID_CTAP].buffer + hid_rx[ITF_HID_CTAP].w_ptr,
           buffer, bufsize);
    hid_rx[ITF_HID_CTAP].w_ptr += bufsize;

    int proc_pkt = driver_process_usb_packet_hid(64);
    if (proc_pkt == 0) {
        driver_process_usb_nopacket_hid();
    }
}
