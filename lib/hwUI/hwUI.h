#pragma once

#include <Arduino.h>

#define buttonPin 0 // use the boot button on most esp32 boards




void buttonSetup();
int checkButton();

void buttonPressHandler();
void buttonHoldHandler();