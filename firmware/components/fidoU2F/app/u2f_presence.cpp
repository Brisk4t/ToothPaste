#include "u2f_presence.h"
#include "picokeys.h"
#include "signal.h"
#include "hwUI.h"
#include "NeoPixelRMT.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"

static const char *TAG = "u2f_presence";

#define BIT_APPROVED   (EventBits_t)(1u << 0)
#define BIT_CANCELLED  (EventBits_t)(1u << 1)

static EventGroupHandle_t s_eg       = NULL;
static volatile bool      s_pending  = false;
static volatile bool      s_approved = false;

/* Exported – read by ctap_hid_transport.c on CTAPHID_CANCEL */
bool cancel_button = false;

/* -----------------------------------------------------------------------
 * is_req_button_pending – declared in picokeys.h, called by send_keepalive()
 * to set KEEPALIVE_STATUS_UPNEEDED when the user hasn't pressed yet.
 * ----------------------------------------------------------------------- */
extern "C" bool is_req_button_pending(void) {
    return s_pending;
}

bool u2f_presence_is_pending(void) {
    return s_pending;
}

/* -----------------------------------------------------------------------
 * u2f_presence_init
 *
 * Creates the EventGroup and registers a SINGLE_PRESS callback with hwUI.
 * The lambda runs in hwUITask context; it only fires the bit while a
 * request is active, so incidental button presses are silently dropped.
 * ----------------------------------------------------------------------- */
void u2f_presence_init(void) {
    s_eg = xEventGroupCreate();
    configASSERT(s_eg != NULL);

    registerButtonCallback(ButtonEvent::SINGLE_PRESS, []() {
        if (s_pending && s_eg != NULL) {
            xEventGroupSetBits(s_eg, BIT_APPROVED);
        }
    });

    ESP_LOGI(TAG, "ready");
}

/* -----------------------------------------------------------------------
 * u2f_presence_wait
 *
 * Blocks the calling task (apdu_thread / cbor_thread) until:
 *   - the user presses the button  → returns true
 *   - timeout_ms elapses           → returns false
 *   - u2f_presence_cancel() fires  → returns false
 *
 * LED feedback (led.blinkUpdate() must be pumped from the main loop):
 *   slow cyan pulse 500 ms  – waiting for touch
 *   green 200 ms flash      – approved
 *   red   200 ms flash      – timeout / cancel
 * ----------------------------------------------------------------------- */
bool u2f_presence_wait(uint32_t timeout_ms) {
    if (s_eg == NULL) {
        ESP_LOGE(TAG, "called before u2f_presence_init");
        return false;
    }

    s_pending     = true;
    s_approved    = false;
    cancel_button = false;

    /* Clear any stale bits left from a previous operation */
    xEventGroupClearBits(s_eg, BIT_APPROVED | BIT_CANCELLED);

    led.blinkStart(500, 0, 200, 200);

    signal_user_presence_request_data_t req_data = { timeout_ms };
    signal_emit_param(SIGNAL_USER_PRESENCE_REQUEST, &req_data);

    EventBits_t bits = xEventGroupWaitBits(
        s_eg,
        BIT_APPROVED | BIT_CANCELLED,
        pdTRUE,   /* clear bits on exit */
        pdFALSE,  /* return on any single bit */
        pdMS_TO_TICKS(timeout_ms));

    led.blinkEnd();
    s_pending = false;

    if (bits & BIT_APPROVED) {
        s_approved = true;
        led.set(0, 255, 0);
        signal_emit(SIGNAL_USER_PRESENCE_COMPLETED);
        vTaskDelay(pdMS_TO_TICKS(200));
        led.set(0, 0, 0);
        return true;
    }

    led.set(200, 0, 0);
    signal_emit(cancel_button ? SIGNAL_USER_PRESENCE_CANCELLED
                              : SIGNAL_USER_PRESENCE_TIMEOUT);
    vTaskDelay(pdMS_TO_TICKS(200));
    led.set(0, 0, 0);
    return false;
}

/* -----------------------------------------------------------------------
 * u2f_presence_cancel
 *
 * Called by ctap_hid_transport.c on CTAPHID_CANCEL.
 * Unblocks u2f_presence_wait() immediately via BIT_CANCELLED.
 * ----------------------------------------------------------------------- */
void u2f_presence_cancel(void) {
    cancel_button = true;
    s_pending     = false;
    if (s_eg != NULL) {
        xEventGroupSetBits(s_eg, BIT_CANCELLED);
    }
}
