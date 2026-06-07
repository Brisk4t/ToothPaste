#ifndef HWUI_H
#define HWUI_H
#include "hwUI.h"
#include "esp_log.h"
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>

static const char* TAG = "HWUI";


// Button handling code for one-button interface
// Credit: Jeff Saltzman
// https://forum.arduino.cc/t/adding-a-double-click-case-statement/283504/3

// Button timing variables
static int debounce = 10;          // ms debounce period to prevent flickering when pressing or releasing the button
static int DCgap = 280;            // max ms between clicks for a double click event
static int holdTime = 10000;       // ms hold period: how long to wait for press+hold event

// Button variables
static boolean buttonVal = HIGH;   // value read from button
static boolean buttonLast = HIGH;  // buffered value of the button's previous state
static boolean DCwaiting = false;  // whether we're waiting for a double click (down)
static boolean DConUp = false;     // whether to register a double click on next release, or whether to wait and click
static boolean singleOK = true;    // whether it's OK to do a single click
static long downTime = -1;         // time the button was pressed down
static long upTime = -1;           // time the button was released
static boolean ignoreUp = false;   // whether to ignore the button release because the click+hold was triggered
static boolean waitForUp = false;       // when held, whether to wait for the up event
static boolean holdEventPast = false;   // whether or not the hold event happened already

// Registered callbacks indexed by ButtonEvent enum value
static constexpr int NUM_EVENTS = 3;
static ButtonCallback s_callbacks[NUM_EVENTS];

void registerButtonCallback(ButtonEvent event, ButtonCallback cb) {
    s_callbacks[static_cast<int>(event)] = std::move(cb);
}

// Polls the button state machine; returns event id (1=single, 2=hold, 3=double-click) or 0
static int pollButton() {
    int event = 0;
    buttonVal = digitalRead(buttonPin);

    // Button pressed
    if (buttonVal == LOW && buttonLast == HIGH && (millis() - upTime) > debounce){ // If the button was pressed and the last state was released{
        downTime = millis(); // Button pressed down duration
        ignoreUp = false; // Reset ignoreUp flag
        waitForUp = false; // Reset waitForUp flag
        singleOK = true; // Allow single click events
        holdEventPast = false;

        // Is the next event the second click of a double click?
        if ((millis()-upTime) < DCgap && DConUp == false && DCwaiting == true)
            DConUp = true;
        else
            DConUp = false;

    DCwaiting = false; // The double click timer has elapsed, so reset the waiting state
    }

   // Button released
   else if (buttonVal == HIGH && buttonLast == LOW && (millis() - downTime) > debounce)
   {
       if (not ignoreUp)
       {
           upTime = millis();
           if (DConUp == false) DCwaiting = true;
       }
   }

   // Test for normal click event: DCgap expired
   if ( buttonVal == HIGH && (millis()-upTime) >= DCgap && DCwaiting == true && DConUp == false && singleOK == true && event != 2)
   {
       event = 1; // event 1 is a single click
       DCwaiting = false;
   }

   // Button hold
   if (buttonVal == LOW && (millis() - downTime) >= holdTime) {
       if (not holdEventPast)
       {
           event = 2; // event 2 is a hold
           waitForUp = true;
           ignoreUp = true;
           DConUp = false;
           DCwaiting = false;
           holdEventPast = true;
       }

   }
   buttonLast = buttonVal;
   return event;
}

// Invokes the registered callback for the given raw event id, if any
static void dispatchEvent(int rawEvent) {
    int idx = rawEvent - 1;
    if (idx >= 0 && idx < NUM_EVENTS && s_callbacks[idx]) {
        s_callbacks[idx]();
    }
}

void hwUIBegin() {
    xTaskCreate(hwUITask, "hwUI", 8192, nullptr, 5, nullptr);
}

void hwUITask(void* arg) {
    pinMode(buttonPin, INPUT_PULLUP); // Set button pin as input with pull-up resistor
    while (true) {
        int event = pollButton();
        if (event > 0) {
            dispatchEvent(event);
        }
        vTaskDelay(10 / portTICK_PERIOD_MS);
    }
}

#endif // HWUI_H
