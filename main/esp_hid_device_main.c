/*
 * Volante DIY - ESP32-S3 Super Mini + Grove Rotary Angle Sensor
 *
 * ESP-IDF v5.5 puro (sem Arduino), BLE HID com NimBLE.
 */

#include <inttypes.h>
#include <stdbool.h>
#include <stdint.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_adc/adc_oneshot.h"
#include "esp_err.h"
#include "esp_event.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "driver/gpio.h"

#if CONFIG_BT_NIMBLE_ENABLED
#include "host/ble_hs.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#endif

#include "esp_hidd.h"
#include "esp_hid_gap.h"

#if !CONFIG_BT_NIMBLE_ENABLED
#error "Este firmware requer CONFIG_BT_NIMBLE_ENABLED=y"
#endif

static const char *TAG = "VOLANTE_HID";

#define PINO_SENSOR_ADC_CHANNEL ADC_CHANNEL_0 /* GPIO1 = ADC1_CH0 no ESP32-S3 */
#define PINO_BOTAO_1            GPIO_NUM_2
#define PINO_BOTAO_2_BOOT       GPIO_NUM_0
#define PINO_BOTAO_3            GPIO_NUM_4
#define QUANTIDADE_BOTOES       3

/* Ajustar depois de medir o curso real do potenciometro no hardware. */
#define ADC_MIN 0
#define ADC_MAX 4095

#if ADC_MAX <= ADC_MIN
#error "ADC_MAX deve ser maior que ADC_MIN"
#endif

#define OVERSAMPLING      16
#define INTERVALO_MS      20
#define HID_BATTERY_LEVEL 100

/* Report ID 1: eixo X assinado de 16 bits (little-endian) + 3 botoes. */
static const unsigned char gamepad_report_map[] = {
    0x05, 0x01,       /* USAGE_PAGE (Generic Desktop) */
    0x09, 0x05,       /* USAGE (Game Pad) */
    0xA1, 0x01,       /* COLLECTION (Application) */
    0x85, 0x01,       /*   REPORT_ID (1) */
    0x09, 0x01,       /*   USAGE (Pointer) */
    0xA1, 0x00,       /*   COLLECTION (Physical) */
    0x09, 0x30,       /*     USAGE (X) */
    0x16, 0x01, 0x80, /*     LOGICAL_MINIMUM (-32767) */
    0x26, 0xFF, 0x7F, /*     LOGICAL_MAXIMUM (32767) */
    0x75, 0x10,       /*     REPORT_SIZE (16) */
    0x95, 0x01,       /*     REPORT_COUNT (1) */
    0x81, 0x02,       /*     INPUT (Data,Var,Abs) */
    0xC0,             /*   END_COLLECTION */
    0x05, 0x09,       /*   USAGE_PAGE (Button) */
    0x19, 0x01,       /*   USAGE_MINIMUM (Button 1) */
    0x29, 0x03,       /*   USAGE_MAXIMUM (Button 3) */
    0x15, 0x00,       /*   LOGICAL_MINIMUM (0) */
    0x25, 0x01,       /*   LOGICAL_MAXIMUM (1) */
    0x75, 0x01,       /*   REPORT_SIZE (1) */
    0x95, 0x03,       /*   REPORT_COUNT (3) */
    0x81, 0x02,       /*   INPUT (Data,Var,Abs) */
    0x75, 0x05,       /*   REPORT_SIZE (5), padding */
    0x95, 0x01,       /*   REPORT_COUNT (1) */
    0x81, 0x03,       /*   INPUT (Const,Var,Abs) */
    0xC0              /* END_COLLECTION */
};

#define GAMEPAD_REPORT_ID  1
#define GAMEPAD_REPORT_LEN 3

static esp_hid_raw_report_map_t ble_report_maps[] = {
    {
        .data = gamepad_report_map,
        .len = sizeof(gamepad_report_map),
    },
};

static esp_hid_device_config_t ble_hid_config = {
    .vendor_id = 0x16C0,
    .product_id = 0x05DF,
    .version = 0x0100,
    .device_name = "Volante DIY",
    .manufacturer_name = "Projeto Volante",
    .serial_number = "0001",
    .report_maps = ble_report_maps,
    .report_maps_len = 1,
};

typedef struct {
    TaskHandle_t task_hdl;
    esp_hidd_dev_t *hid_dev;
} local_param_t;

