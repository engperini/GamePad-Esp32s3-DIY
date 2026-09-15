#include "sophia_console.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <inttypes.h>
#include <stdatomic.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_http_server.h"
#include "esp_ota_ops.h"
#include "esp_app_desc.h"
#include "esp_app_format.h"
#include "esp_timer.h"
#include "esp_mac.h"
#include "esp_log.h"
#include "esp_system.h"
#include "driver/gpio.h"
#include "nvs.h"
#include "cJSON.h"
#include "web_assets.h"

static const char *TAG = "SOPHIA_WIFI";
static httpd_handle_t server;
static esp_netif_t *sta_netif;
static char ap_name[33], station_ssid[33], station_password[65];
static char mode[8] = "direct";
static atomic_bool station_online, access_point_on;
static atomic_bool restarting;
static int retry_count;
static int pilot_fd = -1;
static int64_t pilot_last;
static portMUX_TYPE snapshot_lock = portMUX_INITIALIZER_UNLOCKED;
static struct { uint32_t seq; int16_t lx, rx, ry; uint8_t buttons; int64_t at; } snapshot;

void sophia_controls_publish(int16_t lx, int16_t rx, int16_t ry, uint8_t buttons)
{
    portENTER_CRITICAL(&snapshot_lock);
    snapshot.lx = lx; snapshot.rx = rx; snapshot.ry = ry;
    snapshot.buttons = buttons; snapshot.seq++; snapshot.at = esp_timer_get_time();
    portEXIT_CRITICAL(&snapshot_lock);
}

static esp_err_t json_response(httpd_req_t *req, cJSON *json)
{
    if (!json) return httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Sem memoria");
    char *body = cJSON_PrintUnformatted(json);
    cJSON_Delete(json);
    if (!body) return httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Sem memoria");
    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    esp_err_t err = httpd_resp_sendstr(req, body);
    free(body);
    return err;
}

static bool same_origin(httpd_req_t *req)
{
    if (!httpd_req_get_hdr_value_len(req, "Origin")) return true;
    char origin[160], host[128], expected[160];
    if (httpd_req_get_hdr_value_str(req, "Origin", origin, sizeof(origin)) != ESP_OK ||
        httpd_req_get_hdr_value_str(req, "Host", host, sizeof(host)) != ESP_OK) return false;
    snprintf(expected, sizeof(expected), "http://%s", host);
    return strcmp(expected, origin) == 0;
}

static esp_err_t status_get(httpd_req_t *req)
{
    esp_netif_ip_info_t ip = {0};
    esp_netif_get_ip_info(sta_netif, &ip);
    char ip_text[16]; snprintf(ip_text, sizeof(ip_text), IPSTR, IP2STR(&ip.ip));
    cJSON *j = cJSON_CreateObject();
    cJSON_AddStringToObject(j, "device", "sophia-console");
    cJSON_AddNumberToObject(j, "protocol", 1);
    cJSON_AddStringToObject(j, "version", esp_app_get_description()->version);
    cJSON_AddStringToObject(j, "mode", mode);
    cJSON_AddStringToObject(j, "ap", ap_name);
    cJSON_AddBoolToObject(j, "ap_on", atomic_load(&access_point_on));
    cJSON_AddStringToObject(j, "ssid", station_ssid);
    cJSON_AddBoolToObject(j, "connected", atomic_load(&station_online));
    cJSON_AddStringToObject(j, "ip", ip_text);
    cJSON_AddStringToObject(j, "ap_ip", "192.168.4.1");
    cJSON_AddStringToObject(j, "slot", esp_ota_get_running_partition()->label);
    const esp_partition_t *next = esp_ota_get_next_update_partition(NULL);
    cJSON_AddNumberToObject(j, "ota_max", next ? next->size : 0);
    return json_response(req, j);
}

static void reboot_task(void *arg)
{
    (void)arg; vTaskDelay(pdMS_TO_TICKS(1800)); esp_restart();
}

static esp_err_t schedule_restart(httpd_req_t *req)
{
    atomic_store(&restarting, true);
    if (xTaskCreate(reboot_task, "console_restart", 2048, NULL, 2, NULL) != pdPASS) {
        atomic_store(&restarting, false);
        return httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Salvo. Reinicie manualmente.");
    }
    return httpd_resp_sendstr(req, "Salvo. O console vai reiniciar.");
}

