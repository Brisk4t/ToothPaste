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
#include "IDFHIDSystemControl.h"

static const uint8_t report_descriptor[] = {TUD_HID_REPORT_DESC_SYSTEM_CONTROL(HID_REPORT_ID(HID_REPORT_ID_SYSTEM_CONTROL))};

IDFHIDSystemControl::IDFHIDSystemControl(uint8_t itf) : hid(itf) {
  static bool initialized = false;
}

void IDFHIDSystemControl::begin() {
  hid.begin();
}

void IDFHIDSystemControl::end() {}

bool IDFHIDSystemControl::send(uint8_t value) {
  return hid.SendReport(HID_REPORT_ID_SYSTEM_CONTROL, &value, 1);
}

size_t IDFHIDSystemControl::press(uint8_t k) {
  if (k > 3) {
    return 0;
  }
  return send(k);
}

size_t IDFHIDSystemControl::release() {
  return send(0);
}

bool IDFHIDSystemControl::lock(){
  return hid.lock();
}

bool IDFHIDSystemControl::unlock(){
  return hid.unlock();
}
