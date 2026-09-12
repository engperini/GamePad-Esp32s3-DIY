const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const elements = new Map();
const drawing = new Proxy({}, {get:(_,key)=>key==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
const get=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',style:{},addEventListener(){},classList:{toggle(){}},replaceChildren(){},add(){},getContext:()=>drawing,click(){this.onclick();}});return elements.get(id);};
let pads=[{index:0,id:'GamePad Sophia',mapping:'',axes:[0,0,0,0,0],buttons:Array.from({length:5},()=>({pressed:false,value:0}))}];
const context={document:{body:{classList:{toggle(){}}},getElementById:get,addEventListener(){},querySelectorAll:()=>[]},window:{addEventListener(){}},navigator:{getGamepads:()=>pads},localStorage:{getItem:()=>null,setItem(){}},Option:function(){},innerWidth:1200,innerHeight:800,devicePixelRatio:1,performance:{now:()=>0},requestAnimationFrame(){},console};
vm.createContext(context);vm.runInContext(fs.readFileSync('server_teste/jogo.js','utf8'),context);
const run=s=>vm.runInContext(s,context);
run('start();state.invert=true');
for(const expected of [1,2,3,1]){pads[0].buttons[0].pressed=true;run('input(1000)');assert.equal(run('state.gear'),expected);run('input(1020)');assert.equal(run('state.gear'),expected,'holding must not repeat');pads[0].buttons[0].pressed=false;run('input(1040)');}
pads[0].axes=[.6,0,0,.8,-.4];const controls=run('input(2000)');assert(controls.cx>0&&controls.cy<0);assert(run('state.steer')<0,'inversion');
const steering=run('state.steer');pads[0].axes[3]=-.9;run('input(2020)');assert.equal(run('state.steer'),steering,'camera must not steer');
run('state.speed=80;state.last=2000');pads[0].buttons[1].pressed=true;run('frame(2050)');assert(run('state.speed')<80,'brake reduces speed');assert.equal(run('state.gear'),1);
pads[0].buttons[2].pressed=true;run('input(2100)');assert.equal(run('state.running'),false);const distance=run('state.z');run('frame(2150)');assert.equal(run('state.z'),distance,'pause freezes physics');
pads[0].axes[4]=.9;run('input(3000)');assert.equal(run('state.selection'),1,'R navigates menu');run('showSettings()');pads[0].axes[4]=0;pads[0].buttons[0].pressed=true;run('input(3020)');assert.equal(run('state.invert'),false,'A activates settings item');
run('start()');pads=[];run('input(4000)');assert.equal(run('state.running'),false,'disconnect pauses');
assert.deepEqual(Array.from(run("rightIndices({mapping:'standard',axes:[0,0,0,0,0]})")),[2,3]);
// Car contact point must share the road's projection, including camera motion.
for(const z of [0,500,1700,5000])for(const yaw of [-.8,0,.8])for(const pitch of [-.8,0,.8]){
 run(`Object.assign(state,{z:${z},x:0,yaw:${yaw},pitch:${pitch}})`);
 const road=run('projectRoad(state.z)'),car=run('carPosition()');
 assert(Math.abs(car.x-road.x)<1e-8,'car centered on road at its own depth');
 assert.equal(car.y,road.y,'car and road share camera pitch');
 const ahead=run('projectRoad(state.z+.01)');
 assert(Math.abs(ahead.x-road.x)<.001,'road tangent aligned with car');
}
run('Object.assign(state,{x:120,steer:1});reset()');
assert.equal(run('state.x'),0);assert.equal(run('state.steer'),0);
run('state.x=150');assert(run('carPosition().x')>run('projectRoad(state.z).x'),'steering offset remains visible');
console.log('PASS: controls, car/road alignment through curves, camera yaw/pitch and reset.');

pads=[{index:0,id:'GamePad Sophia',mapping:'',axes:[.3,0,0,0,0],buttons:Array.from({length:5},()=>({pressed:false,value:0}))}];
run('start();state.invert=false;state.sensitivity=.6;input(5000)');
const gentle=run('state.steer');run('state.sensitivity=1.8;input(5020)');
assert(run('state.steer')>gentle*2.9,'sensitivity increases steering outside deadzone');
pads[0].axes[0]=.02;run('input(5040)');assert.equal(run('state.steer'),0,'sensitivity preserves deadzone');
run('reset();state.speed=55;state.gear=1;state.last=6000;frame(6050)');
assert(Math.abs(run('state.z')-55/3.6*.05*24)<1e-6,'faster world motion');
console.log('PASS: sensitivity independent of deadzone, faster world motion.');

// Child-friendly recovery: the previous off-road penalty prevented all acceleration.
run("prepareStage('day');start();state.x=800;state.gear=1;state.steer=0");
const neutral={brake:false,cx:0,cy:0};context.neutral=neutral;
run('for(let i=0;i<240;i++)step(1/60,neutral)');
assert(run('state.speed')>45,'off-road car can accelerate');assert(Math.abs(run('state.x'))<520,'gentle recovery brings car back');
run('state.x=750;state.speed=0;step(.05,{brake:true,cx:0,cy:0})');assert.equal(run('state.speed'),0,'brake still holds');
run("reset();objects=[{type:'cone',z:100,x:0,done:false}];state.speed=55;state.gear=1;state.z=60;step(.05,neutral)");assert.equal(run('state.bumps'),1);assert(run('state.speed')>0,'collision does not trap car');
run("objects=[{type:'star',z:state.z+30,x:state.x,done:false}];step(.05,neutral)");assert.equal(run('state.stars'),1);
run('step(.05,neutral)');assert.equal(run('state.stars'),1,'star only counts once');
run('state.z=stageLength-1;state.speed=55;step(.05,neutral)');assert.equal(run('state.completed'),true);assert.equal(run('state.running'),false);
run('start()');assert.equal(run('state.stage'),'night');assert.equal(run('state.z'),0);assert.equal(run('state.stars'),0);
assert(Math.abs(run('roadSlope(0)'))<.07,'gentle curves');
run('menu(true)');const paused=run('state.elapsed');run('step(.05,neutral)');assert.equal(run('state.elapsed'),paused);
console.log('PASS: shoulder recovery from rest, braking, collision, collectible, stage completion and transition.');

// No sideways drift, including shoulder assist, before accelerating or after pause.
for(const x of [0,300,750]){
 run(`reset();objects=[];state.x=${x};state.steer=1`);
 run('for(let i=0;i<120;i++)step(1/60,neutral)');assert.equal(run('state.x'),x);assert.equal(run('state.z'),0);
 run('menu(true);step(.05,neutral);start();step(.05,neutral)');assert.equal(run('state.x'),x);assert.equal(run('state.turnAngle'),0);
}
// Full lock can change lanes at the first speed, without maximum sensitivity.
run('reset();objects=[];state.speed=55;state.gear=1;state.steer=1');
run('for(let i=0;i<60;i++)step(1/60,neutral)');assert(run('state.x')>=320,'reach adjacent lane within one second');
const right=run('state.x');run('state.steer=-1;for(let i=0;i<60;i++)step(1/60,neutral)');assert(run('state.x')<right-200,'responsive direction reversal');
run("reset();objects=[{type:'barrier',z:130,x:0,done:false}];state.z=60;state.speed=140;state.gear=3;step(.05,neutral)");
assert.equal(run('state.speed'),35,'impact removes 75 percent');
run('for(let i=0;i<10;i++)step(.05,neutral)');assert.equal(run('state.speed'),35,'impact remains perceptible before acceleration returns');
run('for(let i=0;i<40;i++)step(.05,neutral)');assert(run('state.speed')>60,'car resumes after collision');
run("prepareStage('day')");assert.equal(run("objects.some(o=>o.type==='ball')"),false);
// Check that each event schedules a recognizably different synthesized sound.
run(`var notes=[];audioContext={state:'running',currentTime:0,destination:{},createOscillator(){return {frequency:{setValueAtTime(v){notes.push(v)},exponentialRampToValueAtTime(){}},connect(){},start(){},stop(){}}},createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}}};state.sound=true;chime(true)`);
assert.deepEqual(Array.from(run('notes')),[880,1174]);run('notes=[];chime(false)');assert.deepEqual(Array.from(run('notes')),[125]);
run('notes=[];state.sound=false;chime(true)');assert.equal(run('notes.length'),0);
console.log('PASS: no stationary drift, responsive lane change, strong collisions/recovery, distinct sounds, no misleading ball.');
// Wi-Fi source takes precedence and signal loss pauses even with another BLE pad present.
const wifiPad={index:99,id:'Sophia Wi-Fi',mapping:'standard',axes:[-.8,0,0,0],buttons:Array.from({length:5},()=>({pressed:false,value:0}))};
let wireless=wifiPad;
context.window.SophiaLink={wifiSelected:()=>true,getGamepad:()=>wireless,status:'Sem sinal'};
pads=[{...wifiPad,index:0,id:'Another pad',axes:[.8,0,0,0]}];
run('input(89900);start();state.invert=false;input(90000)');
assert(run('state.steer')<0,'Wi-Fi must override local pad');
wireless=null;run('input(90020)');
assert.equal(run('state.running'),false,'Wi-Fi loss pauses despite local pad');
assert.equal(run('state.device'),null,'no silent BLE fallback');
delete context.window.SophiaLink;
console.log('PASS: Wi-Fi game integration and disconnect isolation from other controllers.');
