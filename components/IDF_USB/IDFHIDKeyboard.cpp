/*
  Keyboard.cpp

  Copyright (c) 2015, Arduino LLC
  Original code (pre-library): Copyright (c) 2011, Peter Barrett

  This library is free software; you can redistribute it and/or
  modify it under the terms of the GNU Lesser General Public
  License as published by the Free Software Foundation; either
  version 2.1 of the License, or (at your option) any later version.

  This library is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
  Lesser General Public License for more details.

  You should have received a copy of the GNU Lesser General Public
  License along with this library; if not, write to the Free Software
  Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
*/
#include "IDFHID.h"
#include "KeyboardLayout.h"

#include "IDFHIDKeyboard.h"
namespace idfusb {

const uint8_t report_descriptor[] = {TUD_HID_REPORT_DESC_KEYBOARD(HID_REPORT_ID(HID_REPORT_ID_KEYBOARD))};

IDFHIDKeyboard::IDFHIDKeyboard(uint8_t itf) : hid(itf), _asciimap(KeyboardLayout_en_US), shiftKeyReports(false) {
  static bool initialized = false;
  if (!initialized) {
    //initialized = true;
    //memset(&_keyReport, 0, sizeof(KeyReport));
    //hid.addDevice(this, sizeof(report_descriptor));
  }
}

void IDFHIDKeyboard::begin(const uint8_t *layout) {
  _asciimap = layout;
  hid.begin();
}

void IDFHIDKeyboard::end() {}


void IDFHIDKeyboard::sendReport(KeyReport *keys) {
  hid_keyboard_report_t report;
  report.reserved = 0;
  report.modifier = keys->modifiers;
  memcpy(report.keycode, keys->keys, 6);
  hid.SendReport(HID_REPORT_ID_KEYBOARD, &report, sizeof(report));
}

void IDFHIDKeyboard::setShiftKeyReports(bool set) {
  shiftKeyReports = set;
}

size_t IDFHIDKeyboard::pressRaw(uint8_t k) {
  uint8_t i;
  if (k >= 0xE0 && k < 0xE8) {
    // it's a modifier key
    _keyReport.modifiers |= (1 << (k - 0xE0));
  } else if (k && k < 0xA5) {
    // Add k to the key report only if it's not already present
    // and if there is an empty slot.
    if (_keyReport.keys[0] != k && _keyReport.keys[1] != k && _keyReport.keys[2] != k && _keyReport.keys[3] != k && _keyReport.keys[4] != k
        && _keyReport.keys[5] != k) {

      for (i = 0; i < 6; i++) {
        if (_keyReport.keys[i] == 0x00) {
          _keyReport.keys[i] = k;
          break;
        }
      }
      if (i == 6) {
        return 0;
      }
    }
  } else if (_keyReport.modifiers == 0) {
    //not a modifier and not a key
    return 0;
  }
  sendReport(&_keyReport);
  return 1;
}

size_t IDFHIDKeyboard::releaseRaw(uint8_t k) {
  uint8_t i;
  if (k >= 0xE0 && k < 0xE8) {
    // it's a modifier key
    _keyReport.modifiers &= ~(1 << (k - 0xE0));
  } else if (k && k < 0xA5) {
    // Test the key report to see if k is present.  Clear it if it exists.
    // Check all positions in case the key is present more than once (which it shouldn't be)
    for (i = 0; i < 6; i++) {
      if (0 != k && _keyReport.keys[i] == k) {
        _keyReport.keys[i] = 0x00;
      }
    }
  }
  // Allowing for the release of a modifier key without a corresponding press
  sendReport(&_keyReport);
  return 1;
}

// press() adds the specified key (printing, non-printing, or modifier)
// to the persistent key report and sends the report.  Because of the way
// USB HID works, the host acts like the key remains pressed until we
// call release(), releaseAll(), or otherwise clear the report and resend.
size_t IDFHIDKeyboard::press(uint8_t k) {
  if (k >= 0x88) {  // it's a non-printing key (not a modifier)
    k = k - 0x88;
  } else if (k >= 0x80) {  // it's a modifier key
    _keyReport.modifiers |= (1 << (k - 0x80));
    k = 0;
  } else {  // it's a printing key (k is a ASCII 0..127)
    k = _asciimap[k];
    if (!k) {
      return 0;
    }
    if ((k & SHIFT) == SHIFT) {  // it's a capital letter or other character reached with shift
      // At boot, some PCs need a separate report with the shift key down like a real keyboard.
      if (shiftKeyReports) {
        pressRaw(HID_KEY_SHIFT_LEFT);
      } else {
        _keyReport.modifiers |= 0x02;  // the left shift modifier
      }
      k &= ~SHIFT;
    }
    if ((k & ALT_GR) == ALT_GR) {
      _keyReport.modifiers |= 0x40;  // AltGr = right Alt
      k &= ~ALT_GR;
    }
    if (k == ISO_REPLACEMENT) {
      k = ISO_KEY;
    }
  }
  return pressRaw(k);
}

// release() takes the specified key out of the persistent key report and
// sends the report.  This tells the OS the key is no longer pressed and that
// it shouldn't be repeated any more.
size_t IDFHIDKeyboard::release(uint8_t k) {
  if (k >= 0x88) {  // it's a non-printing key (not a modifier)
    k = k - 0x88;
  } else if (k >= 0x80) {  // it's a modifier key
    _keyReport.modifiers &= ~(1 << (k - 0x80));
    k = 0;
  } else {  // it's a printing key
    k = _asciimap[k];
    if (!k) {
      return 0;
    }
    if ((k & SHIFT) == SHIFT) {  // it's a capital letter or other character reached with shift
      if (shiftKeyReports) {
        releaseRaw(k & 0x7F);    // Release key without shift modifier
        k = HID_KEY_SHIFT_LEFT;  // Below, release shift modifier
      } else {
        _keyReport.modifiers &= ~(0x02);  // the left shift modifier
        k &= ~SHIFT;
      }
    }
    if ((k & ALT_GR) == ALT_GR) {
      _keyReport.modifiers &= ~(0x40);  // AltGr = right Alt
      k &= ~ALT_GR;
    }
    if (k == ISO_REPLACEMENT) {
      k = ISO_KEY;
    }
  }
  return releaseRaw(k);
}

void IDFHIDKeyboard::releaseAll(void) {
  _keyReport.keys[0] = 0;
  _keyReport.keys[1] = 0;
  _keyReport.keys[2] = 0;
  _keyReport.keys[3] = 0;
  _keyReport.keys[4] = 0;
  _keyReport.keys[5] = 0;
  _keyReport.modifiers = 0;
  sendReport(&_keyReport);
}

size_t IDFHIDKeyboard::write(uint8_t c) {
  uint8_t p = press(c);  // Keydown
  
  vTaskDelay(pdMS_TO_TICKS(5)); // Delay between reports
  
  release(c);            // Keyup
  return p;              // just return the result of press() since release() almost always returns 1
}

size_t IDFHIDKeyboard::write(const uint8_t *buffer, size_t size) {
  size_t n = 0;
  while (size--) {
    if (*buffer != '\r') {
      if (write(*buffer)) {
        n++;
      } else {
        break;
      }
    }
    buffer++;
  }
  return n;
}
};