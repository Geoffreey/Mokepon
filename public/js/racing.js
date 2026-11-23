/* Racing menus, shared-controller integration and canvas presentation. */
'use strict'
let raceSnapshot=null,racePrediction=null,raceTimer=0,raceFrame=0,raceGeneration=0,raceSeq=0,raceJoinId=null,raceReady=false,racePaused=false,raceStartRequested=false,raceRequest=null,raceLastFrame=0,raceAccumulator=0,raceResponseAt=0,raceMenuGeneration=0
const raceKeys=new Set(),racePointers=new Map(),raceImages=new Map(),raceReader=MayabGamepad.createReader()
let racePadInput=0,racePadLabel=''
const raceCanvas=$('race-canvas'),raceCtx=raceCanvas.getContext('2d')
const raceKeyMap={ArrowLeft:1,KeyA:1,ArrowRight:2,KeyD:2,ArrowUp:4,KeyW:4,ArrowDown:8,KeyS:8,Space:16,KeyK:16,KeyZ:16,ShiftLeft:32,ShiftRight:32,KeyL:32}
const raceColors=['#f2cc78','#8cd7d9','#bd8edd','#ed946f','#96d879','#e9a1b7']
function raceHeaders(){return {Authorization:`Bearer ${authToken}`,'Content-Type':'application/json'}}
function raceApi(path,body,signal){return api(path,{method:body===undefined?'GET':'POST',headers:raceHeaders(),...(body===undefined?{}:{body:JSON.stringify(body)}),...(signal?{signal}:{})})}
async function abrirCarreras(){
 detenerCarreras();modoJuego='carreras';raceJoinId=null;mostrarSolo('carrerasMenu');$('race-menu-status').textContent='';await actualizarSalasCarrera()
}
async function actualizarSalasCarrera(){
 const generation=++raceMenuGeneration,online=$('race-mode').value==='online',arcade=$('race-mode').value==='arcade'
 $('race-track').disabled=arcade;$('race-count').disabled=online;$('race-refresh').hidden=!online;$('race-create').textContent=online?'Crear sala →':'Elegir guardián →';$('race-rooms').replaceChildren()
 $('race-mode-note').textContent=online?'Crea una sala o elige una. De 2 a 6 jugadores; todos confirman y el anfitrión inicia. En línea no hay pausa.':arcade?'Copa de Selva, Lago y Volcán. Los seis puestos dan 10, 7, 5, 3, 2 y 1 puntos. Gana la suma de las tres carreras.':'Pistas largas con curvas, desniveles, trampas, cajas sorpresa y jade. Derrapa y suelta para ganar mini turbo.'
 try{
  const data=await raceApi('/carreras/salas');if(generation!==raceMenuGeneration||sections.carrerasMenu.hidden)return
  if(data.activeId){const b=document.createElement('button');b.className='secondary-button';b.textContent='Retomar tu carrera';b.onclick=async()=>{try{montarCarrera(await raceApi(`/carreras/${data.activeId}`))}catch(e){$('race-menu-status').textContent=e.message;void actualizarSalasCarrera()}};$('race-rooms').append(b)}
  if(!online)return
  for(const room of data.rooms){const b=document.createElement('button');b.className='mode-card';b.textContent=`${room.host} · ${room.count}/6 · ${MayabRacing.track(room.track).name}`;b.disabled=room.count>=6;b.onclick=()=>{raceJoinId=room.id;prepararGuardian()};$('race-rooms').append(b)}
  $('race-menu-status').textContent=data.rooms.length?'Elige una sala o crea la tuya.':'No hay salas esperando. Crea una e invita a tus amigos a entrar en Carreras → En línea.'
 }catch(e){if(generation===raceMenuGeneration)$('race-menu-status').textContent=e.message}
}
async function iniciarCarreras(){
 const player={guardian:mascotaJugador,skin:skinJugador},snapshot=await raceApi(raceJoinId?`/carreras/${raceJoinId}/unirse`:'/carreras/crear',raceJoinId?player:{...player,mode:$('race-mode').value,count:Number($('race-count').value),track:$('race-track').value})
 montarCarrera(snapshot)
}
function raceClearInputs(){raceKeys.clear();racePointers.clear();racePadInput=0;raceReader.block()}
function detenerCarreras(){raceGeneration++;clearTimeout(raceTimer);cancelAnimationFrame(raceFrame);raceRequest?.abort();raceRequest=null;raceClearInputs();raceLastFrame=0;raceAccumulator=0;if(typeof raceRenderer!=='undefined')raceRenderer.reset()}
function montarCarrera(snapshot){
 detenerCarreras();raceSnapshot=snapshot;racePrediction=snapshot.state?structuredClone(snapshot.state):null;raceSeq=snapshot.ack+1;raceReady=snapshot.players[snapshot.side].ready;racePaused=false;raceStartRequested=false;raceResponseAt=performance.now();$('race-ready').textContent='Estoy listo'
 mostrarSolo('carrerasJuego');$('race-overlay').hidden=false;actualizarCarrera();const generation=raceGeneration;void enviarCarrera(generation);raceFrame=requestAnimationFrame(t=>animarCarrera(t,generation))
}
function raceInput(){if(racePaused||document.hidden||!['playing','countdown'].includes(raceSnapshot?.phase)||!$('race-overlay').hidden||window.MayabUIController?.isDialogOpen())return 0;let input=racePadInput;for(const code of raceKeys)input|=raceKeyMap[code]||0;for(const mask of racePointers.values())input|=mask;return input}
async function enviarCarrera(generation){
 if(generation!==raceGeneration||!raceSnapshot)return
 const controller=new AbortController();raceRequest=controller;const timeout=setTimeout(()=>controller.abort(),4000),started=performance.now()
 try{
  const snap=await raceApi(`/carreras/${raceSnapshot.id}/control`,{seq:raceSeq++,input:raceInput(),ready:raceReady,start:raceStartRequested,pause:racePaused||document.hidden},controller.signal)
  if(generation!==raceGeneration)return
  const previousPhase=raceSnapshot.phase;raceSnapshot=snap;racePrediction=MayabRacingSync.reconcile(racePrediction,snap,raceInput(),performance.now()-started,previousPhase);
  raceResponseAt=performance.now();raceStartRequested=false;actualizarCarrera()
 }catch(e){if(generation!==raceGeneration)return;raceStartRequested=false;$('race-status').textContent=`Conexión interrumpida: ${e.message}. Reintentando…`;raceClearInputs();if(/acceso a esta carrera/.test(e.message)){raceUnavailable();return}}
 finally{clearTimeout(timeout);if(raceRequest===controller)raceRequest=null;if(generation===raceGeneration)raceTimer=setTimeout(()=>enviarCarrera(generation),Math.max(25,(['playing','countdown'].includes(raceSnapshot.phase)?50:350)-(performance.now()-started)))}
}
function raceUnavailable(){detenerCarreras();$('race-overlay').hidden=false;$('race-overlay-title').textContent='La carrera ya no está disponible';$('race-overlay-copy').textContent='La sala expiró o el servidor se reinició. Puedes iniciar otra carrera.';for(const id of ['race-ready','race-start','race-next'])$(id).hidden=true;$('race-again').hidden=false}
function actualizarCarrera(){
 const s=raceSnapshot,t=MayabRacing.track(s.track),r=s.state?.racers[s.side]
 $('race-title').textContent=t.name;$('race-region').textContent=s.mode==='arcade'?`Copa del Mayab · Circuito ${s.cupRound+1} / 3`:t.region
 $('race-pause').hidden=s.mode==='online';$('race-pause').textContent=racePaused?'Continuar':'Pausar'
 for(const id of ['race-ready','race-start','race-next','race-again'])$(id).hidden=true
 if(s.phase==='waiting'){
  $('race-overlay').hidden=false;$('race-overlay-title').textContent=s.mode==='online'?'Parrilla de salida':'Tu kart está listo'
  const copy=$('race-overlay-copy');copy.replaceChildren();const guide=document.createElement('p');guide.textContent='← → / A D: gira · ↑ / W: acelera · ↓ / S: frena · Espacio / K: turbo · Shift / L: derrapa. Mando: palanca para girar, ✕ acelera, □ frena, ○ / R2 turbo, R1 / L1 derrapa. Mantén el acelerador para avanzar; frena para reducir velocidad. Cajas ?: escudo, turbo o trampa. Recoge jade y suelta el derrape para activar mini turbo. P / Options pausa contra la máquina.';copy.append(guide)
  for(const p of s.players){const line=document.createElement('p');line.textContent=`${p.ready?'✓':'○'} ${p.name} · ${p.guardian}`;copy.append(line)}
  $('race-ready').hidden=raceReady;$('race-start').hidden=s.mode!=='online'||s.side!==0;$('race-start').disabled=s.players.length<2||!s.players.every(p=>p.ready)
  $('race-status').textContent=raceReady?'Listo. Esperando a los demás corredores…':'Revisa los controles y confirma para empezar.'
 }else if(s.phase==='finished'){
  $('race-overlay').hidden=false;$('race-overlay-title').textContent=s.mode==='arcade'&&s.cupRound===2?'¡Copa completada!':'¡Bandera a cuadros!';const copy=$('race-overlay-copy');copy.replaceChildren()
  const order=MayabRacing.ranking(s.state)
  for(const [place,i] of order.entries()){const p=document.createElement('p'),r=s.state.racers[i];p.textContent=`${place+1}. ${s.players[i].name} · ${s.players[i].guardian} · ${r.dnf?'Abandono':r.finish===null?'Sin terminar':(r.finish/60).toFixed(2)+' s'} · ◆ ${r.coins} jade${s.mode==='arcade'?' · '+s.cupPoints[i]+' puntos en copa':''}`;if(i===s.side)p.className='racing-you';copy.append(p)}
  if(s.mode==='arcade'&&s.cupRound===2){const best=Math.max(...s.cupPoints),p=document.createElement('p');p.className='racing-you';p.textContent='Campeón de la copa: '+s.players.filter((_,i)=>s.cupPoints[i]===best).map(p=>p.name).join(' y ');copy.append(p)}
  $('race-next').hidden=s.mode!=='arcade'||s.cupRound>=2;$('race-again').hidden=false;$('race-status').textContent='Carrera terminada · Los resultados de esta sesión no otorgan recursos.'
 }else{
  if(!racePaused)$('race-overlay').hidden=true;else{$('race-ready').hidden=false;$('race-ready').textContent='Continuar'}
  $('race-status').textContent=s.phase==='countdown'?`La carrera empieza en ${Math.ceil(s.countdown/60)}…`:r?.finish!==null?'Llegaste a la meta. Esperando la clasificación…':`${s.mode==='online'?'En línea · Sin pausa':'Tres vueltas para conquistar la pista'}${r?.eventUntil>s.state.tick?' · '+r.event:''}${racePadLabel?' · '+racePadLabel:''}`
 }
 if(r){$('race-loot').textContent=`◆ ${r.coins} jade · ${r.shield?'Escudo activo':r.boostTicks>0?'¡Turbo extra!':'Cajas ? dan poderes'}`;$('race-position').textContent=`${MayabRacing.ranking(s.state).indexOf(s.side)+1} / ${s.players.length}`;$('race-lap').textContent=`Vuelta ${Math.max(1,Math.min(3,Math.floor(r.progress)+1))} / 3`;$('race-speed').textContent=`${Math.round(r.speed*600000)} km/h`;$('race-energy').value=r.energy}
}
function raceTogglePause(){if(!raceSnapshot||raceSnapshot.mode==='online'||!['playing','countdown'].includes(raceSnapshot.phase))return;racePaused=!racePaused;raceClearInputs();$('race-overlay').hidden=!racePaused;$('race-overlay-title').textContent='Un alto en el camino';$('race-overlay-copy').textContent='A/D o flechas para girar, W acelera, S frena, Espacio activa turbo y Shift derrapa. ✕ acelera, □ frena, ○ turbo y R1 derrapa en mando.';$('race-ready').hidden=!racePaused;$('race-ready').textContent='Continuar';$('race-pause').textContent=racePaused?'Continuar':'Pausar'}
async function salirCarrera(){
 if(!raceSnapshot){await abrirCarreras();return}
 const id=raceSnapshot.id
 try{await raceApi(`/carreras/${id}/salir`,{});raceSnapshot=null;await abrirCarreras()}catch(e){if(/acceso a esta carrera/.test(e.message)){raceSnapshot=null;await abrirCarreras()}else $('race-status').textContent=e.message}
}
function animarCarrera(time,generation){
 if(generation!==raceGeneration||sections.carrerasJuego.hidden)return
 let pads=[];try{pads=navigator.getGamepads?.()||[]}catch{}
 const pad=raceReader.read(pads);racePadInput=pad.input;racePadLabel=pad.connected&&pad.supported?'Mando conectado':''
 if(pad.disconnected){raceClearInputs();if(!racePaused)raceTogglePause()}
 if(pad.pausePressed)raceTogglePause()
 if(!$('race-overlay').hidden)window.MayabUIController?.navigate(pad);else window.MayabUIController?.clear()
 if(racePrediction&&raceSnapshot.phase==='playing'&&!racePaused&&!document.hidden&&performance.now()-raceResponseAt<600){raceAccumulator+=Math.min(50,time-(raceLastFrame||time));while(raceAccumulator>=1000/60){MayabRacingSync.step(racePrediction,racePrediction.racers.map((_,i)=>i===raceSnapshot.side?raceInput():raceSnapshot.mode==='online'?(raceSnapshot.inputs?.[i]||0):MayabRacing.botInput(racePrediction,i)));raceAccumulator-=1000/60}}
 raceLastFrame=time;if(racePrediction&&raceSnapshot.phase==='playing'&&time-(raceCanvas._hudAt||0)>100){raceCanvas._hudAt=time;$('race-speed').textContent=`${Math.round(racePrediction.racers[raceSnapshot.side].speed*600000)} km/h`;}dibujarCarrera(time);raceFrame=requestAnimationFrame(t=>animarCarrera(t,generation))
}
function raceImage(guardian,skin){const src=fotoGuardian(guardian,skin);if(!raceImages.has(src)){const img=new Image();img.src=src;raceImages.set(src,img)}return raceImages.get(src)}
const raceRenderer=MayabRacingRenderer.create(raceCanvas,raceImage)
function dibujarCarrera(time){raceRenderer.draw(raceSnapshot,racePrediction,time,raceInput())}
$('race-mode').onchange=()=>{raceJoinId=null;void actualizarSalasCarrera()};$('race-refresh').onclick=actualizarSalasCarrera;$('race-menu-back').onclick=mostrarModos;$('race-create').onclick=()=>{raceJoinId=null;prepararGuardian()}
$('race-ready').onclick=()=>{if(racePaused){raceTogglePause();return}raceReady=true;$('race-ready').textContent='Estoy listo';raceClearInputs()}
$('race-start').onclick=()=>{raceStartRequested=true};$('race-exit').onclick=salirCarrera;$('race-again').onclick=salirCarrera;$('race-pause').onclick=raceTogglePause
$('race-help').onclick=()=>{if(raceSnapshot?.mode==='online')void avisarJugador('A/D o ← →: gira · W / ↑: acelera · S / ↓: frena · Espacio: turbo · Shift: derrapa. Mando: ✕ acelera, □ frena, ○ / R2 turbo, R1 / L1 derrapa. En línea la carrera continúa.');else if(!racePaused)raceTogglePause()}
$('race-next').onclick=async()=>{const b=$('race-next');b.disabled=true;try{const snapshot=await raceApi(`/carreras/${raceSnapshot.id}/siguiente`,{});montarCarrera(snapshot)}catch(e){$('race-status').textContent=e.message}finally{b.disabled=false}}
window.addEventListener('keydown',e=>{if(sections.carrerasJuego.hidden||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||window.MayabUIController?.isDialogOpen())return;if(raceKeyMap[e.code]){e.preventDefault();raceKeys.add(e.code)}if((e.code==='KeyP'||e.code==='Escape')&&!e.repeat){e.preventDefault();raceTogglePause()}})
window.addEventListener('keyup',e=>raceKeys.delete(e.code))
function raceFocusLost(){raceClearInputs();if(raceSnapshot&&!sections.carrerasJuego.hidden&&!racePaused)raceTogglePause()}
window.addEventListener('blur',raceFocusLost);document.addEventListener('visibilitychange',()=>{if(document.hidden)raceFocusLost()});window.addEventListener('orientationchange',raceFocusLost)
for(const button of document.querySelectorAll('[data-race-input]')){button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);racePointers.set(e.pointerId,Number(button.dataset.raceInput))});for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,e=>{racePointers.delete(e.pointerId)});button.addEventListener('contextmenu',e=>e.preventDefault())}

// iOS reports the settled visual viewport after its native orientation event.
let raceViewportWide=window.innerWidth>window.innerHeight
window.addEventListener('mayab:viewportchange',event=>{
 const wide=event.detail.width>event.detail.height
 if(wide!==raceViewportWide){raceViewportWide=wide;raceFocusLost();raceLastFrame=0;raceAccumulator=0;raceRenderer.reset()}
})
