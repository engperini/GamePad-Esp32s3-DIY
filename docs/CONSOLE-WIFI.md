# Console Wi-Fi e OTA

O ESP32-S3 serve o jogo e lê volante, analógico R e botões. O navegador executa
física, gráficos e áudio. Não há streaming de vídeo nem dependência de internet.
O Bluetooth HID continua disponível com o mesmo descritor e mapeamento, incluindo
a inversão do volante já validada. O LED ainda não foi alterado.

## Conectar diretamente

1. Ligue o volante e conecte o dispositivo à rede `Sophia-Play-XXXX`.
2. Use a senha individual impressa na USB durante a inicialização. Nesta instalação,
   ela também está no arquivo local `backups/ACESSO-CONSOLE.txt`, excluído do Git.
3. Abra `http://192.168.4.1/`. Se o aparelho avisar que a rede não tem internet,
   escolha permanecer conectado.
4. Em Configurações, deixe **Controle: Automático**. Solte os botões e o analógico R
   para habilitar a conexão. Apenas um navegador pode pilotar por vez.

O menu **Ajuda: conectar ao ESP32** explica os passos e abre a administração.
Teclado e toque continuam disponíveis. O servidor local do PC continua funcionando.

## Rede da casa

Abra `http://192.168.4.1/console.html`, informe a chave de administração (a mesma
senha individual do console), escolha o modo e cadastre SSID/senha de 2,4 GHz.

- **Direto:** somente a rede criada pelo ESP32, além do BLE.
- **Rede local:** conecta ao roteador; após obter IP, desliga a rede própria.
- **Ambos:** mantém a rede própria e conecta também ao roteador.

O ESP32 é cliente do roteador (STA); não é um repetidor/NAT de internet.
Dispositivos na mesma LAN abrem `http://IP-DO-ESP32/`. O IP aparece na administração
no modo Ambos, no log USB ou na lista DHCP do roteador. Reserve esse IP no roteador
se quiser um endereço estável. Redes de convidados com isolamento bloqueiam esse acesso.

Se a rede local falhar, o ponto de acesso é reativado em até cerca de 30 segundos.
Segurar BOOT por 5 segundos, com a placa já ligada, também ativa a recuperação sem
apagar pareamentos ou configurações. Não segure BOOT ao ligar: isso entra no gravador USB.
Use primeiro Ambos para descobrir o IP e depois, se desejar, troque para Rede local.

## Atualizar por OTA

Na administração, informe a chave, escolha `build/volante_ble_gamepad.bin` e envie.
A página mostra progresso e o ESP32 reinicia ao concluir. O jogo e suas páginas
estão compactados dentro do mesmo firmware: uma atualização entrega todos juntos.

Há dois slots de aplicação de `0x1e0000` bytes cada (1.875 MiB). O upload grava no
slot inativo, verifica tamanho, chip, projeto e integridade da imagem antes de
selecioná-la. Uma transferência interrompida mantém o firmware atual selecionado.
O bootloader permite rollback; a nova imagem confirma a inicialização após o servidor
estar ativo e a amostragem saudável por 10 segundos. Isso não substitui testar a
jogabilidade nem a conexão Bluetooth em cada aparelho.

Envie somente a aplicação deste projeto. Bootloader, tabela de partições e imagens
completas da flash não são arquivos OTA. Alterar partições exige nova migração USB.
A administração usa HTTP com chave: destina-se à rede local confiável, sem publicar
portas na internet. Não há assinatura criptográfica de firmware configurada.

## Compilar e migrar via USB

ESP-IDF v5.5, alvo esp32s3, flash física de 4 MB. `idf.py build` gera os arquivos
web a partir de `server_teste`; não edite o cabeçalho gerado em build.
`idf.py -p COM7 flash` grava bootloader/tabela/aplicação/otadata. Antes da primeira
migração, faça backup completo dos 4 MB. O mapa mantém NVS em 0x9000 (0x6000 bytes)
e PHY em 0xf000, preservando a localização dos dados de pareamento. Não use erase-flash.

