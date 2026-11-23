const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs')
const source=fs.readFileSync(require.resolve('../public/js/racing'),'utf8'),Engine=require('../public/js/racing-engine')
function load(context,start,end){vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),context)}
test('pausar y reanudar conserva el botón Continuar tras cada respuesta del servidor',()=>{
 const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,{hidden:false,textContent:'',value:0});return elements.get(id)}
 const snapshot={mode:'maquina',track:'selva',phase:'playing',side:0,players:[{name:'Piloto'},{name:'Máquina'}],state:Engine.create(['Cadejo','Kabrak'])}
 const c=vm.createContext({$,raceSnapshot:snapshot,racePaused:false,racePadLabel:'',raceClearInputs(){},MayabRacing:Engine})
 load(c,'function actualizarCarrera(){','async function salirCarrera(){')
 c.raceTogglePause();c.actualizarCarrera();assert.equal($('race-ready').hidden,false);assert.equal($('race-ready').textContent,'Continuar');assert.equal($('race-overlay').hidden,false)
 c.raceTogglePause();c.actualizarCarrera();assert.equal($('race-overlay').hidden,true)
 c.raceSnapshot.mode='online';c.raceTogglePause();assert.equal(c.racePaused,false)
})
test('las entradas se anulan en menús, pausa, pestaña oculta y diálogos',()=>{
 const c=vm.createContext({racePaused:false,document:{hidden:false},raceSnapshot:{phase:'playing'},$:()=>({hidden:true}),window:{MayabUIController:{isDialogOpen:()=>false}},racePadInput:0,raceKeys:new Set(['KeyW','Space']),raceKeyMap:{KeyW:4,Space:16},racePointers:new Map([[1,2]])})
 load(c,'function raceInput(){','async function enviarCarrera(')
 assert.equal(c.raceInput(),22);c.racePaused=true;assert.equal(c.raceInput(),0);c.racePaused=false;c.document.hidden=true;assert.equal(c.raceInput(),0);c.document.hidden=false;c.raceSnapshot.phase='finished';assert.equal(c.raceInput(),0)
})

test('la conducción siempre requiere acelerador; se puede mantener durante la cuenta atrás',()=>{
 const c=vm.createContext({racePaused:false,document:{hidden:false},raceSnapshot:{phase:'playing'},$:()=>({hidden:true}),window:{MayabUIController:{isDialogOpen:()=>false}},racePadInput:0,raceKeys:new Set(),raceKeyMap:{KeyW:4},racePointers:new Map()})
 load(c,'function raceInput(){','async function enviarCarrera(')
 assert.equal(c.raceInput(),0);c.raceSnapshot.phase='countdown';c.raceKeys.add('KeyW');assert.equal(c.raceInput(),4);c.raceKeys.clear();assert.equal(c.raceInput(),0)
})
