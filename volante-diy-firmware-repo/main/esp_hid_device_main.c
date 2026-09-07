/*
 * VOLANTE DIY - ESP32-S3 Super Mini + Grove Rotary Angle Sensor
 * ==============================================================
 * ESP-IDF puro (sem Arduino). Testado como alvo para ESP-IDF 5.5.
 *
 * Este arquivo SUBSTITUI main/esp_hid_device_main.c do exemplo oficial
 * examples/bluetooth/esp_hid_device (ver instruções de instalação no
 * README.md deste pacote). Ele reaproveita esp_hid_gap.c/.h originais
 * do exemplo sem modificação — não invente esses dois arquivos, copie-
 * os direto da sua instalação do ESP-IDF.
 *
 * HARDWARE
 * --------
 * - ESP32-S3 Super Mini
 * - Grove Rotary Angle Sensor no pino ADC
 * - Botão START (momentâneo) entre o pino digital e GND
 *
 * PINOUT (ESP32-S3 Super Mini) — pinos "seguros" (sem função de boot)
 * ---------------------------------------------------------------------
 *   Sensor (SIG)  -> GPIO1  (ADC1_CH0)
 *   Sensor (VCC)  -> 3V3
 *   Sensor (GND)  -> GND
 *   Botão START   -> GPIO2  (para GND, usa pull-up interno)
 *
 * CONFIGURAÇÃO NECESSÁRIA (idf.py menuconfig)
 * ----------------------------------------------------------------
 * Component config > Bluetooth > Host: NimBLE - Enabled
 * Component config > Bluetooth > Enabled
 * (o exemplo original já vem com um sdkconfig.defaults apontando para
 *  isso — confira antes de compilar, ver README.md)
 */

#include <stdio.h>
#include <string.h>
#include <inttypes.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_system.h"
#include "esp_event.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "esp_bt.h"
#include "driver/gpio.h"
#include "esp_adc/adc_oneshot.h"

#if CONFIG_BT_NIMBLE_ENABLED
#include "host/ble_hs.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#endif

#include "esp_hidd.h"
#include "esp_hid_gap.h"

static const char *TAG = "VOLANTE_HID";

// ===================== PINOUT =====================
#define PINO_SENSOR_ADC_CHANNEL   ADC_CHANNEL_0   // GPIO1 no ESP32-S3 = ADC1_CH0
#define PINO_BOTAO                GPIO_NUM_2

// ===================== CALIBRAÇÃO DO SENSOR =====================
// Ajuste após medir o range real do seu potenciômetro (ver README.md)
#define ADC_MIN   0
#define ADC_MAX   4095

#define OVERSAMPLING   16
#define INTERVALO_MS   20

#define HID_BATTERY_LEVEL 100

// ===================== REPORT MAP: GAMEPAD (1 eixo X de 16 bits + 1 botão) =====================
// Formato do relatório de entrada (report ID 0): 2 bytes de eixo X (little-endian,
// 0-32767) + 1 byte com o bit 0 = estado do botão START.
static const unsigned char gamepadReportMap[] = {
    0x05, 0x01,       // USAGE_PAGE (Generic Desktop)
    0x09, 0x04,       // USAGE (Joystick)
    0xA1, 0x01,       // COLLECTION (Application)
    0x85, 0x01,       //   REPORT_ID (1)
    0x09, 0x01,       //   USAGE (Pointer)
    0xA1, 0x00,       //   COLLECTION (Physical)
    0x09, 0x30,       //     USAGE (X)
    0x15, 0x00,       //     LOGICAL_MINIMUM (0)
    0x26, 0xFF, 0x7F, //     LOGICAL_MAXIMUM (32767)
    0x75, 0x10,       //     REPORT_SIZE (16)
    0x95, 0x01,       //     REPORT_COUNT (1)
    0x81, 0x02,       //     INPUT (Data,Var,Abs)
    0xC0,             //   END_COLLECTION
    0x05, 0x09,       //   USAGE_PAGE (Button)
    0x19, 0x01,       //   USAGE_MINIMUM (Button 1)
    0x29, 0x01,       //   USAGE_MAXIMUM (Button 1)
    0x15, 0x00,       //   LOGICAL_MINIMUM (0)
    0x25, 0x01,       //   LOGICAL_MAXIMUM (1)
    0x75, 0x01,       //   REPORT_SIZE (1)
    0x95, 0x01,       //   REPORT_COUNT (1)
    0x81, 0x02,       //   INPUT (Data,Var,Abs)
    0x75, 0x07,       //   REPORT_SIZE (7)   -- padding para completar o byte
    0x95, 0x01,       //   REPORT_COUNT (1)
    0x81, 0x03,       //   INPUT (Const,Var,Abs)
    0xC0              // END_COLLECTION
};

