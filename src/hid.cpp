#include <hid.h>

Adafruit_USBD_HID keyboard;
const uint8_t asciiToKeycode[128][2] = {HID_ASCII_TO_KEYCODE};
const uint8_t desc_hid_report[] = {TUD_HID_REPORT_DESC_KEYBOARD()};
KeyReport _keyReport;

void hidSetup(){
  // Manual begin() is required on core without built-in support e.g. mbed rp2040
  Serial.println("Starting TinyUSB Device...");
  TinyUSBDevice.begin(0);

  keyboard.setBootProtocol(HID_ITF_PROTOCOL_KEYBOARD);
  keyboard.setPollInterval(0);
  keyboard.setReportDescriptor(desc_hid_report, sizeof(desc_hid_report));
  keyboard.setStringDescriptor("ClipBoard Keyboard");

  // Initialize HID keyboard
  if (!keyboard.begin()) {
    Serial.println("Failed to start HID keyboard");
    while (1);
  }

  
  // If already enumerated, additional class driverr begin() e.g msc, hid, midi won't take effect until re-enumeration
  if (TinyUSBDevice.mounted()) {
    TinyUSBDevice.detach();
    delay(10);
    TinyUSBDevice.attach();
  }

}

size_t press(uint8_t k)
{
	uint8_t i;

	if (k >= 136) {			// it's a non-printing key (not a modifier)
		k = k - 136;
	} 
  
  else if (k >= 128) {	// it's a modifier key
		_keyReport.modifiers |= (1<<(k-128));
		k = 0;
	} 
  
  else {				// it's a printing key
		k = pgm_read_byte(KeyboardLayout_en_US + k);
		if (!k) {
			//setWriteError();
			return 0;
		}
		if ((k & ALT_GR) == ALT_GR) {
			_keyReport.modifiers |= 0x40;   // AltGr = right Alt
			k &= 0x3F;
		} else if ((k & KEYBOARD_MODIFIER_LEFTSHIFT) == KEYBOARD_MODIFIER_LEFTSHIFT) {
			_keyReport.modifiers |= 0x02;	// the left shift modifier
			k &= 0x7F;
		}
		if (k == ISO_REPLACEMENT) {
			k = ISO_KEY;
		}
	}

	// Add k to the key report only if it's not already present
	// and if there is an empty slot.
	if (_keyReport.keys[0] != k && _keyReport.keys[1] != k &&
		_keyReport.keys[2] != k && _keyReport.keys[3] != k &&
		_keyReport.keys[4] != k && _keyReport.keys[5] != k) {

		for (i=0; i<6; i++) {
			if (_keyReport.keys[i] == 0x00) {
				_keyReport.keys[i] = k;
				break;
			}
		}
		if (i == 6) {
			//setWriteError();
			return 0;
		}
	}
	keyboard.sendReport(2, &_keyReport, sizeof(_keyReport));
	return 1;
}


size_t release(uint8_t k)
{
	uint8_t i;
	if (k >= 136) {			// it's a non-printing key (not a modifier)
		k = k - 136;
	} 
  
  else if (k >= 128) {	// it's a modifier key
		_keyReport.modifiers &= ~(1<<(k-128));
		k = 0;
	} 
  
  else {				// it's a printing key
		k = pgm_read_byte(KeyboardLayout_en_US + k);
		if (!k) {
			return 0;
		}
		if ((k & ALT_GR) == ALT_GR) {
			_keyReport.modifiers &= ~(0x40);   // AltGr = right Alt
			k &= 0x3F;
		} else if ((k & SHIFT) == SHIFT) {
			_keyReport.modifiers &= ~(0x02);	// the left shift modifier
			k &= 0x7F;
		}
		if (k == ISO_REPLACEMENT) {
			k = ISO_KEY;
		}
	}

	// Test the key report to see if k is present.  Clear it if it exists.
	// Check all positions in case the key is present more than once (which it shouldn't be)
	for (i=0; i<6; i++) {
		if (0 != k && _keyReport.keys[i] == k) {
			_keyReport.keys[i] = 0x00;
		}
	}

	keyboard.sendReport(2, &_keyReport, sizeof(_keyReport));
	return 1;
}



void sendKey(char character, uint8_t* keycode, uint8_t modifier) {

  while (!keyboard.ready()) delay(1);
  
  //keyboard.keyboardReport(0, modifier, keycode); // key press
  keyboard.keyboardPress(0, character);
  delay(6);

  keyboard.keyboardRelease(0); // key release
  delay(20);
}

void sendString(const char* str) {
    while (*str) { // until we hit a null pointer, iterate over each char in a string 

        uint8_t ascii = (uint8_t)(*str);
        uint8_t modifier = 0;
        uint8_t keycode[6]  = {0};

        if ( asciiToKeycode[ascii][0] ) 
          modifier = KEYBOARD_MODIFIER_LEFTSHIFT;

        keycode[0] = asciiToKeycode[ascii][1];

        sendKey(ascii ,keycode, modifier);
        str++;
    }
}


void viewString(const char* str) {
    while (*str) {

        uint8_t ascii = (uint8_t)(*str);
        uint8_t modifier = 0;
        uint8_t keycode[6]  = {0};
        
        Serial.printf("Ascii: %c", char(ascii));

        if ( asciiToKeycode[ascii][0] ) 
          modifier = KEYBOARD_MODIFIER_LEFTSHIFT;

        keycode[0] = asciiToKeycode[ascii][1];

        Serial.print("Keycode: ");
        for (int i = 0; i < 6; i++) {
            Serial.print("0x");
            if (keycode[i] < 0x10) Serial.print("0");  // leading zero
            Serial.print(keycode[i], HEX);
            Serial.print(" ");
        }

        Serial.printf("Modifier: %d", modifier);
        str++;
    }
}
