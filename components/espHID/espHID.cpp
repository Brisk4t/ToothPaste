#include <espHID.h>

#include "tinyusb.h"
#include "tudconfig.cpp"
#include "IDFHID.h"
#include "IDFHIDKeyboard.h"
#include "IDFHIDMouse.h"
#include "IDFHIDConsumerControl.h"
#include "IDFHIDSystemControl.h"
#include "SerialDebug.h"

// TODO: ESP_LOGI("HID", "Interface 1 report complete"); this string gets stuck reports only on interface 0


// Needed to enable CDC if defined
#if ARDUINO_USB_CDC_ON_BOOT
    #include <USBCDC.h>
    USBCDC USBSerial; 
#endif

// RTOS Queue for HID reports
#define MAX_QUEUE_STRING_LEN 256

typedef struct {
  char data[MAX_QUEUE_STRING_LEN];
  uint8_t length;
} QueueStringItem;

QueueHandle_t reportQueue = xQueueCreate(18, sizeof(QueueStringItem)); // Queue to manage HID inputs

// RTOS Task flags
bool mouseJiggleEnabled = false;
bool keyboardStarted = false;

// Task handle for jiggle task (NULL when not running)
TaskHandle_t jiggleTaskHandle = nullptr;
TaskHandle_t keyboardTaskHandle = nullptr;

// HID Instances
IDFHIDKeyboard keyboard0(0); // Boot Keyboard
IDFHIDMouse mouse(1); // Boot Mouse
IDFHIDConsumerControl control(2); // Consumer Control

void hidSetup()
{ 
  tudsetup(); // Configure TinyUSB
  keyboard0.begin(); // This creates the keyboard ascii layout instance, probably not the best way to handle it???
  startKeyboardTask(); // Start the RTOS keyboard task
}

// Send a string with a delay between each character (crude implementation of alternative polling rates since ESPHID doesn't expose this)
size_t sendStringSlow(const char *str, int delayms) {
  size_t sentCount = 0;

  for (size_t i = 0; str[i] != '\0'; i++) {
    char ch = str[i];

    keyboard0.print(ch);  // Send single character
    //keyboard1.print(ch);  // Send single character

    vTaskDelay(pdMS_TO_TICKS(delayms)); // Delay between characters
    sentCount++;
    keyboard0.releaseAll(); // Release all keys to avoid sticky keys
  }

  return sentCount;
}

// Queue a string to be sent via HID
void sendString(const char *str, bool slowMode)
{
  QueueStringItem item;
  strncpy(item.data, str, MAX_QUEUE_STRING_LEN - 1);
  item.data[MAX_QUEUE_STRING_LEN - 1] = '\0';
  xQueueSend(reportQueue, &item, 0);
}

// Queue a string with specified length
void sendString(const char *str, uint8_t stringLen, bool slowMode)
{
  QueueStringItem item;
  size_t copyLen = stringLen;
  memcpy(item.data, str, copyLen);
  item.data[copyLen] = '\0';
  xQueueSend(reportQueue, &item, 0);
}

// Print a toothpaste_KeyboardPacket's message
void sendString(toothpaste_KeyboardPacket& packet, bool slowMode)
{
  sendString(packet.message, packet.length, slowMode);
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

void sendKeycode(uint8_t* encodedKeys, bool slowMode, bool autoRelease) {
    keyboard0.sendKeycode(encodedKeys, 6);
    //keyboard1.sendKeycode(encodedKeys, 6);
    if(slowMode){
      vTaskDelay(pdMS_TO_TICKS(SLOWMODE_DELAY_MS));
    }

    keyboard0.releaseAll();

}

// Move the mouse by dx and dy, with optional left/right click states
void moveMouse(int32_t x, int32_t y, int32_t LClick, int32_t RClick, int32_t wheel){
  
  //Click before moving if the click is in the same report
  if(!(mouse.isPressed(MOUSE_LEFT)) && LClick == 1){
    mouse.press(MOUSE_LEFT);
    
  }
  if(!(mouse.isPressed(MOUSE_RIGHT)) && RClick == 1){
    mouse.press(MOUSE_RIGHT);
  }
  
  // vTaskDelay(pdMS_TO_TICKS(5));
  //smoothMoveMouse(x, y, 20, 5); // Move the mouse by dx and dy over 20 steps and SLOWMODE_DELAY_MS ms between each step
  mouse.move(x, y, wheel, 0);
  // vTaskDelay(pdMS_TO_TICKS(5));

  // Release after moving the mouse
  if (mouse.isPressed(MOUSE_LEFT) && LClick == 2) {
      mouse.release(MOUSE_LEFT);
  }
  
  if (mouse.isPressed(MOUSE_RIGHT) && RClick == 2) {
      mouse.release(MOUSE_RIGHT);
  }
}

// Press a consumer control key
void consumerControlPress(uint16_t key){
  control.press(key);
  vTaskDelay(pdMS_TO_TICKS(10));
  control.release();

}

// Press a consumer control key
void consumerControlPress(toothpaste_ConsumerControlPacket& controlPacket){
  for (size_t i = 0; i < controlPacket.length; i++) {
    consumerControlPress(controlPacket.code[i]);
  }
  vTaskDelay(pdMS_TO_TICKS(10));
  control.release();

}

// Unpack a mouse packet from a byte array and move the mouse accordingly
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
        moveMouse(x, y, 0, 0, 0);
    }

    // Left/right click states come after the frames
    int32_t* clicks = ints + numFrames * 2;
    int32_t LClick = clicks[0];
    int32_t RClick = clicks[1];

    // Handle Click
    //DEBUG_SERIAL_PRINTF("LClick: %d, RClick: %d\n", LClick, RClick);
    moveMouse(0, 0, LClick, RClick, 0); 
}

