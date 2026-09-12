# Órbita Kids — uma aventura Sophia

Execute no PowerShell:

```powershell
python -m http.server 8000 --bind 127.0.0.1 --directory "C:\Users\engpe\Documents\volante-diy-firmware\server_teste"
```

Abra http://127.0.0.1:8000/jogo.html no Chrome ou Edge. O jogo usa somente
jogo.html, jogo.css e jogo.js. Gráficos e sons são gerados localmente, sem CDN,
fontes externas, cadastro ou internet depois de obter esses arquivos.

## Como brincar

Escolha Jardim das Nuvens (dia, balões e árvores) ou Estrada das Estrelas (noite).
Colete estrelas e desvie dos carros, cones e barreiras listradas. Cada fase termina após 1 km
simulado, mostra estrelas/desvios e oferece o outro mundo. Não há game over.
Curvas são suaves. O acostamento limita o ritmo e ajuda o carro a voltar mesmo
partindo do repouso ao acelerar; parado não há deslocamento lateral. Colisões
retiram 75% da velocidade, adiam a aceleração em 0,8 segundo e dão proteção
de 1,5 segundo. A direção responde por ângulo progressivo, proporcional ao
movimento para a frente, com troca de faixa mais rápida.

- L: direção.
- R: câmera na pista; cima/baixo navega nos menus.
- A / GPIO2: cliques alternam 55, 95, 140, 55 km/h; no menu confirma.
- B / GPIO3: segure para frear; no menu de configurações volta.
- X / GPIO4: pausa/retoma ou volta das configurações.
- Teclado: esquerda/direita dirige, W alterna ritmo, espaço freia, I/J/K/L câmera,
  Esc pausa, cima/baixo e Enter navegam.
- Tela sensível ao toque: esquerda/direita, acelerar por clique e freio segurado.

Configurações reúne inversão, sensibilidade, zona morta, som opcional, tela cheia
e diagnóstico do gamepad. Preferências são salvas no navegador. Com o firmware
invertido validado, use inversão NÃO. A preferência antiga é preservada se já salva.
Estrelas emitem duas notas agudas e colisões um impacto grave. Ative Sons em
Configurações. O som pode exigir um toque/clique na página por política do navegador.
Perda de foco ou desconexão do controle pausa a aventura.

## Portabilidade

O pacote é web estático, não um APK/PWA instalado. Android e TVs ainda precisam
de validação no aparelho real. Gamepad Bluetooth exige navegador/host compatíveis
e contexto seguro (HTTPS ou localhost). O endereço 127.0.0.1 é do aparelho que
abre o navegador: não acessa o PC quando digitado no celular.

Para levar a outro servidor, copie a pasta server_teste e abra jogo.html.
Para um console no ESP32, veja ../docs/CONSOLE-WIFI.md. O servidor e o transporte
WebSocket estão implementados; a ajuda no menu explica AP, rede local e OTA.

Verificações: node tests/check_game.cjs e node tests/check_page.cjs, na raiz.
