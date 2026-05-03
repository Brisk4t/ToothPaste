idf_component_register(
    SRCS
        "main.cpp"
        "log_config.cpp"
    INCLUDE_DIRS "${CMAKE_CURRENT_LIST_DIR}"
    REQUIRES espHID ble hwUI rgbRMT SecureSession stateManager arduino-esp32 tinyusb
)