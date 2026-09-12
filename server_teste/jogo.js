 'use strict';
const $=id=>document.getElementById(id);
const canvas=$('world'),ctx=canvas.getContext('2d');
const keys=new Set(),held=new Set(),keyClicks=new Set(),touch={left:false,right:false,brake:false,go:false};
const state={running:false,started:false,z:0,x:0,speed:0,gear:0,yaw:0,pitch:0,steer:0,invert:false,deadzone:.04,sensitivity:1,selection:0,navTime:0,last:0,toastUntil:0,device:null,stage:'day',screen:'main',stars:0,passed:0,bumps:0,elapsed:0,shield:0,completed:false,sound:false};
try{const saved=JSON.parse(localStorage.getItem('orbita-settings')||'{}');for(const key of ['invert','sound'])if(typeof saved[key]==='boolean')state[key]=saved[key];if(Number.isFinite(saved.deadzone))state.deadzone=Math.max(0,Math.min(.2,saved.deadzone));if(Number.isFinite(saved.sensitivity))state.sensitivity=Math.max(.6,Math.min(1.8,saved.sensitivity));}catch{}
const targets=[0,55,95,140],stageLength=24000;
let objects=[];
function save(){try{localStorage.setItem('orbita-settings',JSON.stringify({invert:state.invert,deadzone:state.deadzone,sensitivity:state.sensitivity,sound:state.sound}));}catch{}}
function settings(){$('invert').textContent=`Volante invertido: ${state.invert?'SIM':'NÃO'}`;$('sensitivity').textContent=`Sensibilidade: ${state.sensitivity.toFixed(1)}×`;$('deadButton').textContent=`Zona morta: ${Math.round(state.deadzone*100)}%`;$('sound').textContent=`Sons: ${state.sound?'SIM':'NÃO'}`;}
function menuActions(){return (state.screen==='settings'?['invert','sensitivity','deadButton','sound','fullScreen','back']:['start','day','night','openSettings','reset']).map($);}
function highlight(scroll=false){menuActions().forEach((b,i)=>{b.classList.toggle('selected',i===state.selection);if(scroll&&i===state.selection)b.scrollIntoView?.({block:'nearest'});});}
function menu(show){state.running=!show;$('overlay').classList.toggle('hidden',!show);document.body.classList.toggle('menu-open',show);$('pause').textContent=show?'▶ Continuar':'Ⅱ Pausa';if(show){$('mainMenu').hidden=state.screen!=='main';$('settingsMenu').hidden=state.screen!=='settings';$('menuTitle').innerHTML=state.completed?'Que viagem linda!<br><em>Você conseguiu!</em>':state.started?'Uma paradinha?<br><em>A aventura espera.</em>':'Vamos dar<br><em>uma voltinha?</em>';$('menuText').textContent=state.completed?`${state.stars} estrelas e ${state.passed} desvios! Pronto para conhecer o outro mundo?`:'Pegue as estrelas e desvie dos carros e cones. Se sair da pista, nós ajudamos você a voltar.';$('start').textContent=state.completed?'Conhecer o outro mundo ↗':state.started?'Continuar aventura ↗':'Vamos brincar! ↗';highlight();}}
function showSettings(){state.screen='settings';state.selection=0;menu(true);}
function back(){state.screen='main';state.selection=0;menu(true);}
function prepareStage(stage){state.stage=stage;Object.assign(state,{z:0,x:0,speed:0,gear:0,yaw:0,pitch:0,steer:0,stars:0,passed:0,bumps:0,elapsed:0,shield:0,completed:false,started:false});objects=[];for(let i=0;i<25;i++){const z=1800+i*850,lane=[-320,0,320][(i*7+2)%3];objects.push({z,x:lane,type:i%3===0?'car':i%3===1?'cone':'ball',done:false});objects.push({z:z+390,x:[-320,0,320][i%3],type:'star',done:false});}document.body.classList.toggle('day-mode',stage==='day');$('day').classList.toggle('chosen',stage==='day');$('night').classList.toggle('chosen',stage==='night');$('stageName').textContent=stage==='day'?'01 · Jardim das Nuvens':'02 · Estrada das Estrelas';}
function start(){unlockAudio();if(state.completed)prepareStage(state.stage==='day'?'night':'day');state.started=true;state.screen='main';menu(false);}
function reset(){prepareStage(state.stage);start();notify('UMA NOVA AVENTURA!');}
function notify(text){$('toast').textContent=text;state.toastUntil=performance.now()+2200;}
function edge(name,down){const fresh=down&&!held.has(name);if(down)held.add(name);else held.delete(name);return fresh;}
function axis(value,zone=.08){return Math.abs(value)<=zone?0:Math.sign(value)*(Math.abs(value)-zone)/(1-zone);}
function rightIndices(gp){return gp.mapping!=='standard'&&gp.axes.length>=5?[3,4]:[2,3];}
let audioContext;
function unlockAudio(){if(!state.sound)return;try{const Audio=window.AudioContext||window.webkitAudioContext;if(Audio){audioContext=audioContext||new Audio();audioContext.resume().catch(()=>{});}}catch{}}
function chime(good){if(!state.sound||!audioContext||audioContext.state!=='running')return;const osc=audioContext.createOscillator(),gain=audioContext.createGain(),t=audioContext.currentTime;osc.type='sine';osc.frequency.setValueAtTime(good?660:180,t);osc.frequency.exponentialRampToValueAtTime(good?1100:100,t+.12);gain.gain.setValueAtTime(.06,t);gain.gain.exponentialRampToValueAtTime(.001,t+.2);osc.connect(gain);gain.connect(audioContext.destination);osc.start(t);osc.stop(t+.22);}
$('start').onclick=start;$('reset').onclick=reset;$('openSettings').onclick=showSettings;$('back').onclick=back;
for(const stage of ['day','night'])$(stage).onclick=()=>{prepareStage(stage);state.selection=0;menu(true);};
$('sensitivity').onclick=()=>{const levels=[.6,1,1.4,1.8];state.sensitivity=levels[(levels.indexOf(state.sensitivity)+1)%levels.length];settings();save();};
$('invert').onclick=()=>{state.invert=!state.invert;settings();save();};$('deadButton').onclick=()=>{state.deadzone=(Math.round(state.deadzone*100)+2)%22/100;settings();save();};$('sound').onclick=()=>{state.sound=!state.sound;unlockAudio();settings();save();};
$('fullScreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else notify('Use tela cheia no menu do navegador.');}catch{notify('Abra a tela cheia pelo menu do navegador.');}};
$('pause').onclick=()=>{state.screen='main';menu(state.running);};
for(const [id,key] of [['touchLeft','left'],['touchRight','right'],['touchBrake','brake'],['touchGo','go']]){const el=$(id);el.addEventListener('pointerdown',e=>{e.preventDefault();el.setPointerCapture(e.pointerId);touch[key]=true;unlockAudio();});for(const event of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(event,()=>touch[key]=false);}
window.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','Escape','Enter'].includes(e.code))e.preventDefault();keys.add(e.code);if(!e.repeat)keyClicks.add(e.code);unlockAudio();});window.addEventListener('keyup',e=>keys.delete(e.code));
function suspend(){keys.clear();keyClicks.clear();Object.keys(touch).forEach(k=>touch[k]=false);if(state.running){state.screen='main';menu(true);}}
window.addEventListener('blur',suspend);document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
let signature='';
function input(now){
 let pads=[];try{pads=navigator.getGamepads?Array.from(navigator.getGamepads()).filter(Boolean):[];}catch{}
 const sig=pads.map(p=>p.index+':'+p.id).join('|');
 if(sig!==signature){const previous=$('gamepad').value;$('gamepad').replaceChildren(new Option('Seleção automática',''));pads.forEach(p=>$('gamepad').add(new Option(p.id,String(p.index))));if(pads.some(p=>String(p.index)===previous))$('gamepad').value=previous;signature=sig;}
 const gp=pads.find(p=>String(p.index)===$('gamepad').value)||pads.find(p=>/Sophia|Volante DIY|16c0/i.test(p.id))||pads[0];
 const identity=gp?gp.index+':'+gp.id:null;
 if(state.device!==null&&state.device!==identity&&state.running){menu(true);notify('CONTROLE ALTERADO OU DESCONECTADO');}state.device=identity;
 const [rx,ry]=gp?rightIndices(gp):[2,3];
 const raw=gp?.axes[0]||0, camX=gp?.axes[rx]||0,camY=gp?.axes[ry]||0;
 const pressed=i=>Boolean(gp?.buttons[i]?.pressed||gp?.buttons[i]?.value>.5);
 const a=pressed(0),b=pressed(1),x=pressed(2);
 const backPressed=edge('b',b);
 const clickW=keyClicks.delete('KeyW'),clickEsc=keyClicks.delete('Escape'),clickEnter=keyClicks.delete('Enter');
 const accelerate=edge('a',a||keys.has('KeyW')||touch.go)||clickW,pause=edge('x',x||keys.has('Escape'))||clickEsc,enter=edge('enter',keys.has('Enter'))||clickEnter;
 $('connection').textContent=gp?'● '+gp.id:'TECLADO DISPONÍVEL';$('steerValue').textContent=raw.toFixed(2);$('steerMeter').style.left=`${50+raw*47}%`;$('cameraValue').textContent=camX.toFixed(2)+' / '+camY.toFixed(2);$('buttonSignals').textContent=`A ${a?'●':'○'}     B ${b?'●':'○'}     X ${x?'●':'○'}`;$('mapping').textContent=gp?`L: eixo 0 · R: eixos ${rx}/${ry}`:'Conecte o gamepad e pressione um botão.';
 if((pause||backPressed)&&!state.running&&state.screen==='settings'){back();return {brake:false,cx:0,cy:0};}
 if(pause&&state.started){state.screen='main';menu(state.running);}
 if(!state.running){const nav=camY>.5||keys.has('ArrowDown')?1:camY<-.5||keys.has('ArrowUp')?-1:0;if(nav&&now>state.navTime){state.selection=(state.selection+nav+menuActions().length)%menuActions().length;highlight(true);state.navTime=now+260;}if(!nav)state.navTime=0;if(accelerate||enter)menuActions()[state.selection].click();return {brake:false,cx:0,cy:0};}
 if(accelerate){state.gear=state.gear%3+1;notify(`VELOCIDADE ${state.gear} / ${targets[state.gear]} KM/H`);}
 state.steer=keys.has('ArrowLeft')||touch.left?-1:keys.has('ArrowRight')||touch.right?1:Math.max(-1,Math.min(1,axis(raw,state.deadzone)*state.sensitivity))*(state.invert?-1:1);
 return {brake:b||keys.has('Space')||touch.brake,cx:axis(camX)+(keys.has('KeyL')?1:0)-(keys.has('KeyJ')?1:0),cy:axis(camY)+(keys.has('KeyK')?1:0)-(keys.has('KeyI')?1:0)};
}
function roadCenter(z){return Math.sin(z/4200)*160+Math.sin(z/8000)*180;}
function roadSlope(z){return Math.cos(z/4200)*160/4200+Math.cos(z/8000)*180/8000;}
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
function draw(now){
 const day=state.stage==='day';
 const horizon=h*(.43+state.pitch*.12),shift=state.yaw*w*.2;
 const sky=ctx.createLinearGradient(0,0,0,horizon);sky.addColorStop(0,day?'#73c8ea':'#071320');sky.addColorStop(.7,day?'#bdeaf1':'#243248');sky.addColorStop(1,day?'#fff1ca':'#807887');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
 ctx.fillStyle=day?'#fff7aa':'#dbecd9';ctx.beginPath();ctx.arc(w*.7-shift*.25,horizon*.48,28,0,Math.PI*2);ctx.fill();
 if(!day)for(let i=0;i<65;i++){const sx=((Math.sin(i*54.32)+1)*.5*w-shift*.1+w)%w,sy=(Math.cos(i*19.73)+1)*.37*horizon;ctx.fillStyle=`rgba(220,240,240,${.2+(i%4)*.12})`;ctx.fillRect(sx,sy,1.4,1.4);}
 for(let layer=0;layer<3;layer++){const points=[[0,horizon+30]];for(let i=0;i<=120;i++){const x=i*w/120;points.push([x,horizon-12-Math.abs(Math.sin(i*.1425+layer*2+state.z/18000))* (35+layer*15)]);}points.push([w,horizon+30]);poly(points,(day?['#aad8b5','#89caa6','#65b29a']:['#263344','#243444','#1f3340'])[layer]);}
 ctx.fillStyle=day?'#8bcd85':'#263e49';ctx.fillRect(0,horizon,w,h-horizon);
 if(day)drawClouds(horizon,shift);
 const project=projectRoad;
 for(let i=95;i>=0;i--){const z1=Math.floor((state.z-cameraDistance)/35)*35+i*35,z2=z1+35,a=project(z1),b=project(z2),band=Math.floor(z1/140)%2;
 poly([[0,b.y],[w,b.y],[w,a.y],[0,a.y]],day?(band?'#91ce88':'#8bc981'):(band?'#293f48':'#2c424b'));
 poly([[a.x-a.width*.56,a.y],[b.x-b.width*.56,b.y],[b.x+b.width*.56,b.y],[a.x+a.width*.56,a.y]],day?(band?'#fff2d0':'#f4b997'):(band?'#789080':'#4b6565'));
 poly([[a.x-a.width*.5,a.y],[b.x-b.width*.5,b.y],[b.x+b.width*.5,b.y],[a.x+a.width*.5,a.y]],day?(band?'#718b9a':'#758f9e'):(band?'#172b34':'#192e37'));
 for(const side of [-1,1])poly([[a.x+side*a.width*.475-a.width*.003,a.y],[b.x+side*b.width*.475-b.width*.003,b.y],[b.x+side*b.width*.475+b.width*.003,b.y],[a.x+side*a.width*.475+a.width*.003,a.y]],'#a4dbb3');
 if(band)for(const lane of [-.16,.16])poly([[a.x+a.width*(lane-.002),a.y],[b.x+b.width*(lane-.002),b.y],[b.x+b.width*(lane+.002),b.y],[a.x+a.width*(lane+.002),a.y]],'#536d71');
 if(day&&Math.floor(z1/35)%13===0)drawTree(a,Math.floor(z1/35));
 for(const object of objects)if(!object.done&&object.z>=z1&&object.z<z2&&object.z>=state.z-45)drawObject(object);
 if(!day&&Math.floor(z1/35)%7===0){for(const side of [-1,1]){const px=a.x+side*a.width*.65;ctx.fillStyle='#769888';ctx.fillRect(px,a.y-65*a.k,3*a.k,65*a.k);ctx.fillStyle='#bbfa74';ctx.fillRect(px-4*a.k,a.y-65*a.k,11*a.k,5*a.k);}}
 }
 // Rear silhouette stays in the driver's reference frame; R only changes the view.
 const car=carPosition(),carX=car.x,carY=car.y,sz=Math.min(w*.12,130);ctx.save();ctx.translate(carX,carY);ctx.rotate(state.steer*.04*Math.min(state.speed/20,1));ctx.globalAlpha=state.shield>0&&Math.floor(state.elapsed*10)%2===0?.5:1;ctx.shadowColor=day?'#426f7844':'#91f6c5';ctx.shadowBlur=16;poly([[-sz*.5,20],[-sz*.44,-26],[-sz*.29,-52],[sz*.29,-52],[sz*.44,-26],[sz*.5,20]],day?'#ffdb77':'#d7e4d6');ctx.shadowBlur=0;poly([[-sz*.3,-25],[-sz*.23,-45],[sz*.23,-45],[sz*.3,-25]],'#142d39');poly([[-sz*.48,8],[sz*.48,8],[sz*.43,26],[-sz*.43,26]],'#142730');ctx.fillStyle='#ff786e';ctx.fillRect(-sz*.41,6,sz*.27,4);ctx.fillRect(sz*.14,6,sz*.27,4);ctx.fillStyle='#a5f479';ctx.fillRect(-sz*.1,12,sz*.2,3);ctx.restore();
 drawSpeedFlow();
 if(Math.abs(state.x)>570){ctx.fillStyle='#ffb36a';ctx.font='11px Segoe UI';ctx.textAlign='center';ctx.fillText('Tudo bem! Vamos voltar para a pista ☺',w/2,h*.63);}
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
function drawObject(o){const p=projectRoad(o.z),x=p.x+o.x*p.k*w/1400,y=p.y,unit=p.k*Math.min(w/900,1.5);ctx.save();ctx.translate(x,y);ctx.scale(unit,unit);circle(0,0,34,'#122d3b22');
 if(o.type==='star'){ctx.translate(0,-38-Math.sin(state.elapsed*4+o.z)*6);const points=[];for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,r=i%2?17:37;points.push([Math.cos(a)*r,Math.sin(a)*r]);}poly(points,'#ffe477');circle(-9,0,3,'#986424');circle(9,0,3,'#986424');}
 else if(o.type==='cone'){poly([[-32,0],[0,-82],[32,0]],'#ff9770');poly([[-19,-32],[-12,-50],[12,-50],[19,-32]],'#fff3d5');ctx.fillStyle='#cb6d54';ctx.fillRect(-38,-4,76,10);}
 else if(o.type==='ball'){circle(0,-28,31,'#b8a0f3');circle(-8,-36,18,'#e1d5ff');circle(12,-22,10,'#ffc59d');}
 else{ctx.fillStyle='#172e43';ctx.fillRect(-48,-19,18,27);ctx.fillRect(30,-19,18,27);poly([[-45,0],[-46,-42],[-29,-83],[29,-83],[46,-42],[45,0]],'#f28fac');poly([[-29,-42],[-21,-69],[21,-69],[29,-42]],'#314e76');ctx.fillStyle='#ffe3b7';ctx.fillRect(-37,-17,18,7);ctx.fillRect(19,-17,18,7);ctx.fillStyle='#d96f94';ctx.fillRect(-38,-3,76,9);}
 ctx.restore();}
function step(dt,controls){
 if(!state.running)return;
 state.elapsed+=dt;state.shield=Math.max(0,state.shield-dt);
 const outside=Math.abs(state.x)>520;
 const target=controls.brake?0:(outside?Math.min(targets[state.gear],60):targets[state.gear]);
 const rate=controls.brake?95:target<state.speed?32:38;
 state.speed+=Math.sign(target-state.speed)*Math.min(Math.abs(target-state.speed),rate*dt);
 const advance=state.speed/3.6*dt*24;
 const curve=roadCenter(state.z+advance)-roadCenter(state.z)-roadSlope(state.z)*advance;
 // A gentle return works even from rest; shoulders never cancel acceleration.
 state.x+=state.steer*Math.max(state.speed,25)*dt*2.3-curve;
 if(outside)state.x-=Math.sign(state.x)*Math.min(Math.abs(state.x),330*dt);
 state.x=Math.max(-820,Math.min(820,state.x));
 const previousZ=state.z;state.z+=advance;
 for(const object of objects){
  if(object.done)continue;
  const oldZ=object.z;if(object.type==='car')object.z+=110*dt;
  if(oldZ>=previousZ-65&&object.z<=state.z+65){
   const near=Math.abs(state.x-object.x)<(object.type==='star'?115:135);
   if(near){object.done=true;if(object.type==='star'){state.stars++;notify('★ Mais uma estrela!');chime(true);}else if(!state.shield){state.bumps++;state.shield=1.5;state.speed=Math.max(25,state.speed*.7);notify('Opa! Tudo bem, vamos continuar!');chime(false);}}
   else if(object.z<state.z-55){object.done=true;if(object.type!=='star')state.passed++;}
  }else if(object.z<state.z-80)object.done=true;
 }
 state.yaw+=(controls.cx*.95-state.yaw)*Math.min(1,dt*5);state.pitch+=(controls.cy*.9-state.pitch)*Math.min(1,dt*5);
 if(state.z>=stageLength){state.z=stageLength;state.completed=true;state.screen='main';state.selection=0;menu(true);chime(true);}
}
function frame(now){const dt=Math.min((now-state.last)/1000||0,.05);state.last=now;const controls=input(now);step(dt,controls);
 draw(now);$('speed').textContent=String(Math.round(state.speed)).padStart(3,'0');$('gear').textContent=state.gear?['','PASSEIO','AVENTURA','TURBO'][state.gear]:'VAMOS?';$('distance').textContent=(state.z/24000).toFixed(2)+' km';$('score').textContent='★ '+state.stars;$('progress').style.width=(100*state.z/stageLength)+'%';document.querySelectorAll('.steps i').forEach((el,i)=>el.classList.toggle('on',i<state.gear));if(now>state.toastUntil)$('toast').textContent='';requestAnimationFrame(frame);}
prepareStage('day');settings();menu(true);requestAnimationFrame(frame);