// Unpack a toothpacket_MousePacket and move the mouse accordingly
void moveMouse(toothpaste_MousePacket& mousePacket) {
    // Move mouse for each frame
    for(uint8_t i = 0; i < mousePacket.num_frames; i++){
        int32_t x = mousePacket.frames[i].x;
        int32_t y = mousePacket.frames[i].y;
        moveMouse(x, y, 0, 0, 0);
    }

    // Left/right click states come after the frames
    int32_t LClick = mousePacket.l_click;
    int32_t RClick = mousePacket.r_click;

    // Handle Click
    //DEBUG_SERIAL_PRINTF("LClick: %d, RClick: %d\n", LClick, RClick);
    moveMouse(0, 0, LClick, RClick, mousePacket.wheel); 
}


// Simple mouse jiggle function to prevent screen sleep
void jiggleMouse(){

  // Use CPU timer ticks for efficient pseudo-random values (no malloc/heavy RNG overhead)
  uint64_t ticks = esp_timer_get_time();
  
  // Generate random offsets from timer ticks: range -3 to 3
  int32_t x = (int32_t)((ticks % 7) - 3);
  int32_t y = (int32_t)(((ticks >> 16) % 7) - 3);
  
  moveMouse(x, y, 0, 0, 0);
  vTaskDelay(pdMS_TO_TICKS(1000));
  moveMouse(-x, -y, 0, 0, 0);
  vTaskDelay(pdMS_TO_TICKS(1000));
}

// ##################### RTOS Tasks + Helpers #################### //

void keyboardTask(void* params)
{
  QueueStringItem item;
  
  while (keyboardStarted) {
    if(xQueueReceive(reportQueue, &item, portMAX_DELAY) == pdTRUE){
      sendStringSlow(item.data, SLOWMODE_DELAY_MS);
    }
  }
  // Task exits gracefully when flag is set to false
  vTaskDelete(NULL);  // Delete self
}

// Start the persistent keyboard queue task
void startKeyboardTask()
{
  if (keyboardTaskHandle == nullptr) {
    keyboardStarted = true;  // Set flag before creating task
    xTaskCreatePinnedToCore(
      keyboardTask,
      "KeyboardWorker",
      8096,
      nullptr,
      1,
      &keyboardTaskHandle,
      1
    );
  }
}

// Persistent RTOS task for mouse jiggle
void jiggleTask(void* params)
{
  while (mouseJiggleEnabled) {
    jiggleMouse();
  }
  // Task exits gracefully when flag is set to false
  vTaskDelete(NULL);  // Delete self
}

// Start the jiggle task
void startJiggle()
{
  if (jiggleTaskHandle == nullptr) {
    mouseJiggleEnabled = true;  // Set flag before creating task
    xTaskCreatePinnedToCore(
      jiggleTask,
      "JiggleWorker",
      3072,
      nullptr,
      1,
      &jiggleTaskHandle,
      1
    );
  }
}

// Stop the jiggle task (graceful shutdown)
void stopJiggle()
{
  if (jiggleTaskHandle != nullptr) {
    mouseJiggleEnabled = false;  // Signal task to exit
    // Task will delete itself when it sees the flag is false
    jiggleTaskHandle = nullptr;
  }
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
// TODO: Actually use this callback to manage report sending state, for now this blocks forever if the host is not ready


// void tud_hid_report_complete_cb(uint8_t instance, uint8_t const *report, uint16_t len) {
//   DEBUG_SERIAL_PRINTLN("Report complete callback entered");
//   switch(instance){
//     case 0:
//       // keyboard0.unlock();
//       ESP_LOGI("HID", "Interface 0 report complete");
//       break;

//     case 1:
//       // keyboard0.unlock();
//       ESP_LOGI("HID", "Interface 1 report complete");
//       break;

//     case 2:
//       // control.unlock();
//       ESP_LOGI("HID", "Interface 2 report complete");
//       break;

//     default:
//       break;
//   }
// }
