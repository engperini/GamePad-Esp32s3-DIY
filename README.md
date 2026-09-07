# GamePad Sophia — ESP32-S3 BLE Gamepad

Firmware ESP-IDF puro para usar um **ESP32-S3 Super Mini** como um
gamepad Bluetooth Low Energy. Há um joystick analógico X/Y para navegação, um
Grove Rotary Angle Sensor (potenciômetro) para o volante e quatro botões.

O repositório é autossuficiente: os arquivos auxiliares `esp_hid_gap.c` e
`esp_hid_gap.h` do exemplo oficial da Espressif estão versionados em `main/`.
Não é necessário criar outro projeto, copiar exemplos ou usar Arduino.

## Status atual

- Estrutura de projeto pronta para clone, build e flash com ESP-IDF v5.5.
- BLE HID configurado para usar NimBLE.
- Descriptor HID: Game Pad, Report ID 1, joystick X/Y, volante Rx e quatro botões.
- Build real concluído com sucesso em ESP-IDF v5.5 para o alvo ESP32-S3.
- A inicialização do firmware e o anúncio BLE já foram verificados no hardware.
- Os três eixos e os quatro botões ainda precisam do teste físico completo.
- Os limites reais do potenciômetro ainda precisam ser calibrados após o
  primeiro teste.

## Hardware e pinagem

| Função | Conexão no ESP32-S3 Super Mini |
|---|---|
| Grove Rotary Angle Sensor — amarelo (SIG) | GPIO1 / ADC1_CH0 |
| Grove Rotary Angle Sensor — branco (NC) | Não conectar |
| Grove Rotary Angle Sensor — vermelho (VCC) | 3V3 |
| Grove Rotary Angle Sensor — preto (GND) | GND |
| Joystick — pino “5V”/VCC | **3V3** |
| Joystick — GND | GND |
| Joystick — VRX | GPIO5 / ADC1_CH4 |
| Joystick — VRY | GPIO6 / ADC1_CH5 |
| Joystick — SW | GPIO7 / botão 4 |
| Botão 1 externo | GPIO2 e GND |
| Botão 2 de teste | BOOT da placa / GPIO0 |
| Botão 3 externo (futuro) | GPIO4 e GND |

Os botões usam os pull-ups internos do ESP32-S3: solto é nível alto e
pressionado é nível baixo. Os botões externos devem apenas fechar o respectivo
GPIO com GND, sem aplicar 3V3 ou 5V. GPIO0 também seleciona o modo de gravação:
o botão BOOT pode ser usado durante a execução, mas não deve ficar pressionado
ao ligar ou reiniciar a placa.

Alimente o Grove e o joystick com **3V3**, não com 5V. Mesmo que o pino de
alimentação do joystick esteja marcado “5V”, suas saídas analógicas podem chegar
até VCC; usar 3V3 mantém GPIO1, GPIO5 e GPIO6 dentro da faixa do ESP32-S3. O
botão SW do joystick fecha GPIO7 com GND quando pressionado.

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
2. Procure por **GamePad Sophia**.
3. Faça o pareamento como um controle/gamepad Bluetooth.
4. Se uma versão anterior já tiver sido pareada e o descriptor mudar, remova o
   dispositivo salvo no host e pareie novamente.

O firmware anuncia o appearance BLE específico de gamepad e volta a anunciar
automaticamente após uma desconexão.

## Relatório HID

O relatório de entrada usa **Report ID 1** e possui 7 bytes:

- bytes 0–1: joystick X assinado de 16 bits, little-endian;
- bytes 2–3: joystick Y assinado de 16 bits, little-endian;
- bytes 4–5: volante Rx assinado de 16 bits, little-endian;
- byte 6, bit 0: botão 1 / GPIO2 (`1` = pressionado);
- byte 6, bit 1: botão 2 / BOOT-GPIO0 (`1` = pressionado);
- byte 6, bit 2: botão 3 / GPIO4 (`1` = pressionado);
- byte 6, bit 3: botão 4 / joystick SW-GPIO7 (`1` = pressionado);
- byte 6, bits 4–7: padding em zero.

O joystick possui zona morta configurável ao redor do centro para evitar
movimento involuntário nos menus. Navegadores expõem os eixos pela Gamepad API
normalizados aproximadamente entre `-1` e `1`.

## Página de teste

Depois de parear o dispositivo no sistema operacional, sirva a página por
`localhost` para que o navegador disponibilize a Gamepad API:

```powershell
python -m http.server 8000 --directory server_teste
```

Abra `http://localhost:8000` no Chrome ou Edge. A página usa
`navigator.getGamepads()` para mostrar os três eixos normalizados, o estado
individual dos quatro botões e uma representação do volante.

Alguns navegadores só liberam a leitura após uma interação com o gamepad. Não é
usado Web Bluetooth: o pareamento HID é feito pelo sistema operacional e a
página acessa o controle pela Gamepad API.

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
