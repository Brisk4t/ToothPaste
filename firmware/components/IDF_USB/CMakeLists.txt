# Automatically register all .c and .cpp files in this component
file(GLOB_RECURSE component_sources
     "${CMAKE_CURRENT_LIST_DIR}/*.c"
     "${CMAKE_CURRENT_LIST_DIR}/*.cpp"
)

# Register the component with ESP-IDF
idf_component_register(
    SRCS ${component_sources}           # All source files found
    INCLUDE_DIRS "${CMAKE_CURRENT_LIST_DIR}" "keyboardLayout" # Header search path
    REQUIRES arduino-esp32 serialDebug esp_tinyusb esp_driver_gpio   # Optional: list dependencies
)