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

void moveMouse(int32_t x, int32_t y, bool LClick, bool RClick){
  
  // Click before moving if the click is in the same report
  if(LClick){
    mouse.press(MOUSE_LEFT);
  }

  if(RClick){
    mouse.press(MOUSE_RIGHT);
  }
  

  smoothMoveMouse(x, y, 20, 5); // Move the mouse by dx and dy over 20 steps and SLOWMODE_DELAY_MS ms between each step

  // Release after moving the mouse
  if (mouse.isPressed(MOUSE_LEFT)) {
      mouse.release(MOUSE_LEFT);
  }
  
  if (mouse.isPressed(MOUSE_RIGHT)) {
      mouse.release(MOUSE_RIGHT);
  }
  
}

void moveMouse(uint8_t* mousePacket){ // mousePacket is an array of int32_t values sent over a uint8_t stream
  int32_t* ints = reinterpret_cast<int32_t*>(mousePacket); // Safely cast uint8_t* to uint32_t*
  moveMouse(ints[0], ints[1], ints[2], ints[3]);
}

// Smooth the mouse movement between its current position and dx dy
void smoothMoveMouse(int dx, int dy, int steps, int interval) {
  float stepX = (float)dx / steps;
  float stepY = (float)dy / steps;
  
  float accumulatedX = 0;
  float accumulatedY = 0;

  for (int i = 0; i < steps; i++) {
    accumulatedX += stepX;
    accumulatedY += stepY;

    // Convert accumulated float deltas to int and move only if non-zero
    int moveX = round(accumulatedX);
    int moveY = round(accumulatedY);

    if (moveX != 0 || moveY != 0) {
      mouse.move(moveX, moveY);
      accumulatedX -= moveX;
      accumulatedY -= moveY;
    }

    delay(SLOWMODE_DELAY_MS);
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