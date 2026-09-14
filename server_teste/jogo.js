 'use strict';
const $=id=>document.getElementById(id);
const canvas=$('world'),ctx=canvas.getContext('2d');
const keys=new Set(),held=new Set(),keyClicks=new Set(),touch={left:false,right:false,brake:false,go:false,horn:false};
const state={running:false,started:false,z:0,x:0,speed:0,gear:0,yaw:0,pitch:0,steer:0,turnAngle:0,impact:0,invert:false,deadzone:.04,sensitivity:1,selection:0,navTime:0,last:0,toastUntil:0,device:null,stage:'day',screen:'main',stars:0,passed:0,bumps:0,elapsed:0,shield:0,completed:false,sound:true,carModel:'renegade',carColor:'#f5f4ec'};
try{const saved=JSON.parse(localStorage.getItem('orbita-settings')||'{}');if(saved.soundRevision===2&&typeof saved.sound==='boolean')state.sound=saved.sound;for(const key of ['invert'])if(typeof saved[key]==='boolean')state[key]=saved[key];if(Number.isFinite(saved.deadzone))state.deadzone=Math.max(0,Math.min(.2,saved.deadzone));if(Number.isFinite(saved.sensitivity))state.sensitivity=Math.max(.6,Math.min(1.8,saved.sensitivity));if(['renegade','song','sport','buggy'].includes(saved.carModel))state.carModel=saved.carModel;if(/^#[0-9a-f]{6}$/i.test(saved.carColor||''))state.carColor=saved.carColor;}catch{}
const targets=[0,55,95,140];
const tracks={
 day:{name:'Jardim das Nuvens',length:60000,curve:[1250,1900,280,3300],sky:['#73c8ea','#bdeaf1','#fff1ca'],ground:['#91ce88','#8bc981'],road:['#718b9a','#758f9e'],edge:['#fff2d0','#f4b997']},
 night:{name:'Estrada das Estrelas',length:72000,curve:[1450,2100,330,3500],sky:['#071320','#243248','#807887'],ground:['#293f48','#2c424b'],road:['#172b34','#192e37'],edge:['#789080','#4b6565']},
 coast:{name:'Costa dos Golfinhos',length:84000,curve:[1500,2000,260,3100],sky:['#3baedc','#9ae4ed','#ffecb8'],ground:['#eddaa4','#e5d19a'],road:['#778991','#7c8e96'],edge:['#fff6dd','#e8b295']},
 hills:{name:'Vale das Araucárias',length:78000,curve:[1600,2200,350,3400],sky:['#7eafd2','#cce2e5','#fce7be'],ground:['#7ca579','#769f72'],road:['#6e7e85','#73838a'],edge:['#f3e6c7','#bdaf95']}
};
const trackIds=Object.keys(tracks);
const originalCenter=(track,z)=>{const [a,l,b,m]=track.curve;return a*(1-Math.cos(z/l))+b*(1-Math.cos(z/m));};
const originalSlope=(track,z)=>{const [a,l,b,m]=track.curve;return a/l*Math.sin(z/l)+b/m*Math.sin(z/m);};
function extendTrack(track){
 const originalLength=track.length,segments=[];let previous=0,distance=0,offset=0;
 const curvature=z=>{const [a,l,b,m]=track.curve;return a/(l*l)*Math.cos(z/l)+b/(m*m)*Math.cos(z/m);};
 const bend=end=>{segments.push({start:distance,end:distance+end-previous,original:previous,offset,straight:false});distance+=end-previous;previous=end;};
 // Insert a tangent straight at each inflection; every original curved section remains.
 for(let z=100;z<originalLength-1800;z+=100)if(curvature(z-100)*curvature(z)<0){
  let low=z-100,high=z;for(let i=0;i<30;i++){const mid=(low+high)/2;if(curvature(low)*curvature(mid)<=0)high=mid;else low=mid;}
  const cut=(low+high)/2;bend(cut);const slope=originalSlope(track,cut);
  segments.push({start:distance,end:distance+5000,original:cut,offset,straight:true,slope});
  distance+=5000;offset+=slope*5000;
 }
 bend(originalLength);track.originalLength=originalLength;track.length=distance;track.segments=segments;
}
for(const track of Object.values(tracks))extendTrack(track);
let stageLength=tracks.day.length,mapPoints=[];
let objects=[];
function save(){try{localStorage.setItem('orbita-settings',JSON.stringify({invert:state.invert,deadzone:state.deadzone,sensitivity:state.sensitivity,sound:state.sound,soundRevision:2,carModel:state.carModel,carColor:state.carColor}));}catch{}}
function settings(){$('invert').textContent=`Volante invertido: ${state.invert?'SIM':'NÃO'}`;$('sensitivity').textContent=`Sensibilidade: ${state.sensitivity.toFixed(1)}×`;$('deadButton').textContent=`Zona morta: ${Math.round(state.deadzone*100)}%`;$('sound').textContent=`Sons: ${state.sound?'SIM':'NÃO'}`;}
function menuActions(){return (state.screen==='settings'?['invert','sensitivity','deadButton','sound','fullScreen','source','advanced','help','back']:state.screen==='garage'?['modelRenegade','modelSong','modelSport','modelBuggy','colorWhite','colorGray','colorPink','colorBlue','colorGreen','colorYellow','garageBack']:['start','day','night','coast','hills','customize','openSettings','reset']).map($);}
function highlight(scroll=false){menuActions().forEach((b,i)=>{b.classList.toggle('selected',i===state.selection);if(scroll&&i===state.selection)b.scrollIntoView?.({block:'nearest'});});}
function menu(show){state.running=!show;$('overlay').classList.toggle('hidden',!show);document.body.classList.toggle('menu-open',show);$('pause').textContent=show?'▶ Continuar':'Ⅱ Pausa';if(show){$('mainMenu').hidden=state.screen!=='main';$('settingsMenu').hidden=state.screen!=='settings';$('garageMenu').hidden=state.screen!=='garage';$('menuTitle').innerHTML=state.completed?'Que viagem linda!<br><em>Você conseguiu!</em>':state.started?'Uma paradinha?<br><em>A aventura espera.</em>':'Vamos dar<br><em>uma voltinha?</em>';$('menuText').textContent=state.completed?`${state.stars} tesouros e ${state.passed} desvios! Pronto para conhecer o outro mundo?`:'Pegue estrelas, corações, doces e cristais. Desvie dos obstáculos e divirta-se!';$('start').textContent=state.completed?'Conhecer o outro mundo ↗':state.started?'Continuar aventura ↗':'Vamos brincar! ↗';updateGarage();highlight();}}
function showSettings(){state.screen='settings';state.selection=0;menu(true);refreshConsoleInfo();}
function showGarage(){state.screen='garage';state.selection=0;menu(true);}
function back(){state.screen='main';state.selection=0;menu(true);}
function prepareStage(stage){state.stage=tracks[stage]?stage:'day';const track=tracks[state.stage];stageLength=track.length;mapPoints=Array.from({length:241},(_,i)=>({z:i*stageLength/240,x:roadCenter(i*stageLength/240)}));Object.assign(state,{z:0,x:0,speed:0,gear:0,yaw:0,pitch:0,steer:0,turnAngle:0,impact:0,stars:0,passed:0,bumps:0,elapsed:0,shield:0,completed:false,started:false});objects=[];const treasures=['star','heart','candy','gem'];for(let i=0,z=1800;z<stageLength-5000;i++,z+=5500){for(let j=0;j<8;j++)objects.push({z:z+j*350,x:[-320,0,320][(i+Math.floor(j/2))%3],type:treasures[(i+j)%4],done:false});objects.push({z:z+4000,x:[-320,0,320][(i+2)%3],type:['car','cone','car','barrier','car'][i%5],done:false});}document.body.classList.toggle('day-mode',state.stage!=='night');for(const id of trackIds){$(id).classList.toggle('chosen',id===state.stage);const caption=$(id).querySelector?.('.trackDistance');if(caption)caption.textContent=(tracks[id].length/24000).toFixed(1).replace('.',',')+' km';}$('stageName').textContent='0'+(trackIds.indexOf(state.stage)+1)+' · '+track.name;}
function start(){unlockAudio();if(state.completed)prepareStage(trackIds[(trackIds.indexOf(state.stage)+1)%trackIds.length]);state.started=true;state.screen='main';menu(false);}
function nextStage(){
 const carry={speed:state.speed,gear:state.gear,stars:state.stars,passed:state.passed,bumps:state.bumps,elapsed:state.elapsed,x:state.x,steer:state.steer,turnAngle:state.turnAngle,yaw:state.yaw,pitch:state.pitch};
 prepareStage(trackIds[(trackIds.indexOf(state.stage)+1)%trackIds.length]);
 Object.assign(state,carry,{started:true,running:true,screen:'main',shield:1.5});
 notify('NOVA PAISAGEM · '+tracks[state.stage].name);chime(true);
}
function reset(){prepareStage(state.stage);start();notify('UMA NOVA AVENTURA!');}
function notify(text){$('toast').textContent=text;state.toastUntil=performance.now()+2200;}
function edge(name,down){const fresh=down&&!held.has(name);if(down)held.add(name);else held.delete(name);return fresh;}
function axis(value,zone=.08){return Math.abs(value)<=zone?0:Math.sign(value)*(Math.abs(value)-zone)/(1-zone);}
function rightIndices(gp){return gp.mapping!=='standard'&&gp.axes.length>=5?[3,4]:[2,3];}
let audioContext;
function unlockAudio(){if(!state.sound)return;try{const Audio=window.AudioContext||window.webkitAudioContext;if(Audio){audioContext=audioContext||new Audio();audioContext.resume().catch(()=>{});}}catch{}}
function chime(good){
 if(!state.sound||!audioContext||audioContext.state!=='running')return;
 const start=audioContext.currentTime;
 // Stars ring twice in a high register; impacts make one short, low thud.
 for(let i=0;i<(good?2:1);i++){
  const osc=audioContext.createOscillator(),gain=audioContext.createGain(),t=start+i*.09;
  osc.type=good?'sine':'triangle';osc.frequency.setValueAtTime(good?(i?1174:880):125,t);
  osc.frequency.exponentialRampToValueAtTime(good?(i?1396:1046):45,t+.14);
  gain.gain.setValueAtTime(.001,t);gain.gain.exponentialRampToValueAtTime(good?.075:.12,t+.008);gain.gain.exponentialRampToValueAtTime(.001,t+.23);
  osc.connect(gain);gain.connect(audioContext.destination);osc.start(t);osc.stop(t+.25);
 }
}
$('source').onclick=()=>{const link=window.SophiaLink;if(!link)return;const sources=['auto','local','wifi'];link.setSource(sources[(sources.indexOf(link.source)+1)%sources.length]);$('source').textContent='Controle: '+({auto:'Automático',local:'Bluetooth / teclado',wifi:'Wi-Fi do ESP32'})[link.source];};
$('advanced').onclick=()=>{window.location.assign('console.html');};
function renderConsoleInfo(status){
 const validIp=value=>typeof value==='string'&&/^(\d{1,3}\.){3}\d{1,3}$/.test(value)&&value.split('.').every(n=>Number(n)<=255)&&value!=='0.0.0.0';
 const address=(id,ip,enabled,unavailable)=>{const el=$(id);el.textContent=enabled&&validIp(ip)?'http://'+ip+'/':unavailable;if(enabled&&validIp(ip)){el.href='http://'+ip+'/';}else el.removeAttribute('href');};
 $('consoleNetwork').textContent='Wi-Fi direto: '+(status.ap||'Sophia-Play');
 address('consoleDirect',status.ap_ip,status.ap_on,'Wi-Fi direto desativado');
 address('consoleLan',status.ip,status.connected,'Não conectado ao roteador');
 $('consoleCurrent').textContent='Você está acessando por: '+window.location.host;
}
async function refreshConsoleInfo(){
 if(!window.fetch)return;
 $('consoleCurrent').textContent='Consultando endereços do ESP32…';
 try{const response=await window.fetch('/api/status',{cache:'no-store',signal:AbortSignal.timeout(3000)});if(!response.ok)throw Error();const status=await response.json();if(status.device!=='sophia-console')throw Error();renderConsoleInfo(status);}
 catch{$('consoleCurrent').textContent='ESP32 indisponível neste endereço. No Wi-Fi direto, abra http://192.168.4.1/';$('consoleNetwork').textContent='Endereços não confirmados';for(const id of ['consoleDirect','consoleLan']){$(id).textContent='Indisponível';$(id).removeAttribute('href');}}
}
$('help').onclick=()=>{$('consoleHelp').hidden=!$('consoleHelp').hidden;if(!$('consoleHelp').hidden)$('consoleHelp').scrollIntoView?.({block:'nearest'});};
$('start').onclick=start;$('reset').onclick=reset;$('customize').onclick=showGarage;$('openSettings').onclick=showSettings;$('back').onclick=back;$('garageBack').onclick=back;
const modelButtons={modelRenegade:['renegade','#f5f4ec'],modelSong:['song','#8d98a5'],modelSport:['sport','#f28fac'],modelBuggy:['buggy','#ffd76e']};
for(const [id,[model,color]] of Object.entries(modelButtons))$(id).onclick=()=>{state.carModel=model;state.carColor=color;updateGarage();save();};
const colorButtons={colorWhite:'#f5f4ec',colorGray:'#8d98a5',colorPink:'#f28fac',colorBlue:'#65bff0',colorGreen:'#8ed174',colorYellow:'#ffd76e'};
for(const [id,color] of Object.entries(colorButtons))$(id).onclick=()=>{state.carColor=color;updateGarage();save();};
for(const stage of trackIds)$(stage).onclick=()=>{prepareStage(stage);state.selection=0;menu(true);};
$('sensitivity').onclick=()=>{const levels=[.6,1,1.4,1.8];state.sensitivity=levels[(levels.indexOf(state.sensitivity)+1)%levels.length];settings();save();};
$('invert').onclick=()=>{state.invert=!state.invert;settings();save();};$('deadButton').onclick=()=>{state.deadzone=(Math.round(state.deadzone*100)+2)%22/100;settings();save();};$('sound').onclick=()=>{state.sound=!state.sound;unlockAudio();settings();save();};
$('fullScreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else notify('Use tela cheia no menu do navegador.');}catch{notify('Abra a tela cheia pelo menu do navegador.');}};
$('pause').onclick=()=>{state.screen='main';menu(state.running);};
for(const [id,key] of [['touchLeft','left'],['touchRight','right'],['touchBrake','brake'],['touchGo','go'],['touchHorn','horn']]){const el=$(id);el.addEventListener('pointerdown',e=>{e.preventDefault();el.setPointerCapture(e.pointerId);touch[key]=true;unlockAudio();});for(const event of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(event,()=>touch[key]=false);}
window.addEventListener('pointerdown',unlockAudio);
window.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','Escape','Enter'].includes(e.code))e.preventDefault();keys.add(e.code);if(!e.repeat)keyClicks.add(e.code);unlockAudio();});window.addEventListener('keyup',e=>keys.delete(e.code));
function suspend(){keys.clear();keyClicks.clear();Object.keys(touch).forEach(k=>touch[k]=false);if(state.running){state.screen='main';menu(true);}}
window.addEventListener('blur',suspend);document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
let signature='';
function input(now){
 let pads=[];try{pads=navigator.getGamepads?Array.from(navigator.getGamepads()).filter(Boolean):[];}catch{}
 const link=window.SophiaLink;if(link?.wifiSelected()){const wireless=link.getGamepad();pads=wireless?[wireless]:[];}
 const sig=pads.map(p=>p.index+':'+p.id).join('|');
 if(sig!==signature){const previous=$('gamepad').value;$('gamepad').replaceChildren(new Option('Seleção automática',''));pads.forEach(p=>$('gamepad').add(new Option(p.id,String(p.index))));if(pads.some(p=>String(p.index)===previous))$('gamepad').value=previous;signature=sig;}
 const gp=pads.find(p=>String(p.index)===$('gamepad').value)||pads.find(p=>/Sophia|Volante DIY|16c0/i.test(p.id))||pads[0];
 const identity=gp?gp.index+':'+gp.id:null;
 if(state.device!==null&&state.device!==identity&&state.running){menu(true);notify('CONTROLE ALTERADO OU DESCONECTADO');}state.device=identity;
 const [rx,ry]=gp?rightIndices(gp):[2,3];
 const raw=gp?.axes[0]||0, camX=gp?.axes[rx]||0,camY=gp?.axes[ry]||0;
 const pressed=i=>Boolean(gp?.buttons[i]?.pressed||gp?.buttons[i]?.value>.5);
 const standard=gp?.mapping==='standard'&&gp.buttons.length>=12,rawHid=!standard&&gp?.buttons.length>=15;
 const a=pressed(0),b=pressed(1),x=pressed(rawHid?3:2),rClick=pressed(standard?11:rawHid?14:3),startButton=pressed(standard?9:rawHid?11:4);
 const backPressed=edge('b',b),hornPressed=edge('horn',b||keys.has('KeyH')||touch.horn);keyClicks.delete('KeyH');
 const clickW=keyClicks.delete('KeyW'),clickEsc=keyClicks.delete('Escape'),clickEnter=keyClicks.delete('Enter');
 const accelerate=edge('a',a||keys.has('KeyW')||touch.go)||clickW,pause=edge('x',x||startButton||keys.has('Escape'))||clickEsc,enter=edge('enter',keys.has('Enter'))||clickEnter;
 $('connection').textContent=gp?'● '+gp.id:link?.wifiSelected()?link.status:'TECLADO DISPONÍVEL';$('steerValue').textContent=raw.toFixed(2);$('steerMeter').style.left=`${50+raw*47}%`;$('cameraValue').textContent=camX.toFixed(2)+' / '+camY.toFixed(2);$('buttonSignals').textContent=`A ${a?'●':'○'}     B ${b?'●':'○'}     X ${x?'●':'○'}     R ${rClick?'●':'○'}`;$('mapping').textContent=gp?`L: eixo 0 · R: eixos ${rx}/${ry}`:'Conecte o gamepad e pressione um botão.';
 if((pause||backPressed)&&!state.running&&state.screen!=='main'){back();return {brake:false,cx:0,cy:0};}
 if(pause&&state.started){state.screen='main';menu(state.running);}
 if(!state.running){const nav=camY>.5||keys.has('ArrowDown')?1:camY<-.5||keys.has('ArrowUp')?-1:0;if(nav&&now>state.navTime){state.selection=(state.selection+nav+menuActions().length)%menuActions().length;highlight(true);state.navTime=now+260;}if(!nav)state.navTime=0;if(accelerate||enter)menuActions()[state.selection].click();return {brake:false,cx:0,cy:0};}
 if(hornPressed)honk();
 if(accelerate){state.gear=state.gear%3+1;notify(`VELOCIDADE ${state.gear} / ${targets[state.gear]} KM/H`);}
 state.steer=keys.has('ArrowLeft')||touch.left?-1:keys.has('ArrowRight')||touch.right?1:Math.max(-1,Math.min(1,axis(raw,state.deadzone)*state.sensitivity))*(state.invert?-1:1);
 return {brake:rClick||keys.has('Space')||touch.brake,cx:axis(camX)+(keys.has('KeyL')?1:0)-(keys.has('KeyJ')?1:0),cy:axis(camY)+(keys.has('KeyK')?1:0)-(keys.has('KeyI')?1:0)};
}
function roadSegment(z){const list=tracks[state.stage].segments;return list.find(s=>z<s.end)||list[list.length-1];}
function roadCenter(z){const track=tracks[state.stage],s=roadSegment(z),delta=z-s.start;if(z>track.length)return roadCenter(track.length)+roadSlope(track.length)*(z-track.length);return s.offset+originalCenter(track,s.original+(s.straight?0:delta))+(s.straight?s.slope*delta:0);}
function roadSlope(z){const track=tracks[state.stage],s=roadSegment(z);return s.straight?s.slope:originalSlope(track,s.original+Math.min(z-s.start,s.end-s.start));}
let lastHorn=-Infinity;
function honk(){if(performance.now()-lastHorn<450)return;lastHorn=performance.now();notify('BIP BIP!');unlockAudio();if(!state.sound||audioContext?.state!=='running')return;const start=audioContext.currentTime;for(let i=0;i<2;i++){const t=start+i*.21,f=1046;const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type='sine';osc.frequency.setValueAtTime(f,t);gain.gain.setValueAtTime(.001,t);gain.gain.exponentialRampToValueAtTime(.09,t+.012);gain.gain.exponentialRampToValueAtTime(.001,t+.13);osc.connect(gain);gain.connect(audioContext.destination);osc.start(t);osc.stop(t+.15);}}
const cameraDistance=240;
function projectRoad(z){
 const depth=z-(state.z-cameraDistance),k=1/(depth*.002+1);
 const horizon=h*(.43+state.pitch*.12);
 // Use the tangent at the car as the viewing direction. The car and road
 // share their world position, perspective depth and camera translation.
 const bend=roadCenter(z)-roadCenter(state.z)-roadSlope(state.z)*(z-state.z);
 return {x:w/2+(bend-state.x)*k*w/1400-state.yaw*w*.2,
   y:Math.round(horizon+(h-horizon)*k),width:w*.82*k,k};
}
function carPosition(){const p=projectRoad(state.z);return {x:p.x+state.x*p.k*w/1400,y:p.y};}
let w=0,h=0;
function resize(){w=innerWidth;h=innerHeight;const d=Math.min(devicePixelRatio||1,2);canvas.width=w*d;canvas.height=h*d;ctx.setTransform(d,0,0,d,0,0);}window.addEventListener('resize',resize);resize();
function poly(points,color){ctx.fillStyle=color;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fill();}
function carPath(g,points,color){g.fillStyle=color;g.beginPath();points.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p));g.closePath();g.fill();}
function paintPlayerCar(g,size,model,color){window.SophiaCars.draw(g,size*.5,model,color,0,false);}
function updateGarage(){
 for(const [id,[model]] of Object.entries(modelButtons))$(id).classList.toggle('chosen',model===state.carModel);
 for(const [id,color] of Object.entries(colorButtons))$(id).classList.toggle('chosen',color===state.carColor);
}
let previewKey='';
function drawGaragePreview(){const c=$('carPreview');if(state.screen!=='garage'||c.hidden)return;const key=state.carModel+state.carColor;if(key===previewKey)return;previewKey=key;const g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);g.save();g.translate(c.width*.5,c.height*.74);window.SophiaCars.side(g,130,state.carModel,state.carColor);g.restore();g.fillStyle='#dfffc8';g.font='700 13px system-ui';g.textAlign='center';g.fillText(({renegade:'RENEGADE',song:'BYD SONG PRO',sport:'FOGUETE',buggy:'BUGGY'})[state.carModel],c.width/2,c.height-12);}
function draw(now){
 const day=state.stage!=='night',track=tracks[state.stage];
 const horizon=h*(.43+state.pitch*.12),shift=state.yaw*w*.2;
 const sky=ctx.createLinearGradient(0,0,0,horizon);sky.addColorStop(0,track.sky[0]);sky.addColorStop(.7,track.sky[1]);sky.addColorStop(1,track.sky[2]);ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
 ctx.fillStyle=day?'#fff7aa':'#dbecd9';ctx.beginPath();ctx.arc(w*.7-shift*.25,horizon*.48,28,0,Math.PI*2);ctx.fill();
 if(!day)for(let i=0;i<65;i++){const sx=((Math.sin(i*54.32)+1)*.5*w-shift*.1+w)%w,sy=(Math.cos(i*19.73)+1)*.37*horizon;ctx.fillStyle=`rgba(220,240,240,${.2+(i%4)*.12})`;ctx.fillRect(sx,sy,1.4,1.4);}
 for(let layer=0;layer<3;layer++){const points=[[0,horizon+30]];for(let i=0;i<=120;i++){const x=i*w/120;points.push([x,horizon-12-Math.abs(Math.sin(i*.1425+layer*2+state.z/18000))* (35+layer*15)]);}points.push([w,horizon+30]);poly(points,(day?['#aad8b5','#89caa6','#65b29a']:['#263344','#243444','#1f3340'])[layer]);}
 ctx.fillStyle=track.ground[0];ctx.fillRect(0,horizon,w,h-horizon);
 if(day)drawClouds(horizon,shift);
 const project=projectRoad;
 for(let i=95;i>=0;i--){const z1=Math.floor((state.z-cameraDistance)/35)*35+i*35,z2=z1+35,a=project(z1),b=project(z2),band=Math.floor(z1/140)%2;
 poly([[0,b.y],[w,b.y],[w,a.y],[0,a.y]],track.ground[band?0:1]);
 poly([[a.x-a.width*.56,a.y],[b.x-b.width*.56,b.y],[b.x+b.width*.56,b.y],[a.x+a.width*.56,a.y]],track.edge[band?0:1]);
 poly([[a.x-a.width*.5,a.y],[b.x-b.width*.5,b.y],[b.x+b.width*.5,b.y],[a.x+a.width*.5,a.y]],track.road[band?0:1]);
 for(const side of [-1,1])poly([[a.x+side*a.width*.475-a.width*.003,a.y],[b.x+side*b.width*.475-b.width*.003,b.y],[b.x+side*b.width*.475+b.width*.003,b.y],[a.x+side*a.width*.475+a.width*.003,a.y]],'#a4dbb3');
 if(band)for(const lane of [-.16,.16])poly([[a.x+a.width*(lane-.002),a.y],[b.x+b.width*(lane-.002),b.y],[b.x+b.width*(lane+.002),b.y],[a.x+a.width*(lane+.002),a.y]],'#536d71');
 drawRoadside(a,b,z1);
 for(const object of objects)if(!object.done&&object.z>=z1&&object.z<z2&&object.z>=state.z-45)drawObject(object);
 if(!day&&Math.floor(z1/35)%7===0){for(const side of [-1,1]){const px=a.x+side*a.width*.65;ctx.fillStyle='#769888';ctx.fillRect(px,a.y-65*a.k,3*a.k,65*a.k);ctx.fillStyle='#bbfa74';ctx.fillRect(px-4*a.k,a.y-65*a.k,11*a.k,5*a.k);}}
 }
 // The chosen car stays in the driver's reference frame; R only changes the view.
 const car=carPosition(),carX=car.x,carY=car.y,sz=Math.min(w*.12,130);ctx.save();ctx.translate(carX,carY);ctx.rotate(state.turnAngle*.08);ctx.globalAlpha=state.shield>0&&Math.floor(state.elapsed*10)%2===0?.5:1;ctx.shadowColor=day?'#426f7844':'transparent';ctx.shadowBlur=day?16:0;ctx.filter=day?'none':'brightness(.78)';paintPlayerCar(ctx,sz,state.carModel,state.carColor,state.turnAngle);ctx.restore();
 drawSpeedFlow();
 drawMinimap();
 drawGaragePreview(now);
 if(Math.abs(state.x)>570){ctx.fillStyle='#ffb36a';ctx.font='11px Segoe UI';ctx.textAlign='center';ctx.fillText('Tudo bem! Vamos voltar para a pista ☺',w/2,h*.63);}
}
function drawMinimap(){
 if(!state.running||!mapPoints.length)return;
 const width=w<600?110:156,height=w<600?150:198,left=w-width-18,top=w<600?115:150;
 const min=Math.min(...mapPoints.map(p=>p.x)),max=Math.max(...mapPoints.map(p=>p.x)),range=Math.max(max-min,1000);
 const point=(z,x)=>[left+15+(x-min)/range*(width-30),top+height-27-z/stageLength*(height-62)];
 ctx.save();ctx.fillStyle='#0b1722cc';ctx.fillRect(left,top,width,height);ctx.font='bold 10px Segoe UI';ctx.textAlign='left';ctx.fillStyle='#cde5dc';ctx.fillText('PERCURSO',left+12,top+17);
 ctx.lineWidth=4;ctx.lineJoin='round';ctx.strokeStyle='#748e99';ctx.beginPath();mapPoints.forEach((p,i)=>{const q=point(p.z,p.x);if(i)ctx.lineTo(...q);else ctx.moveTo(...q);});ctx.stroke();
 ctx.lineWidth=3;ctx.strokeStyle='#bcf77d';ctx.beginPath();for(const p of mapPoints){if(p.z>state.z)break;const q=point(p.z,p.x);if(p.z===0)ctx.moveTo(...q);else ctx.lineTo(...q);}const current=point(state.z,roadCenter(state.z));ctx.lineTo(...current);ctx.stroke();
 const finish=point(stageLength,roadCenter(stageLength));ctx.fillStyle='#f3ecd3';ctx.fillRect(finish[0]-3,finish[1]-3,6,6);
 circle(current[0],current[1],6,'#10252d');circle(current[0],current[1],4,'#fff09a');
 ctx.fillStyle='#dbece2';ctx.font='10px Segoe UI';ctx.fillText(Math.floor(state.z/stageLength*100)+'% · até a próxima fase',left+9,top+height-9);ctx.restore();
}
// Sparse peripheral trails communicate speed without hiding the road.
function drawSpeedFlow(){
 const intensity=Math.max(0,Math.min(1,(state.speed-25)/115));
 if(!intensity)return;
 const horizon=h*(.43+state.pitch*.12),vanish=w/2-state.yaw*w*.2;
 ctx.save();ctx.lineWidth=1.2;
 for(let i=0;i<34;i++){
  const t=((state.z/1250+i*.6180339)%1+1)%1;
  const side=i%2?1:-1,spread=.5+(i%7)*.075;
  const y=horizon+(h-horizon)*t*t;
  const x=vanish+side*w*spread*t;
  const length=.018+intensity*.095;
  const tail=Math.max(0,t-length);
  ctx.strokeStyle=`rgba(185,250,221,${intensity*t*.36})`;
  ctx.beginPath();ctx.moveTo(vanish+side*w*spread*tail,horizon+(h-horizon)*tail*tail);ctx.lineTo(x,y);ctx.stroke();
 }
 ctx.restore();
}
function circle(x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
function drawClouds(horizon,shift){
 for(let i=0;i<6;i++){const x=((i*.21*w+state.elapsed*(2+i*.3)-shift*.15)%(w+150))-70,y=horizon*(.23+(i%3)*.16);for(let j=0;j<4;j++)circle(x+j*19,y-Math.sin(j)*12,22,'#ffffffcc');}
 for(let i=0;i<3;i++){const x=w*(.17+i*.3)-shift*.2,y=horizon*(.38+i*.12)+Math.sin(state.elapsed*.8+i)*9;circle(x,y,17,['#f58fa5','#b8a1ef','#fbb978'][i]);ctx.strokeStyle='#786d72';ctx.beginPath();ctx.moveTo(x-9,y+12);ctx.lineTo(x-5,y+32);ctx.lineTo(x+5,y+32);ctx.lineTo(x+9,y+12);ctx.stroke();ctx.fillStyle='#aa8769';ctx.fillRect(x-6,y+29,12,8);}
}
function drawTree(p,index){for(const side of [-1,1]){const x=p.x+side*p.width*.75,r=48*p.k;ctx.fillStyle='#9d826a';ctx.fillRect(x-r*.12,p.y-r,r*.24,r);circle(x,p.y-r*1.6,r,Math.abs(index)%2?'#64ad8b':'#acd27d');circle(x-r*.5,p.y-r*1.4,r*.6,'#91cb80');circle(x+side*r*.4,p.y-r*1.8,r*.26,'#ffe0ae');}}
// All scenery is procedural and anchored to road depth; no downloaded textures.
function drawRoadside(a,b,z){
 const n=Math.floor(z/35),stage=state.stage;
 if(stage==='coast'){
  poly([[0,b.y],[b.x-b.width*.88,b.y],[a.x-a.width*.88,a.y],[0,a.y]],n%8<4?'#46bdc9':'#40b4c4');
  if(n%9===0)poly([[a.x-a.width*1.8,a.y],[a.x-a.width*.97,a.y],[a.x-a.width*.99,a.y+2*a.k]],'#d3f8e8');
 }
 // Guard rails and fence posts follow both bends, outside the safe shoulder.
 for(const side of [-1,1]){
  const ax=a.x+side*a.width*.63,bx=b.x+side*b.width*.63;
  if(stage==='hills'||stage==='coast'){
   poly([[ax,a.y-18*a.k],[bx,b.y-18*b.k],[bx,b.y-23*b.k],[ax,a.y-23*a.k]],'#c4cbc3');
   if(n%5===0){ctx.fillStyle='#747e78';ctx.fillRect(ax,a.y-23*a.k,3*a.k,23*a.k);}
  }else if(stage==='day'){
   ctx.strokeStyle='#eae1b3';ctx.lineWidth=Math.max(1,2*a.k);ctx.beginPath();ctx.moveTo(ax,a.y-17*a.k);ctx.lineTo(bx,b.y-17*b.k);ctx.stroke();
   if(n%5===0){ctx.fillStyle='#fff1c9';ctx.fillRect(ax,a.y-27*a.k,4*a.k,27*a.k);}
  }
 }
 if(n%17!==0)return;
 const index=Math.abs(Math.floor(n/17));
 for(const side of [-1,1]){
  const x=a.x+side*a.width*(.78+(index%3)*.1),u=a.k*Math.min(w/1000,1.6);ctx.save();ctx.translate(x,a.y);ctx.scale(u,u);
  if(stage==='night'){
   const height=95+(index%4)*38;ctx.fillStyle=['#203748','#2c4059','#344058'][index%3];ctx.fillRect(-38,-height,76,height);
   ctx.fillStyle='#71807d';ctx.fillRect(-41,-height-5,82,5);
   for(let row=0;row<Math.floor(height/24);row++)for(let col=0;col<3;col++){ctx.fillStyle=(row+col+index)%3?'#f3d99c':'#465566';ctx.fillRect(-26+col*22,-height+13+row*24,10,12);}
   ctx.fillStyle='#e9bba7';ctx.fillRect(-12,-25,24,25);
  }else if(stage==='coast'){
   if(side===1||index%3){
    poly([[-5,0],[4,0],[14,-95],[7,-99]],'#b18a62');
    for(let j=0;j<6;j++){const angle=j*Math.PI/3;poly([[10,-99],[10+Math.cos(angle)*55,-99+Math.sin(angle)*30],[10+Math.cos(angle+.4)*38,-93+Math.sin(angle+.4)*26]],j%2?'#4a9d72':'#377c65');}
    circle(7,-94,5,'#896e49');circle(16,-92,5,'#896e49');
   }else{
    ctx.fillStyle='#ae896c';ctx.fillRect(-2,-65,4,65);poly([[-45,-48],[0,-80],[45,-48]],'#f98987');poly([[0,-80],[20,-48],[-20,-48]],'#fff0cd');ctx.fillStyle='#f5ead0';ctx.fillRect(18,-8,43,6);
   }
  }else if(stage==='hills'){
   if(index%4===0){poly([[-45,0],[-32,-31],[-4,-49],[34,-30],[46,0]],'#8b9990');poly([[-32,-31],[-4,-49],[14,-12]],'#b2b8a1');}
   else{ctx.fillStyle='#796c55';ctx.fillRect(-6,-108,12,108);for(let j=0;j<3;j++){const y=-40-j*31,r=55-j*9;poly([[-r,y],[0,y-62],[r,y]],['#3e785f','#4b8a6a','#5b9a74'][j]);}}
  }else if(index%4===0){
   ctx.fillStyle='#f3ddba';ctx.fillRect(-48,-69,96,69);poly([[-59,-68],[0,-113],[59,-68]],'#bd7866');poly([[0,-113],[59,-68],[43,-68]],'#996253');ctx.fillStyle='#71949d';ctx.fillRect(-33,-49,21,23);ctx.fillRect(15,-49,21,23);ctx.fillStyle='#8d7764';ctx.fillRect(-8,-31,20,31);ctx.fillStyle='#f8edce';ctx.fillRect(-36,-25,28,3);ctx.fillRect(12,-25,28,3);
  }else{
   ctx.fillStyle='#9b7e5d';ctx.fillRect(-7,-84,14,84);circle(0,-94,44,'#5d9b6c');circle(-28,-76,31,'#80b577');circle(27,-83,33,'#99c480');
   for(let j=0;j<4;j++){const fx=-43+j*25;ctx.fillStyle='#648850';ctx.fillRect(fx,-10,2,10);circle(fx,-12,4,j%2?'#ffe094':'#fbb8ba');}
  }
  ctx.restore();
 }
}
function drawObject(o){const p=projectRoad(o.z),x=p.x+o.x*p.k*w/1400,y=p.y,unit=p.k*Math.min(w/900,1.5);ctx.save();ctx.translate(x,y);ctx.scale(unit,unit);circle(0,0,34,'#122d3b22');
 if(o.type==='star'){ctx.translate(0,-38-Math.sin(state.elapsed*4+o.z)*6);const points=[];for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,r=i%2?17:37;points.push([Math.cos(a)*r,Math.sin(a)*r]);}poly(points,'#ffe477');circle(-9,0,3,'#986424');circle(9,0,3,'#986424');}
 else if(o.type==='heart'){ctx.translate(0,-42-Math.sin(state.elapsed*4+o.z)*6);ctx.fillStyle='#ff7196';ctx.beginPath();ctx.moveTo(0,28);ctx.bezierCurveTo(-48,-3,-31,-35,0,-13);ctx.bezierCurveTo(31,-35,48,-3,0,28);ctx.fill();circle(-11,-8,3,'#852a52');circle(11,-8,3,'#852a52');}
 else if(o.type==='candy'){ctx.translate(0,-40-Math.sin(state.elapsed*4+o.z)*6);poly([[-42,-16],[-25,-8],[-25,9],[-42,18]],'#83d9ec');poly([[42,-16],[25,-8],[25,9],[42,18]],'#83d9ec');ctx.fillStyle='#ffb257';ctx.fillRect(-26,-17,52,35);ctx.fillStyle='#fff0c7';for(let i=-18;i<20;i+=14)ctx.fillRect(i,-17,7,35);circle(-8,-5,2,'#713e58');circle(8,-5,2,'#713e58');}
 else if(o.type==='gem'){ctx.translate(0,-42-Math.sin(state.elapsed*4+o.z)*6);poly([[0,-39],[34,-10],[20,31],[-20,31],[-34,-10]],'#7ce8ef');poly([[0,-39],[12,-10],[0,31],[-12,-10]],'#d7ffff');circle(-9,-7,3,'#246a83');circle(9,-7,3,'#246a83');}
 else if(o.type==='cone'){poly([[-32,0],[0,-82],[32,0]],'#ff9770');poly([[-19,-32],[-12,-50],[12,-50],[19,-32]],'#fff3d5');ctx.fillStyle='#cb6d54';ctx.fillRect(-38,-4,76,10);}
 else if(o.type==='barrier'){
  ctx.fillStyle='#394557';ctx.fillRect(-36,-46,10,50);ctx.fillRect(26,-46,10,50);
  ctx.fillStyle='#ffac62';ctx.fillRect(-48,-64,96,34);
  for(let i=0;i<4;i++){const x=-48+i*24;poly([[x,-64],[x+12,-64],[x+24,-30],[x+12,-30]],'#583b36');}
  ctx.fillStyle='#fff4d8';ctx.font='bold 20px Segoe UI';ctx.textAlign='center';ctx.fillText('!',0,-39);
 }
 else{ctx.fillStyle='#172e43';ctx.fillRect(-48,-19,18,27);ctx.fillRect(30,-19,18,27);poly([[-45,0],[-46,-42],[-29,-83],[29,-83],[46,-42],[45,0]],'#f28fac');poly([[-29,-42],[-21,-69],[21,-69],[29,-42]],'#314e76');ctx.fillStyle='#ffe3b7';ctx.fillRect(-37,-17,18,7);ctx.fillRect(19,-17,18,7);ctx.fillStyle='#d96f94';ctx.fillRect(-38,-3,76,9);}
 ctx.restore();}
function step(dt,controls){
 if(!state.running)return;
 state.elapsed+=dt;state.shield=Math.max(0,state.shield-dt);state.impact=Math.max(0,state.impact-dt);
 const outside=Math.abs(state.x)>520;
 const target=controls.brake?0:(outside?Math.min(targets[state.gear],60):targets[state.gear]);
 const rate=controls.brake?95:target<state.speed?32:state.impact>0?0:38;
 state.speed+=Math.sign(target-state.speed)*Math.min(Math.abs(target-state.speed),rate*dt);
 const advance=state.speed/3.6*dt*24;
 const curve=roadCenter(state.z+advance)-roadCenter(state.z)-roadSlope(state.z)*advance;
 // Steering follows a heading progressively; lateral travel requires forward motion.
 // Full lock reaches the adjacent lane in well under a second at cruise speed.
 if(state.speed>.01){
  const desiredAngle=state.steer*.9;
  state.turnAngle+=(desiredAngle-state.turnAngle)*(1-Math.exp(-10*dt));
  state.x+=Math.tan(state.turnAngle)*advance-curve;
  if(outside)state.x-=Math.sign(state.x)*Math.min(Math.abs(state.x),330*dt*Math.min(state.speed/25,1));
 }else state.turnAngle=0;
 state.x=Math.max(-820,Math.min(820,state.x));
 const previousZ=state.z;state.z+=advance;
 for(const object of objects){
  if(object.done)continue;
  const oldZ=object.z;
  if(oldZ>=previousZ-65&&object.z<=state.z+65){
   const treasure=['star','heart','candy','gem'].includes(object.type),near=Math.abs(state.x-object.x)<(treasure?115:135);
   if(near){object.done=true;if(treasure){state.stars++;notify(({star:'★ Estrela brilhante!',heart:'♥ Coração feliz!',candy:'🍬 Doce surpresa!',gem:'◆ Cristal mágico!'})[object.type]);chime(true);}else if(!state.shield){state.bumps++;state.shield=1.5;state.impact=.8;state.speed*=.25;notify('Opa! Tudo bem, vamos continuar!');chime(false);}}
   else if(object.z<state.z-55){object.done=true;if(!treasure)state.passed++;}
  }else if(object.z<state.z-80)object.done=true;
 }
 state.yaw+=(controls.cx*.95-state.yaw)*Math.min(1,dt*5);state.pitch+=(controls.cy*.9-state.pitch)*Math.min(1,dt*5);
 if(state.z>=stageLength)nextStage();
}
function frame(now){const dt=Math.min((now-state.last)/1000||0,.05);state.last=now;const controls=input(now);step(dt,controls);
 draw(now);$('speed').textContent=String(Math.round(state.speed)).padStart(3,'0');$('gear').textContent=state.gear?['','PASSEIO','AVENTURA','TURBO'][state.gear]:'VAMOS?';$('distance').textContent=(state.z/24000).toFixed(2)+' / '+(stageLength/24000).toFixed(1)+' km';$('score').textContent='✦ '+state.stars;$('progress').style.width=(100*state.z/stageLength)+'%';document.querySelectorAll('.steps i').forEach((el,i)=>el.classList.toggle('on',i<state.gear));if(now>state.toastUntil)$('toast').textContent='';requestAnimationFrame(frame);}
prepareStage('day');settings();menu(true);requestAnimationFrame(frame);
