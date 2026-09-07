idf_component_register(
    SRCS "esp_hid_device_main.c" "esp_hid_gap.c"
    INCLUDE_DIRS "."
    REQUIRES esp_hid bt nvs_flash driver esp_adc
)
