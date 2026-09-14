/*
 * Volante DIY - ESP32-S3 Super Mini + Grove Rotary Angle Sensor
 *
 * ESP-IDF v5.5 puro (sem Arduino), BLE HID com NimBLE.
 */

#include <inttypes.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdatomic.h>
#include "sophia_console.h"

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
#include "services/gap/ble_svc_gap.h"
#endif

#include "esp_hidd.h"
#include "esp_hid_gap.h"

#if !CONFIG_BT_NIMBLE_ENABLED
#error "Este firmware requer CONFIG_BT_NIMBLE_ENABLED=y"
#endif

static const char *TAG = "VOLANTE_HID";

#define CANAL_VOLANTE_ADC       ADC_CHANNEL_0 /* GPIO1 = ADC1_CH0 */
#define CANAL_JOYSTICK_X_ADC    ADC_CHANNEL_4 /* GPIO5 = ADC1_CH4 */
#define CANAL_JOYSTICK_Y_ADC    ADC_CHANNEL_5 /* GPIO6 = ADC1_CH5 */
#define PINO_BOTAO_1            GPIO_NUM_2
#define PINO_BOTAO_2            GPIO_NUM_3
#define PINO_BOTAO_5_BOOT       GPIO_NUM_0
#define PINO_BOTAO_3            GPIO_NUM_4
#define PINO_BOTAO_4_JOYSTICK   GPIO_NUM_7
#define QUANTIDADE_BOTOES       5

/* Corrige o sentido fisico do potenciometro para todos os jogos/hosts. */
#define VOLANTE_INVERTIDO       1

/* Use 1 depois de ligar VRX/VRY. Em 0, Rx e Ry ficam centrados e sem ruido. */
#define JOYSTICK_HABILITADO 1

/* Ajustar depois de medir o curso real do potenciometro no hardware. */
#define ADC_MIN 0
#define ADC_MAX 4095
#define JOYSTICK_CENTRO 2048
#define JOYSTICK_ZONA_MORTA 320

#if ADC_MAX <= ADC_MIN
#error "ADC_MAX deve ser maior que ADC_MIN"
#endif

#define OVERSAMPLING      16
#define INTERVALO_MS      20
#define HID_BATTERY_LEVEL 100

/* MAPEAMENTO EDITAVEL: usos HID Button (nao indices JavaScript).
 * GPIO2=A(1), GPIO3=B(2), GPIO4=X(4), GPIO7=R3(15), BOOT=Start(12).
 * A ordem corresponde aos bits fisicos retornados por ler_botoes().
 * Mantenha cada uso entre 1 e 15. Slots sem botao ficam soltos.
 */
static const uint8_t botoes_usos_hid[QUANTIDADE_BOTOES] = {1, 2, 4, 15, 12};

/* Report ID 1: quatro eixos + 15 slots padrao HID e um bit reservado. */
static const unsigned char gamepad_report_map[] = {
    0x05, 0x01,       /* USAGE_PAGE (Generic Desktop) */
    0x09, 0x05,       /* USAGE (Game Pad) */
    0xA1, 0x01,       /* COLLECTION (Application) */
    0x85, 0x01,       /*   REPORT_ID (1) */
    0x09, 0x01,       /*   USAGE (Pointer) */
    0xA1, 0x00,       /*   COLLECTION (Physical) */
    0x09, 0x30,       /*     USAGE (X) */
    0x09, 0x31,       /*     USAGE (Y) */
    0x09, 0x33,       /*     USAGE (Rx, joystick horizontal) */
    0x09, 0x34,       /*     USAGE (Ry, joystick vertical) */
    0x16, 0x01, 0x80, /*     LOGICAL_MINIMUM (-32767) */
    0x26, 0xFF, 0x7F, /*     LOGICAL_MAXIMUM (32767) */
    0x75, 0x10,       /*     REPORT_SIZE (16) */
    0x95, 0x04,       /*     REPORT_COUNT (4 axes) */
    0x81, 0x02,       /*     INPUT (Data,Var,Abs) */
    0xC0,             /*   END_COLLECTION */
    0x05, 0x09,       /*   USAGE_PAGE (Button) */
    0x19, 0x01,       /*   USAGE_MINIMUM (Button 1) */
    0x29, 0x0F,       /*   USAGE_MAXIMUM (Button 15 / R3) */
    0x15, 0x00,       /*   LOGICAL_MINIMUM (0) */
    0x25, 0x01,       /*   LOGICAL_MAXIMUM (1) */
    0x75, 0x01,       /*   REPORT_SIZE (1) */
    0x95, 0x0F,       /*   REPORT_COUNT (15 buttons) */
    0x81, 0x02,       /*   INPUT (Data,Var,Abs) */
    0x75, 0x01,       /*   REPORT_SIZE (1), padding */
    0x95, 0x01,       /*   REPORT_COUNT (1) */
    0x81, 0x03,       /*   INPUT (Const,Var,Abs) */
    0xC0              /* END_COLLECTION */
};

