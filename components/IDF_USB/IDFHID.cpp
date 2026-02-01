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

typedef struct {
  IDFHIDDevice *device;
  uint8_t reports_num;
  uint8_t *report_ids;
} tinyusb_hid_device_t;

SemaphoreHandle_t IDFHID::tinyusb_hid_device_input_sem = nullptr;
bool tinyusb_hid_is_initialized = false;
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

bool IDFHID::lock(){
  while(!ready() && (xSemaphoreTake(tinyusb_hid_device_input_sem, pdMS_TO_TICKS(5) != pdTRUE))){
    tud_task();
  }
  return true;
}

bool IDFHID::unlock(){
  return xSemaphoreGive(tinyusb_hid_device_input_sem);
}

void IDFHID::begin() {
  if (tinyusb_hid_device_input_sem == NULL) {
    tinyusb_hid_device_input_sem = xSemaphoreCreateBinary();
  }
}

void IDFHID::end() {
  if (tinyusb_hid_device_input_sem != NULL) {
    vSemaphoreDelete(tinyusb_hid_device_input_sem);
    tinyusb_hid_device_input_sem = NULL;
  }
}

bool IDFHID::ready() {
  return tud_hid_n_ready(itf);
}


bool IDFHID::SendReport(uint8_t id, const void *data, size_t len, uint32_t timeout_ms) {  
  // If we're configured to support boot protocol, and the host has requested boot protocol, prevent
  // sending of report ID, by passing report ID of 0 to tud_hid_n_report().
  lock(); // Lock the semaphore until notified of report completion
  uint8_t effective_id = ((tinyusb_interface_protocol != HID_ITF_PROTOCOL_NONE) && (tud_hid_n_get_protocol(itf) == HID_PROTOCOL_BOOT)) ? 0 : id;
  printf("Effective ID: %d %d\n\r", effective_id, itf);
  // DEBUG_SERIAL_PRINTF("Time sending queued keyboard character: %lld us\n", esp_timer_get_time());

  return tud_hid_n_report(itf, 0, data, len);

}