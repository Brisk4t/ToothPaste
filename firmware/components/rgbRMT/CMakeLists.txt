# Automatically register all .c and .cpp files in this component
file(GLOB_RECURSE component_sources
     "${CMAKE_CURRENT_LIST_DIR}/*.c"
     "${CMAKE_CURRENT_LIST_DIR}/*.cpp"
)

# Register the component with ESP-IDF
idf_component_register(
    SRCS ${component_sources}
    INCLUDE_DIRS "${CMAKE_CURRENT_LIST_DIR}"
    REQUIRES arduino-esp32
)

target_compile_definitions(${COMPONENT_LIB} PRIVATE
    "RGB_LED_PIN=GPIO_NUM_${CONFIG_TOOTHPASTE_RGB_LED_PIN}"
)