static esp_err_t config_post(httpd_req_t *req)
{
    if (!same_origin(req)) return httpd_resp_send_err(req, HTTPD_403_FORBIDDEN, "Origem invalida");
    if (req->content_len < 2 || req->content_len > 512) return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Configuracao invalida");
    char body[513]; int got = 0;
    while (got < req->content_len) {
        int n = httpd_req_recv(req, body + got, req->content_len - got);
        if (n <= 0) return ESP_FAIL;
        got += n;
    }
    body[got] = 0;
    cJSON *j = cJSON_Parse(body);
    const cJSON *m = cJSON_GetObjectItemCaseSensitive(j, "mode");
    const cJSON *s = cJSON_GetObjectItemCaseSensitive(j, "ssid");
    const cJSON *p = cJSON_GetObjectItemCaseSensitive(j, "password");
    bool valid = cJSON_IsString(m) && (!strcmp(m->valuestring, "direct") || !strcmp(m->valuestring, "local") || !strcmp(m->valuestring, "hybrid"));
    valid = valid && cJSON_IsString(s) && strlen(s->valuestring) <= 32 && cJSON_IsString(p) && strlen(p->valuestring) <= 63;
    if (valid && strcmp(m->valuestring, "direct")) valid = strlen(s->valuestring) > 0 && (strlen(p->valuestring) == 0 || strlen(p->valuestring) >= 8);
    if (!valid) { cJSON_Delete(j); return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Revise modo, SSID e senha (vazia ou 8 a 63 caracteres)"); }
    nvs_handle_t nvs;
    esp_err_t err = nvs_open("sophia_wifi", NVS_READWRITE, &nvs);
    if (err == ESP_OK) {
        err = nvs_set_str(nvs, "mode", m->valuestring);
        if (err == ESP_OK) err = nvs_set_str(nvs, "ssid", s->valuestring);
        if (err == ESP_OK) err = nvs_set_str(nvs, "password", p->valuestring);
        if (err == ESP_OK) err = nvs_commit(nvs);
        nvs_close(nvs);
    }
    cJSON_Delete(j); memset(body, 0, sizeof(body));
    if (err != ESP_OK) return httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Nao foi possivel salvar");
    return schedule_restart(req);
}

static esp_err_t ota_post(httpd_req_t *req)
{
    if (!same_origin(req)) return httpd_resp_send_err(req, HTTPD_403_FORBIDDEN, "Origem invalida");
    const esp_partition_t *part = esp_ota_get_next_update_partition(NULL);
    if (!part || req->content_len < 512 || req->content_len > part->size) return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Tamanho de firmware invalido");
    // Validate the project and chip before erasing even the inactive slot.
    unsigned char buffer[4096]; int first = 0;
    const size_t header_size = sizeof(esp_image_header_t) + sizeof(esp_image_segment_header_t) + sizeof(esp_app_desc_t);
    while (first < header_size) {
        int n = httpd_req_recv(req, (char *)buffer + first, header_size - first);
        if (n <= 0) return ESP_FAIL;
        first += n;
    }
    esp_image_header_t header; esp_app_desc_t desc;
    memcpy(&header, buffer, sizeof(header));
    memcpy(&desc, buffer + sizeof(header) + sizeof(esp_image_segment_header_t), sizeof(desc));
    if (header.magic != ESP_IMAGE_HEADER_MAGIC || header.chip_id != ESP_CHIP_ID_ESP32S3 ||
        desc.magic_word != ESP_APP_DESC_MAGIC_WORD || memcmp(desc.project_name, esp_app_get_description()->project_name, sizeof(desc.project_name))) {
        return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Envie apenas o .bin da aplicacao GamePad Sophia para ESP32-S3");
    }
    esp_ota_handle_t ota;
    esp_err_t err = esp_ota_begin(part, req->content_len, &ota);
    if (err != ESP_OK) return httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Nao foi possivel iniciar OTA");
    err = esp_ota_write(ota, buffer, first);
    int remaining = req->content_len - first;
    const int64_t deadline = esp_timer_get_time() + 180000000;
    while (err == ESP_OK && remaining > 0 && esp_timer_get_time() < deadline) {
        int n = httpd_req_recv(req, (char *)buffer, remaining < sizeof(buffer) ? remaining : sizeof(buffer));
        if (n <= 0) { err = ESP_FAIL; break; }
        err = esp_ota_write(ota, buffer, n); remaining -= n;
    }
    if (err != ESP_OK || remaining) { esp_ota_abort(ota); return httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Upload interrompido; firmware atual preservado"); }
    err = esp_ota_end(ota);
    if (err == ESP_OK) err = esp_ota_set_boot_partition(part);
    if (err != ESP_OK) return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Imagem rejeitada; firmware atual preservado");
    ESP_LOGI(TAG, "OTA validado no slot %s", part->label);
    return schedule_restart(req);
}

static esp_err_t controls_ws(httpd_req_t *req)
{
    if (req->method == HTTP_GET) {
        // IDF 5.5 already sent the WS handshake before invoking this handler.
        // Reject by closing the session, never by writing an HTTP response into WS.
        if (!same_origin(req)) return ESP_FAIL;
        int fd = httpd_req_to_sockfd(req);
        if (pilot_fd != -1 && pilot_fd != fd && esp_timer_get_time() - pilot_last < 2000000 &&
            httpd_ws_get_fd_info(server, pilot_fd) == HTTPD_WS_CLIENT_WEBSOCKET) {
            return ESP_FAIL;
        }
        pilot_fd = fd; pilot_last = esp_timer_get_time(); return ESP_OK;
    }
    httpd_ws_frame_t frame = {0};
    esp_err_t err = httpd_ws_recv_frame(req, &frame, 0);
    if (err != ESP_OK || frame.len > 8) return ESP_FAIL;
    uint8_t request[9]; frame.payload = request;
    if ((err = httpd_ws_recv_frame(req, &frame, frame.len)) != ESP_OK) return err;
    if (frame.type != HTTPD_WS_TYPE_TEXT || frame.len != 1 || request[0] != '?' ||
        httpd_req_to_sockfd(req) != pilot_fd || atomic_load(&restarting)) return ESP_FAIL;
    pilot_last = esp_timer_get_time();
    uint32_t seq; int16_t lx, rx, ry; uint8_t buttons; int64_t at;
    portENTER_CRITICAL(&snapshot_lock);
    seq = snapshot.seq; lx = snapshot.lx; rx = snapshot.rx; ry = snapshot.ry;
    buttons = snapshot.buttons; at = snapshot.at;
    portEXIT_CRITICAL(&snapshot_lock);
    char data[128];
    int len = snprintf(data, sizeof(data), "[1,%"PRIu32",%d,%d,%d,%u,%"PRId64"]", seq, lx, rx, ry, buttons, (esp_timer_get_time() - at) / 1000);
    httpd_ws_frame_t response = {.type = HTTPD_WS_TYPE_TEXT, .payload = (uint8_t *)data, .len = len};
    return httpd_ws_send_frame(req, &response);
}

// Bounded, volatile diagnostics; never write player reports to flash.
static char diagnostic_reports[12][2048];
static unsigned diagnostic_next, diagnostic_count;
static esp_err_t diagnostics_post(httpd_req_t *req)
{
    if (!same_origin(req)) return ESP_FAIL;
    if (req->content_len < 2 || req->content_len >= 2048) return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid report");
    char body[2048]; int got = 0;
    while (got < req->content_len) {
        int n = httpd_req_recv(req, body + got, req->content_len - got);
        if (n <= 0) return ESP_FAIL;
        got += n;
    }
    body[got] = 0;
    cJSON *j = cJSON_Parse(body);
    if (!cJSON_IsObject(j)) { cJSON_Delete(j); return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid JSON"); }
    cJSON_Delete(j);
    memcpy(diagnostic_reports[diagnostic_next], body, got + 1);
    diagnostic_next = (diagnostic_next + 1) % 12;
    if (diagnostic_count < 12) diagnostic_count++;
    return httpd_resp_send(req, "OK", 2);
}
static esp_err_t diagnostics_get(httpd_req_t *req)
{
    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    char header[128];
    snprintf(header, sizeof(header), "{\"uptimeMs\":%"PRId64",\"freeHeap\":%lu,\"reports\":[", esp_timer_get_time()/1000, (unsigned long)esp_get_free_heap_size());
    httpd_resp_sendstr_chunk(req, header);
    for (unsigned i = 0; i < diagnostic_count; i++) {
        if (i) httpd_resp_sendstr_chunk(req, ",");
        httpd_resp_sendstr_chunk(req, diagnostic_reports[(diagnostic_next + 12 - diagnostic_count + i) % 12]);
    }
    httpd_resp_sendstr_chunk(req, "]}");
    return httpd_resp_send_chunk(req, NULL, 0);
}

static esp_err_t asset_get(httpd_req_t *req)
{
    const char *uri = strcmp(req->uri, "/") == 0 ? "/jogo.html" : req->uri;
    for (size_t i = 0; i < sizeof(web_assets) / sizeof(web_assets[0]); i++) {
        if (!strcmp(uri, web_assets[i].uri)) {
            httpd_resp_set_type(req, web_assets[i].mime);
            httpd_resp_set_hdr(req, "Content-Encoding", "gzip");
            httpd_resp_set_hdr(req, "Cache-Control", "no-cache");
            httpd_resp_set_hdr(req, "X-Content-Type-Options", "nosniff");
            return httpd_resp_send(req, (const char *)web_assets[i].data, web_assets[i].size);
        }
    }
    return httpd_resp_send_err(req, HTTPD_404_NOT_FOUND, "Pagina nao encontrada");
}

static void wifi_event(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    (void)arg;
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) esp_wifi_connect();
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        atomic_store(&station_online, false);
        if (retry_count++ < 5) esp_wifi_connect();
    }
    if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = data;
        atomic_store(&station_online, true); retry_count = 0;
        ESP_LOGI(TAG, "Rede local: http://"IPSTR"/", IP2STR(&event->ip_info.ip));
    }
}