#define GAMEPAD_REPORT_ID  1
#define GAMEPAD_REPORT_LEN 10

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
    .device_name = "GamePad Sophia",
    .manufacturer_name = "Sophia DIY",
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
static atomic_bool s_hid_ready;

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
        s_adc1_handle, CANAL_VOLANTE_ADC, &chan_config));
#if JOYSTICK_HABILITADO
    ESP_ERROR_CHECK(adc_oneshot_config_channel(
        s_adc1_handle, CANAL_JOYSTICK_X_ADC, &chan_config));
    ESP_ERROR_CHECK(adc_oneshot_config_channel(
        s_adc1_handle, CANAL_JOYSTICK_Y_ADC, &chan_config));
#endif
}

static esp_err_t adc_ler_bruto(adc_channel_t canal, int *media)
{
    int32_t soma = 0;

    for (int i = 0; i < OVERSAMPLING; i++) {
        int leitura;
        esp_err_t err = adc_oneshot_read(s_adc1_handle, canal, &leitura);
        if (err != ESP_OK) {
            return err;
        }
        soma += leitura;
    }

    *media = (int)(soma / OVERSAMPLING);
    return ESP_OK;
}

static int16_t mapear_adc_para_eixo(int leitura_bruta)
{
    if (leitura_bruta < ADC_MIN) {
        leitura_bruta = ADC_MIN;
    } else if (leitura_bruta > ADC_MAX) {
        leitura_bruta = ADC_MAX;
    }

    const int64_t escala = (int64_t)(leitura_bruta - ADC_MIN) * 65534;
    return (int16_t)(escala / (ADC_MAX - ADC_MIN) - 32767);
}

#if JOYSTICK_HABILITADO
static int16_t mapear_joystick_para_eixo(int leitura_bruta)
{
    const int limite_inferior = JOYSTICK_CENTRO - JOYSTICK_ZONA_MORTA;
    const int limite_superior = JOYSTICK_CENTRO + JOYSTICK_ZONA_MORTA;

    if (leitura_bruta < limite_inferior) {
        const int64_t escala = (int64_t)(limite_inferior - leitura_bruta) * 32767;
        return (int16_t)-(escala / limite_inferior);
    }
    if (leitura_bruta > limite_superior) {
        const int64_t escala = (int64_t)(leitura_bruta - limite_superior) * 32767;
        return (int16_t)(escala / (ADC_MAX - limite_superior));
    }

    return 0;
}
#endif

static uint8_t ler_botoes(void)
{
    uint8_t botoes = 0;

    if (gpio_get_level(PINO_BOTAO_1) == 0) {
        botoes |= 1U << 0;
    }
    if (gpio_get_level(PINO_BOTAO_2) == 0) {
        botoes |= 1U << 1;
    }
    if (gpio_get_level(PINO_BOTAO_3) == 0) {
        botoes |= 1U << 2;
    }
    if (gpio_get_level(PINO_BOTAO_4_JOYSTICK) == 0) {
        botoes |= 1U << 3;
    }

    if (gpio_get_level(PINO_BOTAO_5_BOOT) == 0) {
        botoes |= 1U << 4;
    }

    return botoes;
}

static esp_err_t enviar_relatorio_gamepad(int16_t joystick_x, int16_t joystick_y,
                                          int16_t volante_lx, uint8_t botoes)
{
    const uint16_t joystick_x_bits = (uint16_t)joystick_x;
    const uint16_t joystick_y_bits = (uint16_t)joystick_y;
    const uint16_t volante_bits = (uint16_t)volante_lx;
    uint16_t botoes_hid = 0;
    for (int i = 0; i < QUANTIDADE_BOTOES; i++) {
        if (botoes & (1U << i)) botoes_hid |= 1U << (botoes_usos_hid[i] - 1);
    }
    uint8_t buffer[GAMEPAD_REPORT_LEN] = {
        (uint8_t)(volante_bits & 0xFF), /* L horizontal */
        (uint8_t)(volante_bits >> 8),
        0, 0, /* L vertical: sem sensor, sempre centralizado */
        (uint8_t)(joystick_x_bits & 0xFF),
        (uint8_t)(joystick_x_bits >> 8),
        (uint8_t)(joystick_y_bits & 0xFF),
        (uint8_t)(joystick_y_bits >> 8),
        (uint8_t)botoes_hid, (uint8_t)(botoes_hid >> 8),
    };

    return esp_hidd_dev_input_set(s_ble_hid_param.hid_dev, 0,
                                  GAMEPAD_REPORT_ID, buffer, sizeof(buffer));
}

