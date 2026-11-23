const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const main=fs.readFileSync(require.resolve('../public/js/mokepon'),'utf8')
const duel=fs.readFileSync(require.resolve('../public/js/duel'),'utf8')
function load(source,start,end,context){vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),context)}
function setup(extra={}){
 const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,{disabled:false,hidden:false,textContent:'',querySelector:()=>({textContent:''})});return elements.get(id)}
 return vm.createContext({$,console,...extra})
}
test('volver a entrar a una sala prepara de nuevo el selector y habilita el botón',()=>{
 let prepared=0
 const c=setup({salaActual:null,mapaBackground:{},document:{querySelector:()=>({})},prepararGuardian(){prepared++;c.$('boton-mascota').disabled=false},actualizarEstadoSala:async()=>{},avisarJugador(){}})
 c.$('boton-mascota').disabled=true
 load(main,'function entrarSala(','async function salirSala',c)
 c.entrarSala({nombre:'Sala',mapa:'mapa.png',soyCreador:true})
 assert.equal(prepared,1);assert.equal(c.$('boton-mascota').disabled,false)
})
test('el selector libera el botón tras iniciar o fallar en arcade, máquina y en línea',async()=>{
 for(const mode of ['arcade','maquina','pvp'])for(const fail of [false,true]){
  const start=async()=>{if(fail)throw Error('Sin conexión')}
  const c=setup({document:{querySelector:selector=>selector.includes('mascota')?{value:'Cadejo'}:null},mokepones:[{nombre:'Cadejo'}],guardianDisponible:()=>true,modoJuego:mode,iniciarArcade:start,iniciarDueloLocal:start,api:start,mascotaJugador:'',skinJugador:'',nombreJugador:'Prueba',fotoGuardian:()=>'',mostrarAtaques(){},obtenerObjetoMascota:()=>({ataques:[]}),jugadorId:'uno',cabeceras:()=>({}),mostrarSolo(){},iniciarMapa(){},actualizarEstadoSala:async()=>{},avisarJugador(){}})
  load(main,'async function seleccionarMascotaJugador(','function mostrarAtaques',c)
  await c.seleccionarMascotaJugador()
  assert.equal(c.$('boton-mascota').disabled,false,`${mode}, error=${fail}`)
 }
})
test('salir del resultado no espera a una actualización de recursos pendiente',async()=>{
 for(const mode of ['maquina','mision','pvp']){
  let destination='',cleared=false
  const c=setup({duelReturning:false,duelSnapshot:{mode},jugadorId:'uno',salaActual:{},sections:{misiones:{hidden:true}},api:async()=>{},cabeceras:()=>({}),limpiarBatalla(){cleared=true},mostrarSolo(name){destination=name},iniciarMapa(){},actualizarEstadoSala:async()=>{},renderMisiones(){},mostrarModos(){destination='modos'},cargarProgreso:()=>new Promise(()=>{})})
  load(duel,'async function volverDelDuelo(','function leerMandoDuelo',c)
  await c.volverDelDuelo()
  assert.equal(cleared,true);assert.equal(destination,{maquina:'modos',mision:'misiones',pvp:'mapa'}[mode])
 }
})
test('si falla el cierre del duelo en línea conserva el resultado y permite reintentar',async()=>{
 const snapshot={mode:'pvp'}
 const c=setup({duelReturning:false,duelSnapshot:snapshot,jugadorId:'uno',cabeceras:()=>({}),api:async()=>{throw Error('Intenta otra vez')}})
 load(duel,'async function volverDelDuelo(','function leerMandoDuelo',c)
 await c.volverDelDuelo()
 assert.equal(c.duelSnapshot,snapshot);assert.equal(c.duelReturning,false);assert.equal(c.$('duel-return').disabled,false)
 assert.equal(c.$('duel-status').textContent,'Intenta otra vez')
})
test('una petición detenida vence y los controles conservan su propia señal de cancelación',async()=>{
 let expire,received,cleared=false
 const c=setup({AbortController,jugadorToken:null,sesionInvalida:false,setTimeout(fn){expire=fn;return 1},clearTimeout(){cleared=true},fetch:async(url,options)=>{received=options.signal;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('Abortado'))))}})
 load(main,'async function api(','async function iniciarJuego',c)
 const pending=c.api('/arcade/progreso');expire()
 await assert.rejects(pending,/La conexión tardó demasiado/);assert.equal(received.aborted,true);assert.equal(cleared,true)
 const external=new AbortController();const controls=c.api('/combate/uno/control',{signal:external.signal})
 assert.equal(received,external.signal);external.abort();await assert.rejects(controls,/Abortado/)
})
