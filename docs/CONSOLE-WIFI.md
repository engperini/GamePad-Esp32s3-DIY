# Console Wi-Fi e OTA

O ESP32-S3 serve o jogo e lê volante, analógico R e botões. O navegador executa
física, gráficos e áudio. Não há streaming de vídeo nem dependência de internet.
O Bluetooth HID continua disponível com o mesmo descritor e mapeamento, incluindo
a inversão do volante já validada. O LED ainda não foi alterado.

## Conectar diretamente

1. Ligue o volante e conecte o dispositivo à rede `Sophia-Play-XXXX`.
2. A rede é aberta e não pede senha.
3. Abra `http://192.168.4.1/`. Se o aparelho avisar que a rede não tem internet,
   escolha permanecer conectado.
4. Em Configurações, deixe **Controle: Automático**. Solte os botões e o analógico R
   para habilitar a conexão. Apenas um navegador pode pilotar por vez.

O menu **Ajuda: conectar ao ESP32** explica os passos e abre a administração.
Teclado e toque continuam disponíveis. O servidor local do PC continua funcionando.

## Rede da casa

Abra `http://192.168.4.1/console.html`, escolha o modo e cadastre SSID/senha de 2,4 GHz.

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

Na administração, escolha `build/volante_ble_gamepad.bin` e envie.
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
A rede direta e a administração são abertas, sem senha ou chave, por escolha do
projeto DIY. Qualquer dispositivo conectado pode configurar a rede e enviar OTA. Não há assinatura criptográfica de firmware configurada.

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

## Atualização 1.1.1

Rede Sophia-Play aberta e administração/OTA sem chave. A senha do roteador continua
como campo opcional para conectar a uma rede local protegida. A chave antiga é
removida do NVS. O histórico acima descreve também os testes da versão 1.1.0.

Validação da 1.1.1 na placa: conexão à rede aberta confirmada; arquivos web atuais,
administração sem chave e snapshots passaram. OTA sem chave aplicado de ota_1 para
ota_0, com servidor disponível após reinício. No Windows foi necessário substituir
o perfil Wi-Fi antigo protegido pelo perfil aberto da mesma rede.

## Correção 1.1.2 — conexão do volante no navegador

O Chrome reproduziu `TypeError: Illegal invocation` em `socket.onopen` e
`socket.onclose`: os temporizadores nativos eram chamados como métodos do objeto
injetado de transporte, sem o receptor Window exigido pelo navegador. Isso impedia
o primeiro pedido de comandos e também comprometia a reconexão. Os testes de
protocolo em Node não detectavam essa diferença.

Os temporizadores agora são chamados por wrappers ligados à janela. Um teste do
bootstrap real da página verifica os quatro temporizadores com a exigência de
receptor do navegador. Firmware BLE e configuração da rede não foram alterados.

Versão aplicada por OTA pela LAN em 192.168.0.24, de ota_0 para ota_1. No Chrome,
a página passou a mostrar Sophia · Wi-Fi e eixos recebidos (L=-0,84; R=0/0) no
menu de diagnóstico. Build, testes do jogo, transporte, HID e partições passaram.
O mesmo JavaScript atende os acessos AP e LAN; a validação visual desta correção
foi feita pelo endereço da LAN. O usuário também confirmou nesta etapa que o
modo roteador serviu a página com sucesso.

## Atualização 1.2.0 — garagem e novos tesouros

Adicionada à tela inicial a Garagem da Sophia, com Renegade branco, BYD Song Pro
cinza, Foguete e Buggy, seis cores e prévia animada. Os carros são desenhos vetoriais
do Canvas, compactos e recoloríveis; não usam fotografias nem dependem de internet.
Coração, doce e cristal passam a alternar com a estrela como colecionáveis.

Aplicada por OTA pela rede local em `192.168.0.24`, de `ota_1` para `ota_0`.
O status confirmou firmware 1.2.0, modo híbrido e servidor ativo depois do reinício.
A garagem foi aberta e revisada no Chrome diretamente a partir do ESP32; a conexão
`Sophia · Wi-Fi` voltou após a janela normal de reconexão. Os testes de física,
garagem, colecionáveis, transporte Wi-Fi, HID e partições passaram.

## Atualização 1.3.0 — quatro percursos e garagem estática

Prévia fixa em três quartos, com carrocerias projetadas em Canvas, rodas,
vidros, lanternas e seis cores. O arquivo cars.js é incorporado à mesma imagem
OTA do jogo. Som ativado por padrão; B buzina e o clique R freia, preservando
os eixos de câmera e o relatório Bluetooth do firmware.

Quatro pistas de 2,5 a 3,5 km, curvas suaves e cenários laterais com casas,
cercas, prédios, mar, palmeiras, árvores, pedras e defensas.

Aplicada por OTA na LAN em 192.168.0.24, de ota_1 para ota_0. Status confirmou
1.3.0 e modo híbrido após o reinício. HTML, CSS, jogo.js, cars.js e sophia-link.js
servidos pela placa foram comparados byte a byte com os arquivos ativos.
Imagem de 1.112.128 bytes, com 43% da partição OTA livre. Testes de física,
controles, som, quatro pistas, garagem estática, transporte, HID e partições
passaram; garagem e costa revisadas no navegador.
