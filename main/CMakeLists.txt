# This file was automatically generated for projects
# without default 'CMakeLists.txt' file.
file(GLOB_RECURSE component_sources
     "${CMAKE_CURRENT_LIST_DIR}/*.c"
     "${CMAKE_CURRENT_LIST_DIR}/*.cpp"
)

# Register the component with ESP-IDF
idf_component_register(
    SRCS ${component_sources}           # All source files found
    INCLUDE_DIRS "${CMAKE_CURRENT_LIST_DIR}"  # Header search path
    REQUIRES espHID ble hwUI rgbRMT SecureSession serialDebug stateManager arduino tinyusb       # Optional: list dependencies
)

# idf_component_get_property(tusb_lib espressif__tinyusb COMPONENT_LIB)

# target_include_directories(${tusb_lib} PUBLIC "${COMPONENT_DIR}/tusb")
# target_sources(${tusb_lib} PUBLIC "${COMPONENT_DIR}/tusb/usb_descriptors.c")