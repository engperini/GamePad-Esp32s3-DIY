const assert = require('node:assert/strict');
const {Link, decode} = require('../server_teste/sophia-link.js');
let now = 0;
const packet = (seq, buttons = 0, rx = 0, age = 0) => JSON.stringify([1, seq, 32767, rx, -16384, buttons, age]);
assert.equal(decode('invalid'), null);
assert.equal(decode(packet(1, 32)), null);
assert.equal(decode(packet(1, 0, 32768)), null);
assert.equal(decode(packet(1, 0, 0, 251)), null);
assert.equal(decode(packet(-1)), null);
assert.deepEqual(decode(packet(1)).axes.slice(0,2), [1, 0]);
const link = new Link({now:()=>now});
assert.equal(link.wifiSelected(), false);
link.available=true; assert.equal(link.wifiSelected(), true);
link.source='local'; assert.equal(link.wifiSelected(), false);
link.source='wifi'; link.available=false; assert.equal(link.wifiSelected(), true);
const neutral = seq => JSON.stringify([1, seq, 32767, 0, 0, 0, 0]);
link.receive(packet(1, 1)); assert.equal(link.getGamepad(), null);
link.receive(neutral(2)); assert.equal(link.getGamepad().axes[0], 1);
link.receive(packet(3, 5)); assert.equal(link.getGamepad().buttons[2].pressed, true);
now=300; assert.equal(link.receive(packet(3, 5)), false);
assert.equal(link.receive(packet(2)), false);
now=351; assert.equal(link.getGamepad(), null); // duplicate never refreshes timeout
link.seq=0xffffffff; assert.equal(link.receive(neutral(0)), true);
link.stop(); assert.equal(link.getGamepad(), null); assert.equal(link.armed,false);
let interval, retry, socket;
class Socket {constructor(){socket=this;this.readyState=1;} send(value){this.sent=value;} close(){this.closed=true;this.onclose?.();}}
const live = new Link({now:()=>now,WebSocket:Socket,url:'ws://test/ws',setInterval:fn=>(interval=fn,1),clearInterval:()=>{},setTimeout:fn=>(retry=fn,2),clearTimeout:()=>{}});
live.available=true; live.setSource('auto'); socket.onopen(); interval(); assert.equal(socket.sent,'?');
socket.onmessage({data:neutral(1)}); assert.ok(live.getGamepad());
now+=351; interval(); assert.equal(socket.closed,true); assert.equal(live.getGamepad(),null);
retry(); const oldSocket=socket; live.setSource('local'); oldSocket.onmessage({data:neutral(2)});
assert.equal(live.getGamepad(),null); assert.equal(live.wifiSelected(),false);
console.log('PASS Wi-Fi: validation, arming, sequence/wrap, stale timeout, reconnect and source isolation');
// Exercise the actual browser bootstrap, with Window's receiver requirement.
const vm = require('node:vm'), fs = require('node:fs');
const windowObject = {};
const calls = [];
for (const name of ['setInterval','clearInterval','setTimeout','clearTimeout']) {
  windowObject[name] = function(){ assert.equal(this,windowObject,'Window timer receiver');calls.push(name);return 1; };
}
const browserContext={...windowObject,window:windowObject,performance:{now:()=>0},WebSocket:Socket,
 location:{protocol:'http:',host:'192.168.0.24'},AbortSignal,
 fetch:()=>Promise.resolve({ok:false})};
vm.runInNewContext(fs.readFileSync(require.resolve('../server_teste/sophia-link.js'),'utf8'),browserContext);
const browserLink=windowObject.SophiaLink;
browserLink.available=true;browserLink.setSource('wifi');socket.onopen();socket.onclose();browserLink.stop();
for(const name of ['setInterval','clearInterval','setTimeout','clearTimeout']) assert(calls.includes(name),name);
console.log('PASS: browser bootstrap preserves native Window timer receiver for connection and retry.');
