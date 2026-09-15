const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const elements = new Map();
const drawing = new Proxy({}, {get:(_,key)=>key==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
const get=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',style:{},width:id==='carPreview'?520:0,height:id==='carPreview'?250:0,addEventListener(){},classList:{toggle(){}},replaceChildren(){},add(){},getContext:()=>drawing,click(){this.onclick();}});return elements.get(id);};
let pads=[{index:0,id:'GamePad Sophia',mapping:'',axes:[0,0,0,0,0],buttons:Array.from({length:5},()=>({pressed:false,value:0}))}];
const context={document:{body:{classList:{toggle(){}}},getElementById:get,addEventListener(){},querySelectorAll:()=>[]},window:{addEventListener(){}},navigator:{getGamepads:()=>pads},localStorage:{getItem:()=>null,setItem(){}},Option:function(){},innerWidth:1200,innerHeight:800,devicePixelRatio:1,performance:{now:()=>0},requestAnimationFrame(){},console};
vm.createContext(context);vm.runInContext(fs.readFileSync('server_teste/cars.js','utf8'),context);vm.runInContext(fs.readFileSync('server_teste/jogo.js','utf8'),context);
const run=s=>vm.runInContext(s,context);
run('start();state.invert=true');
for(const expected of [1,2,3,1]){pads[0].buttons[0].pressed=true;run('input(1000)');assert.equal(run('state.gear'),expected);run('input(1020)');assert.equal(run('state.gear'),expected,'holding must not repeat');pads[0].buttons[0].pressed=false;run('input(1040)');}
pads[0].axes=[.6,0,0,.8,-.4];const controls=run('input(2000)');assert(controls.cx>0&&controls.cy<0);assert(run('state.steer')<0,'inversion');
const steering=run('state.steer');pads[0].axes[3]=-.9;run('input(2020)');assert.equal(run('state.steer'),steering,'camera must not steer');
run('state.speed=80;state.last=2000');pads[0].buttons[3].pressed=true;run('frame(2050)');assert(run('state.speed')<80,'brake reduces speed');assert.equal(run('state.gear'),1);
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
run('state.z=stageLength-1;state.speed=55;step(.05,neutral)');assert.equal(run('state.completed'),false);assert.equal(run('state.running'),true);
assert.equal(run('state.stage'),'night');assert.equal(run('state.z'),0);assert.equal(run('state.stars'),1);assert.equal(run('state.gear'),1);assert.equal(run('state.speed'),55);
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
assert.deepEqual(Array.from(run("[...new Set(objects.filter(o=>['star','heart','candy','gem'].includes(o.type)).map(o=>o.type))]")),['star','heart','candy','gem']);
run("reset();objects=['heart','candy','gem'].map((type,i)=>({type,z:state.z+30+i*500,x:state.x,done:false}));state.speed=55;state.gear=1");
for(let i=1;i<=3;i++){run('objects[0].z=state.z+30;step(.05,neutral);objects.shift()');assert.equal(run('state.stars'),i,`collectible ${i}`);}
// Check that each event schedules a recognizably different synthesized sound.
run(`var notes=[];audioContext={state:'running',currentTime:0,destination:{},createOscillator(){return {frequency:{setValueAtTime(v){notes.push(v)},exponentialRampToValueAtTime(){}},connect(){},start(){},stop(){}}},createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}}};state.sound=true;chime(true)`);
assert.deepEqual(Array.from(run('notes')),[880,1174]);run('notes=[];chime(false)');assert.deepEqual(Array.from(run('notes')),[125]);
run('notes=[];state.sound=false;chime(true)');assert.equal(run('notes.length'),0);
console.log('PASS: no stationary drift, responsive lane change, strong collisions/recovery, distinct sounds, no misleading ball.');
run("showGarage();$('modelSong').click();$('colorBlue').click();drawGaragePreview(1000)");
assert.equal(run('state.screen'),'garage');assert.equal(run('state.carModel'),'song');assert.equal(run('state.carColor'),'#65bff0');
assert.equal(run('menuActions().length'),11);run("$('garageBack').click()");assert.equal(run('state.screen'),'main');
console.log('PASS: garage models, colors, static preview, persistence state and gamepad menu actions.');
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
// Horn and brake must remain independent on raw BLE, Wi-Fi and standard pads.
for(const mapping of ['', 'standard'])for(const count of [5,17]){
 pads=[{index:0,id:'Sophia',mapping,axes:[0,0,0,0,0],buttons:Array.from({length:count},()=>({pressed:false}))}];
 run('input(100000);start();held.clear();state.sound=true;notes=[];lastHorn=-Infinity');
 pads[0].buttons[1].pressed=true;
 assert.equal(run('input(100020).brake'),false,'B horn never brakes');
 assert.deepEqual(Array.from(run('notes')),[1046,1046],'horn has its own sound');
 pads[0].buttons[1].pressed=false;pads[0].buttons[mapping==='standard'&&count>=12?11:count>=15?14:3].pressed=true;
 assert.equal(run('input(100040).brake'),true,'right stick click brakes');
 pads[0].buttons.forEach(b=>b.pressed=false);run('input(100060);start()');
 pads[0].buttons[mapping==='standard'&&count>=12?9:count>=15?11:4].pressed=true;
 run('input(100080)');assert.equal(run('state.running'),false,'Start pauses on each transport');
 pads[0].buttons.forEach(b=>b.pressed=false);run('input(100100);start()');
 pads[0].buttons[mapping!=='standard'&&count>=15?3:2].pressed=true;
 run('input(100120)');assert.equal(run('state.running'),false,'X keeps its action on each transport');
}
for(const stage of ['day','night','coast','hills']){
 run(`prepareStage('${stage}');draw(1000)`);
 assert(run('stageLength')>=60000,'longer tracks');
 const sections=Array.from(run('tracks[state.stage].segments'));
 assert(sections.filter(s=>s.straight).length>=8,'multiple inserted straights');
 assert.equal(sections.filter(s=>!s.straight).reduce((sum,s)=>sum+s.end-s.start,0),run('tracks[state.stage].originalLength'),'all original curve distance retained');
 assert(run('stageLength')>run('tracks[state.stage].originalLength')*1.5,'added distance rather than replacing bends');
 for(const section of sections){
  const z=(section.start+section.end)/2;
  if(section.straight)assert(Math.abs(run(`roadCenter(${z}+500)-2*roadCenter(${z})+roadCenter(${z}-500)`))<1e-6,'straight has zero curvature');
  if(section.start>0){assert(Math.abs(run(`roadCenter(${section.start}+.0001)-roadCenter(${section.start}-.0001)`))<.001,'position continuous at joins');assert(Math.abs(run(`roadSlope(${section.start}+.0001)-roadSlope(${section.start}-.0001)`))<1e-6,'tangent continuous at joins');}
 }
 console.log(stage+': '+(run('stageLength')/24000).toFixed(2)+' km');
 const layout=Array.from(run('objects')),hazards=layout.filter(o=>['car','cone','barrier'].includes(o.type)),treasures=layout.filter(o=>!hazards.includes(o));
 assert(treasures.length>=hazards.length*4,'four treasures per obstacle');
 assert(hazards.filter(o=>o.type==='car').length>Math.ceil(hazards.length/3),'more traffic cars than the previous layout');
 for(const treasure of treasures)for(const obstacle of hazards)assert(Math.abs(treasure.z-obstacle.z)>=1400,'clear space around obstacles');
 assert(Math.abs(run('projectRoad(2000).x-projectRoad(0).x'))>45,'bend visible from the start');
 for(let z=0;z<run('stageLength');z+=500){
  assert(Math.abs(run(`roadSlope(${z})`))<.86,'bounded bends');
  assert(Math.abs(run(`(roadCenter(${z}+.01)-roadCenter(${z}-.01))/.02-roadSlope(${z})`))<1e-6,'camera tangent matches track');
 }
 run('start();state.stars=12;state.gear=3;state.speed=140;state.z=stageLength-1;step(.05,neutral)');assert.equal(run('state.running'),true);assert.equal(run('state.stars'),12);assert.equal(run('state.gear'),3);assert.equal(run('state.speed'),140);
 assert.equal(run('state.stage'),({day:'night',night:'coast',coast:'hills',hills:'day'})[stage]);
}
// A preview is time-independent; recoloring actually changes the drawn geometry.
let renders=0;const drawCar=context.window.SophiaCars.side;
context.window.SophiaCars.side=(...args)=>{renders++;return drawCar(...args);};
run("showGarage();previewKey='';drawGaragePreview(0);drawGaragePreview(5000)");assert.equal(renders,1);
run("$('colorYellow').click();drawGaragePreview(5100)");assert.equal(renders,2);
let destination='';context.window.location={host:'192.168.4.1',assign:url=>destination=url};
for(const id of ['consoleDirect','consoleLan'])get(id).removeAttribute=function(name){delete this[name];};
run("renderConsoleInfo({ap:'Sophia-Play',ap_on:true,ap_ip:'192.168.4.1',connected:true,ip:'192.168.0.7'})");
assert.equal(get('consoleLan').href,'http://192.168.0.7/');assert.equal(get('consoleDirect').href,'http://192.168.4.1/');
assert(get('consoleCurrent').textContent.includes('192.168.4.1'),'show current AP access alongside LAN address');
run("renderConsoleInfo({ap_on:false,connected:false});$('advanced').click()");
assert.equal(get('consoleLan').href,undefined);assert.equal(get('consoleDirect').href,undefined);assert.equal(destination,'console.html');
run('showSettings()');assert(Array.from(run('menuActions()')).includes(get('advanced')),'console accessible by gamepad');
console.log('PASS: dynamic AP/LAN addresses, disconnected state and direct console navigation.');
const source=fs.readFileSync('server_teste/jogo.js','utf8');
for(const mapping of ['', 'standard'])for(const count of [8,17]){
 pads=[{index:0,id:'Sophia',mapping,axes:[0,0,0,0],buttons:Array.from({length:count},()=>({pressed:false}))}];
 run('input(200000);reset();held.clear()');
 const standard=mapping==='standard'&&count>=12,raw=!standard&&count>=15;
 pads[0].buttons[standard?7:raw?9:6].pressed=true;run('input(200020)');assert.equal(run('state.gear'),1,'new R2 accelerates');
 pads[0].buttons[standard?6:raw?8:5].pressed=true;assert.equal(run('input(200040).brake'),true,'new L2 brakes');
 pads[0].buttons[standard?9:raw?11:7].pressed=true;run('input(200060)');assert.equal(run('state.running'),false,'external Start pauses');
}
for(const [saved,expected] of [[{},true],[{sound:false},true],[{sound:false,soundRevision:2},false]]){
 const fresh={...context,window:{addEventListener(){}},localStorage:{getItem:()=>JSON.stringify(saved),setItem(){}}};
 vm.createContext(fresh);vm.runInContext(source,fresh);assert.equal(vm.runInContext('state.sound',fresh),expected);
}
console.log('PASS: independent horn/R brake across transports, four longer gentle tracks, static preview and sound defaults.');
