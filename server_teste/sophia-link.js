/* Optional same-origin Wi-Fi transport. A normal static server keeps Gamepad API. */
(function (root) {
  'use strict';
  function decode(message) {
    let p; try { p = JSON.parse(message); } catch { return null; }
    if (!Array.isArray(p) || p.length !== 7 || p[0] !== 1 || !p.every(Number.isInteger)) return null;
    if (p[1] < 0 || p[1] > 0xffffffff || p.slice(2, 5).some(v => Math.abs(v) > 32767) || p[5] < 0 || p[5] > 255 || p[6] < 0 || p[6] > 250) return null;
    return { seq: p[1], axes: [p[2] / 32767, 0, p[3] / 32767, p[4] / 32767], buttons: p[5] };
  }
  class Link {
    constructor(env) { this.env = env; this.available = false; this.pad = null; this.last = -Infinity; this.seq = null; this.armed = false; this.source = 'auto'; this.socket = null; this.status = 'Bluetooth / teclado'; this.pending = false; this.epoch = 0; }
    wifiSelected() { return this.source === 'wifi' || (this.source === 'auto' && this.available); }
    receive(message) {
      const p = decode(message);
      if (!p) return false;
      if (this.seq !== null) { const difference = (p.seq - this.seq) >>> 0; if (!difference) { this.pending = false; return false; } if (difference > 0x7fffffff) return false; }
      this.seq = p.seq; this.last = this.env.now(); this.pending = false;
      if (!this.armed) {
        // Require buttons and menu joystick to be released after every reconnect.
        if (p.buttons || Math.abs(p.axes[2]) > .45 || Math.abs(p.axes[3]) > .45) { this.status = 'Solte botões e R para conectar'; return true; }
        this.armed = true;
      }
      this.pad = { id: 'Sophia · Wi-Fi', index: 99, mapping: 'standard', axes: p.axes,
        buttons: Array.from({ length: 8 }, (_, i) => ({ pressed: !!(p.buttons & (1 << i)), value: (p.buttons >> i) & 1 })) };
      this.status = 'Volante por Wi-Fi'; return true;
    }
    getGamepad() { return this.pad && this.env.now() - this.last <= 350 ? this.pad : null; }
    stop() {
      this.epoch++; if (this.timer) this.env.clearInterval(this.timer); if (this.retry) this.env.clearTimeout(this.retry);
      this.timer = this.retry = null; const socket = this.socket; this.socket = null;
      this.pad = null; this.armed = false; this.seq = null; this.pending = false; this.last = -Infinity;
      if (socket) socket.close();
    }
    setSource(value) {
      this.stop(); this.source = ['auto', 'wifi', 'local'].includes(value) ? value : 'auto';
      if (this.wifiSelected()) this.connect(); else this.status = 'Bluetooth / teclado';
    }
    connect() {
      if (!this.wifiSelected() || !this.available) { this.status = 'Abra o jogo no endereço do ESP32'; return; }
      const epoch = this.epoch, socket = new this.env.WebSocket(this.env.url);
      this.socket = socket; this.last = this.env.now(); this.status = 'Conectando ao volante…';
      socket.onopen = () => {
        if (epoch !== this.epoch) return;
        this.last = this.env.now();
        this.timer = this.env.setInterval(() => {
          if (this.env.now() - this.last > 350) { this.pad = null; socket.close(); return; }
          if (socket.readyState === 1 && !this.pending) { this.pending = true; socket.send('?'); }
        }, 20);
      };
      socket.onmessage = e => { if (epoch === this.epoch) this.receive(e.data); };
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        if (epoch !== this.epoch) return;
        this.pad = null; this.seq = null; this.armed = false; this.pending = false;
        if (this.timer) this.env.clearInterval(this.timer); this.timer = null;
        this.status = 'Wi-Fi sem sinal / outro jogador conectado';
        this.retry = this.env.setTimeout(() => this.connect(), 1500);
      };
    }
  }
  if (typeof module !== 'undefined') { module.exports = { Link, decode }; return; }
  // Window timer functions require their native receiver in browsers. Wrappers
  // keep Link's injected environment from becoming their `this` value.
  const link = new Link({ now: () => performance.now(), WebSocket,
    setInterval: (fn, ms) => root.setInterval(fn, ms), clearInterval: id => root.clearInterval(id),
    setTimeout: (fn, ms) => root.setTimeout(fn, ms), clearTimeout: id => root.clearTimeout(id),
    url: `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws` });
  root.SophiaLink = link;
  fetch('/api/status', { cache: 'no-store', signal: AbortSignal.timeout(2500) }).then(r => r.ok ? r.json() : null).then(status => {
    if (status?.device === 'sophia-console' && status.protocol === 1) { link.available = true; link.setSource(link.source); }
  }).catch(() => {});
})(typeof window === 'undefined' ? {} : window);
