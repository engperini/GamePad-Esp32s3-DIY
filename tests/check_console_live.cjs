// Real-device check. --ota deliberately installs the current build in the other slot.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const base = process.argv[2] || 'http://192.168.4.1';
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const request = (uri, options={}) => fetch(base+uri,{...options,signal:AbortSignal.timeout(15000)});
async function connect(){return new Promise((resolve,reject)=>{const ws=new WebSocket(base.replace(/^http/,'ws')+'/ws');ws.onopen=()=>resolve(ws);ws.onerror=reject;});}
async function sample(ws){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('WS timeout')),2500);ws.onmessage=e=>{clearTimeout(timer);resolve(JSON.parse(e.data));};ws.send('?');});}
(async()=>{
 const status=await (await request('/api/status')).json(); assert.equal(status.device,'sophia-console');
 for(const name of ['jogo.html','jogo.css','jogo.js','cars.js','sophia-link.js','console.html','console.js','index.html']){
  const res=await request('/'+name);assert.equal(res.status,200);assert.equal(res.headers.get('content-encoding'),'gzip');
  assert.deepEqual(Buffer.from(await res.arrayBuffer()),fs.readFileSync(path.join(root,'server_teste',name)));
 }
 const headers={};
 assert.equal((await request('/api/config',{method:'POST',body:'{}'})).status,400);
 assert.equal((await request('/api/ota',{method:'POST',headers,body:Buffer.alloc(512)})).status,400);
 assert.equal((await request('/api/config',{method:'POST',headers,body:JSON.stringify({mode:'wrong',ssid:'',password:''})})).status,400);
 const ws=await connect();const measurements=[];let previous=-1;
 for(let i=0;i<60;i++){const start=performance.now();const p=await sample(ws);assert.equal(p[0],1);assert(p[1]>previous);assert(p[6]<250);previous=p[1];measurements.push(performance.now()-start);await sleep(20);}
 const denied=await new Promise(resolve=>{const other=new WebSocket(base.replace(/^http/,'ws')+'/ws');other.onopen=()=>other.send('?');other.onmessage=()=>{other.close();resolve(false);};other.onerror=()=>resolve(true);other.onclose=()=>resolve(true);});assert(denied,'second pilot must not receive controls');
 assert((await sample(ws))[1]>previous,'first pilot retains control');
 ws.close();measurements.sort((a,b)=>a-b);
 console.log('PASS real HTTP assets, open administration, invalid config/image, 60 WS snapshots, exclusive pilot. RTT median='+measurements[30].toFixed(1)+'ms p95='+measurements[57].toFixed(1)+'ms');
 if(process.argv.includes('--ota')){
  const response=await request('/api/ota',{method:'POST',headers,body:fs.readFileSync(path.join(root,'build/volante_ble_gamepad.bin'))});
  assert.equal(response.status,200,await response.text());await sleep(15000);
  let after;for(let i=0;i<10;i++){try{after=await (await request('/api/status')).json();break;}catch{await sleep(1000);}}
  assert(after);assert.notEqual(after.slot,status.slot);console.log('PASS real OTA: '+status.slot+' -> '+after.slot+'; server alive after restart');
 }
})().catch(e=>{console.error(e);process.exit(1);});