static local_param_t s_ble_hid_param;
static adc_oneshot_unit_handle_t s_adc1_handle;

static void adc_iniciar(void)
{
    const adc_oneshot_unit_init_cfg_t init_config = {
        .unit_id = ADC_UNIT_1,
    };
    ESP_ERROR_CHECK(adc_oneshot_new_unit(&init_config, &s_adc1_handle));

    const adc_oneshot_chan_cfg_t chan_config = {
        .atten = ADC_ATTEN_DB_12,
        .bitwidth = ADC_BITWIDTH_12,
    };
    ESP_ERROR_CHECK(adc_oneshot_config_channel(
        s_adc1_handle, PINO_SENSOR_ADC_CHANNEL, &chan_config));
}

static esp_err_t adc_ler_bruto(int *media)
{
    int32_t soma = 0;

    for (int i = 0; i < OVERSAMPLING; i++) {
        int leitura;
        esp_err_t err = adc_oneshot_read(
            s_adc1_handle, PINO_SENSOR_ADC_CHANNEL, &leitura);
        if (err != ESP_OK) {
            return err;
        }
        soma += leitura;
    }

    *media = (int)(soma / OVERSAMPLING);
    return ESP_OK;
}

static int16_t mapear_para_eixo(int leitura_bruta)
{
    if (leitura_bruta < ADC_MIN) {
        leitura_bruta = ADC_MIN;
    } else if (leitura_bruta > ADC_MAX) {
        leitura_bruta = ADC_MAX;
    }

    const int64_t escala = (int64_t)(leitura_bruta - ADC_MIN) * 65534;
    return (int16_t)(escala / (ADC_MAX - ADC_MIN) - 32767);
}

static uint8_t ler_botoes(void)
{
    uint8_t botoes = 0;

    if (gpio_get_level(PINO_BOTAO_1) == 0) {
        botoes |= 1U << 0;
    }
    if (gpio_get_level(PINO_BOTAO_2_BOOT) == 0) {
        botoes |= 1U << 1;
    }
    if (gpio_get_level(PINO_BOTAO_3) == 0) {
        botoes |= 1U << 2;
    }

    return botoes;
}

static esp_err_t enviar_relatorio_gamepad(int16_t eixo_x, uint8_t botoes)
{
    const uint16_t eixo_bits = (uint16_t)eixo_x;
    uint8_t buffer[GAMEPAD_REPORT_LEN] = {
        (uint8_t)(eixo_bits & 0xFF),
        (uint8_t)(eixo_bits >> 8),
        botoes,
    };

    return esp_hidd_dev_input_set(s_ble_hid_param.hid_dev, 0,
                                  GAMEPAD_REPORT_ID, buffer, sizeof(buffer));
}

static void tarefa_leitura_volante(void *pv_parameters)
{
    (void)pv_parameters;
    uint8_t botoes_estado_anterior = 0;

    while (true) {
        int leitura_bruta;
        esp_err_t err = adc_ler_bruto(&leitura_bruta);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Falha na leitura do ADC: %s", esp_err_to_name(err));
            vTaskDelay(pdMS_TO_TICKS(INTERVALO_MS));
            continue;
        }

        const int16_t eixo_x = mapear_para_eixo(leitura_bruta);
        const uint8_t botoes = ler_botoes();

        err = enviar_relatorio_gamepad(eixo_x, botoes);
        if (err != ESP_OK) {
            ESP_LOGW(TAG, "Falha ao enviar relatorio HID: %s", esp_err_to_name(err));
        }

        const uint8_t botoes_alterados = botoes ^ botoes_estado_anterior;
        for (unsigned int i = 0; i < QUANTIDADE_BOTOES; i++) {
            const uint8_t mascara = 1U << i;
            if ((botoes_alterados & mascara) != 0) {
                ESP_LOGI(TAG, "Botao %u: %s", i + 1,
                         (botoes & mascara) != 0 ? "pressionado" : "solto");
            }
        }
        botoes_estado_anterior = botoes;

        /* Para calibrar, habilite temporariamente esta linha:
         * ESP_LOGI(TAG, "ADC: %d, eixo: %" PRId16, leitura_bruta, eixo_x); */
        vTaskDelay(pdMS_TO_TICKS(INTERVALO_MS));
    }
}

