#include <espHID.h>
#include <USB.h>

USBHIDKeyboard keyboard;

// Start the hid keyboard
void hidSetup()
{
  keyboard.begin();
  USB.begin();
}


// Send a string with a delay
size_t sendStringSlow(const char *str, bool slowMode)
{
  size_t size = strlen(str);

  size_t n = 0;
  while (size--)
  {
    if (*str != '\r')
    {
      if (keyboard.write(*str))
      {
        n++;
      }
      else
      {
        break;
      }
    }
    size--;
    delay(slowMode);
  }
  return n;
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

// Timer callback must match `void (*)(void *)`
void sendStringCallback(void *arg)
{
  const char *str = static_cast<const char *>(arg);
  sendString(str, false);  // Or true if you want slowMode
}

void sendString(void *arg, bool slowMode, int delay){
  esp_timer_create_args_t timer_args = {
      .callback = &sendStringCallback,
      .arg = arg,
      .dispatch_method = ESP_TIMER_TASK,
      .name = "delayedFn"
    };
    esp_timer_handle_t oneShotTimer;
    esp_timer_create(&timer_args, &oneShotTimer);
    esp_timer_start_once(oneShotTimer, delay*1000); // 5 seconds
}