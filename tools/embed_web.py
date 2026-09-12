"""Embed the current web assets in each OTA image (no separately stale filesystem)."""
import gzip
import sys
from pathlib import Path

root, output = map(Path, sys.argv[1:])
files = [('jogo.html', 'text/html; charset=utf-8'), ('jogo.css', 'text/css'),
         ('jogo.js', 'text/javascript'), ('sophia-link.js', 'text/javascript'),
         ('console.html', 'text/html; charset=utf-8'), ('console.js', 'text/javascript'),
         ('index.html', 'text/html; charset=utf-8')]
lines = ['/* Generated: edit server_teste sources instead. */',
         'typedef struct { const char *uri; const char *mime; const unsigned char *data; size_t size; } web_asset_t;']
for i, (name, _) in enumerate(files):
    data = gzip.compress((root / name).read_bytes(), mtime=0)
    lines.append(f'static const unsigned char asset_{i}[] = {{' + ','.join(map(str, data)) + '};')
lines.append('static const web_asset_t web_assets[] = {')
for i, (name, mime) in enumerate(files):
    lines.append(f'{{"/{name}", "{mime}", asset_{i}, sizeof(asset_{i})}},')
lines.append('};')
output.write_text('\n'.join(lines), encoding='utf-8')
