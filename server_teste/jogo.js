'use strict';
const $ = id => document.getElementById(id);
const canvas = $('world'), ctx = canvas.getContext('2d');
const keys = new Set(), held = new Set();
const state = {running:false,started:false,z:0,x:0,speed:0,gear:0,yaw:0,pitch:0,steer:0,invert:true,deadzone:.04,sensitivity:1,selection:0,navTime:0,last:0,toastUntil:0,device:null};
try { const saved=JSON.parse(localStorage.getItem('orbita-settings')||'{}'); if(typeof saved.invert==='boolean')state.invert=saved.invert;if(Number.isFinite(saved.deadzone))state.deadzone=Math.max(0,Math.min(.2,saved.deadzone));;if(Number.isFinite(saved.sensitivity))state.sensitivity=Math.max(.6,Math.min(1.8,saved.sensitivity)); } catch {}
const targets=[0,55,95,140], actions=[$('start'),$('invert'),$('reset'),$('sensitivity')];
function save(){try{localStorage.setItem('orbita-settings',JSON.stringify({invert:state.invert,deadzone:state.deadzone,sensitivity:state.sensitivity}));}catch{}}
function settings(){ $('sensitivity').textContent=`Sensibilidade: ${state.sensitivity.toFixed(1)}× · A para alternar`; $('invert').textContent=`Volante invertido: ${state.invert?'SIM':'NÃO'}`;$('deadzone').value=state.deadzone*100;$('deadValue').textContent=Math.round(state.deadzone*100)+'%'; }
function highlight(){actions.forEach((b,i)=>b.classList.toggle('selected',i===state.selection));}
function menu(show){state.running=!show;$('overlay').classList.toggle('hidden',!show);$('pause').textContent=show?'Retomar · X':'Pausar · X';if(show){$('menuTitle').innerHTML=state.started?'Uma pausa.<br><em>A pista espera.</em>':'Sinta a curva.<br><em>Encontre o controle.</em>';$('start').innerHTML=state.started?'Retomar percurso <span>↗</span>':'Entrar na pista <span>↗</span>';highlight();}}
function start(){state.started=true;menu(false);}
function notify(text){$('toast').textContent=text;state.toastUntil=performance.now()+2200;}
function edge(name,down){const fresh=down&&!held.has(name);if(down)held.add(name);else held.delete(name);return fresh;}
function axis(value,zone=.08){return Math.abs(value)<=zone?0:Math.sign(value)*(Math.abs(value)-zone)/(1-zone);}
function rightIndices(gp){return gp.mapping!=='standard'&&gp.axes.length>=5?[3,4]:[2,3];}
function reset(){Object.assign(state,{z:0,x:0,speed:0,gear:0,yaw:0,pitch:0,steer:0});start();notify('NOVO PERCURSO');}
$('sensitivity').onclick=()=>{const levels=[.6,1,1.4,1.8];state.sensitivity=levels[(levels.indexOf(state.sensitivity)+1)%levels.length];settings();save();};$('start').onclick=start;$('reset').onclick=reset;$('invert').onclick=()=>{state.invert=!state.invert;settings();save();};$('deadzone').oninput=e=>{state.deadzone=Number(e.target.value)/100;settings();save();};$('pause').onclick=()=>menu(state.running);
window.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','Escape'].includes(e.code))e.preventDefault();keys.add(e.code);});window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{keys.clear();if(state.running)menu(true);});document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.running)menu(true);});
let signature='';
function input(now){
 const pads=navigator.getGamepads?Array.from(navigator.getGamepads()).filter(Boolean):[];
 const sig=pads.map(p=>p.index+':'+p.id).join('|');
 if(sig!==signature){const previous=$('gamepad').value;$('gamepad').replaceChildren(new Option('Seleção automática',''));pads.forEach(p=>$('gamepad').add(new Option(p.id,String(p.index))));if(pads.some(p=>String(p.index)===previous))$('gamepad').value=previous;signature=sig;}
 const gp=pads.find(p=>String(p.index)===$('gamepad').value)||pads.find(p=>/Sophia|Volante DIY|16c0/i.test(p.id))||pads[0];
 const identity=gp?gp.index+':'+gp.id:null;
 if(state.device!==null&&state.device!==identity&&state.running){menu(true);notify('CONTROLE ALTERADO OU DESCONECTADO');}state.device=identity;
 const [rx,ry]=gp?rightIndices(gp):[2,3];
 const raw=gp?.axes[0]||0, camX=gp?.axes[rx]||0,camY=gp?.axes[ry]||0;
 const pressed=i=>Boolean(gp?.buttons[i]?.pressed||gp?.buttons[i]?.value>.5);
 const a=pressed(0),b=pressed(1),x=pressed(2);
 const accelerate=edge('a',a||keys.has('KeyW')),pause=edge('x',x||keys.has('Escape')),enter=edge('enter',keys.has('Enter'));
 $('connection').textContent=gp?'● '+gp.id:'TECLADO DISPONÍVEL';$('steerValue').textContent=raw.toFixed(2);$('steerMeter').style.left=`${50+raw*47}%`;$('cameraValue').textContent=camX.toFixed(2)+' / '+camY.toFixed(2);$('buttonSignals').textContent=`A ${a?'●':'○'}     B ${b?'●':'○'}     X ${x?'●':'○'}`;$('mapping').textContent=gp?`L: eixo 0 · R: eixos ${rx}/${ry}`:'Conecte o gamepad e pressione um botão.';
 if(pause&&state.started)menu(state.running);
 if(!state.running){const nav=camY>.5||keys.has('ArrowDown')?1:camY<-.5||keys.has('ArrowUp')?-1:0;if(nav&&now>state.navTime){state.selection=(state.selection+nav+actions.length)%actions.length;highlight();state.navTime=now+260;}if(!nav)state.navTime=0;if(accelerate||enter)actions[state.selection].click();return {brake:false,cx:0,cy:0};}
 if(accelerate){state.gear=state.gear%3+1;notify(`VELOCIDADE ${state.gear} / ${targets[state.gear]} KM/H`);}
 state.steer=keys.has('ArrowLeft')?-1:keys.has('ArrowRight')?1:Math.max(-1,Math.min(1,axis(raw,state.deadzone)*state.sensitivity))*(state.invert?-1:1);
 return {brake:b||keys.has('Space'),cx:axis(camX)+(keys.has('KeyL')?1:0)-(keys.has('KeyJ')?1:0),cy:axis(camY)+(keys.has('KeyK')?1:0)-(keys.has('KeyI')?1:0)};
}
function roadCenter(z){return Math.sin(z/730)*650+Math.sin(z/1700)*1050;}
function roadSlope(z){return Math.cos(z/730)*650/730+Math.cos(z/1700)*1050/1700;}
const cameraDistance=240;
function projectRoad(z){
 const depth=z-(state.z-cameraDistance),k=1/(depth*.002+1);
 const horizon=h*(.43+state.pitch*.12);
 // Use the tangent at the car as the viewing direction. The car and road
 // share their world position, perspective depth and camera translation.
 const bend=roadCenter(z)-roadCenter(state.z)-roadSlope(state.z)*(z-state.z);
 return {x:w/2+(bend-state.x)*k*w/1400-state.yaw*w*.2,
   y:horizon+(h-horizon)*k,width:w*.82*k,k};
}
function carPosition(){const p=projectRoad(state.z);return {x:p.x+state.x*p.k*w/1400,y:p.y};}
let w=0,h=0;
function resize(){w=innerWidth;h=innerHeight;const d=Math.min(devicePixelRatio||1,2);canvas.width=w*d;canvas.height=h*d;ctx.setTransform(d,0,0,d,0,0);}window.addEventListener('resize',resize);resize();
function poly(points,color){ctx.fillStyle=color;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fill();}
function draw(now){
 const horizon=h*(.43+state.pitch*.12),shift=state.yaw*w*.2;
 const sky=ctx.createLinearGradient(0,0,0,horizon);sky.addColorStop(0,'#071320');sky.addColorStop(.7,'#243248');sky.addColorStop(1,'#807887');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
 ctx.fillStyle='#dbecd9';ctx.beginPath();ctx.arc(w*.7-shift*.25,horizon*.48,28,0,Math.PI*2);ctx.fill();
 for(let i=0;i<65;i++){const sx=((Math.sin(i*54.32)+1)*.5*w-shift*.1+w)%w,sy=(Math.cos(i*19.73)+1)*.37*horizon;ctx.fillStyle=`rgba(220,240,240,${.2+(i%4)*.12})`;ctx.fillRect(sx,sy,1.4,1.4);}
 for(let layer=0;layer<3;layer++){const points=[[0,horizon+30]];for(let i=0;i<=30;i++){const x=i*w/30;points.push([x,horizon-12-Math.abs(Math.sin(i*.57+layer*2+state.z/18000))* (35+layer*15)]);}points.push([w,horizon+30]);poly(points,['#263344','#243444','#1f3340'][layer]);}
 ctx.fillStyle='#263e49';ctx.fillRect(0,horizon,w,h-horizon);
 const project=projectRoad;
 for(let i=95;i>=0;i--){const z1=Math.floor((state.z-cameraDistance)/35)*35+i*35,z2=z1+35,a=project(z1),b=project(z2),band=Math.floor(z1/140)%2;
 poly([[0,b.y],[w,b.y],[w,a.y],[0,a.y]],band?'#293f48':'#2c424b');
 poly([[a.x-a.width*.56,a.y],[b.x-b.width*.56,b.y],[b.x+b.width*.56,b.y],[a.x+a.width*.56,a.y]],band?'#789080':'#4b6565');
 poly([[a.x-a.width*.5,a.y],[b.x-b.width*.5,b.y],[b.x+b.width*.5,b.y],[a.x+a.width*.5,a.y]],band?'#172b34':'#192e37');
 for(const side of [-1,1])poly([[a.x+side*a.width*.475-a.width*.003,a.y],[b.x+side*b.width*.475-b.width*.003,b.y],[b.x+side*b.width*.475+b.width*.003,b.y],[a.x+side*a.width*.475+a.width*.003,a.y]],'#a4dbb3');
 if(band)for(const lane of [-.16,.16])poly([[a.x+a.width*(lane-.002),a.y],[b.x+b.width*(lane-.002),b.y],[b.x+b.width*(lane+.002),b.y],[a.x+a.width*(lane+.002),a.y]],'#536d71');
 if(Math.floor(z1/35)%7===0){for(const side of [-1,1]){const px=a.x+side*a.width*.65;ctx.fillStyle='#769888';ctx.fillRect(px,a.y-65*a.k,3*a.k,65*a.k);ctx.fillStyle='#bbfa74';ctx.fillRect(px-4*a.k,a.y-65*a.k,11*a.k,5*a.k);}}
 }
 // Rear silhouette stays in the driver's reference frame; R only changes the view.
 const car=carPosition(),carX=car.x,carY=car.y,sz=Math.min(w*.12,130);ctx.save();ctx.translate(carX,carY);ctx.rotate(state.steer*.04*Math.min(state.speed/20,1));ctx.shadowColor='#91f6c5';ctx.shadowBlur=24;poly([[-sz*.5,20],[-sz*.44,-26],[-sz*.29,-52],[sz*.29,-52],[sz*.44,-26],[sz*.5,20]],'#d7e4d6');ctx.shadowBlur=0;poly([[-sz*.3,-25],[-sz*.23,-45],[sz*.23,-45],[sz*.3,-25]],'#142d39');poly([[-sz*.48,8],[sz*.48,8],[sz*.43,26],[-sz*.43,26]],'#142730');ctx.fillStyle='#ff786e';ctx.fillRect(-sz*.41,6,sz*.27,4);ctx.fillRect(sz*.14,6,sz*.27,4);ctx.fillStyle='#a5f479';ctx.fillRect(-sz*.1,12,sz*.2,3);ctx.restore();
 drawSpeedFlow();
 if(Math.abs(state.x)>570){ctx.fillStyle='#ffb36a';ctx.font='11px Segoe UI';ctx.textAlign='center';ctx.fillText('FORA DA PISTA · REDUZA E CORRIJA O VOLANTE',w/2,h*.63);}
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
function frame(now){const dt=Math.min((now-state.last)/1000||0,.05);state.last=now;const controls=input(now);
 if(state.running){const target=controls.brake?0:targets[state.gear];const rate=controls.brake?95:target<state.speed?40:38;state.speed+=Math.sign(target-state.speed)*Math.min(Math.abs(target-state.speed),rate*dt);const advance=state.speed/3.6*dt*24;const curve=roadCenter(state.z+advance)-roadCenter(state.z)-roadSlope(state.z)*advance;state.x+=state.steer*state.speed*dt*2.8-curve;state.x=Math.max(-1300,Math.min(1300,state.x));if(Math.abs(state.x)>570)state.speed=Math.max(0,state.speed-45*dt);state.z+=advance;state.yaw+=(controls.cx*.95-state.yaw)*Math.min(1,dt*5);state.pitch+=(controls.cy*.9-state.pitch)*Math.min(1,dt*5);}
 draw(now);$('speed').textContent=String(Math.round(state.speed)).padStart(3,'0');$('gear').textContent=state.gear?`${state.gear} / ${targets[state.gear]} km/h`:'NEUTRO';$('distance').textContent=(state.z/24000).toFixed(2)+' km';document.querySelectorAll('.steps i').forEach((el,i)=>el.classList.toggle('on',i<state.gear));if(now>state.toastUntil)$('toast').textContent='';requestAnimationFrame(frame);}
settings();highlight();requestAnimationFrame(frame);
