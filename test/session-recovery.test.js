const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs')
const source=fs.readFileSync(require.resolve('../public/js/mokepon'),'utf8')
function context(fetch){
 const state={removed:0,reloads:0,alerts:0},c=vm.createContext({AbortController,AbortSignal,setTimeout,clearTimeout,authToken:'account-valid',jugadorToken:'player-old',jugadorId:'old-id',salaActual:null,modoJuego:'pvp',sesionInvalida:false,fetch,localStorage:{removeItem(){state.removed++}},location:{reload(){state.reloads++}},avisarJugador:async()=>{state.alerts++},$:()=>({}),detenerIntervalosJuego(){},mostrarSolo(){}})
 vm.runInContext(source.slice(source.indexOf('let recuperacionJugador='),source.indexOf('\nasync function iniciarJuego')),c)
 return {c,state}
}
const response=(status,data={})=>({status,ok:status>=200&&status<300,json:async()=>data})
test('dos peticiones tras perder la sesión de jugador recuperan una sola vez sin cerrar la cuenta',async()=>{
 let renewals=0,retries=0
 const {c,state}=context(async(url,options)=>{
  if(url==='/unirse'){renewals++;await new Promise(r=>setTimeout(r,5));assert.equal(options.headers.Authorization,'Bearer account-valid');return response(201,{id:'new-id',token:'player-new'})}
  if(options.headers.Authorization==='Bearer player-old')return response(401)
  assert.equal(options.headers.Authorization,'Bearer player-new');retries++;return response(200,{salas:[]})
 })
 await Promise.all([c.api('/salas',{headers:{Authorization:'Bearer player-old'}}),c.api('/salas',{headers:{Authorization:'Bearer player-old'}})])
 assert.equal(renewals,1);assert.equal(retries,2);assert.equal(c.jugadorToken,'player-new');assert.equal(c.authToken,'account-valid');assert.equal(state.removed,0);assert.equal(state.reloads,0);assert.equal(state.alerts,0)
})
test('reintenta una acción rechazada con el identificador de jugador recuperado',async()=>{
 const seen=[];const {c}=context(async(url,options)=>{seen.push(url);if(url==='/unirse')return response(201,{id:'new-id',token:'player-new'});return response(options.headers.Authorization==='Bearer player-old'?401:204)})
 await c.api('/mokepon/old-id',{method:'POST',headers:{Authorization:'Bearer player-old','Content-Type':'application/json'},body:'{"mokepon":"Cadejo"}'})
 assert.deepEqual(seen,['/mokepon/old-id','/unirse','/mokepon/new-id'])
})
test('una caída de red al reconectar conserva las credenciales para otro intento',async()=>{
 const {c,state}=context(async url=>url==='/unirse'?response(503):response(401))
 await assert.rejects(c.api('/salas',{headers:{Authorization:'Bearer player-old'}}),/reconectar/)
 assert.equal(c.authToken,'account-valid');assert.equal(state.removed,0);assert.equal(state.reloads,0)
})
test('una cuenta realmente revocada sí termina la sesión; una contraseña incorrecta no borra otra sesión',async()=>{
 const {c,state}=context(async()=>response(401,{error:'No autorizado'}))
 await assert.rejects(c.api('/salas',{headers:{Authorization:'Bearer player-old'}}))
 assert.equal(c.authToken,null);assert.equal(state.removed,1);assert.equal(state.reloads,1)
 const other=context(async()=>response(401,{error:'Contraseña incorrecta'}))
 await assert.rejects(other.c.api('/auth/login',{method:'POST'}),/Contraseña incorrecta/)
 assert.equal(other.state.removed,0);assert.equal(other.c.authToken,'account-valid')
})
test('cerrar sesión durante una reconexión no puede restaurar el acceso',async()=>{
 let finish;const {c,state}=context(async url=>url==='/unirse'?new Promise(resolve=>{finish=resolve}):response(401))
 const request=c.api('/salas',{headers:{Authorization:'Bearer player-old'}})
 await new Promise(resolve=>setTimeout(resolve,0));c.authToken=null;c.jugadorToken=null
 finish(response(201,{id:'new-id',token:'player-new'}));await assert.rejects(request,/cuenta cambió/)
 assert.equal(c.authToken,null);assert.equal(c.jugadorToken,null);assert.equal(state.reloads,0)
})
