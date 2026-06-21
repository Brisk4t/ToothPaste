#include "u2f_presence.h"
#include "picokeys.h"
#include "signal.h"
#include "hwUI.h"
#include "NeoPixelRMT.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"

static const char *TAG = "u2f_presence";

#define BIT_APPROVED   (EventBits_t)(1u << 0)
#define BIT_CANCELLED  (EventBits_t)(1u << 1)

static EventGroupHandle_t s_eg       = NULL;
static volatile bool      s_pending  = false;
static volatile bool      s_approved = false;
static volatile bool      s_latched  = false;   /* press seen since arming */
static uint32_t           s_deadline = 0;        /* board_millis() deadline */

/* Per-poll slice (ms): how long u2f_presence_check() waits for a press
 * before returning "not yet". Kept short so each host poll (Windows
 * re-polls U2F MSG every ~130 ms) gets a prompt SW_CONDITIONS_NOT_SATISFIED. */
#define PRESENCE_SLICE_MS  50u

/* Exported – read by ctap_hid_transport.c on CTAPHID_CANCEL */
bool cancel_button = false;

static uint32_t presence_millis(void) {
    return (uint32_t)(esp_timer_get_time() / 1000ULL);
}

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
            /* Latch the press so a button tap landing between two host
             * polls (when no task is blocked on the event group) is still
             * reported on the next u2f_presence_check() call. */
            s_latched = true;
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
    s_latched     = false;
    cancel_button = false;

    /* Clear any stale bits left from a previous operation */
    xEventGroupClearBits(s_eg, BIT_APPROVED | BIT_CANCELLED);

    /* Borrow the LED with a blink; blinkStart() snapshots the device-state
     * color and blinkEnd() restores it. */
    led.blinkStart(500, 0, 200, 200);

    signal_user_presence_request_data_t req_data = { timeout_ms };
    signal_emit_param(SIGNAL_USER_PRESENCE_REQUEST, &req_data);

    EventBits_t bits = xEventGroupWaitBits(
        s_eg,
        BIT_APPROVED | BIT_CANCELLED,
        pdTRUE,   /* clear bits on exit */
        pdFALSE,  /* return on any single bit */
        pdMS_TO_TICKS(timeout_ms));

    if (bits & BIT_APPROVED) {
        s_approved = true;
        led.set(0, 255, 0);   /* stops the blink and flashes green */
        signal_emit(SIGNAL_USER_PRESENCE_COMPLETED);
        vTaskDelay(pdMS_TO_TICKS(200));
        led.blinkEnd();       /* restores the device-state color */
        s_pending = false;
        return true;
    }

    led.set(200, 0, 0);       /* red flash */
    signal_emit(cancel_button ? SIGNAL_USER_PRESENCE_CANCELLED
                              : SIGNAL_USER_PRESENCE_TIMEOUT);
    vTaskDelay(pdMS_TO_TICKS(200));
    led.blinkEnd();           /* restores the device-state color */
    s_pending = false;
    return false;
}

/* -----------------------------------------------------------------------
 * u2f_presence_check  – per-poll, non-blocking presence for CTAP1/U2F.
 *
 * Mirrors pico-keys wait_button_pressed(): returns 0 on press, 1 when not
 * pressed yet (caller answers SW_CONDITIONS_NOT_SATISFIED and the host
 * re-polls), 2 on cancel.  The worker re-enters this once per host poll,
 * so each poll resolves within PRESENCE_SLICE_MS instead of holding the
 * channel for the whole timeout.
 * ----------------------------------------------------------------------- */
int u2f_presence_check(uint32_t timeout_ms) {
    if (s_eg == NULL) {
        ESP_LOGE(TAG, "called before u2f_presence_init");
        return 1;
    }

    /* First poll of a new operation: arm the request once. s_pending stays
     * true across subsequent polls, so the LED keeps blinking and a latched
     * press is preserved between calls. */
    if (!s_pending) {
        s_pending     = true;
        s_approved    = false;
        s_latched     = false;
        cancel_button = false;
        s_deadline    = presence_millis() + timeout_ms;
        xEventGroupClearBits(s_eg, BIT_APPROVED | BIT_CANCELLED);
        /* Borrow the LED with a blink; blinkStart() snapshots the
         * device-state color and blinkEnd() restores it. */
        led.blinkStart(500, 0, 200, 200);
        signal_user_presence_request_data_t req_data = { timeout_ms };
        signal_emit_param(SIGNAL_USER_PRESENCE_REQUEST, &req_data);
    }

    /* Wait a short slice for a press (also catches a press latched between
     * polls via s_latched). */
    EventBits_t bits = xEventGroupWaitBits(
        s_eg,
        BIT_APPROVED | BIT_CANCELLED,
        pdTRUE,   /* clear bits on exit */
        pdFALSE,  /* return on any single bit */
        pdMS_TO_TICKS(PRESENCE_SLICE_MS));

    if (bits & BIT_CANCELLED) {
        led.set(200, 0, 0);   /* stops the blink and flashes red */
        signal_emit(SIGNAL_USER_PRESENCE_CANCELLED);
        vTaskDelay(pdMS_TO_TICKS(200));
        led.blinkEnd();       /* restores the device-state color */
        s_pending = false;
        s_latched = false;
        return 2;
    }

    if ((bits & BIT_APPROVED) || s_latched) {
        s_approved = true;
        led.set(0, 255, 0);   /* stops the blink and flashes green */
        signal_emit(SIGNAL_USER_PRESENCE_COMPLETED);
        vTaskDelay(pdMS_TO_TICKS(200));
        led.blinkEnd();       /* restores the device-state color */
        s_pending = false;
        s_latched = false;
        return 0;
    }

    /* Overall deadline reached without a press: disarm so the LED stops and
     * a fresh operation can re-arm. Still answer "not yet" — the host stops
     * polling on its own. */
    if ((int32_t)(presence_millis() - s_deadline) >= 0) {
        signal_emit(SIGNAL_USER_PRESENCE_TIMEOUT);
        led.blinkEnd();       /* restores the device-state color */
        s_pending = false;
        s_latched = false;
    }

    return 1;   /* not pressed yet */
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
