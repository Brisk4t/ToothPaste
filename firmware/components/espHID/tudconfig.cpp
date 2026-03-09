#include "tinyusb.h"
#include "class/hid/hid_device.h"
#include "class/cdc/cdc.h"
#include "class/cdc/cdc_device.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"


// ESP32-S3 DWC2 has ep_in_count=5 (EP0-EP4 IN only). Full TUD_CDC_DESCRIPTOR needs EP4 IN
// for notification + EP5 IN for data — EP5 IN does not exist on this hardware. The custom
// CDC descriptor below omits the optional interrupt notification endpoint, using EP4 IN + EP4 OUT
// for data only. 8+9+5+5+4+5+9+7+7 = 59 bytes.
#define CDC_NO_NOTIF_DESC_LEN    59u
#define TUSB_DESC_TOTAL_LEN      (TUD_CONFIG_DESC_LEN + CFG_TUD_HID * TUD_HID_DESC_LEN + CDC_NO_NOTIF_DESC_LEN)

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

// uint8_t const desc_serialDevice[] =
// {
//     //TUD_HID_REPORT_DESC_KEYBOARD( HID_REPORT_ID(1         )),
//       TUD_CDC_DESCRIPTOR(),
// };


const char *hid_string_descriptor[8] = {
    // array of pointer to string descriptors
    (char[]){0x09, 0x04},     // 0: is supported language is English (0x0409)
    "Brisk4t",                // 1: Manufacturer
    "ToothPaste Receiver",    // 2: Product
    "8008135",                // 3: Serials, should use chip ID
    "ToothPaste Boot Keyboard",   // 4: HID
    "ToothPaste Boot Mouse",      // 5: HID
    "ToothPaste Generic Input",   // 6: HID
    "ToothPaste Serial",          // 7: CDC
};

tusb_desc_device_t const desc_device =
{
    .bLength            = sizeof(tusb_desc_device_t),
    .bDescriptorType    = TUSB_DESC_DEVICE,
    .bcdUSB             = 0x0200,
    .bDeviceClass       = 0xEF, // Miscellaneous Device Class (required for IAD composite)
    .bDeviceSubClass    = 0x02, // Common Class
    .bDeviceProtocol    = 0x01, // Interface Association Descriptor
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
    // Interface count: 3 HID + 2 CDC (control + data) = 5
    TUD_CONFIG_DESCRIPTOR(1, 5, 0, TUSB_DESC_TOTAL_LEN, TUSB_DESC_CONFIG_ATT_REMOTE_WAKEUP, 500),

    // Interface number, string index, boot protocol (none/boot keyboard/boot mouse), report descriptor len, EP In address, size & polling interval
    TUD_HID_DESCRIPTOR(0, 4, HID_ITF_PROTOCOL_KEYBOARD, sizeof(desc_boot_keyboard), 0x81, 64, 1),
    TUD_HID_DESCRIPTOR(1, 5, HID_ITF_PROTOCOL_MOUSE, sizeof(desc_boot_mouse), 0x82, 64, 1),
    TUD_HID_DESCRIPTOR(2, 6, HID_ITF_PROTOCOL_NONE, sizeof(desc_consumerControl), 0x83, 64, 1),

    // CDC ACM: interfaces 3 (control, no notify EP) + 4 (data)
    // Custom descriptor without interrupt notification endpoint — saves EP4 IN for bulk data;
    // data in = 0x84 (EP4 IN), data out = 0x04 (EP4 OUT).

    // IAD: 8 bytes
    0x08, TUSB_DESC_INTERFACE_ASSOCIATION, 0x03, 0x02,
        TUSB_CLASS_CDC, CDC_COMM_SUBCLASS_ABSTRACT_CONTROL_MODEL, CDC_COMM_PROTOCOL_NONE, 0x00,

    // CDC Communication Interface: 9 bytes, bNumEndpoints=0 (no notify EP)
    0x09, TUSB_DESC_INTERFACE, 0x03, 0x00, 0x00,
        TUSB_CLASS_CDC, CDC_COMM_SUBCLASS_ABSTRACT_CONTROL_MODEL, CDC_COMM_PROTOCOL_NONE, 0x07,

    // CDC Header Functional Descriptor: 5 bytes
    0x05, TUSB_DESC_CS_INTERFACE, CDC_FUNC_DESC_HEADER, U16_TO_U8S_LE(0x0120),

    // CDC Call Management Functional Descriptor: 5 bytes
    0x05, TUSB_DESC_CS_INTERFACE, CDC_FUNC_DESC_CALL_MANAGEMENT, 0x00, 0x04,

    // CDC ACM Functional Descriptor: 4 bytes
    0x04, TUSB_DESC_CS_INTERFACE, CDC_FUNC_DESC_ABSTRACT_CONTROL_MANAGEMENT, 0x02,

    // CDC Union Functional Descriptor: 5 bytes
    0x05, TUSB_DESC_CS_INTERFACE, CDC_FUNC_DESC_UNION, 0x03, 0x04,

    // CDC Data Interface: 9 bytes, bNumEndpoints=2
    0x09, TUSB_DESC_INTERFACE, 0x04, 0x00, 0x02, TUSB_CLASS_CDC_DATA, 0x00, 0x00, 0x00,

    // Bulk OUT EP4 (0x04): 7 bytes
    0x07, TUSB_DESC_ENDPOINT, 0x04, TUSB_XFER_BULK, U16_TO_U8S_LE(64), 0x00,

    // Bulk IN EP4 (0x84): 7 bytes
    0x07, TUSB_DESC_ENDPOINT, 0x84, TUSB_XFER_BULK, U16_TO_U8S_LE(64), 0x00,
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
  // else if (itf == 3)
  // {
  //   return desc_systemControl;
  // }

  return NULL;
}

// Invoked when received SET_REPORT control request or
// received data on OUT endpoint ( Report ID = 0, Type = 0 )
void tud_hid_set_report_cb(uint8_t instance, uint8_t report_id, hid_report_type_t report_type, uint8_t const *buffer, uint16_t bufsize)
{
}

// ##################### CDC Serial Endpoint #################### //

// Function pointer registered by ble.cpp to forward received serial data over BLE
static void (*s_cdcRxCallback)(const char*, size_t) = nullptr;

void setCDCRxCallback(void (*callback)(const char*, size_t)) {
    s_cdcRxCallback = callback;
}

// Invoked by TinyUSB when the CDC OUT endpoint receives data from the host.
// Reads all available data in a loop and forwards each chunk to the registered callback.
void tud_cdc_rx_cb(uint8_t itf) {
    // notifyDebugString caps at 149 bytes; use the same limit here
    constexpr size_t BUF_SIZE = 149;
    uint8_t buf[BUF_SIZE];
    uint32_t count;

    while ((count = tud_cdc_n_read(itf, buf, BUF_SIZE)) > 0) {
        if (s_cdcRxCallback != nullptr) {
            s_cdcRxCallback((const char*)buf, (size_t)count);
        }
    }
}
