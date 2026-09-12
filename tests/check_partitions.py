"""Verify migration geometry and that both OTA slots fit the actual image."""
import csv
from pathlib import Path
root = Path(__file__).resolve().parents[1]
rows = {}
end = 0x9000
for line in (root/'partitions.csv').read_text().splitlines():
    if not line.strip() or line.startswith('#'): continue
    name, kind, subtype, offset, size, *_ = next(csv.reader([line]))
    start, length = int(offset, 0), int(size, 0)
    assert start >= end, 'overlap'
    assert start % 4096 == 0 and length % 4096 == 0
    if kind.strip() == 'app': assert start % 65536 == 0
    end = start + length
    rows[name.strip()] = (start, length)
assert end <= 0x400000
assert rows['nvs'] == (0x9000, 0x6000)
assert rows['phy_init'] == (0xf000, 0x1000)
assert rows['otadata'][1] == 0x2000
size = (root/'build/volante_ble_gamepad.bin').stat().st_size
assert size <= rows['ota_0'][1] == rows['ota_1'][1]
print(f'PASS: 4 MB geometry, legacy NVS/PHY preserved, application {size} bytes fits both OTA slots')
