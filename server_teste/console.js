'use strict';
const byId = id => document.getElementById(id);
let info = null, busy = false;
function report(text) { byId('result').textContent = text; }
async function refresh() {
  try {
    const response = await fetch('/api/status', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw Error();
    info = await response.json(); if (info.device !== 'sophia-console') throw Error();
    byId('status').textContent = `Firmware ${info.version} · slot ${info.slot}. Rede direta: ${info.ap} (${info.ap_on ? 'ativa' : 'desligada'}). Rede local: ${info.connected ? 'http://' + info.ip + '/' : 'desconectada'}. Limite OTA: ${Math.floor(info.ota_max / 1024)} KiB.`;
    byId('mode').value = info.mode; byId('ssid').value = info.ssid;
  } catch { info = null; byId('status').textContent = 'Abra esta página pelo IP do ESP32. O servidor Python do computador não configura a placa.'; }
}
function lock(value) { busy = value; byId('save').disabled = byId('upload').disabled = value; }
byId('refresh').onclick = refresh;
byId('network').onsubmit = async event => {
  event.preventDefault(); if (busy) return;
  if (!info) { report('Conecte ao ESP32.'); return; }
  lock(true);
  try {
    const response = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: byId('mode').value, ssid: byId('ssid').value, password: byId('password').value }), signal: AbortSignal.timeout(10000) });
    const text = await response.text(); if (!response.ok) throw Error(text);
    byId('password').value = ''; report(text + ' Após reconectar, abra o novo endereço.');
  } catch (error) { report(error.message || 'Falha ao salvar a rede.'); } finally { lock(false); }
};
byId('upload').onclick = () => {
  if (busy) return;
  const file = byId('firmware').files[0];
  if (!info || !file) { report('Conecte ao ESP32 e escolha o .bin.'); return; }
  if (!file.name.endsWith('.bin') || file.size < 512 || file.size > info.ota_max) { report('Arquivo inválido ou maior que a partição OTA.'); return; }
  if (!confirm(`Atualizar o console com ${file.name}? O jogo será interrompido e a placa reiniciará.`)) return;
  lock(true); byId('progress').value = 0;
  const xhr = new XMLHttpRequest(); xhr.open('POST', '/api/ota'); xhr.timeout = 190000;
  xhr.setRequestHeader('Content-Type', 'application/octet-stream');
  xhr.upload.onprogress = e => { if (e.lengthComputable) byId('progress').value = e.loaded / e.total * 100; };
  xhr.onload = () => { report(xhr.responseText || 'Confira o estado do console.'); lock(false); };
  xhr.onerror = xhr.ontimeout = () => { report('Conexão interrompida. Reconecte e confira a versão antes de tentar novamente.'); lock(false); };
  xhr.send(file);
};
refresh();
