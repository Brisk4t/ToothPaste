// Log build mode — uncomment exactly one, then save and rebuild (only this file recompiles):
#define LOG_BUILD_DEBUG
// #define LOG_BUILD_TESTING
// #define LOG_BUILD_PROD

#include "log_config.h"
#include "esp_log.h"

void configure_log_levels()
{
#if defined(LOG_BUILD_DEBUG)
    // Full verbosity: crypto material, packet contents, session secrets, everything.
    esp_log_level_set("*",            ESP_LOG_VERBOSE);
    esp_log_level_set("MAIN",         ESP_LOG_VERBOSE);
    esp_log_level_set("BLE",          ESP_LOG_VERBOSE);
    esp_log_level_set("BLE_AUTH",     ESP_LOG_VERBOSE);
    esp_log_level_set("BLE_TASK",     ESP_LOG_VERBOSE);
    esp_log_level_set("SESSION",      ESP_LOG_VERBOSE);
    esp_log_level_set("HWUI",         ESP_LOG_VERBOSE);
    esp_log_level_set("STATE",        ESP_LOG_VERBOSE);
    esp_log_level_set("hid_keyboard", ESP_LOG_VERBOSE);

#elif defined(LOG_BUILD_TESTING)
    // Non-sensitive components at INFO: packet metadata, state transitions, BLE events.
    // SESSION and BLE_AUTH suppressed to ERROR: they log AES keys, shared secrets, and raw key bytes at LOGD.
    esp_log_level_set("*",            ESP_LOG_INFO);
    esp_log_level_set("MAIN",         ESP_LOG_INFO);
    esp_log_level_set("BLE",          ESP_LOG_INFO);
    esp_log_level_set("BLE_TASK",     ESP_LOG_INFO);
    esp_log_level_set("HWUI",         ESP_LOG_INFO);
    esp_log_level_set("STATE",        ESP_LOG_INFO);
    esp_log_level_set("hid_keyboard", ESP_LOG_INFO);
    esp_log_level_set("SESSION",      ESP_LOG_ERROR);
    esp_log_level_set("BLE_AUTH",     ESP_LOG_ERROR);

#elif defined(LOG_BUILD_PROD)
    // Errors only across the board.
    esp_log_level_set("*",            ESP_LOG_ERROR);
    esp_log_level_set("MAIN",         ESP_LOG_ERROR);
    esp_log_level_set("BLE",          ESP_LOG_ERROR);
    esp_log_level_set("BLE_AUTH",     ESP_LOG_ERROR);
    esp_log_level_set("BLE_TASK",     ESP_LOG_ERROR);
    esp_log_level_set("SESSION",      ESP_LOG_ERROR);
    esp_log_level_set("HWUI",         ESP_LOG_ERROR);
    esp_log_level_set("STATE",        ESP_LOG_ERROR);
    esp_log_level_set("hid_keyboard", ESP_LOG_ERROR);
#endif
}