static void health_task(void *arg)
{
    (void)arg; unsigned ticks = 0, boot_held = 0; bool rescued = false, confirmed = false;
    while (true) {
        vTaskDelay(pdMS_TO_TICKS(1000)); ticks++;
        boot_held = gpio_get_level(GPIO_NUM_0) == 0 ? boot_held + 1 : 0;
        bool rescue = boot_held >= 5;
        if ((!atomic_load(&station_online) && ticks % 30 == 0 && strcmp(mode, "direct")) || rescue) {
            if (!atomic_load(&access_point_on)) {
                esp_err_t err = esp_wifi_set_mode(station_ssid[0] ? WIFI_MODE_APSTA : WIFI_MODE_AP);
                if (err == ESP_OK) { atomic_store(&access_point_on, true); ESP_LOGW(TAG, "Rede de recuperacao %s ativa: http://192.168.4.1/", ap_name); }
            }
            if (rescue) rescued = true;
            if (station_ssid[0] && !atomic_load(&station_online)) { retry_count = 0; esp_wifi_connect(); }
        }
        if (!strcmp(mode, "local") && atomic_load(&station_online) && atomic_load(&access_point_on) && !rescued) {
            if (esp_wifi_set_mode(WIFI_MODE_STA) == ESP_OK) atomic_store(&access_point_on, false);
        }
        if (!confirmed && ticks >= 10) {
            int64_t last; uint32_t seq;
            portENTER_CRITICAL(&snapshot_lock); last = snapshot.at; seq = snapshot.seq; portEXIT_CRITICAL(&snapshot_lock);
            if (server && seq && esp_timer_get_time() - last < 500000) {
                esp_ota_img_states_t ota_state;
                if (esp_ota_get_state_partition(esp_ota_get_running_partition(), &ota_state) == ESP_OK && ota_state == ESP_OTA_IMG_PENDING_VERIFY) {
                    ESP_ERROR_CHECK(esp_ota_mark_app_valid_cancel_rollback());
                    ESP_LOGI(TAG, "OTA confirmado: servidor e amostragem saudaveis");
                }
                confirmed = true;
            } else if (ticks >= 30) { ESP_LOGE(TAG, "Autoteste falhou; reiniciando para rollback"); esp_restart(); }
        }
    }
}

