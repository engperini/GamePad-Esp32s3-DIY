# Console Wi-Fi — viabilidade e proposta

## Estado atual

Órbita Kids é um jogo Canvas 2D com perspectiva, executado no navegador. A versão
atual recebe Gamepad API, teclado e toque. Não existe servidor Wi-Fi nem protocolo
de controles WebSocket implementado no firmware atual. Nenhuma gravação foi
feita na placa para esta mudança do jogo.

## Arquitetura proposta para um console independente

1. ESP32-S3 cria uma rede Wi-Fi local protegida, por exemplo Sophia-Play.
2. TV, tablet ou celular conecta nessa rede e abre um endereço local do ESP32
   (192.168.4.1 é uma escolha possível a configurar, não um servidor já disponível).
3. ESP32 entrega HTML/CSS/JavaScript armazenados na flash, com MIME e cache corretos.
4. O navegador executa física, gráficos, interface e áudio. Não há streaming de vídeo.
5. ESP32 lê ADC/botões e envia snapshots pequenos, por exemplo 50 vezes por segundo,
   por WebSocket para a página. Bluetooth não é necessário neste modo de jogo.
6. O cliente aplica sequência/timestamp e pausa se perder o sinal. Reconexão exige
   neutralizar entradas para impedir aceleração involuntária. Só um cliente pilota.

Isto é uma proposta, não uma medição de latência. É necessário medir resposta,
perda de pacotes e uso de RAM na placa e nos aparelhos de destino.

O servidor HTTP oficial do ESP-IDF suporta arquivos e WebSocket:
https://docs.espressif.com/projects/esp-idf/en/v5.5/esp32s3/api-reference/protocols/esp_http_server.html

## Por que não simplesmente HTTP local + Gamepad Bluetooth?

A Gamepad API é restrita a contextos seguros. Localhost é uma exceção confiável,
mas http://192.168.4.1 não se torna seguro só por estar na rede local. Um certificado
HTTPS autoassinado não fornece confiança automática em qualquer aparelho.

Servir a página por HTTP local e enviar o próprio controle por WebSocket da mesma
origem evita depender da Gamepad API nesse modo. Isso ainda precisa ser validado
com as políticas e implementações dos navegadores escolhidos.

Referências:
https://developer.mozilla.org/en-US/docs/Web/API/Navigator/getGamepads
https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts

## Android, TV e limites

Em tablet/celular, navegador moderno com Canvas e WebSocket é um bom alvo. Para
usar Bluetooth, o sistema precisa reconhecer este HID e o navegador expor os eixos.
Android TV pode usar um navegador compatível ou futuramente um aplicativo que
embuta a experiência. Não se pode prometer funcionamento em todo navegador de TV.
Um display com Wi-Fi, sem navegador e processamento suficientes, não basta.
PWA offline e pacote Android são caminhos adicionais; não estão implementados.

A placa identificada tem 4 MB físicos de flash e 2 MB de PSRAM, mas a configuração
atual de gravação usa 2 MB e uma partição de aplicação de 1 MB. Antes de adicionar
Wi-Fi/arquivos, revisar mapa de partições e orçamento real do binário. Não basta
somar o tamanho do JavaScript. Pode-se embutir arquivos compactados ou usar uma
partição de dados; preservar NVS e pareamento ao planejar a atualização.

Wi-Fi e BLE compartilham o rádio de 2,4 GHz no ESP32-S3. Para este jogo independente,
proponho um modo Wi-Fi dedicado e manter um modo BLE para os outros jogos. Caso
ambos operem juntos, configurar e testar coexistência e latência.
https://docs.espressif.com/projects/esp-idf/en/v5.0/esp32s3/api-guides/coexist.html

## Próximo passo de implementação

Implementar SoftAP, entrega de arquivos e WebSocket em etapa própria; medir memória,
compilar e testar antes de gravar. Depois validar em uma TV Android e um celular reais.
O LED continua pendente da identificação física de seu circuito.
