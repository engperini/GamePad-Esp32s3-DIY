"""Capture physical USB console locally; redact its key in terminal output."""
import re
import sys
import time
from pathlib import Path
import serial

root = Path(__file__).resolve().parents[1]
with serial.Serial(sys.argv[1] if len(sys.argv) > 1 else 'COM7', 115200, timeout=.2) as port:
    port.dtr = False
    port.rts = True
    time.sleep(.15)
    port.rts = False
    end = time.monotonic() + 22
    chunks = []
    while time.monotonic() < end:
        chunks.append(port.read(4096))
raw = b''.join(chunks).decode('utf-8', 'replace')
(root / 'backups').mkdir(exist_ok=True)
(root / 'backups/console-boot-local.txt').write_text(raw, encoding='utf-8')
key = re.search(r'Chave Wi-Fi/administracao: ([0-9a-f]+)', raw)
ap = re.search(r'Console direto: rede ([^,]+)', raw)
if key and ap:
    (root / 'backups/ACESSO-CONSOLE.txt').write_text(
        f'Rede: {ap[1]}\nSenha Wi-Fi e chave de administracao: {key[1]}\nJogo: http://192.168.4.1/\nConfiguracao: http://192.168.4.1/console.html\n', encoding='utf-8')
print(re.sub(r'(Chave Wi-Fi/administracao: )[^\r\n\x1b]+', r'\1[guardada em backups/ACESSO-CONSOLE.txt]', raw))
