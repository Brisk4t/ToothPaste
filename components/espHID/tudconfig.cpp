#include "tinyusb.h"
#include "class/hid/hid_device.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"


#define TUSB_DESC_TOTAL_LEN      (TUD_CONFIG_DESC_LEN + CFG_TUD_HID * TUD_HID_DESC_LEN)

static const char *TAG = "hid_keyboard";




uint8_t const desc_hid_report1[] =
{
  TUD_HID_REPORT_DESC_KEYBOARD()
};

uint8_t const desc_hid_report2[] =
{
    //TUD_HID_REPORT_DESC_KEYBOARD( HID_REPORT_ID(1         )),
    TUD_HID_REPORT_DESC_MOUSE   (),
};


const char *hid_string_descriptor[5] = {
    // array of pointer to string descriptors
    (char[]){0x09, 0x04},  // 0: is supported language is English (0x0409)
    "Brisk4t",             // 1: Manufacturer
    "ToothPaste Receiver",      // 2: Product
    "8008135",              // 3: Serials, should use chip ID
    "Example HID interface",  // 4: HID
};

tusb_desc_device_t const desc_device =
{
    .bLength            = sizeof(tusb_desc_device_t),
    .bDescriptorType    = TUSB_DESC_DEVICE,
    .bcdUSB             = 0x0200,
    .bDeviceClass       = 0x00,
    .bDeviceSubClass    = 0x00,
    .bDeviceProtocol    = 0x00,
    .bMaxPacketSize0    = CFG_TUD_ENDPOINT0_SIZE,

    .idVendor           = 0xCafe,
    .idProduct          = 0x0001,
    .bcdDevice          = 0x0100,

    .iManufacturer      = 0x01,
    .iProduct           = 0x02,
    .iSerialNumber      = 0x03,

    .bNumConfigurations = 0x01
};

static const uint8_t hid_configuration_descriptor[] = {
    // Configuration number, interface count, string index, total length, attribute, power in mA
    TUD_CONFIG_DESCRIPTOR(1, 2, 0, TUSB_DESC_TOTAL_LEN, TUSB_DESC_CONFIG_ATT_REMOTE_WAKEUP, 500),

    // Interface number, string index, boot protocol, report descriptor len, EP In address, size & polling interval
    TUD_HID_DESCRIPTOR(0, 4, true, sizeof(desc_hid_report1), 0x81, 64, 1),
    TUD_HID_DESCRIPTOR(1, 4, true, sizeof(desc_hid_report2), 0x82, 64, 1),
};

void sendTestString()
{
    // HID keyboard interface index
    const uint8_t ITF = 0; // usually 0 for the first HID interface

    // Report ID (0 if not used)
    const uint8_t REPORT_ID = 0;

    // HID 6-key report array: [modifier, reserved, key1..key6]
    uint8_t report[8];

    // Clear report
    memset(report, 0, sizeof(report));

    // "t e s t s t r i n g"
    // Using standard HID keycodes (no modifiers for lowercase letters)
    const uint8_t keys[] = {
        HID_KEY_T, HID_KEY_E, HID_KEY_S, HID_KEY_T,
        HID_KEY_S, HID_KEY_T, HID_KEY_R, HID_KEY_I,
        HID_KEY_N, HID_KEY_G
    };

    for (size_t i = 0; i < sizeof(keys); i++)
    {
        // Wait until HID is ready
        while (!tud_hid_ready()) {
            tud_task();
            vTaskDelay(pdMS_TO_TICKS(1));
        }

        // Press key
        memset(report, 0, sizeof(report));
        report[2] = keys[i];
        tud_hid_n_report(ITF, REPORT_ID, report, sizeof(report));

        // Give the host a chance to process
        vTaskDelay(pdMS_TO_TICKS(10));

        // Release key
        memset(report, 0, sizeof(report));
        tud_hid_n_report(ITF, REPORT_ID, report, sizeof(report));

        vTaskDelay(pdMS_TO_TICKS(5));
    }
}

void tudsetup()
{ 
  //init_ascii_to_hid();
  tinyusb_config_t tusb_cfg = {};
    tusb_cfg.device_descriptor = &desc_device;
    tusb_cfg.string_descriptor = hid_string_descriptor;
    tusb_cfg.string_descriptor_count = sizeof(hid_string_descriptor) / sizeof(hid_string_descriptor[0]);
    tusb_cfg.external_phy = false;
    tusb_cfg.configuration_descriptor = hid_configuration_descriptor;

    ESP_ERROR_CHECK(tinyusb_driver_install(&tusb_cfg));
    ESP_LOGI(TAG, "USB initialization DONE");
}


/********* TinyUSB HID callbacks ***************/

// Invoked when received GET HID REPORT DESCRIPTOR request
// Application return pointer to descriptor, whose contents must exist long enough for transfer to complete
// uint8_t const * tud_descriptor_configuration_cb(uint8_t instance)
// {
//   (void) instance; // for multiple configurations
//   return hid_configuration_descriptor;
// }

// Invoked when received GET_REPORT control request
// Application must fill buffer report's content and return its length.
// Return zero will cause the stack to STALL request
uint16_t tud_hid_get_report_cb(uint8_t instance, uint8_t report_id, hid_report_type_t report_type, uint8_t *buffer, uint16_t reqlen)
{
    (void) instance;
    (void) report_id;
    (void) report_type;
    (void) buffer;
    (void) reqlen;

    return 0;
}

uint8_t const * tud_hid_descriptor_report_cb(uint8_t itf)
{
  if (itf == 0)
  {
    return desc_hid_report1;
  }
  else if (itf == 1)
  {
    return desc_hid_report2;
  }

  return NULL;
}

// Invoked when received SET_REPORT control request or
// received data on OUT endpoint ( Report ID = 0, Type = 0 )
void tud_hid_set_report_cb(uint8_t instance, uint8_t report_id, hid_report_type_t report_type, uint8_t const *buffer, uint16_t bufsize)
{
}


