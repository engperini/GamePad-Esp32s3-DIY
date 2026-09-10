const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(`${__dirname}/../server_teste/index.html`, 'utf8');
const elements = new Map();
for (const [,id] of html.matchAll(/id="([^"]+)"/g)) {
  elements.set(id, {textContent:'', value:'', dataset:{}, style:{}, childNodes:[{textContent:''}],
    classList:{add(){},remove(){},toggle(){}}, querySelector(){return {textContent:''}},
    addEventListener(){}, replaceChildren(){}, add(){}});
}
const gp = {index:0,id:'GamePad Sophia',axes:[-0.75,0,0.25,-0.5],
  buttons:[true,false,true,false,true].map(pressed => ({pressed, value:Number(pressed)}))};
const context = {document:{getElementById:id=>{assert(elements.has(id),id);return elements.get(id)}},
  navigator:{getGamepads:()=>[gp]},window:{addEventListener(){}},console,
  requestAnimationFrame(){},Option:function(){}};
vm.createContext(context);
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
vm.runInContext('loop()',context);
assert.equal(elements.get('valorVolante').textContent,'-0.750');
assert.equal(elements.get('valorJoystickX').textContent,'0.250');
assert.equal(elements.get('valorJoystickY').textContent,'-0.500');
for(let i=0;i<5;i++) assert.equal(elements.get(`valorBotao${i+1}`).childNodes[0].textContent,
  gp.buttons[i].pressed?'pressionado ':'solto ');
// Windows RawInput leaves a zero Z slot between Y and Rx.
gp.mapping = '';
gp.axes = [-0.75, 0, 0, 0.65, -0.35];
vm.runInContext('loop()',context);
assert.equal(elements.get('valorVolante').textContent,'-0.750');
assert.equal(elements.get('valorJoystickX').textContent,'0.650');
assert.equal(elements.get('valorJoystickY').textContent,'-0.350');
// Standard mapping keeps R at 2/3 even if extra axes exist.
gp.mapping = 'standard';
gp.axes = [-0.75, 0, -0.25, 0.5, 0];
vm.runInContext('loop()',context);
assert.equal(elements.get('valorJoystickX').textContent,'-0.250');
assert.equal(elements.get('valorJoystickY').textContent,'0.500');
console.log('PASS: compact, Windows HID and standard axis layouts; all buttons.');
