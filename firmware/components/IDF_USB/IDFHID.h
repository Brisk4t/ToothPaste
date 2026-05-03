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

#pragma once

#include "tinyusb.h"
#include "class/hid/hid_device.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"


// Used by the included TinyUSB drivers
enum {
  HID_REPORT_ID_NONE,
  HID_REPORT_ID_KEYBOARD,
  HID_REPORT_ID_MOUSE,
  HID_REPORT_ID_GAMEPAD,
  HID_REPORT_ID_CONSUMER_CONTROL,
  HID_REPORT_ID_SYSTEM_CONTROL,
  HID_REPORT_ID_VENDOR
};

typedef struct {
  uint8_t instance;
  union {
    struct {
      uint8_t protocol;
    } set_protocol;
    struct {
      uint8_t idle_rate;
    } set_idle;
  };
} arduino_usb_hid_event_data_t;

// Base class for all HID device types.
// Provides USB transport (begin/end/lock/unlock/SendReport) and virtual hooks
// for TinyUSB descriptor and feature callbacks. Subclass and override as needed.
class IDFHID {
public:
  IDFHID(uint8_t itf = 0);
  void begin(void);
  void end(void);
  bool lock();
  bool unlock();
  bool ready(void);
  bool SendReport(uint8_t report_id, const void *data, size_t len, uint32_t timeout_ms = 100);

  virtual uint16_t _onGetDescriptor(uint8_t *buffer) { return 0; }
  virtual uint16_t _onGetFeature(uint8_t report_id, uint8_t *buffer, uint16_t len) { return 0; }
  virtual void _onSetFeature(uint8_t report_id, const uint8_t *buffer, uint16_t len) {}
  virtual void _onOutput(uint8_t report_id, const uint8_t *buffer, uint16_t len) {}

protected:
  uint8_t itf;

private:
  static SemaphoreHandle_t tinyusb_hid_device_input_sem;
};

// Legacy pure-virtual interface retained for USBHIDGamepad and USBHIDVendor which
// have not yet been migrated to inherit IDFHID directly.
class IDFHIDDevice {
public:
  virtual uint16_t _onGetDescriptor(uint8_t *buffer) { return 0; }
  virtual uint16_t _onGetFeature(uint8_t report_id, uint8_t *buffer, uint16_t len) { return 0; }
  virtual void _onSetFeature(uint8_t report_id, const uint8_t *buffer, uint16_t len) {}
  virtual void _onOutput(uint8_t report_id, const uint8_t *buffer, uint16_t len) {}
};