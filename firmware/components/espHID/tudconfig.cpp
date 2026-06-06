#include "tinyusb.h"
#include "class/hid/hid_device.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "fido_u2f.h"

// FIDO U2F is a "HID device" but it doesn't use the standard HID report descriptor, so we need to define our own total length
// The other option is i start going through the tinyusb code but ughhh
#define TOOTHPASTE_USER_HID_DEVICES (CFG_TUD_HID-1)
#define TUSB_DESC_TOTAL_LEN      (TUD_CONFIG_DESC_LEN + (TOOTHPASTE_USER_HID_DEVICES * TUD_HID_DESC_LEN) + TUD_HID_INOUT_DESC_LEN)

static const char *TAG = "hid_keyboard";




uint8_t const desc_boot_keyboard[] =
{
  TUD_HID_REPORT_DESC_KEYBOARD()
};

uint8_t const desc_boot_mouse[] =
{
    //TUD_HID_REPORT_DESC_KEYBOARD( HID_REPORT_ID(1         )),
    TUD_HID_REPORT_DESC_MOUSE   (),
};

uint8_t const desc_consumerControl[] =
{
    //TUD_HID_REPORT_DESC_KEYBOARD( HID_REPORT_ID(1         )),
      TUD_HID_REPORT_DESC_CONSUMER(),
};

uint8_t const desc_systemControl[] =
{
    //TUD_HID_REPORT_DESC_KEYBOARD( HID_REPORT_ID(1         )),
      TUD_HID_REPORT_DESC_SYSTEM_CONTROL(),
};

uint8_t const desc_fido_u2f[] =
{
  //TUD_HID_REPORT_DESC_KEYBOARD( HID_REPORT_ID(1         )),
  TUD_HID_REPORT_DESC_FIDO_U2F(CFG_TUD_HID_EP_BUFSIZE),
};




const char *hid_string_descriptor[8] = {
    // array of pointer to string descriptors
    (char[]){0x09, 0x04},     // 0: is supported language is English (0x0409)
    "Brisk4t",                // 1: Manufacturer
    "ToothPaste Receiver",    // 2: Product
    "8008135",                // 3: Serials, should use chip ID
    "ToothPaste Boot Keyboard",   // 4: HID
    "ToothPaste Boot Mouse",      // 5: HID
    "ToothPaste Generic Input",   // 6: HID
    "ToothPaste FIDO U2F",        // 7: HID
};

tusb_desc_device_t const desc_device =
{
    .bLength            = sizeof(tusb_desc_device_t),
    .bDescriptorType    = TUSB_DESC_DEVICE,
    .bcdUSB             = 0x0200,
    .bDeviceClass       = 0xEF,
    .bDeviceSubClass    = 0x02,
    .bDeviceProtocol    = 0x01,
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
    // Interface count: 3 HID (IN only) + 1 HID INOUT (FIDO U2F) = 4
    TUD_CONFIG_DESCRIPTOR(1, 4, 0, TUSB_DESC_TOTAL_LEN, TUSB_DESC_CONFIG_ATT_REMOTE_WAKEUP, 500),

    // Interface number, string index, boot protocol (none/boot keyboard/boot mouse), report descriptor len, EP In address, size & polling interval
    TUD_HID_DESCRIPTOR(0, 4, HID_ITF_PROTOCOL_KEYBOARD, sizeof(desc_boot_keyboard), 0x81, 64, 1),
    TUD_HID_DESCRIPTOR(1, 5, HID_ITF_PROTOCOL_MOUSE, sizeof(desc_boot_mouse), 0x82, 64, 1),
    TUD_HID_DESCRIPTOR(2, 6, HID_ITF_PROTOCOL_NONE, sizeof(desc_consumerControl), 0x83, 64, 1),

    TUD_HID_INOUT_DESCRIPTOR(3, 7, HID_ITF_PROTOCOL_NONE, sizeof(desc_fido_u2f), 0x04, 0x84, 64, 1),
    //TUD_HID_DESCRIPTOR(3, 6, HID_ITF_PROTOCOL_NONE, sizeof(desc_systemControl), 0x84, 64, 1),
};

// Send a test keyboard string without the keyboard library
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

uint16_t tud_hid_get_report_cb(uint8_t instance, uint8_t report_id,
                                hid_report_type_t report_type,
                                uint8_t *buffer, uint16_t reqlen)
{
    if (instance == FIDO_TUD_ITF) {
        return ctap_hid_get_report(instance, report_id, report_type, buffer, reqlen);
    }
    //memset(buffer, 0, reqlen);
    return 0;
}

void tud_hid_set_report_cb(uint8_t instance, uint8_t report_id,
                            hid_report_type_t report_type,
                            uint8_t const *buffer, uint16_t bufsize)
{
    if (instance == FIDO_TUD_ITF) {
        ctap_hid_set_report(instance, report_id, report_type, buffer, bufsize);
    }
    /* keyboard/mouse/consumer SET_REPORT not used – ignore */
}

void tud_hid_report_complete_cb(uint8_t instance,
                                 uint8_t const *report, uint16_t len)
{
    if (instance == FIDO_TUD_ITF) {
        ctap_hid_report_complete(instance, report, len);
    }
}

uint8_t const * tud_hid_descriptor_report_cb(uint8_t itf)
{
  if (itf == 0)
  {
    return desc_boot_keyboard;
  }
  else if (itf == 1)
  {
    return desc_boot_mouse;
  }
  else if (itf == 2)
  {
    return desc_consumerControl;
  }
  else if (itf == 3)
  {
    return desc_fido_u2f;
  }

  return NULL;
}