esp_err_t sophia_console_start(void)
{
    nvs_handle_t nvs;
    ESP_ERROR_CHECK(nvs_open("sophia_wifi", NVS_READWRITE, &nvs));
    esp_err_t key_err = nvs_erase_key(nvs, "key");
    if (key_err == ESP_OK) ESP_ERROR_CHECK(nvs_commit(nvs));
    size_t size;
    size = sizeof(station_ssid); nvs_get_str(nvs, "ssid", station_ssid, &size);
    size = sizeof(station_password); nvs_get_str(nvs, "password", station_password, &size);
    size = sizeof(mode); nvs_get_str(nvs, "mode", mode, &size); nvs_close(nvs);
    if (strcmp(mode, "direct") && strcmp(mode, "local") && strcmp(mode, "hybrid")) strcpy(mode, "direct");
    if (!station_ssid[0]) strcpy(mode, "direct");
    uint8_t mac[6]; ESP_ERROR_CHECK(esp_read_mac(mac, ESP_MAC_WIFI_SOFTAP));
    snprintf(ap_name, sizeof(ap_name), "Sophia-Play-%02X%02X", mac[4], mac[5]);
    ESP_ERROR_CHECK(esp_netif_init());
    esp_err_t err = esp_event_loop_create_default();
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) return err;
    if (!esp_netif_create_default_wifi_ap() || !(sta_netif = esp_netif_create_default_wifi_sta())) return ESP_ERR_NO_MEM;
    wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&init)); ESP_ERROR_CHECK(esp_wifi_set_storage(WIFI_STORAGE_RAM));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, wifi_event, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, wifi_event, NULL));
    ESP_ERROR_CHECK(esp_wifi_set_mode(strcmp(mode, "direct") ? WIFI_MODE_APSTA : WIFI_MODE_AP));
    wifi_config_t ap = {.ap = {.channel = 6, .max_connection = 3, .authmode = WIFI_AUTH_OPEN}};
    strlcpy((char *)ap.ap.ssid, ap_name, sizeof(ap.ap.ssid)); ap.ap.ssid_len = strlen(ap_name);
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &ap));
    if (strcmp(mode, "direct")) {
        wifi_config_t sta = {0}; memcpy(sta.sta.ssid, station_ssid, strlen(station_ssid));
        memcpy(sta.sta.password, station_password, strlen(station_password));
        sta.sta.threshold.authmode = station_password[0] ? WIFI_AUTH_WPA2_PSK : WIFI_AUTH_OPEN;
        ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &sta));
    }
    ESP_ERROR_CHECK(esp_wifi_start()); atomic_store(&access_point_on, true);
    ESP_LOGI(TAG, "Console direto: rede %s, http://192.168.4.1/", ap_name);
    ESP_LOGI(TAG, "Rede aberta, sem senha ou chave de administracao");
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.max_uri_handlers = 8; config.stack_size = 8192; config.max_open_sockets = 5;
    config.lru_purge_enable = true; config.uri_match_fn = httpd_uri_match_wildcard;
    config.recv_wait_timeout = 8; config.send_wait_timeout = 5;
    ESP_ERROR_CHECK(httpd_start(&server, &config));
    const httpd_uri_t routes[] = {
        {.uri="/api/status", .method=HTTP_GET, .handler=status_get},
        {.uri="/api/diagnostics", .method=HTTP_GET, .handler=diagnostics_get},
        {.uri="/api/diagnostics", .method=HTTP_POST, .handler=diagnostics_post},
        {.uri="/api/config", .method=HTTP_POST, .handler=config_post},
        {.uri="/api/ota", .method=HTTP_POST, .handler=ota_post},
        {.uri="/ws", .method=HTTP_GET, .handler=controls_ws, .is_websocket=true},
        {.uri="/*", .method=HTTP_GET, .handler=asset_get},
    };
    for (size_t i = 0; i < sizeof(routes)/sizeof(routes[0]); i++) ESP_ERROR_CHECK(httpd_register_uri_handler(server, &routes[i]));
    if (xTaskCreate(health_task, "console_health", 3072, NULL, 2, NULL) != pdPASS) return ESP_ERR_NO_MEM;
    return ESP_OK;
}
