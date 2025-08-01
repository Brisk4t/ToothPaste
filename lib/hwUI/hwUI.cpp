#ifndef HWUI_H
#define HWUI_H
#include "hwUI.h"

// https://forum.arduino.cc/t/adding-a-double-click-case-statement/283504/3

// Button timing variables
int debounce = 10;          // ms debounce period to prevent flickering when pressing or releasing the button
int DCgap = 280;            // max ms between clicks for a double click event
int holdTime = 10000;        // ms hold period: how long to wait for press+hold event

// Button variables
boolean buttonVal = HIGH;   // value read from button
boolean buttonLast = HIGH;  // buffered value of the button's previous state
boolean DCwaiting = false;  // whether we're waiting for a double click (down)
boolean DConUp = false;     // whether to register a double click on next release, or whether to wait and click
boolean singleOK = true;    // whether it's OK to do a single click
long downTime = -1;         // time the button was pressed down
long upTime = -1;           // time the button was released
boolean ignoreUp = false;   // whether to ignore the button release because the click+hold was triggered
boolean waitForUp = false;        // when held, whether to wait for the up event
boolean holdEventPast = false;    // whether or not the hold event happened already


void buttonSetup(){
    pinMode(buttonPin, INPUT_PULLUP); // Set button pin as input with pull-up resistor
}

int checkButton() {   
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

void buttonPressHandler(){
    // Handle button press event
    DEBUG_SERIAL_PRINTLN("Button pressed!");
}

void buttonHoldHandler(){
    // Handle button hold event
    DEBUG_SERIAL_PRINTLN("Button held!");

    //enterPairingMode(); // Enter pairing mode when button is held
}

#endif // HWUI_H