Testes locais: `node tests/check_game.cjs`, `node tests/check_page.cjs`,
`node tests/check_link.cjs` e, após compilar, `python tests/check_report.py`.

## Transporte e compatibilidade

HTTP serve sete arquivos compactados; WebSocket `/ws` fornece snapshots a pedido,
a cada 20 ms. Formato: `[1, sequencia, Lx, Rx, Ry, botoes, idadeMs]`. Eixos assinados
entre -32767 e 32767, botões nos bits 0 a 4. O cliente valida sequência e idade,
desconsidera snapshots repetidos para o timeout e perde o controle após 350 ms sem
dado novo. A perda pausa uma partida que usava esse controle. Reconexão exige
liberar botões e R. Selecionar Wi-Fi nunca troca silenciosamente para outro gamepad.

Em um servidor comum, a detecção de `/api/status` falha e o jogo continua usando a
Gamepad API original. No ESP32, os comandos próprios por WebSocket evitam depender
da Gamepad API em HTTP sem contexto seguro. O testador antigo index.html continua
voltado à Gamepad API em localhost/HTTPS.

Wi-Fi e BLE compartilham o rádio; a coexistência está habilitada, com tarefas de
Wi-Fi e NimBLE em núcleos diferentes. STA + BLE é suportado; SoftAP + BLE pode ter
variações de desempenho. Manter o mapeamento não garante latência idêntica sob carga.
TV/tablet/celular precisam de navegador com Canvas, JavaScript e WebSocket. Android
TV deve ser validado no aparelho. Um display apenas com Wi-Fi não executa o jogo.

Referências oficiais:
- https://docs.espressif.com/projects/esp-idf/en/v5.5/esp32s3/api-guides/coexist.html
- https://docs.espressif.com/projects/esp-idf/en/v5.5/esp32s3/api-reference/protocols/esp_http_server.html
- https://docs.espressif.com/projects/esp-idf/en/v5.5/esp32s3/api-reference/system/ota.html

## Validação desta placa em 12/09/2026

- ESP32-S3 SuperMini, MAC físico 28:84:85:6e:0f:e8, flash de 4 MB.
- Backup completo antes da migração: `backups/pre-wifi-ota-20260912.bin`, SHA-256
  `8dfeedc752ef078309a6a67d996ef7f8bc6de8b106e1f60a8f5d9ac68d4e290d`.
- Migração USB com verificação dos hashes; NVS e PHY não foram apagados.
- Build 1.1.0: 1.105.472 bytes; aproximadamente 44% livres em cada slot.
- Sete arquivos HTTP recebidos da placa e comparados byte a byte com os fontes.
- Rejeição de configuração sem chave, modo inválido e imagem OTA inválida.
- 60 snapshots WebSocket válidos, exclusividade de piloto e primeiro cliente
  mantido após recusar o segundo. RTT mediano 54,8 ms, percentil 95 de 159,2 ms
  nesta bancada; não é uma medida de movimento físico até aparecer na tela.
- OTA real via Wi-Fi de ota_0 para ota_1. Servidor retornou após reinício e o
  boot seguinte continuou carregando ota_1 (0x1f0000), sem rollback inesperado.
- Testes do jogo, testador HID, transporte e geometria de partições passaram.
- Ajuda conferida no navegador em localhost.

Ainda pendentes: configuração/teste com o roteador de 2,4 GHz do usuário e teste
em TV/tablet. O descritor e mapeamento BLE permanecem iguais; o log posterior
registrou encerramentos remotos repetidos (531 = HCI 0x13). Não declarar estabilidade
Bluetooth validada nesta atualização apenas porque houve conexão. A confirmação
no aparelho usado pelo usuário ainda é necessária. A opção NimBLE NVS_PERSIST
já estava desativada na configuração anterior e não foi alterada: preservar a
região NVS não adiciona persistência de vínculos que antes não existia.

Confirmação posterior do usuário: Bluetooth funcionando após reiniciar e esquecer/
parear novamente no aparelho. Portanto, o uso físico foi confirmado, mas a necessidade
de refazer o pareamento deve permanecer registrada; esta etapa não mudou a política
de persistência Bluetooth.
