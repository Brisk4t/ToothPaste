# Mirror SecureSession's crypto-path split: conditionally pull in
# esp-cryptoauthlib and propagate USE_SOFTWARE_CRYPTO to match the
# project-wide Kconfig setting.  The set() must precede idf_component_register
# so ${FIDO_CRYPTO_REQUIRES} is resolved before the REQUIRES list is evaluated.
if(CONFIG_TOOTHPASTE_SOFTWARE_CRYPTO)
    set(FIDO_CRYPTO_REQUIRES "")
else()
    set(FIDO_CRYPTO_REQUIRES "esp-cryptoauthlib")
endif()

idf_component_register(
    SRCS
        "platform/signal.c"
        "protocol/tlv.c"
        "protocol/apdu.c"
        "protocol/cbor_dispatch.c"
        "transport/fido_usb_compat.c"
        "transport/ctap_hid_transport.c"
        "app/u2f_app.c"
        "app/fido_glue.c"
        "app/u2f_store.c"
        "app/u2f_presence.cpp"
    INCLUDE_DIRS
        "."
        "platform"
        "transport"
        "protocol"
        "app"
    REQUIRES
        espHID
        esp_tinyusb
        nvs_flash
        mbedtls
        freertos
        esp_timer
        esp_system
        driver
        espressif__cbor
        hwUI
        rgbRMT
        ${FIDO_CRYPTO_REQUIRES}
)

if(CONFIG_TOOTHPASTE_SOFTWARE_CRYPTO)
    target_compile_definitions(${COMPONENT_LIB} PUBLIC USE_SOFTWARE_CRYPTO)
endif()
