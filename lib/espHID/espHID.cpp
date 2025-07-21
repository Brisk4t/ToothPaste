#include <espHID.h>
#include <USB.h>

USBHIDKeyboard keyboard;
USBHIDMouse mouse;
USBHIDConsumerControl control;
USBHIDSystemControl syscontrol;

// Start the hid keyboard
void hidSetup()
{
  keyboard.begin();
  mouse.begin();
  control.begin();
  syscontrol.begin();
  USB.begin();
}

// Send a string with a delay between each character (crude implementation of alternative polling rates since ESPHID doesn't expose this)
size_t sendStringSlow(const char *str, int delayms) {
  size_t sentCount = 0;

  for (size_t i = 0; str[i] != '\0'; i++) {
    char ch = str[i];

    keyboard.print(ch);  // Send single character
    sentCount++;

    delay(delayms);  // Blocking delay between characters
  }

  return sentCount;
}

// Send a string
void sendString(const char *str, bool slowMode)
{
  if(!slowMode)
    keyboard.print(str);
    
  else
    sendStringSlow(str, SLOWMODE_DELAY_MS);
}

// Cast a pointer to a string pointer and send the string 
void sendString(void *arg, bool slowMode)
{
  const char *str = static_cast<const char *>(arg);
  sendString(str, slowMode);
}

// Press all the keys in the array together and release them after 50ms (max 6)
void sendKeycode(uint8_t* keys, bool slowMode) {
    for(int i=0; i<7; i++){
      keyboard.press(keys[i]);
    }
    delay(50); // optionally slower delay if slowMode
    keyboard.releaseAll();
}

void moveMouse(int x, int y, bool LClick, bool RClick){
  
  // Click before moving if the click is in the same report
  if(LClick){
    mouse.press(MOUSE_LEFT);
  }

  if(RClick){
    mouse.press(MOUSE_RIGHT);
  }
  
  mouse.move(x, y, 0, 0); // Move the mouse by the x and y distance

  // Release after moving the mouse
  if (mouse.isPressed(MOUSE_LEFT)) {
      mouse.release(MOUSE_LEFT);
  }
  
  if (mouse.isPressed(MOUSE_RIGHT)) {
      mouse.release(MOUSE_RIGHT);
  }
  
}

void moveMouse(int32_t* mousePacket){
  moveMouse(mousePacket[0], mousePacket[1], (bool)mousePacket[2], (bool)mousePacket[3]);
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