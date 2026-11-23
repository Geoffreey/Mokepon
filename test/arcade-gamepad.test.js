const test=require('node:test')
const assert=require('node:assert/strict')
const G=require('../public/js/arcade-gamepad')
const A=require('../public/js/arcade-engine')
function pad({index=0,id='Test Controller',mapping='standard',axes=[0,0],buttons=[],connected=true}={}){
  return {index,id,mapping,axes,connected,buttons:Array.from({length:17},(_,i)=>({pressed:buttons.includes(i),value:buttons.includes(i)?1:0}))}
}
test('mando estándar: palanca, cruceta y acciones simultáneas',()=>{
  assert.equal(G.decode(pad({axes:[-.8,0],buttons:[0,2,7]})).input,A.INPUT.LEFT|A.INPUT.JUMP|A.INPUT.ATTACK|A.INPUT.SHOOT)
  assert.equal(G.decode(pad({buttons:[15,1]})).input,A.INPUT.RIGHT|A.INPUT.SHOOT)
  assert.equal(G.decode(pad({buttons:[14,15]})).input,0)
  assert.equal(G.decode(pad({axes:[.2,0]})).input,0)
  assert.equal(G.decode(pad({axes:[NaN,0]})).input,0)
  assert.equal(G.decode(pad({mapping:''})).input,0)
  assert.equal(G.decode(pad({connected:false,buttons:[0]})).input,0)
})
test('conexión con botones sostenidos espera a soltarlos; Start no se repite',()=>{
  const reader=G.createReader()
  assert.equal(reader.read([pad({buttons:[0]})]).input,0)
  reader.read([pad()])
  const jump=reader.read([pad({buttons:[0]})]);assert.equal(jump.input,4);assert.equal(jump.confirmPressed,true)
  assert.equal(reader.read([pad({buttons:[0]})]).confirmPressed,false)
  assert.equal(reader.read([pad({buttons:[9]})]).pausePressed,true)
  assert.equal(reader.read([pad({buttons:[9]})]).pausePressed,false)
  reader.block();assert.equal(reader.read([pad({buttons:[9]})]).pausePressed,false)
  reader.read([pad()]);assert.equal(reader.read([pad({buttons:[9]})]).pausePressed,true)
})
test('admite índices dispersos, desconexión, reconexión y menús',()=>{
  const reader=G.createReader(),two=pad({index:2})
  assert.equal(reader.read([null,null,two]).connected,true)
  assert.equal(reader.read([null,null,pad({index:2,buttons:[13]})]).menuPressed,1)
  assert.equal(reader.read([null,null,pad({index:2,buttons:[13]})]).menuPressed,0)
  assert.equal(reader.read([]).disconnected,true)
  assert.equal(reader.read([]).disconnected,false)
  assert.equal(reader.read([pad({index:2,buttons:[1]})]).input,0)
  reader.read([two]);assert.equal(reader.read([pad({index:2,buttons:[1]})]).input,16)
})
test('prioriza un mando estándar y mantiene el seleccionado',()=>{
  const reader=G.createReader(),first=pad({index:1}),second=pad({index:2})
  assert.equal(reader.read([pad({mapping:''}),null,second]).index,2)
  assert.equal(reader.read([first,second]).index,2)
  assert.equal(reader.read([first]).disconnected,true)
  assert.equal(reader.read([pad({mapping:''})]).supported,false)
})
test('las acciones del mando completan el mismo salto y proyectil que teclado',()=>{
  const reader=G.createReader(),state=A.create('selva','Cadejo')
  reader.read([pad()]);for(let i=0;i<30;i++)A.step(state,0)
  const input=reader.read([pad({axes:[1,0],buttons:[0,1]})]).input
  A.step(state,input)
  assert.ok(state.player.vy<0);assert.ok(state.player.vx>0)
  assert.equal(state.playerShots.length,1);assert.equal(state.playerShots[0].element,'fire')
})

test('integración del arcade: Start pausa/continúa, desconexión pausa y salir cancela el bucle',()=>{
  const vm=require('node:vm'),fs=require('node:fs'),elements=new Map()
  const element=()=>({hidden:false,disabled:false,textContent:'',classList:{add(){},remove(){},toggle(){}},getContext:()=>({}),getClientRects:()=>[{}],addEventListener(){},focus(){},click(){this.onclick?.()}})
  const $=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)}
  let pads=[pad()],scheduled=0
  const context=vm.createContext({MayabArcade:A,MayabGamepad:G,$,sections:{arcadeJuego:$('arcade-juego')},
    navigator:{getGamepads:()=>pads},window:{addEventListener(){},matchMedia:()=>({addEventListener(){}})},
    document:{hidden:false,fullscreenEnabled:false,fullscreenElement:null,body:element(),querySelectorAll:()=>[],addEventListener(){}},
    cancelAnimationFrame(){},requestAnimationFrame(){scheduled++;return scheduled}})
  vm.runInContext(fs.readFileSync(require.resolve('../public/js/arcade'),'utf8'),context)
  $('arcade-tutorial').hidden=true;$('arcade-overlay').hidden=true
  vm.runInContext("arcadeState=MayabArcade.create('selva');arcadePaused=false;actualizarMandoArcade()",context)
  pads=[pad({buttons:[9]})];vm.runInContext('actualizarMandoArcade()',context)
  assert.equal(vm.runInContext('arcadePaused',context),true)
  vm.runInContext('actualizarMandoArcade()',context);assert.equal(vm.runInContext('arcadePaused',context),true)
  pads=[pad()];vm.runInContext('actualizarMandoArcade()',context)
  pads=[pad({buttons:[9]})];vm.runInContext('actualizarMandoArcade()',context)
  assert.equal(vm.runInContext('arcadePaused',context),false)
  pads=[];vm.runInContext('actualizarMandoArcade()',context)
  assert.equal(vm.runInContext('arcadePaused',context),true)
  assert.equal(vm.runInContext('arcadeGamepadInput',context),0)
  pads=[pad()];vm.runInContext('actualizarMandoArcade()',context)
  $('arcade-continuar').onclick=()=>vm.runInContext('detenerArcade()',context)
  $('arcade-continuar').hidden=false;$('arcade-reintentar').hidden=true
  pads=[pad({buttons:[0]})];vm.runInContext('arcadeLoop(16)',context)
  assert.equal(scheduled,0,'una acción de menú que sale no puede crear otro bucle de animación')
  // Portrait camera fits the real space left by the HUD and touch controls.
  context.window.matchMedia=()=>({matches:true})
  $('arcade-canvas').parentElement={clientWidth:354,clientHeight:520}
  vm.runInContext('configurarVistaArcade()',context);assert.equal($('arcade-canvas').width,420)
  $('arcade-canvas').parentElement={clientWidth:284,clientHeight:220}
  vm.runInContext('configurarVistaArcade()',context);assert.equal($('arcade-canvas').width,697)
  context.window.matchMedia=()=>({matches:false})
  vm.runInContext('configurarVistaArcade()',context);assert.equal($('arcade-canvas').width,960)
  vm.runInContext('mostrarGuiaArcade()',context)
  assert.equal($('arcade-tutorial-content').scrollTop,0)

})
