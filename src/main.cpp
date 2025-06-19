//Framework libraries
#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ClipBoard libraries
#include "SecureSession.h"
#include "espHID.h"
#include "main.h"
#include "ble.h"

SecureSession sec;


void setup() {
  hidSetup();
  bleSetup();

  led.begin();
  led.setColor(10,10,10);
  led.show();


  uint8_t pubKey[SecureSession::PUBKEY_SIZE];
  size_t pubLen;

  // Initialize the secure session
  // sec.init();
  
  // int ret = sec.generateKeypair(pubKey, pubLen); // Generate the public key on setup
  // if (!ret) {
  //   //led.blink(5000, 3, 30,30,30); // blink 3 times
  //   size_t olen = 0;
  //   char base64pubKey[50];
  //   mbedtls_base64_encode((unsigned char *)base64pubKey, sizeof(base64pubKey), &olen, pubKey, SecureSession::PUBKEY_SIZE); // turn the 
  //   base64pubKey[olen] = '\0';  // Null-terminate
    
  //   //delay(5000);
  //   //sendString(base64pubKey);
    
  //   led.set(0, 30, 50);
  // }
  
  // else{
  //   char retchar[12];
  //   snprintf(retchar, 12, "%d", ret);  

  //   sendString("Something went wrong: ");
  //   sendString(retchar);
  //   led.setColor(255, 0,0);  // Red
  //   led.show();
  // }
  //Serial.println("Waiting a client connection to notify...");
}

void loop() {
  led.blinkUpdate();

  // notify changed value
  if (deviceConnected) {
    //inputCharacteristic->setValue(String(value).c_str());
    inputCharacteristic->notify();
    delay(300); // bluetooth stack will go into congestion, if too many packets are sent, in 6 hours test i was able to go as low as 3ms
  }

  // disconnecting  
  if (!deviceConnected && oldDeviceConnected) {
    led.blinkStart(1000,10,0,10);

    Serial.println("Device disconnected.");
    bluServer->startAdvertising(); // restart advertising
    Serial.println("Start advertising");
    oldDeviceConnected = deviceConnected;
  }

  // connecting
  if (deviceConnected && !oldDeviceConnected) {
    // do stuff here on connecting
    led.blinkStart(1000,10,10,0); // Device connected

    oldDeviceConnected = deviceConnected;
    Serial.println("Device Connected");
  }
}
