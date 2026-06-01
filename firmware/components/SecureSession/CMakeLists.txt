# Automatically register all .c and .cpp files in this component
file(GLOB_RECURSE component_sources
     "${CMAKE_CURRENT_LIST_DIR}/*.c"
     "${CMAKE_CURRENT_LIST_DIR}/*.cpp"
)

# Register the component with ESP-IDF
idf_component_register(
    SRCS ${component_sources}
    INCLUDE_DIRS "${CMAKE_CURRENT_LIST_DIR}"
    REQUIRES arduino-esp32 nvs_flash toothPacket esp-cryptoauthlib
)

if(CONFIG_TOOTHPASTE_SOFTWARE_CRYPTO)
    target_compile_definitions(${COMPONENT_LIB} PUBLIC USE_SOFTWARE_CRYPTO)
endif()