#define GAMEPAD_REPORT_ID   1
#define GAMEPAD_REPORT_LEN  3   // 2 bytes eixo X + 1 byte botão

static esp_hid_raw_report_map_t ble_report_maps[] = {
    {
        .data = gamepadReportMap,
        .len = sizeof(gamepadReportMap)
    }
};

static esp_hid_device_config_t ble_hid_config = {
    .vendor_id = 0x16C0,
    .product_id = 0x05DF,
    .version = 0x0100,
    .device_name = "Volante DIY",
    .manufacturer_name = "Projeto Volante",
    .serial_number = "0001",
    .report_maps = ble_report_maps,
    .report_maps_len = 1
};

typedef struct {
    TaskHandle_t task_hdl;
    esp_hidd_dev_t *hid_dev;
    uint8_t protocol_mode;
    bool conectado;
} local_param_t;

static local_param_t s_ble_hid_param = {0};

// ===================== ADC =====================
// Usamos leitura bruta (0-4095) sem calibração de tensão: o objetivo é
// só mapear a posição do potenciômetro para um eixo 0-32767, não medir
// a tensão real em volts. Por isso não usamos o componente adc_cali.
static adc_oneshot_unit_handle_t adc1_handle;

static void adc_iniciar(void) {
    adc_oneshot_unit_init_cfg_t init_config = {
        .unit_id = ADC_UNIT_1,
    };
    ESP_ERROR_CHECK(adc_oneshot_new_unit(&init_config, &adc1_handle));

    adc_oneshot_chan_cfg_t chan_config = {
        .atten = ADC_ATTEN_DB_12,   // range de entrada 0-3.3V aprox
        .bitwidth = ADC_BITWIDTH_12,
    };
    ESP_ERROR_CHECK(adc_oneshot_config_channel(adc1_handle, PINO_SENSOR_ADC_CHANNEL, &chan_config));
}

static int adc_ler_bruto(void) {
    long soma = 0;
    int leitura = 0;
    for (int i = 0; i < OVERSAMPLING; i++) {
        adc_oneshot_read(adc1_handle, PINO_SENSOR_ADC_CHANNEL, &leitura);
        soma += leitura;
    }
    return (int)(soma / OVERSAMPLING);
}

static int32_t mapear_para_eixo(int leitura_bruta) {
    if (leitura_bruta < ADC_MIN) leitura_bruta = ADC_MIN;
    if (leitura_bruta > ADC_MAX) leitura_bruta = ADC_MAX;
    return (int32_t)(((int64_t)(leitura_bruta - ADC_MIN) * 32767) / (ADC_MAX - ADC_MIN));
}

// ===================== ENVIO DO RELATÓRIO HID =====================
static void enviar_relatorio_gamepad(int32_t eixo_x, bool botao_pressionado) {
    uint8_t buffer[GAMEPAD_REPORT_LEN];
    buffer[0] = (uint8_t)(eixo_x & 0xFF);         // eixo X, byte baixo
    buffer[1] = (uint8_t)((eixo_x >> 8) & 0xFF);  // eixo X, byte alto
    buffer[2] = botao_pressionado ? 0x01 : 0x00;  // bit 0 = botão START

    esp_hidd_dev_input_set(s_ble_hid_param.hid_dev, 0, GAMEPAD_REPORT_ID, buffer, GAMEPAD_REPORT_LEN);
}

// ===================== TASK PRINCIPAL DE LEITURA =====================
static void tarefa_leitura_volante(void *pvParameters) {
    bool botao_estado_anterior = false;

    while (1) {
        if (!s_ble_hid_param.conectado) {
            vTaskDelay(pdMS_TO_TICKS(200));
            continue;
        }

        int leitura_bruta = adc_ler_bruto();
        int32_t eixo_x = mapear_para_eixo(leitura_bruta);

        bool botao_pressionado = (gpio_get_level(PINO_BOTAO) == 0); // pull-up: pressionado = 0

        enviar_relatorio_gamepad(eixo_x, botao_pressionado);

        if (botao_pressionado != botao_estado_anterior) {
            ESP_LOGI(TAG, "Botao START: %s", botao_pressionado ? "pressionado" : "solto");
            botao_estado_anterior = botao_pressionado;
        }

        // Descomente para depurar valores no monitor serial:
        // ESP_LOGI(TAG, "ADC bruto: %d  Eixo: %" PRId32, leitura_bruta, eixo_x);

        vTaskDelay(pdMS_TO_TICKS(INTERVALO_MS));
    }
}

static void tarefa_iniciar(void) {
    if (s_ble_hid_param.task_hdl) {
        return;
    }
    xTaskCreate(tarefa_leitura_volante, "tarefa_leitura_volante", 4096, NULL,
                configMAX_PRIORITIES - 3, &s_ble_hid_param.task_hdl);
}

