idf_component_register(
    SRCS "esp_hid_device_main.c" "esp_hid_gap.c" "sophia_console.c"
    INCLUDE_DIRS "."
    REQUIRES esp_hid bt nvs_flash driver esp_adc esp_wifi esp_netif esp_http_server app_update esp_timer json esp_app_format
)

set(WEB_ROOT "${CMAKE_CURRENT_LIST_DIR}/../server_teste")
set(WEB_HEADER "${CMAKE_CURRENT_BINARY_DIR}/web_assets.h")
set(WEB_FILES jogo.html jogo.css jogo.js sophia-link.js console.html console.js index.html)
set(WEB_INPUTS)
foreach(FILE ${WEB_FILES})
    list(APPEND WEB_INPUTS "${WEB_ROOT}/${FILE}")
endforeach()
add_custom_command(OUTPUT "${WEB_HEADER}"
    COMMAND ${PYTHON} "${CMAKE_CURRENT_LIST_DIR}/../tools/embed_web.py" "${WEB_ROOT}" "${WEB_HEADER}"
    DEPENDS ${WEB_INPUTS} "${CMAKE_CURRENT_LIST_DIR}/../tools/embed_web.py"
    VERBATIM)
add_custom_target(sophia_web_assets DEPENDS "${WEB_HEADER}")
add_dependencies(${COMPONENT_LIB} sophia_web_assets)
target_include_directories(${COMPONENT_LIB} PRIVATE "${CMAKE_CURRENT_BINARY_DIR}")
