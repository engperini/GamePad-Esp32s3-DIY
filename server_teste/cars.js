/* Small procedural car models. Canvas polygons only; no images or 3D library. */
(function(root){
 'use strict';
 const models={
  renegade:{width:.91,length:1.83,roof:1.94,cabinFront:-.88,cabinBack:1.34,roofWidth:.76,roofBack:1.15,hood:1.1,roundLights:true},
  song:{width:.99,length:2.1,roof:1.83,cabinFront:-1.05,cabinBack:1.63,roofWidth:.77,roofBack:1.22,hood:.98},
  sport:{width:1.02,length:1.99,roof:1.32,cabinFront:-.77,cabinBack:1.21,roofWidth:.74,roofBack:.77,hood:.69},
  buggy:{width:.94,length:1.58,roof:1.67,cabinFront:-.57,cabinBack:.97,roofWidth:.66,roofBack:.72,hood:.85}
 };
 function tint(hex,k){const n=parseInt(hex.slice(1),16);return '#'+[n>>16,(n>>8)&255,n&255].map(v=>Math.round(k<0?v*(1+k):v+(255-v)*k).toString(16).padStart(2,'0')).join('');}
 function draw(g,size,id,color,yaw=0,garage=false){
  const m=models[id]||models.renegade,W=m.width,L=m.length,H=m.hood,R=m.roof,C=m.roofWidth;
  const ca=Math.cos(yaw),sa=Math.sin(yaw),e=garage?.32:.19,ce=Math.cos(e),se=Math.sin(e),faces=[];
  const project=p=>{const d=p[0]*sa+p[2]*ca;return [(p[0]*ca-p[2]*sa)*size,(-p[1]*ce+d*se-L*se)*size,d*ce+p[1]*se];};
  const face=(points,fill,stroke='#23354444',line=.013)=>{const p=points.map(project);faces.push({p,fill,stroke,line,z:p.reduce((a,v)=>a+v[2],0)/p.length});};
  const quad=(a,b,c,d,fill)=>face([a,b,c,d],fill);
  const box=(x0,x1,y0,y1,z0,z1,fill)=>{
   quad([x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],tint(fill,.1));
   quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],tint(fill,-.12));
   quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],tint(fill,-.18));
   quad([x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[x1,y1,z0],tint(fill,.02));
   quad([x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1],tint(fill,.23));
  };
  // Chassis, painted shoulder and shaped engine hood.
  box(-W*.94,W*.94,.39,.68,-L,L,'#313c46');
  // Chamfered ends and inset wheel arches soften the body without a heavy mesh.
  const end=L-.09,shoulder=H+.27;
  quad([-W*.9,.64,-end],[W*.9,.64,-end],[W*.9,shoulder-.09,-end],[-W*.9,shoulder-.09,-end],tint(color,.04));
  quad([-W*.9,.64,end],[W*.9,.64,end],[W*.9,shoulder-.09,end],[-W*.9,shoulder-.09,end],tint(color,-.1));
  for(const side of [-1,1]){
   const surface=side*(W+.002),points=[[surface,shoulder,-end+.18],[surface,shoulder,end-.18],[surface,.64,end-.18]];
   for(const z of [L*.62,-L*.63]){points.push([surface,.64,z+.46]);for(let i=0;i<=12;i++){const angle=i*Math.PI/12;points.push([surface,.44+Math.sin(angle)*.49,z+Math.cos(angle)*.49]);}}
   points.push([surface,.64,-end+.18]);face(points,tint(color,side<0?-.13:.03));
   for(const sign of [-1,1])quad([side*W,.64,sign*(end-.18)],[side*W,shoulder,sign*(end-.18)],[side*W*.9,shoulder-.09,sign*end],[side*W*.9,.64,sign*end],tint(color,-.08));
   for(const z of [L*.62,-L*.63])for(let i=0;i<12;i++){const a=i*Math.PI/12,b=(i+1)*Math.PI/12;quad([surface+side*.012,.44+Math.sin(a)*.49,z+Math.cos(a)*.49],[surface+side*.012,.44+Math.sin(b)*.49,z+Math.cos(b)*.49],[surface+side*.012,.44+Math.sin(b)*.55,z+Math.cos(b)*.55],[surface+side*.012,.44+Math.sin(a)*.55,z+Math.cos(a)*.55],'#35434d');}
  }
  quad([-W,H+.27,-L+.09],[W,H+.27,-L+.09],[W,H+.35,m.cabinFront],[-W,H+.35,m.cabinFront],tint(color,.23));
  quad([-W,H+.27,L-.09],[W,H+.27,L-.09],[W,H+.35,m.cabinBack],[-W,H+.35,m.cabinBack],tint(color,.1));
  const base=H+.32,rf=m.cabinFront+.4,rb=m.roofBack;
  quad([-W,base,m.cabinFront],[W,base,m.cabinFront],[C,R,rf],[-C,R,rf],tint(color,.05));
  quad([-W,base,m.cabinBack],[W,base,m.cabinBack],[C,R,rb],[-C,R,rb],tint(color,-.03));
  quad([-C,R,rf],[C,R,rf],[C,R,rb],[-C,R,rb],tint(color,.34));
  for(const s of [-1,1]){
   quad([s*W,base,m.cabinFront],[s*W,base,m.cabinBack],[s*C,R,rb],[s*C,R,rf],tint(color,s<0?-.15:.1));
   // Glass trapezoids, central pillar and chrome belt line.
   const x0=s*(W*.94+.025),x1=s*(C+.018),z0=m.cabinFront+.16,z1=m.cabinBack-.12;
   quad([x0,base+.06,z0],[x0,base+.06,z1],[x1,R-.1,rb-.1],[x1,R-.1,rf+.1],'#182e42');
   quad([x0,base+.09,z0+.06],[x0,base+.09,.05],[x1,R-.14,-.02],[x1,R-.14,rf+.17],'#467187');
   quad([x0,base+.09,.17],[x0,base+.09,z1-.06],[x1,R-.14,rb-.16],[x1,R-.14,.1],'#2c4b62');
   face([[s*(W+.008),base-.03,z0],[s*(W+.008),base-.03,z1]],'#c4d1d9','#c4d1d9',.023);
   for(const z of [.13,m.cabinBack-.18]){
    face([[s*(W+.016),.71,z],[s*(W+.016),base-.08,z]],color,tint(color,-.36),.012);
    box(s*W-.035,s*W+.035,base-.14,base-.1,z-.17,z-.01,'#aebdc5');
   }
   box(s*(W+.12)-.11,s*(W+.12)+.11,base+.04,base+.18,m.cabinFront+.06,m.cabinFront+.29,color);
   // Roof rails have a real gap above the roof on the two SUVs.
   if(id==='renegade'||id==='song')box(s*C*.86-.026,s*C*.86+.026,R+.035,R+.075,rf+.06,rb-.06,'#37454f');
  }
  // Front and rear glass use their own reflective panels.
  const glass=(front)=>{const b=front?m.cabinFront-.012:m.cabinBack+.012,t=front?rf-.012:rb+.012;
   quad([-W*.85,base+.055,b],[W*.85,base+.055,b],[C*.88,R-.1,t],[-C*.88,R-.1,t],front?'#234256':'#233b50');
   quad([-W*.76,base+.07,b+.004],[-W*.4,base+.07,b+.004],[C*.05,R-.13,t+.004],[-C*.35,R-.13,t+.004],'#ffffff19');
  };glass(true);glass(false);
  face([[-.24,base+.11,m.cabinBack+.023],[.35,base+.15,m.cabinBack+.023]],'#1c2833','#1c2833',.025);
  // Sculpted bumpers, plate, rear hatch seam and reflectors.
  box(-W*.93,W*.93,.42,.66,L-.075,L+.045,'#28343f');
  box(-W*.68,W*.68,.43,.5,L+.047,L+.063,'#a1b0bc');
  box(-.22,.22,.75,.89,L-.074,L-.06,'#eef2e9');
  face([[-.12,.805,L-.052],[.12,.805,L-.052]],'#556370','#556370',.018);
  face([[-W*.65,H+.19,L-.073],[W*.65,H+.19,L-.073]],color,tint(color,-.24),.018);
  for(const s of [-1,1])box(s*.7-.09,s*.7+.09,.54,.585,L+.065,L+.078,'#e64650');
  if(id==='renegade'){
   for(const s of [-1,1]){
    box(s*.67-.17,s*.67+.17,.93,1.26,L-.07,L-.028,'#302d36');
    box(s*.67-.133,s*.67+.133,.967,1.225,L-.025,L-.012,'#ec444a');
    for(const flip of [-1,1])face([[s*.67-.088,1.096-flip*.086,L],[s*.67+.088,1.096+flip*.086,L]],'#ffdbc0','#ffdbc0',.037);
   }
  }else{
   box(-W*.86,W*.86,H+.075,H+.14,L-.065,L-.028,'#c52035');
   face([[-W*.8,H+.12,L-.019],[W*.8,H+.12,L-.019]],'#ffafa4','#ffafa4',.019);
   for(const s of [-1,1])box(s*W*.72-.13,s*W*.72+.13,H-.01,H+.17,L-.025,L-.014,'#fa4c58');
  }
  // Headlights and model-specific grille visible in the static garage view.
  box(-W*.85,W*.85,.66,H+.12,-L-.018,-L+.06,'#202c36');
  for(const s of [-1,1]){
   if(m.roundLights){const ring=[];for(let i=0;i<24;i++){const a=i*Math.PI/12;ring.push([s*.66+Math.cos(a)*.15,H-.015+Math.sin(a)*.15,-L-.025]);}face(ring,'#e8f7ff','#96bfce',.028);}
   else box(s*.65-.23,s*.65+.23,H+.01,H+.09,-L-.035,-L-.02,'#e3f7ff');
  }
  if(m.roundLights)for(let i=-3;i<=3;i++)box(i*.12-.032,i*.12+.032,.79,H+.08,-L-.025,-L-.021,'#7c8990');
  else for(let i=0;i<4;i++)face([[-.48,.72+i*.055,-L-.027],[.48,.72+i*.055,-L-.027]],'#8798a3','#8798a3',.017);
  // Four cylindrical tires with inset alloy rims and radial spokes.
  for(const s of [-1,1])for(const z of [-L*.63,L*.62]){
   const r=id==='buggy'?.45:.38,y=.41,outer=s*(W+.075),inner=s*(W-.22),N=20;
   for(let i=0;i<N;i++){const a=i*2*Math.PI/N,b=(i+1)*2*Math.PI/N;
    quad([inner,y+Math.cos(a)*r,z+Math.sin(a)*r],[outer,y+Math.cos(a)*r,z+Math.sin(a)*r],[outer,y+Math.cos(b)*r,z+Math.sin(b)*r],[inner,y+Math.cos(b)*r,z+Math.sin(b)*r],i<8?'#26313b':'#111c26');}
   const disk=(radius,x,fill)=>{const p=[];for(let i=0;i<N;i++){const a=i*2*Math.PI/N;p.push([x,y+Math.cos(a)*radius,z+Math.sin(a)*radius]);}face(p,fill);};
   disk(r,outer,'#131f2a');disk(r*.74,outer+s*.009,'#8596a3');disk(r*.58,outer+s*.012,'#263646');
   for(let i=0;i<5;i++){const a=i*Math.PI*2/5;face([[outer+s*.018,y,z],[outer+s*.018,y+Math.cos(a)*r*.66,z+Math.sin(a)*r*.66]],'#d4dee4','#d4dee4',.048);}
   disk(.08,outer+s*.021,'#bccbd3');
  }
  if(id==='sport')box(-W*.9,W*.9,1.47,1.53,.86,1.12,'#24343f');
  if(id==='buggy')for(const s of [-1,1])box(s*.65-.035,s*.65+.035,R-.45,R+.06,.55,.64,'#263c49');
  g.save();g.fillStyle='#07182538';g.beginPath();g.ellipse(0,-size*.08,size*(garage?1.72:1.15),size*.28,0,0,Math.PI*2);g.fill();
  faces.sort((a,b)=>a.z-b.z);
  for(const f of faces){g.beginPath();f.p.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));if(f.p.length>2){g.closePath();g.fillStyle=f.fill;g.fill();}g.strokeStyle=f.stroke;g.lineWidth=Math.max(.5,size*f.line);g.stroke();}
  g.restore();
 }
 // Side elevation for the garage: independent 2D silhouette, with both lamps visible.
 function side(g,size,id,color){
  const suv=id==='renegade'||id==='song',boxy=id==='renegade',sport=id==='sport';
  const top=sport?-64:boxy?-102:-91,front=boxy?44:32,rear=boxy?-102:-87;
  g.save();g.scale(size/100,size/100);
  const path=(points,fill)=>{g.beginPath();points.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p));g.closePath();g.fillStyle=fill;g.fill();};
  g.fillStyle='#081c3033';g.beginPath();g.ellipse(0,12,155,11,0,0,Math.PI*2);g.fill();
  path([[-148,-12],[-148,-58],[rear,top],[front,top],[76,-60],[132,-51],[149,-32],[146,-9]],color);
  path([[-148,-12],[-148,-26],[148,-26],[146,-9]],'#31414b');
  path([[rear+9,top+8],[-123,-61],[-39,-61],[-39,top+8]],'#284b60');
  path([[-32,top+8],[front-5,top+8],[64,-61],[-32,-61]],'#355f76');
  path([[-23,top+10],[front-12,top+10],[48,-67],[22,-67]],'#ffffff20');
  path([[-140,-54],[128,-48],[141,-37],[-140,-43]],tint(color,.2));
  g.strokeStyle=tint(color,-.3);g.lineWidth=1;g.beginPath();g.moveTo(-35,-58);g.lineTo(-35,-28);g.moveTo(68,-55);g.lineTo(67,-28);g.stroke();
  g.fillStyle='#cad5dc';g.fillRect(-59,-52,14,3);g.fillRect(40,-50,14,3);
  g.fillStyle='#e94350';g.fillRect(-148,-55,boxy?12:17,boxy?22:10);
  g.fillStyle='#fff1b5';g.fillRect(131,-47,16,9);
  g.fillStyle='#637b88';g.fillRect(58,-66,17,8);
  if(suv){g.fillStyle='#34424c';g.fillRect(rear+6,top-5,front-rear-12,4);}
  if(sport){g.fillStyle='#31414b';g.fillRect(-151,-70,46,5);g.fillRect(-137,-66,5,12);}
  for(const x of [-98,98]){
   g.fillStyle='#26343e';g.beginPath();g.arc(x,-10,30,Math.PI,Math.PI*2);g.fill();
   for(const [r,c] of [[25,'#15212b'],[17,'#a5b6c1'],[13,'#354b5b'],[5,'#d6e0e6']]){g.fillStyle=c;g.beginPath();g.arc(x,-10,r,0,Math.PI*2);g.fill();}
   g.strokeStyle='#c9d7df';g.lineWidth=3;for(let i=0;i<5;i++){const a=i*Math.PI*2/5;g.beginPath();g.moveTo(x,-10);g.lineTo(x+Math.cos(a)*14,-10+Math.sin(a)*14);g.stroke();}
  }
  g.restore();
 }
 root.SophiaCars={draw,side,models};
 if(typeof module!=='undefined')module.exports=root.SophiaCars;
})(typeof window==='undefined'?{}:window);