static void tarefa_parar(void) {
    if (s_ble_hid_param.task_hdl) {
        vTaskDelete(s_ble_hid_param.task_hdl);
        s_ble_hid_param.task_hdl = NULL;
    }
}

// ===================== EVENTOS HID (BLE) =====================
static void ble_hidd_event_callback(void *handler_args, esp_event_base_t base, int32_t id, void *event_data) {
    esp_hidd_event_t event = (esp_hidd_event_t)id;
    esp_hidd_event_data_t *param = (esp_hidd_event_data_t *)event_data;

    switch (event) {
    case ESP_HIDD_START_EVENT:
        ESP_LOGI(TAG, "HID START");
        esp_hid_ble_gap_adv_start();
        break;

    case ESP_HIDD_CONNECT_EVENT:
        ESP_LOGI(TAG, "HID CONNECT");
        s_ble_hid_param.conectado = true;
        tarefa_iniciar();
        break;

    case ESP_HIDD_PROTOCOL_MODE_EVENT:
        ESP_LOGI(TAG, "PROTOCOL MODE[%u]: %s", param->protocol_mode.map_index,
                 param->protocol_mode.protocol_mode ? "REPORT" : "BOOT");
        break;

    case ESP_HIDD_CONTROL_EVENT:
        ESP_LOGI(TAG, "CONTROL[%u]: %sSUSPEND", param->control.map_index,
                 param->control.control ? "EXIT_" : "");
        if (param->control.control) {
            tarefa_iniciar();
        } else {
            tarefa_parar();
        }
        break;

    case ESP_HIDD_DISCONNECT_EVENT:
        ESP_LOGI(TAG, "HID DISCONNECT: %s",
                 esp_hid_disconnect_reason_str(esp_hidd_dev_transport_get(param->disconnect.dev),
                                                param->disconnect.reason));
        s_ble_hid_param.conectado = false;
        tarefa_parar();
        esp_hid_ble_gap_adv_start();
        break;

    case ESP_HIDD_STOP_EVENT:
        ESP_LOGI(TAG, "HID STOP");
        break;

    default:
        break;
    }
}

#if CONFIG_BT_NIMBLE_ENABLED
static void ble_hid_device_host_task(void *param) {
    ESP_LOGI(TAG, "BLE Host Task iniciada");
    nimble_port_run();
    nimble_port_freertos_deinit();
}
void ble_store_config_init(void);
#endif

void app_main(void) {
    esp_err_t ret;

    ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    // Botão START com pull-up interno
    gpio_config_t io_conf = {
        .pin_bit_mask = (1ULL << PINO_BOTAO),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
    };
    gpio_config(&io_conf);

    adc_iniciar();

    ESP_LOGI(TAG, "Inicializando GAP HID (modo BLE)");
    ESP_ERROR_CHECK(esp_hid_gap_init(HIDD_BLE_MODE));

    ESP_ERROR_CHECK(esp_hid_ble_gap_adv_init(ESP_HID_APPEARANCE_GENERIC, ble_hid_config.device_name));

    ESP_ERROR_CHECK(esp_hidd_dev_init(&ble_hid_config, ESP_HID_TRANSPORT_BLE,
                                       ble_hidd_event_callback, &s_ble_hid_param.hid_dev));
    ESP_ERROR_CHECK(esp_hidd_dev_battery_set(s_ble_hid_param.hid_dev, HID_BATTERY_LEVEL));

#if CONFIG_BT_NIMBLE_ENABLED
    ble_store_config_init();
    ble_hs_cfg.store_status_cb = ble_store_util_status_rr;
    nimble_port_freertos_init(ble_hid_device_host_task);
#endif

    ESP_LOGI(TAG, "Volante DIY pronto. Aguardando pareamento BLE...");
}

/*
 * ===================== CALIBRAÇÃO =====================
 * O potenciômetro Grove Rotary Angle gira ~300 graus, não 360. O range
 * elétrico real usado pelo giro físico do volante provavelmente é
 * menor que 0-4095.
 *
 * Para calibrar:
 * 1. Descomente a linha "ESP_LOGI(TAG, "ADC bruto..." dentro de
 *    tarefa_leitura_volante()
 * 2. idf.py monitor
 * 3. Gire o volante todo para a esquerda, anote "ADC bruto"
 * 4. Gire todo para a direita, anote o valor
 * 5. Ajuste ADC_MIN e ADC_MAX no topo deste arquivo
 *
 * ===================== TESTE NO PC =====================
 * Este firmware não muda para testar no PC. Pareie o "Volante DIY" no
 * Bluetooth do Windows como um controle normal, depois abra a página
 * server_teste/index.html — ela lê os valores via Gamepad API do
 * navegador. Ajustes de exibição ficam sempre no HTML/JS, nunca aqui.
 */