void ble_hid_task_start_up(void)
{
    if (s_ble_hid_param.task_hdl != NULL) {
        return;
    }

    BaseType_t result = xTaskCreate(tarefa_leitura_volante,
                                    "leitura_volante", 4096, NULL,
                                    configMAX_PRIORITIES - 3,
                                    &s_ble_hid_param.task_hdl);
    if (result != pdPASS) {
        s_ble_hid_param.task_hdl = NULL;
        ESP_LOGE(TAG, "Nao foi possivel criar a tarefa de leitura");
    }
}

static void tarefa_parar(void)
{
    if (s_ble_hid_param.task_hdl != NULL) {
        vTaskDelete(s_ble_hid_param.task_hdl);
        s_ble_hid_param.task_hdl = NULL;
    }
}

static void ble_hidd_event_callback(void *handler_args, esp_event_base_t base,
                                    int32_t id, void *event_data)
{
    (void)handler_args;
    (void)base;
    esp_hidd_event_data_t *param = event_data;

    switch ((esp_hidd_event_t)id) {
    case ESP_HIDD_START_EVENT:
        ESP_LOGI(TAG, "HID iniciado");
        ESP_ERROR_CHECK(esp_hid_ble_gap_adv_start());
        break;
    case ESP_HIDD_CONNECT_EVENT:
        ESP_LOGI(TAG, "HID conectado");
        break;
    case ESP_HIDD_PROTOCOL_MODE_EVENT:
        ESP_LOGI(TAG, "Modo de protocolo[%u]: %s",
                 param->protocol_mode.map_index,
                 param->protocol_mode.protocol_mode ? "REPORT" : "BOOT");
        break;
    case ESP_HIDD_CONTROL_EVENT:
        ESP_LOGI(TAG, "Controle[%u]: %sSUSPEND", param->control.map_index,
                 param->control.control ? "EXIT_" : "");
        if (param->control.control) {
            ble_hid_task_start_up();
        } else {
            tarefa_parar();
        }
        break;
    case ESP_HIDD_DISCONNECT_EVENT:
        ESP_LOGI(TAG, "HID desconectado: %s",
                 esp_hid_disconnect_reason_str(
                     esp_hidd_dev_transport_get(param->disconnect.dev),
                     param->disconnect.reason));
        tarefa_parar();
        ESP_ERROR_CHECK(esp_hid_ble_gap_adv_start());
        break;
    case ESP_HIDD_STOP_EVENT:
        ESP_LOGI(TAG, "HID parado");
        break;
    default:
        break;
    }
}

#if CONFIG_BT_NIMBLE_ENABLED
static void ble_hid_device_host_task(void *param)
{
    (void)param;
    ESP_LOGI(TAG, "Tarefa host BLE iniciada");
    nimble_port_run();
    nimble_port_freertos_deinit();
}

void ble_store_config_init(void);
#endif

void app_main(void)
{
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES ||
        ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    const gpio_config_t io_conf = {
        .pin_bit_mask = (1ULL << PINO_BOTAO_1) |
                        (1ULL << PINO_BOTAO_2_BOOT) |
                        (1ULL << PINO_BOTAO_3),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    ESP_ERROR_CHECK(gpio_config(&io_conf));
    adc_iniciar();

    ESP_LOGI(TAG, "Inicializando BLE HID com NimBLE");
    ESP_ERROR_CHECK(esp_hid_gap_init(HIDD_BLE_MODE));
    ESP_ERROR_CHECK(esp_hid_ble_gap_adv_init(
        ESP_HID_APPEARANCE_GAMEPAD, ble_hid_config.device_name));
    ESP_ERROR_CHECK(esp_hidd_dev_init(
        &ble_hid_config, ESP_HID_TRANSPORT_BLE,
        ble_hidd_event_callback, &s_ble_hid_param.hid_dev));
    ESP_ERROR_CHECK(esp_hidd_dev_battery_set(
        s_ble_hid_param.hid_dev, HID_BATTERY_LEVEL));

    ble_store_config_init();
    ble_hs_cfg.store_status_cb = ble_store_util_status_rr;
    ESP_ERROR_CHECK(esp_nimble_enable(ble_hid_device_host_task));

    ESP_LOGI(TAG, "Volante DIY pronto; aguardando pareamento BLE");
}
