// Copyright 2015-2020 Espressif Systems (Shanghai) PTE LTD
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.



#include "IDFHID.h"
#define USB_HID_DEVICES_MAX 10

namespace idfusb { 
typedef struct {
  IDFHIDDevice *device;
  uint8_t reports_num;
  uint8_t *report_ids;
} tinyusb_hid_device_t;


static SemaphoreHandle_t tinyusb_hid_device_input_sem = NULL;
static SemaphoreHandle_t tinyusb_hid_device_input_mutex = NULL;

static bool tinyusb_hid_is_initialized = false;
static hid_interface_protocol_enum_t tinyusb_interface_protocol = HID_ITF_PROTOCOL_NONE;
#if ARDUHAL_LOG_LEVEL >= ARDUHAL_LOG_LEVEL_DEBUG
static const char *tinyusb_hid_device_report_types[4] = {"INVALID", "INPUT", "OUTPUT", "FEATURE"};
#endif

IDFHID::IDFHID(uint8_t itf) {
  this->itf = itf;

  //Temp setting for BOOT keyboard
  if(itf == 0){
    tinyusb_interface_protocol = HID_ITF_PROTOCOL_KEYBOARD;
  }
}


void IDFHID::begin() {
  if (tinyusb_hid_device_input_sem == NULL) {
    tinyusb_hid_device_input_sem = xSemaphoreCreateBinary();
  }
  if (tinyusb_hid_device_input_mutex == NULL) {
    tinyusb_hid_device_input_mutex = xSemaphoreCreateMutex();
  }
}

void IDFHID::end() {
  if (tinyusb_hid_device_input_sem != NULL) {
    vSemaphoreDelete(tinyusb_hid_device_input_sem);
    tinyusb_hid_device_input_sem = NULL;
  }
  if (tinyusb_hid_device_input_mutex != NULL) {
    vSemaphoreDelete(tinyusb_hid_device_input_mutex);
    tinyusb_hid_device_input_mutex = NULL;
  }
}

bool IDFHID::ready() {
  return tud_hid_n_ready(itf);
}

// Callback triggered by TinyUSB once the HOST consumes the current report
void tud_hid_report_complete_cb(uint8_t instance, uint8_t const *report, size_t len) {
  if (tinyusb_hid_device_input_sem) {
    xSemaphoreGive(tinyusb_hid_device_input_sem);
  }
}

bool IDFHID::SendReport(uint8_t id, const void *data, size_t len, uint32_t timeout_ms) {  
  // If we're configured to support boot protocol, and the host has requested boot protocol, prevent
  // sending of report ID, by passing report ID of 0 to tud_hid_n_report().
  uint8_t effective_id = ((tinyusb_interface_protocol != HID_ITF_PROTOCOL_NONE) && (tud_hid_n_get_protocol(itf) == HID_PROTOCOL_BOOT)) ? 0 : id;
  printf("Effective ID: %d %d\n\r", effective_id, itf);
  // This does not guarantee that the HOST is ready to poll the device again
  while (!ready()) { // If the TinyUSB queue is ready to accept more reports 
        tud_task();
        vTaskDelay(pdMS_TO_TICKS(1));
  }
  return tud_hid_n_report(itf, 0, data, len);

}
};