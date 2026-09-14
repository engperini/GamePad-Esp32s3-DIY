# Botões do GamePad Sophia — firmware 1.4.0

Edite `botoes_usos_hid` em `main/esp_hid_device_main.c`:

```c
static const uint8_t botoes_usos_hid[QUANTIDADE_BOTOES] = {1, 2, 4, 15, 12};
```

| Entrada física | Função | Uso HID |
|---|---|---|
| GPIO2 | A | 1 |
| GPIO3 | B | 2 |
| GPIO4 | X | 4 |
| GPIO7, clique do analógico | R3 | 15 |
| GPIO0, BOOT | Start | 12 |

Os valores são usos HID, não índices da Gamepad API. Use valores únicos entre
1 e 15. O relatório Bluetooth mantém os quatro eixos e passa a ter 10 bytes:
8 de eixos e 2 de botões. Os slots sem botão físico ficam soltos.
O transporte Wi-Fi mantém seus cinco bits físicos originais; o jogo interpreta
separadamente o formato Wi-Fi, o HID bruto e o mapeamento padrão do navegador.

No Órbita: A acelera/confirma, B buzina/volta, X ou Start pausa e R3 freia.
As funções do jogo ficam em `input()` de `server_teste/jogo.js`.
BOOT por cinco segundos continua sendo o comando de recuperação da rede.

Depois de trocar o descritor HID, esqueça e pareie novamente o controle caso
o aparelho mantenha o mapeamento anterior. A interpretação deve ser validada
no aparelho/jogo alvo; isto não emula o protocolo proprietário XInput.

## Resposta do volante

`ADC_MIN`, `ADC_MAX` e `mapear_adc_para_eixo()` no mesmo arquivo definem a
conversão linear do potenciômetro para -32767 a 32767. `VOLANTE_INVERTIDO`
controla o sentido. Não há zona morta programada para o volante no firmware.
A zona morta de 320 é exclusivamente do analógico R.

A sensibilidade nas configurações do Órbita só vale nesse jogo. Antes de alterar
a calibração do firmware, observe o eixo no testador enquanto gira lentamente:
se a leitura sobe gradualmente mas o jogo da TV vira abruptamente, investigue
a configuração/compatibilidade daquele jogo; se o próprio eixo salta ou satura,
meça sensor, alimentação e curso útil. A versão 1.4.0 não altera essa calibração.
