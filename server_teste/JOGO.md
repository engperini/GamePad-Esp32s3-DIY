# Órbita Kids — uma aventura Sophia

Execute no PowerShell:

```powershell
python -m http.server 8000 --bind 127.0.0.1 --directory "C:\Users\engpe\Documents\volante-diy-firmware\server_teste"
```

Abra http://127.0.0.1:8000/jogo.html no Chrome ou Edge. O jogo usa somente
jogo.html, jogo.css, cars.js, jogo.js e sophia-link.js. Gráficos e sons são gerados localmente, sem CDN,
fontes externas, cadastro ou internet depois de obter esses arquivos.

## Como brincar

Escolha Jardim das Nuvens (4,58 km), Estrada das Estrelas (5,29 km), Costa dos
Golfinhos (6,21 km) ou Vale das Araucárias (5,54 km). Os cenários têm casas e cercas,
prédios iluminados, mar e palmeiras, ou pinheiros e pedras. Colete tesouros e desvie
dos carros, cones e barreiras. Ao terminar, o próximo mundo começa automaticamente, preservando velocidade,
ritmo e tesouros acumulados. Depois do quarto mundo, o circuito volta ao primeiro.
Não há game over.
Curvas são visíveis desde o início, com transições suaves. Retas de cerca de
208 metros foram inseridas nas transições entre curvas, sem eliminar os trechos
curvos anteriores. O minimapa no canto superior direito mostra o percurso aberto,
a posição atual, o trecho percorrido e o fim da fase. Há oito tesouros por
obstáculo, em grupos separados por trechos livres. Os carros na pista são
obstáculos parados para preservar essa separação. Há mais carros entre os obstáculos, mantendo livres os grupos de colecionáveis.
O carro do jogador não emite brilho e tem iluminação reduzida na fase noturna.
A buzina faz dois bipes agudos.
A inclinação visual máxima ao virar é de cerca de 4 graus. O acostamento limita o ritmo e ajuda o carro a voltar mesmo
partindo do repouso ao acelerar; parado não há deslocamento lateral. Colisões
retiram 75% da velocidade, adiam a aceleração em 0,8 segundo e dão proteção
de 1,5 segundo. A direção responde por ângulo progressivo, proporcional ao
movimento para a frente, com troca de faixa mais rápida.

- L: direção.
- R: câmera na pista; cima/baixo navega nos menus.
- A / GPIO2: cliques alternam 55, 95, 140, 55 km/h; no menu confirma.
- B / GPIO3: buzina; nos menus volta.
- Clique do analógico R / GPIO7: segure para frear.
- X / GPIO4: pausa/retoma ou volta das configurações.
- Teclado: esquerda/direita dirige, W alterna ritmo, espaço freia, I/J/K/L câmera,
  H buzina, Esc pausa, cima/baixo e Enter navegam.
- Tela sensível ao toque: esquerda/direita, acelerar por clique, buzina e freio segurado.

Configurações reúne inversão, sensibilidade, zona morta, som ativado por padrão, tela cheia
e diagnóstico do gamepad. Preferências são salvas no navegador. Com o firmware
invertido validado, use inversão NÃO. A preferência antiga é preservada se já salva.
Estrelas emitem duas notas agudas e colisões um impacto grave. Sons começa em SIM (inclusive ao migrar preferências antigas); depois, sua escolha
SIM/NÃO fica salva. O som pode exigir um toque/clique na página por política do navegador.
Perda de foco ou desconexão do controle pausa a aventura.

## Garagem da Sophia

Na tela inicial, **Personalizar carro** abre a garagem. Há quatro desenhos vetoriais:
Renegade, BYD Song Pro, Foguete e Buggy. O Renegade começa branco e o Song Pro,
cinza; qualquer modelo aceita branco, cinza, rosa, azul, verde ou amarelo. A prévia
fica estática em vista lateral 2D, mostrando vidros, rodas, lanterna traseira,
farol dianteiro e pintura. O desenho usa Canvas sem imagens externas. A escolha fica salva neste navegador
e aparece no carro dirigido. O menu funciona por toque/mouse, teclado e gamepad.

Além das estrelas, a pista alterna corações, doces e cristais. Todos são colecionáveis,
usam o mesmo som positivo e contam como tesouros; carros, cones e barreiras continuam
sendo obstáculos.

## Portabilidade

Em Configurações, o painel **Seu console na rede** mostra os IPs atuais do modo
direto e do roteador. O botão **Configurações avançadas · Console** abre a página
de Wi-Fi e OTA sem digitar endereço. Os IPs são consultados na placa, não fixados
no jogo; o painel também informa quando uma das conexões está desativada.

O pacote é web estático, não um APK/PWA instalado. Android e TVs ainda precisam
de validação no aparelho real. Gamepad Bluetooth exige navegador/host compatíveis
e contexto seguro (HTTPS ou localhost). O endereço 127.0.0.1 é do aparelho que
abre o navegador: não acessa o PC quando digitado no celular.

Para levar a outro servidor, copie a pasta server_teste e abra jogo.html.
Para um console no ESP32, veja ../docs/CONSOLE-WIFI.md. O servidor e o transporte
WebSocket estão implementados; a ajuda no menu explica AP, rede local e OTA.

Verificações: node tests/check_game.cjs e node tests/check_page.cjs, na raiz.
