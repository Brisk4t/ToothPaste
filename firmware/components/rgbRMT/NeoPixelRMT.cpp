#include <NeoPixelRMT.h>

NeoPixelRMT led(RGB_LED_PIN); // Create a NeoPixelRMT instance with the default pin
NeoPixelRMT::NeoPixelRMT(gpio_num_t pin) : dataPin(pin) {}

// Initialize the RMT RGB led driver for the specified pin
void NeoPixelRMT::begin() {
  if (!rmtInit(RGB_LED_PIN, RMT_TX_MODE, RMT_MEM_NUM_BLOCKS_1, 10000000)) {
    Serial.println("init sender failed\n");
  }
}

// Set the color of the LED using r,g,b values without calling show()
void NeoPixelRMT::setColor(uint8_t r, uint8_t g, uint8_t b) {
    uint8_t color[3] = {g, r, b}; // GRB order
    int idx = 0;
    for (int col = 0; col < 3; col++) {
        for (int bit = 0; bit < 8; bit++) {
            bool bitVal = color[col] & (1 << (7 - bit));
            led_data[idx].level0 = 1;
            led_data[idx].duration0 = bitVal ? 8 : 4;
            led_data[idx].level1 = 0;
            led_data[idx].duration1 = bitVal ? 4 : 8;
            idx++;
        }
    }
}

// Set the color of the LED using struct without calling show()
void NeoPixelRMT::setColor(const RGB& color) {
    setColor(color.r, color.g, color.b);
}

// Write LED data to RMT
void NeoPixelRMT::show() {
    //if (rmt) {
          rmtWrite(RGB_LED_PIN, led_data, 24, RMT_WAIT_FOR_EVER);
    //}
}


// Set the color of the LED using r,g,b values and call show()
void NeoPixelRMT::set(uint8_t r, uint8_t g, uint8_t b){
    // A solid color request ends any active blink and becomes the logical
    // current color (so it can be snapshotted/restored later).
    blinking = false;
    curR = r; curG = g; curB = b;
    setColor(r, g, b);
    show();
}

// Set the color of the LED and call show() using RGB struct
void NeoPixelRMT::set(const RGB& color) {
    set(color.r, color.g, color.b);
}

// Internal: configure and start a blink without taking a snapshot.
void NeoPixelRMT::startBlink(int intervalMs, uint8_t r, uint8_t g, uint8_t b) {
    blinkInterval = intervalMs;
    blinkR = r;
    blinkG = g;
    blinkB = b;
    lastToggle = millis();
    ledOn = false;
    blinking = true;
    // Start with LED off without touching the logical solid color.
    setColor(0, 0, 0);
    show();
}

// Start blinking with r,g,b values. Snapshots the current persistent state
// first, so blinkEnd() can restore it.
void NeoPixelRMT::blinkStart(int intervalMs, uint8_t r, uint8_t g, uint8_t b) {
    saveState();
    startBlink(intervalMs, r, g, b);
}

// Start blinking with defined RGB color
void NeoPixelRMT::blinkStart(int intervalMs, const RGB& color) {
    blinkStart(intervalMs, color.r, color.g, color.b);
}

// Stop blinking and restore the state captured at blinkStart().
void NeoPixelRMT::blinkEnd() {
    blinking = false;
    restoreState();
}

// Update the blink state using millis()
void NeoPixelRMT::blinkUpdate() {
    if (!blinking) return;

    unsigned long now = millis();
    if (now - lastToggle >= (unsigned long)blinkInterval) {
        lastToggle = now;
        ledOn = !ledOn;
        // Push frames straight to the hardware; do not disturb the logical
        // solid color tracked by set().
        if (ledOn) {
            setColor(blinkR, blinkG, blinkB);
        } else {
            setColor(0, 0, 0);
        }
        show();
    }
}

// Snapshot the current persistent state (blink or solid color).
void NeoPixelRMT::saveState() {
    savedBlinking = blinking;
    if (blinking) {
        savedInterval = (int)blinkInterval;
        savedR = blinkR; savedG = blinkG; savedB = blinkB;
    } else {
        savedR = curR; savedG = curG; savedB = curB;
    }
    savedValid = true;
}

// Reapply the snapshot taken by saveState(). Uses startBlink() (not the
// public blinkStart) so a restore never overwrites the saved snapshot. If
// nothing was ever saved, leave the LED as-is for the caller to drive.
void NeoPixelRMT::restoreState() {
    if (!savedValid) {
        return;
    }
    if (savedBlinking) {
        startBlink(savedInterval, savedR, savedG, savedB);
    } else {
        set(savedR, savedG, savedB);
    }
}