static void tarefa_leitura_volante(void *pv_parameters)
{
    (void)pv_parameters;
    uint8_t botoes_estado_anterior = 0;

    while (true) {
#if JOYSTICK_HABILITADO
        int leitura_joystick_x;
        int leitura_joystick_y;
        esp_err_t err = adc_ler_bruto(CANAL_JOYSTICK_X_ADC, &leitura_joystick_x);
        if (err == ESP_OK) {
            err = adc_ler_bruto(CANAL_JOYSTICK_Y_ADC, &leitura_joystick_y);
        }
#else
        esp_err_t err = ESP_OK;
#endif
        int leitura_volante;
        if (err == ESP_OK) {
            err = adc_ler_bruto(CANAL_VOLANTE_ADC, &leitura_volante);
        }
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Falha na leitura do ADC: %s", esp_err_to_name(err));
            vTaskDelay(pdMS_TO_TICKS(INTERVALO_MS));
            continue;
        }

#if JOYSTICK_HABILITADO
        const int16_t joystick_x = mapear_joystick_para_eixo(leitura_joystick_x);
        const int16_t joystick_y = mapear_joystick_para_eixo(leitura_joystick_y);
#else
        const int16_t joystick_x = 0;
        const int16_t joystick_y = 0;
#endif
        const int16_t volante_mapeado = mapear_adc_para_eixo(leitura_volante);
        /* A faixa e -32767..32767; a negacao cabe em int16_t. */
        const int16_t volante_lx = VOLANTE_INVERTIDO
            ? (int16_t)-volante_mapeado : volante_mapeado;
        const uint8_t botoes = ler_botoes();

        sophia_controls_publish(volante_lx, joystick_x, joystick_y, botoes);
        if (atomic_load(&s_hid_ready)) {
            err = enviar_relatorio_gamepad(joystick_x, joystick_y, volante_lx, botoes);
            if (err != ESP_OK) {
                ESP_LOGD(TAG, "Falha ao enviar relatorio HID: %s", esp_err_to_name(err));
            }
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
         * ESP_LOGI(TAG, "JX:%d JY:%d VOL:%d", leitura_joystick_x,
         *          leitura_joystick_y, leitura_volante); */
        vTaskDelay(pdMS_TO_TICKS(INTERVALO_MS));
    }
}

static void sensores_start(void)
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

/* Existing NimBLE encryption/resume callbacks still enable the same HID stream.
 * Sampling itself remains alive so the console works without a BLE host. */
void ble_hid_task_start_up(void)
{
    atomic_store(&s_hid_ready, true);
}
static void tarefa_parar(void)
{
    atomic_store(&s_hid_ready, false);
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
                        (1ULL << PINO_BOTAO_2) |
                        (1ULL << PINO_BOTAO_3) |
                        (1ULL << PINO_BOTAO_4_JOYSTICK) |
                        (1ULL << PINO_BOTAO_5_BOOT),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    ESP_ERROR_CHECK(gpio_config(&io_conf));
    adc_iniciar();
    sensores_start();
    ESP_LOGI(TAG, "Controles: L=GPIO1/Y=0 R=GPIO5/6 A/B/X=GPIO2/3/4 SW=GPIO7 BOOT=GPIO0");

    ESP_LOGI(TAG, "Inicializando BLE HID com NimBLE");
    ESP_ERROR_CHECK(esp_hid_gap_init(HIDD_BLE_MODE));
    ESP_ERROR_CHECK(esp_hid_ble_gap_adv_init(
        ESP_HID_APPEARANCE_GAMEPAD, ble_hid_config.device_name));
    ESP_ERROR_CHECK(esp_hidd_dev_init(
        &ble_hid_config, ESP_HID_TRANSPORT_BLE,
        ble_hidd_event_callback, &s_ble_hid_param.hid_dev));
    const int nome_gap_resultado =
        ble_svc_gap_device_name_set(ble_hid_config.device_name);
    if (nome_gap_resultado != 0) {
        ESP_LOGE(TAG, "Falha ao definir nome GAP: %d", nome_gap_resultado);
        ESP_ERROR_CHECK(ESP_FAIL);
    }
    ESP_ERROR_CHECK(esp_hidd_dev_battery_set(
        s_ble_hid_param.hid_dev, HID_BATTERY_LEVEL));

    ble_store_config_init();
    ble_hs_cfg.store_status_cb = ble_store_util_status_rr;
    ESP_ERROR_CHECK(esp_nimble_enable(ble_hid_device_host_task));

    ESP_LOGI(TAG, "GamePad Sophia pronto; aguardando pareamento BLE");
    ESP_ERROR_CHECK(sophia_console_start());
}
