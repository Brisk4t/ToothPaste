# Automatically register all .c and .cpp files in this component
file(GLOB_RECURSE component_sources
     "${CMAKE_CURRENT_LIST_DIR}/*.c"
     "${CMAKE_CURRENT_LIST_DIR}/*.cpp"
)

# Register the component with ESP-IDF
idf_component_register(
    SRCS ${component_sources}           # All source files found
    INCLUDE_DIRS "${CMAKE_CURRENT_LIST_DIR}" # Header search path
    REQUIRES arduino-esp32 serialDebug esp_tinyusb esp_driver_gpio IDF_USB toothPacket # Optional: list dependencies
)

# Enable CDC in the raw TinyUSB managed component without using CONFIG_TINYUSB_CDC_ENABLED,
# which would pull in the Arduino USBCDC layer (incompatible API in this project).
idf_build_set_property(COMPILE_DEFINITIONS "CFG_TUD_CDC=1" APPEND)
idf_build_set_property(COMPILE_DEFINITIONS "CFG_TUD_CDC_RX_BUFSIZE=512" APPEND)
idf_build_set_property(COMPILE_DEFINITIONS "CFG_TUD_CDC_TX_BUFSIZE=512" APPEND)