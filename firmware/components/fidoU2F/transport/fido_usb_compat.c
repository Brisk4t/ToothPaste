#include "fido_usb_compat.h"
#include "fido_u2f.h"
#include "esp_log.h"

static const char *TAG = "fido_compat";

QueueHandle_t hid_to_ctap_q     = NULL;
QueueHandle_t ctap_to_hid_q     = NULL;
uint16_t      finished_data_size = 0;

static TaskHandle_t _ctap_task = NULL;

/* Forward declarations – implemented in ctap_hid_transport.c */
extern void hid_init(void);
extern void hid_task(void);

/* -----------------------------------------------------------------------
 * HID poll task – calls hid_task() every millisecond.
 * hid_task() checks ctap_to_hid_q and flushes the TX buffer.
 * ----------------------------------------------------------------------- */
static void fido_hid_poll_task(void *arg) {
    (void)arg;
    for (;;) {
        hid_task();
        vTaskDelay(pdMS_TO_TICKS(1));
    }
}

void fido_u2f_init(void) {
    hid_to_ctap_q = xQueueCreate(8, sizeof(uint32_t));
    ctap_to_hid_q = xQueueCreate(8, sizeof(uint32_t));
    configASSERT(hid_to_ctap_q);
    configASSERT(ctap_to_hid_q);

    hid_init();

    BaseType_t ret = xTaskCreate(fido_hid_poll_task, "fido_hid", 4096, NULL,
                                 tskIDLE_PRIORITY + 2, NULL);
    if (ret != pdPASS) {
        ESP_LOGE(TAG, "Failed to create fido_hid poll task");
    }
}

/* -----------------------------------------------------------------------
 * CTAP task lifecycle
 * ----------------------------------------------------------------------- */

void ctap_task_start(uint8_t itf, void *(*thread)(void *)) {
    (void)itf;
    if (_ctap_task != NULL) {
        return;
    }
    BaseType_t ret = xTaskCreate((TaskFunction_t)thread, "ctap_task", 8192,
                                 NULL, tskIDLE_PRIORITY + 2, &_ctap_task);
    if (ret != pdPASS) {
        ESP_LOGE(TAG, "Failed to create ctap_task");
        _ctap_task = NULL;
    }
}

void ctap_task_reset(void) {
    if (_ctap_task == NULL) {
        return;
    }
    uint32_t ev = EV_EXIT;
    xQueueSend(hid_to_ctap_q, &ev, pdMS_TO_TICKS(200));
    /* ctap_task calls vTaskDelete(NULL) on EV_EXIT.
     * Clear the handle so ctap_task_start recreates it next session. */
    _ctap_task = NULL;

    /* Drain leftover responses so the next session starts clean */
    uint32_t dummy;
    while (xQueueReceive(ctap_to_hid_q, &dummy, 0) == pdTRUE) {}
}

int ctap_task_poll(uint8_t itf) {
    (void)itf;
    uint32_t flag = 0;
    while (xQueueReceive(ctap_to_hid_q, &flag, 0) == pdTRUE) {
        if (flag == EV_EXEC_FINISHED) {
            return PICOKEYS_OK;
        }
    }
    return PICOKEYS_ERR_BLOCKED;
}

/* -----------------------------------------------------------------------
 * Event dispatch
 * ----------------------------------------------------------------------- */

void usb_send_event(uint32_t event) {
    xQueueSend(hid_to_ctap_q, &event, portMAX_DELAY);
}

void timeout_stop(void) { /* stub – deferred */ }

void usb_set_timeout_counter(uint8_t itf, uint32_t ms) {
    (void)itf; (void)ms; /* stub – deferred */
}

uint32_t board_millis(void) {
    return (uint32_t)(esp_timer_get_time() / 1000ULL);
}
