#pragma once
#include <stdint.h>
#include "esp_err.h"
/* One ADC reader publishes a snapshot consumed independently by Wi-Fi and HID. */
void sophia_controls_publish(int16_t lx, int16_t rx, int16_t ry, uint8_t buttons);
esp_err_t sophia_console_start(void);
