#include <espHID.h>

#include "tinyusb.h"
#include "tudconfig.cpp"
#include "IDFHID.h"
#include "IDFHIDKeyboard.h"
#include "IDFHIDMouse.h"
#include "IDFHIDConsumerControl.h"
#include "IDFHIDSystemControl.h"
#include "SerialDebug.h"

// Needed to enable CDC if defined
#if ARDUINO_USB_CDC_ON_BOOT
    #include <USBCDC.h>
    USBCDC USBSerial; 
#endif

int syscount = 1;
bool mouseJiggleEnabled = false;


// Task handle for jiggle task (NULL when not running)
TaskHandle_t jiggleTaskHandle = nullptr;

IDFHIDKeyboard keyboard0(0); // Boot Keyboard
IDFHIDMouse mouse(1);
IDFHIDConsumerControl control(2);
//IDFHIDSystemControl syscontrol(3);

void hidSetup()
{ 
  tudsetup();
  

  // if(ARDUINO_USB_CDC_ON_BOOT) USBSerial.begin(); 
  keyboard0.begin();
  //keyboard1.begin();
  // mouse.begin();
  // control.begin();
  // syscontrol.begin();
}

// Send a string with a delay between each character (crude implementation of alternative polling rates since ESPHID doesn't expose this)
size_t sendStringSlow(const char *str, int delayms) {
  size_t sentCount = 0;

  for (size_t i = 0; str[i] != '\0'; i++) {
    char ch = str[i];

    keyboard0.print(ch);  // Send single character
    //keyboard1.print(ch);  // Send single character
    sentCount++;

    delay(delayms);  // Blocking delay between characters
    keyboard0.releaseAll(); // Release all keys to avoid sticky keys
  }

  return sentCount;
}

// Send a string - slowMode is enabled by default
void sendString(const char *str, bool slowMode)
{
  if(!slowMode){
    keyboard0.print(str);
    //keyboard1.print(str);
  }
  else
    sendStringSlow(str, SLOWMODE_DELAY_MS);
}

// Cast a pointer to a string pointer and send the string 
void sendString(void *arg, bool slowMode)
{
  const char *str = static_cast<const char *>(arg);
  sendString(str, slowMode);
}

void stringTest(){
  sendTestString();
}

// Press all the keys in the array together and release them after 50ms (max 6)
// void sendKeycode(uint8_t* keys, bool slowMode) {
//     for(int i=0; i<6; i++){
//       keyboard0.press(keys[i]);
//       // vTaskDelay(pdMS_TO_TICKS(5));
//       //keyboard1.press(keys[i]);
//     }
//     // vTaskDelay(pdMS_TO_TICKS(5));
//     keyboard0.releaseAll();
//     //keyboard1.releaseAll();
// }

void sendKeycode(uint8_t* encodedKeys, bool slowMode) {
    keyboard0.sendKeycode(encodedKeys, 6);
    //keyboard1.sendKeycode(encodedKeys, 6);
    if(slowMode){
      vTaskDelay(pdMS_TO_TICKS(SLOWMODE_DELAY_MS));
    }
}

void moveMouse(int32_t x, int32_t y, int32_t LClick, int32_t RClick){
  
  //Click before moving if the click is in the same report
  if(!(mouse.isPressed(MOUSE_LEFT)) && LClick == 1){
    mouse.press(MOUSE_LEFT);
    
  }
  if(!(mouse.isPressed(MOUSE_RIGHT)) && RClick == 1){
    mouse.press(MOUSE_RIGHT);
  }
  
  // vTaskDelay(pdMS_TO_TICKS(5));
  //smoothMoveMouse(x, y, 20, 5); // Move the mouse by dx and dy over 20 steps and SLOWMODE_DELAY_MS ms between each step
  mouse.move(x, y);
  // vTaskDelay(pdMS_TO_TICKS(5));

  // Release after moving the mouse
  if (mouse.isPressed(MOUSE_LEFT) && LClick == 2) {
      mouse.release(MOUSE_LEFT);
  }
  
  if (mouse.isPressed(MOUSE_RIGHT) && RClick == 2) {
      mouse.release(MOUSE_RIGHT);
  }
  
  // vTaskDelay(pdMS_TO_TICKS(5));
}

// Press a consumer control key
void consumerControlPress(uint16_t key){
  control.press(key);
  vTaskDelay(pdMS_TO_TICKS(10));
  consumerControlRelease();

}

