# Volante DIY — Firmware ESP-IDF (ESP32-S3 Super Mini)

Firmware ESP-IDF 5.5 puro (sem Arduino) que expõe um ESP32-S3 Super
Mini como gamepad Bluetooth LE (BLE HID), lendo um Grove Rotary Angle
Sensor (potenciômetro) e um botão START. Funciona em qualquer host que
aceite gamepads BLE genéricos: Android TV / Google TV, Windows, Linux.

## Por que este repo não é um projeto ESP-IDF completo por si só

O suporte de baixo nível para GAP (advertising, pareamento, bonding)
via NimBLE é grande e delicado (`esp_hid_gap.c`, ~500 linhas). Em vez
de reconstruir esse arquivo, este repositório reaproveita o exemplo
oficial **`examples/bluetooth/esp_hid_device`**, já incluído em
qualquer instalação do ESP-IDF, e substitui apenas o arquivo principal
pela lógica específica deste volante.

Isso significa que, para compilar, você precisa gerar o projeto base a
partir do exemplo oficial primeiro (passo 1 abaixo) — os arquivos
`esp_hid_gap.c`/`esp_hid_gap.h` vêm de lá, testados pela Espressif, e
não estão neste repositório.

## Estrutura deste repositório

```
main/
  esp_hid_device_main.c   - lógica do volante (substitui o arquivo de
                             mesmo nome do exemplo oficial)
  CMakeLists.txt          - dependências do componente main
CMakeLists.txt            - raiz do projeto ESP-IDF
server_teste/
  index.html              - página de teste (Gamepad API do navegador)
```

## Passo a passo — do zero até compilar

### 1. Ambiente ESP-IDF 5.5

Confirme que o ambiente está ativo no terminal:

```bash
. $HOME/esp/esp-idf/export.sh   # ou o caminho da sua instalação
idf.py --version                # deve mostrar v5.5.x
```

### 2. Gerar o projeto base a partir do exemplo oficial

```bash
idf.py create-project-from-example "espressif/esp-idf:bluetooth/esp_hid_device"
mv esp_hid_device volante-diy-build
cd volante-diy-build
```

Isso cria `main/esp_hid_gap.c`, `main/esp_hid_gap.h` e o resto da
estrutura, testados e mantidos pela Espressif.

### 3. Sobrepor com os arquivos deste repositório

Supondo que você clonou este repositório em `~/volante-diy-firmware`:

```bash
cp ~/volante-diy-firmware/main/esp_hid_device_main.c main/esp_hid_device_main.c
cp ~/volante-diy-firmware/main/CMakeLists.txt main/CMakeLists.txt
cp -r ~/volante-diy-firmware/server_teste .
```

### 4. Configurar o alvo e o Bluetooth

```bash
idf.py set-target esp32s3
idf.py menuconfig
```

Dentro do menuconfig, confirme:
- `Component config` > `Bluetooth` > habilitado
- `Component config` > `Bluetooth` > `Host` > **NimBLE - Enabled**

Salve (`S`) e saia (`Q`).

### 5. Compilar, gravar e monitorar

```bash
idf.py build
idf.py -p /dev/ttyACM0 flash monitor
```

(troque `/dev/ttyACM0` pela porta serial real — Windows: `COMx`;
Linux: `/dev/ttyUSB0` ou `/dev/ttyACM0`)

Sair do monitor: `Ctrl+]`

## Pinout (ESP32-S3 Super Mini)

Pinos "seguros" — sem função de boot/strapping:

| Função        | Pino                        |
|---------------|------------------------------|
| Sensor (SIG)  | GPIO1 (ADC1_CH0)             |
| Sensor (VCC)  | 3V3                          |
| Sensor (GND)  | GND                           |
| Botão START   | GPIO2 (outra perna → GND)     |

Se sua placa específica tiver esses pinos ocupados, ajuste
`PINO_SENSOR_ADC_CHANNEL` e `PINO_BOTAO` no topo de
`main/esp_hid_device_main.c`.

## Calibração do sensor

O Grove Rotary Angle Sensor gira ~300°, não 360° — o range elétrico
real do giro físico do seu volante provavelmente não é 0-4095.
Instruções de calibração completas estão comentadas no final de
`main/esp_hid_device_main.c`.

## Testar no PC (sem alterar o firmware)

1. Grave o firmware (passo 5 acima)
2. Windows > Configurações > Bluetooth > Adicionar dispositivo >
   selecione **"Volante DIY"** > parear (como qualquer controle)
3. Abra `server_teste/index.html` num navegador (Chrome/Edge) — não
   precisa de servidor rodando, dá para abrir o arquivo direto
4. Gire o volante — o desenho na página deve girar junto

**Por que não dá para usar Web Bluetooth direto:** o firmware expõe
um dispositivo HID, e o Chrome bloqueia por segurança que páginas web
se conectem a dispositivos HID via Web Bluetooth. O sistema
operacional pareia o HID normalmente, e a página só lê o que o SO já
expõe através da Gamepad API.

## Formato do relatório HID (gamepad)

Relatório de entrada (`report ID 1`), 3 bytes:
- Bytes 0–1: eixo X, 16 bits, little-endian, faixa 0–32767
- Byte 2, bit 0: estado do botão START (1 = pressionado)
- Byte 2, bits 1–7: padding (sempre 0)

Para adicionar mais eixos/botões, edite `gamepadReportMap` em
`main/esp_hid_device_main.c` seguindo a especificação HID Usage Tables
(Generic Desktop / Button), e ajuste o buffer em
`enviar_relatorio_gamepad()` de acordo.

## Status

- ✅ Firmware compilável conceitualmente (revisado à mão; não
  compilado neste ambiente por falta do toolchain ESP-IDF completo —
  confira o build na sua máquina e abra uma issue se algo não bater)
- ⬜ Calibração dos valores `ADC_MIN`/`ADC_MAX` reais — depende do seu
  hardware específico
- ⬜ Testado fisicamente no Android TV
