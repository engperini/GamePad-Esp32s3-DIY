"""Check the HID descriptor that is actually embedded in the compiled firmware."""
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = (root / 'main/esp_hid_device_main.c').read_text(encoding='utf-8')
body = source.split('gamepad_report_map[] = {')[1].split('};')[0]
body = re.sub(r'/\*.*?\*/', '', body, flags=re.S)
data = bytes(int(x, 16) for x in re.findall(r'0x[0-9A-Fa-f]+', body))
assert data in (root / 'build/volante_ble_gamepad.bin').read_bytes()
size = count = page = report_id = 0
inputs = []
usages = []
i = 0
while i < len(data):
    key = data[i]
    n = [0, 1, 2, 4][key & 3]
    value = int.from_bytes(data[i+1:i+1+n], 'little')
    i += 1 + n
    tag = key & 0xfc
    if tag == 0x04: page = value
    elif tag == 0x08: usages.append(value)
    elif tag == 0x74: size = value
    elif tag == 0x94: count = value
    elif tag == 0x84: report_id = value
    elif tag == 0x80: inputs.append((page, size, count, value, usages[:]))
    if (key & 0x0c) == 0: usages.clear()
assert report_id == 1
assert inputs == [(1,16,4,2,[0x30,0x31,0x33,0x34]), (9,1,5,2,[]), (9,3,1,3,[])], inputs
assert sum(size * count for _,size,count,_,_ in inputs) == 72
print('PASS: compiled HID descriptor: X/Y/Rx/Ry, 5 buttons, 9-byte report.')