// Press a consumer control key
void consumerControlPress(toothpaste_ConsumerControlPacket& controlPacket){
  for (size_t i = 0; i < controlPacket.length; i++) {
    consumerControlPress(controlPacket.code[i]);
  }
  vTaskDelay(pdMS_TO_TICKS(10));
  consumerControlRelease();

}

// Release all consumer control keys
void consumerControlRelease(){
  control.release();
}

void genericInput(){
  //syscontrol.press(syscount++);
}


void moveMouse(uint8_t* mousePacket) {
    if(!mousePacket) return;

    // First byte = numFrames
    uint8_t numFrames = std::min(mousePacket[0], uint8_t(10));

    // int32 frames start at offset 4 (because of JS padding)
    int32_t* ints = reinterpret_cast<int32_t*>(mousePacket + 3);

    // Move mouse for each frame
    for(uint8_t i = 0; i < numFrames; i++){
        int32_t x = ints[i*2];
        int32_t y = ints[i*2 + 1];
        moveMouse(x, y, 0, 0);
    }

    // Left/right click states come after the frames
    int32_t* clicks = ints + numFrames * 2;
    int32_t LClick = clicks[0];
    int32_t RClick = clicks[1];

    // Handle Click
    //DEBUG_SERIAL_PRINTF("LClick: %d, RClick: %d\n", LClick, RClick);
    moveMouse(0, 0, LClick, RClick); 
}

void moveMouse(toothpaste_MousePacket& mousePacket) {
    // Move mouse for each frame
    for(uint8_t i = 0; i < mousePacket.num_frames; i++){
        int32_t x = mousePacket.frames[i].x;
        int32_t y = mousePacket.frames[i].y;
        moveMouse(x, y, 0, 0);
    }

    // Left/right click states come after the frames
    int32_t LClick = mousePacket.l_click;
    int32_t RClick = mousePacket.r_click;

    // Handle Click
    //DEBUG_SERIAL_PRINTF("LClick: %d, RClick: %d\n", LClick, RClick);
    moveMouse(0, 0, LClick, RClick); 
}



// Persistent RTOS task for mouse jiggle
void jiggleTask(void* params)
{
  while (true) {
    jiggleMouse();
  }
  // Task is deleted externally via vTaskDelete()
}

// Start the jiggle task
void startJiggle()
{
  if (jiggleTaskHandle == nullptr) {
    xTaskCreatePinnedToCore(
      jiggleTask,
      "JiggleWorker",
      1024,
      nullptr,
      1,
      &jiggleTaskHandle,
      1
    );
  }
}

// Stop the jiggle task
void stopJiggle()
{
  if (jiggleTaskHandle != nullptr) {
    vTaskDelete(jiggleTaskHandle);
    jiggleTaskHandle = nullptr;
  }
}

// Simple mouse jiggle function to prevent screen sleep
void jiggleMouse(){
  
  // Use CPU timer ticks for efficient pseudo-random values (no malloc/heavy RNG overhead)
  uint64_t ticks = esp_timer_get_time();
  
  // Generate random offsets from timer ticks: range -3 to 3
  int32_t x = (int32_t)((ticks % 7) - 3);
  int32_t y = (int32_t)(((ticks >> 16) % 7) - 3);
  
  moveMouse(x, y, 0, 0);
  vTaskDelay(pdMS_TO_TICKS(50));
  moveMouse(-x, -y, 0, 0);
  vTaskDelay(pdMS_TO_TICKS(50));
}

// ##################### Delay Functions #################### //
// Timer callback must match `void (*)(void *)`
void sendStringCallback(void *arg)
{
  const char *str = static_cast<const char *>(arg);
  sendString(str, true);
}

// Delayed send function to wait before sending a string
void sendStringDelay(void *arg, int delayms){
  esp_timer_create_args_t timer_args = {
      .callback = &sendStringCallback,
      .arg = arg,
      .dispatch_method = ESP_TIMER_TASK,
      .name = "delayedFn"
    };
    esp_timer_handle_t oneShotTimer;
    esp_timer_create(&timer_args, &oneShotTimer);
    esp_timer_start_once(oneShotTimer, delayms*1000); // Delay uses ms
}

//------------------------TINYUSB Callbacks------------------------------//

// Callback triggered by TinyUSB once the HOST consumes the current report
void tud_hid_report_complete_cb(uint8_t instance, uint8_t const *report, size_t len) {
  DEBUG_SERIAL_PRINTLN("Report complete callback entered");
  switch(instance){
    case 0:
      keyboard0.unlock();
      break;

    case 1:
      mouse.unlock();
      break;

    case 2:
      control.unlock();
      break;

    default:
      break;
  }
}
