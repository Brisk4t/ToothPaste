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
#include "IDFHIDConsumerControl.h"

static const uint8_t report_descriptor[] = {TUD_HID_REPORT_DESC_CONSUMER(HID_REPORT_ID(HID_REPORT_ID_CONSUMER_CONTROL))};

IDFHIDConsumerControl::IDFHIDConsumerControl(uint8_t itf) : hid(itf) {
  static bool initialized = false;
  if (!initialized) {
    // initialized = true;
    // hid.addDevice(this, sizeof(report_descriptor));
  }
}

// uint16_t IDFHIDConsumerControl::_onGetDescriptor(uint8_t *dst) {
//   memcpy(dst, report_descriptor, sizeof(report_descriptor));
//   return sizeof(report_descriptor);
// }

void IDFHIDConsumerControl::begin() {
  hid.begin();
}

void IDFHIDConsumerControl::end() {}

bool IDFHIDConsumerControl::send(uint16_t value) {
  return hid.SendReport(HID_REPORT_ID_CONSUMER_CONTROL, &value, 2);
}

size_t IDFHIDConsumerControl::press(uint16_t k) {
  return send(k);
}

size_t IDFHIDConsumerControl::release() {
  return send(0);
}

bool IDFHIDConsumerControl::lock(){
  return hid.lock();
}

bool IDFHIDConsumerControl::unlock(){
  return hid.unlock();
}
