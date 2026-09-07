# Volante DIY — ESP32-S3 BLE Gamepad

Firmware ESP-IDF puro para usar um **ESP32-S3 Super Mini** como um
gamepad Bluetooth Low Energy. O eixo X vem de um Grove Rotary Angle Sensor
(potenciômetro) e o botão START é um botão momentâneo.

O repositório é autossuficiente: os arquivos auxiliares `esp_hid_gap.c` e
`esp_hid_gap.h` do exemplo oficial da Espressif estão versionados em `main/`.
Não é necessário criar outro projeto, copiar exemplos ou usar Arduino.

## Status atual

- Estrutura de projeto pronta para clone, build e flash com ESP-IDF v5.5.
- BLE HID configurado para usar NimBLE.
- Descriptor HID: Game Pad, Report ID 1, eixo X assinado e um botão.
- Build real concluído com sucesso em ESP-IDF v5.5 para o alvo ESP32-S3.
- O firmware **ainda não foi gravado nem testado fisicamente no hardware**.
- Os limites reais do potenciômetro ainda precisam ser calibrados após o
  primeiro teste.

## Hardware e pinagem

| Função | Conexão no ESP32-S3 Super Mini |
|---|---|
| Grove Rotary Angle Sensor — SIG | GPIO1 / ADC1_CH0 |
| Grove Rotary Angle Sensor — VCC | 3V3 |
| Grove Rotary Angle Sensor — GND | GND |
| Botão START | GPIO2 e GND |

O botão usa o pull-up interno do ESP32-S3: solto é nível alto e pressionado é
nível baixo.

O ADC usa atenuação `ADC_ATTEN_DB_12`, resolução de 12 bits, média de 16
amostras e envia um relatório a cada 20 ms. `ADC_MIN` e `ADC_MAX`, no início de
`main/esp_hid_device_main.c`, permanecem configuráveis para a calibração futura.

## Requisitos

- ESP-IDF v5.5 instalado com o toolchain para ESP32-S3.
- Git.
- Cabo USB de dados e a porta serial correspondente à placa.

Antes de usar `idf.py`, ative o ambiente do ESP-IDF no terminal conforme a sua
instalação.

Linux/macOS (exemplo):

```bash
. "$HOME/esp/esp-idf/export.sh"
idf.py --version
```

Windows: abra o **ESP-IDF PowerShell/Command Prompt** instalado pela Espressif,
ou execute o script de exportação indicado pela sua instalação. `idf.py
--version` deve informar v5.5.x.

## Clone, build e flash

```bash
git clone https://github.com/engperini/GamePad-Esp32s3-DIY.git
cd GamePad-Esp32s3-DIY
idf.py set-target esp32s3
idf.py build
idf.py flash monitor
```

Se a porta não for detectada automaticamente:

```bash
idf.py -p COM5 flash monitor
```

No Linux, a porta normalmente tem formato `/dev/ttyACM0` ou `/dev/ttyUSB0`.
Troque o exemplo pela porta real. Para sair do monitor, use `Ctrl+]`.

O arquivo `sdkconfig.defaults` ativa Bluetooth e o host NimBLE. O comando
`idf.py set-target esp32s3` gera o `sdkconfig` local para o ESP32-S3.

## Pareamento Bluetooth

Depois do primeiro flash:

1. Abra as configurações Bluetooth do computador, celular ou TV.
2. Procure por **Volante DIY**.
3. Faça o pareamento como um controle/gamepad Bluetooth.
4. Se uma versão anterior já tiver sido pareada e o descriptor mudar, remova o
   dispositivo salvo no host e pareie novamente.

O firmware anuncia o appearance BLE específico de gamepad e volta a anunciar
automaticamente após uma desconexão.

## Relatório HID

O relatório de entrada usa **Report ID 1** e possui 3 bytes:

- bytes 0–1: eixo X assinado de 16 bits, little-endian, de -32767 a +32767;
- byte 2, bit 0: botão START (`1` = pressionado);
- byte 2, bits 1–7: padding em zero.

O centro nominal do ADC é convertido para eixo próximo de zero. Navegadores
expõem esse eixo pela Gamepad API normalizado aproximadamente entre `-1` e `1`.

## Página de teste

Depois de parear o dispositivo no sistema operacional, abra
`server_teste/index.html` no Chrome ou Edge. A página usa `navigator.getGamepads()`
para mostrar o eixo normalizado, o botão e uma representação do volante.

Alguns navegadores só liberam a leitura após uma interação com o gamepad. Se o
eixo aparecer em outro índice, use o botão **Trocar índice do eixo** na página.
Não é usado Web Bluetooth: o pareamento HID é feito pelo sistema operacional e
a página acessa o controle pela Gamepad API.

## Estrutura

```text
.
├── CMakeLists.txt
├── sdkconfig.defaults
├── main/
│   ├── CMakeLists.txt
│   ├── esp_hid_device_main.c
│   ├── esp_hid_gap.c
│   └── esp_hid_gap.h
└── server_teste/
    └── index.html
```

`esp_hid_gap.c` e `esp_hid_gap.h` preservam os cabeçalhos SPDX e o conteúdo do
exemplo `examples/bluetooth/esp_hid_device/main/` do ESP-IDF v5.5.

## Antes do primeiro uso real

O Grove Rotary Angle Sensor tem curso mecânico aproximado de 300°, mas o curso
usado pelo volante pode ser menor. Após o primeiro flash, registre as leituras
brutas nos extremos, ajuste `ADC_MIN` e `ADC_MAX` e compile novamente. Não há
calibração definitiva embutida porque ela depende da montagem física.
