#pragma once

/*
 * ESP32/FreeRTOS shim that replaces pico-keys-sdk's usb.h abstractions.
 *
 * Two FreeRTOS queues bridge the USB task and the CTAP processing task:
 *
 *   hid_to_ctap_q  – HID transport sends events/commands to the CTAP task
 *   ctap_to_hid_q  – CTAP task signals completion back to the HID poll task
 */

#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#include "esp_timer.h"

#include "picokeys.h"

#ifdef __cplusplus
extern "C" {
#endif

/* -----------------------------------------------------------------------
 * Interface index constants
 *
 * ITF_HID_CTAP / ITF_HID  – 0-based index into the ctap_hid_transport.c
 *                            internal hid_rx/hid_tx buffer arrays.
 *                            We manage only the FIDO interface, so this
 *                            is always 0.
 *
 * FIDO_TUD_ITF             – the actual TinyUSB HID instance number.
 *                            In ToothPaste's descriptor: 0=keyboard,
 *                            1=mouse, 2=consumer, 3=FIDO U2F.
 * ----------------------------------------------------------------------- */
#define ITF_HID_CTAP    0
#define ITF_HID         0
#define ITF_HID_TOTAL   1
#define FIDO_TUD_ITF    3

/* Enable the HID path in apdu.c conditional blocks */
#define USB_ITF_HID

/* -----------------------------------------------------------------------
 * USB buffer – used by ctap_hid_transport.c for packet reassembly.
 * 2 KB covers all U2F messages comfortably; increase to 8 KB if CTAP2
 * resident-key support (larger CBOR payloads) is added later.
 * ----------------------------------------------------------------------- */
#define USB_BUFFER_SIZE 2048

typedef struct {
    uint8_t  buffer[USB_BUFFER_SIZE];
    uint16_t r_ptr;
    uint16_t w_ptr;
} usb_buffer_t;

typedef enum {
    WRITE_IDLE    = 0,
    WRITE_PENDING = 1,
    WRITE_SUCCESS = 2,
    WRITE_FAILED  = 3,
} write_status_t;

/* -----------------------------------------------------------------------
 * Queue event codes
 *
 * hid_to_ctap_q carries:  EV_CMD_AVAILABLE, EV_VERIFY_CMD_AVAILABLE,
 *                         EV_MODIFY_CMD_AVAILABLE, EV_EXIT
 * ctap_to_hid_q carries:  EV_EXEC_FINISHED (and intermediate acks)
 * ----------------------------------------------------------------------- */
#define EV_CMD_AVAILABLE        0u
#define EV_VERIFY_CMD_AVAILABLE 1u
#define EV_MODIFY_CMD_AVAILABLE 2u
#define EV_EXEC_FINISHED        3u
#define EV_EXIT                 4u

/* Queues; created by fido_u2f_init() */
extern QueueHandle_t hid_to_ctap_q;
extern QueueHandle_t ctap_to_hid_q;

/* Byte count of the last finished APDU response; set by apdu_thread */
extern uint16_t finished_data_size;

/* -----------------------------------------------------------------------
 * CTAP task lifecycle
 * ----------------------------------------------------------------------- */

/* Start the CTAP processing FreeRTOS task the first time it is called.
 * Subsequent calls while the task is still running are no-ops. */
void ctap_task_start(uint8_t itf, void *(*thread)(void *));

/* Send EV_EXIT to the CTAP task and clear the task handle.
 * Called on CTAPHID_INIT to reset state between sessions. */
void ctap_task_reset(void);

/* Non-blocking poll: returns PICOKEYS_OK when EV_EXEC_FINISHED is
 * dequeued from ctap_to_hid_q, PICOKEYS_ERR_BLOCKED otherwise. */
int ctap_task_poll(uint8_t itf);

/* -----------------------------------------------------------------------
 * Event dispatch and misc stubs
 * ----------------------------------------------------------------------- */
void     usb_send_event(uint32_t event);
void     timeout_stop(void);
void     usb_set_timeout_counter(uint8_t itf, uint32_t ms);
uint32_t board_millis(void);

#ifdef __cplusplus
}
#endif
