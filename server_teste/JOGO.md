# Órbita — pista de provas Sophia

Execute no PowerShell:

```powershell
python -m http.server 8000 --bind 127.0.0.1 --directory "C:\Users\engpe\Documents\volante-diy-firmware\server_teste"
```

Abra http://127.0.0.1:8000/jogo.html no Chrome ou Edge. Conecte o controle no Bluetooth do Windows e pressione um botão. Se necessário, escolha o dispositivo no seletor. O jogo funciona offline, sem instalar bibliotecas.

- L: direção.
- R: câmera horizontal/vertical durante a condução; cima/baixo seleciona opções no menu.
- A / GPIO2: cada clique alterna 55, 95, 140 e novamente 55 km/h. No menu, confirma.
- B / GPIO3: freia enquanto pressionado. Ao soltar, volta gradualmente à velocidade selecionada.
- X / GPIO4: pausa e retoma.
- Teclado: setas esquerda/direita dirigem, W alterna velocidades, espaço freia, I/J/K/L movem a câmera, Esc pausa, cima/baixo e Enter operam o menu.

O menu permite inverter a direção e ajustar a zona morta; essas preferências ficam salvas neste navegador. A inversão começa ligada para testar a direção relatada pelo usuário. Ela afeta apenas este jogo, não o firmware nem outros jogos. Perda de foco ou desconexão do controle pausa a experiência.

HTML e CSS compõem a interface; JavaScript desenha a pista em Canvas 2D com perspectiva e lê a Gamepad API. As velocidades são simuladas. Para encerrar o servidor, use Ctrl+C no terminal.

Sensibilidade no menu: 0,6× (suave), 1,0× (normal), 1,4× e 1,8× (mais rápida), alternada com A. A zona morta continua independente. A pista tem movimento ampliado, aceleração mais rápida e rastros periféricos proporcionais à velocidade.
