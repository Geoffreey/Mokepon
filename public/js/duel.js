/* Network combat UI: inputs go to the server; local prediction never awards a result. */
'use strict'
let duelSnapshot=null,duelPrediction=null,duelFrameId=0,duelTimer=0,duelGeneration=0,duelRequest=null,duelSeq=0,duelPaused=true,duelReady=false,duelLastFrame=0,duelAccumulator=0,duelLastResponse=0,duelFailures=0,duelReturning=false
let duelCamera=null,duelGamepadInput=0,duelPadLabel='',duelResultKey=''
const duelKeys=new Set(),duelPointers=new Map(),duelReader=MayabGamepad.createReader(),duelCanvas=$('duel-canvas'),duelContext=duelCanvas.getContext('2d')
const duelKeyMap={ArrowLeft:1,KeyA:1,ArrowRight:2,KeyD:2,Space:4,ArrowUp:4,KeyW:4,KeyJ:8,KeyX:8,KeyK:16,KeyZ:16,KeyL:32,ShiftLeft:32,ShiftRight:32}
const duelClone=value=>JSON.parse(JSON.stringify(value))
async function iniciarDueloLocal(){
  const snapshot=await api('/combate/iniciar',{method:'POST',headers:cabeceras(true),body:JSON.stringify({mode:modoJuego==='mision'?'mision':'maquina',guardian:mascotaJugador,skin:skinJugador,missionId:misionActual?.id})})
  iniciarDueloVista(snapshot)
}
function limpiarControlesDuelo(){duelKeys.clear();duelPointers.clear();duelGamepadInput=0;duelReader.block();document.querySelectorAll('.duel-controls .pressed').forEach(b=>b.classList.remove('pressed'))}
function detenerDuelo(){
  duelGeneration++;cancelAnimationFrame(duelFrameId);clearTimeout(duelTimer);duelRequest?.abort();duelRequest=null
  limpiarControlesDuelo();duelSnapshot=null;duelPrediction=null;duelCamera=null
}
function iniciarDueloVista(snapshot){
  detenerDuelo();duelSnapshot=snapshot;duelPrediction=duelClone(snapshot.state);duelSeq=snapshot.ack+1;duelReady=snapshot.phase!=='waiting';duelPaused=!duelReady;duelLastFrame=0;duelAccumulator=0;duelLastResponse=performance.now();duelFailures=0;duelReturning=false;duelResultKey=''
  const own=snapshot.state.fighters[snapshot.side];mascotaJugador=own.guardian;skinJugador=snapshot.skins[snapshot.side]
  const names={selva:'Templos de la Selva',volcan:'Corazón del Volcán',lago:'Espejo de Atitlán',cueva:'Cueva de Jade'}
  $('duel-mode').textContent=snapshot.mode==='pvp'?'Duelo en línea · Tiempo real':snapshot.mode==='mision'?'Misión · Tiempo real':'Entrenamiento · Tiempo real'
  $('duel-title').textContent=snapshot.mission?.name||names[snapshot.arena]||'Arena de guardianes'
  for(let i=0;i<2;i++){$(`duel-name-${i}`).textContent=`${snapshot.names[i]} · ${snapshot.state.fighters[i].guardian}`;arcadeImage(fotoGuardian(snapshot.state.fighters[i].guardian,snapshot.skins[i]))}
  $('duel-pause').textContent=snapshot.mode==='pvp'?'Controles':'Pausar';$('duel-exit').disabled=false;$('duel-return').disabled=false
  $('room-dock').hidden=true;mostrarSolo('duelo');$('duel-overlay').hidden=true
  if(!duelReady)mostrarGuiaDuelo();else{$('duel-guide').hidden=true;sections.duelo.classList.remove('arcade-learning')}
  const generation=duelGeneration;duelFrameId=requestAnimationFrame(t=>animarDuelo(t,generation));void enviarControlesDuelo(generation)
}
function mostrarGuiaDuelo(){
  if(!duelSnapshot||['finished','cancelled'].includes(duelSnapshot.phase))return
  limpiarControlesDuelo();duelPaused=true
  $('duel-guide-copy').textContent=`${mascotaJugador} usa ${MayabArcade.POWERS[mascotaJugador].name}. Gana al agotar la salud del rival. El escudo protege únicamente de frente y consume energía.`
  $('duel-online-note').textContent=duelSnapshot.mode==='pvp'?'En línea el combate sigue mientras consultas los controles. Si abandonas una pelea iniciada, cuenta como derrota. Ambos jugadores deben estar listos para empezar.':'Puedes pausar el entrenamiento o la misión. Completa el combate para que el servidor registre el resultado y las recompensas.'
  $('duel-start').textContent=duelReady?'Volver al combate':'¡Listo para combatir!'
  $('duel-guide').hidden=false;sections.duelo.classList.add('arcade-learning');$('duel-overlay').hidden=true
}
function continuarDuelo(){if(!duelSnapshot||['finished','cancelled'].includes(duelSnapshot.phase))return;limpiarControlesDuelo();duelReady=true;duelPaused=false;duelLastFrame=0;$('duel-guide').hidden=true;sections.duelo.classList.remove('arcade-learning');$('duel-overlay').hidden=true;duelCanvas.focus({preventScroll:true})}
function inputDuelo(){
  if(duelPaused||document.hidden||!duelSnapshot||duelSnapshot.phase!=='playing'||window.MayabUIController?.isDialogOpen())return 0
  let mask=duelGamepadInput;for(const code of duelKeys)mask|=duelKeyMap[code]||0;for(const input of duelPointers.values())mask|=input
  return mask
}
async function enviarControlesDuelo(generation){
  if(generation!==duelGeneration||!duelSnapshot)return
  const started=performance.now(),id=duelSnapshot.id,controller=new AbortController();duelRequest=controller
  const timeout=setTimeout(()=>controller.abort(),4000)
  try{
    const snapshot=await api(`/combate/${encodeURIComponent(id)}/control`,{method:'POST',headers:cabeceras(true),signal:controller.signal,body:JSON.stringify({seq:duelSeq++,input:inputDuelo(),ready:duelReady,pause:duelSnapshot.mode!=='pvp'&&(duelPaused||document.hidden)})})
    if(generation!==duelGeneration)return
    duelSnapshot=snapshot;duelPrediction=duelClone(snapshot.state);duelLastResponse=performance.now();duelFailures=0
    if(['finished','cancelled'].includes(snapshot.phase))mostrarResultadoDuelo()
  }catch(error){
    if(generation!==duelGeneration)return
    duelFailures++;limpiarControlesDuelo();$('duel-status').textContent='Conexión interrumpida. Intentando reconectar…'
    if(error.message.includes('acceso a este combate')){
      mostrarOverlayDuelo('El combate ya no está disponible','Vuelve a la arena para iniciar otro duelo.');$('duel-return').hidden=false;duelSnapshot.phase='unavailable';return
    }
  }finally{
    clearTimeout(timeout);if(duelRequest===controller)duelRequest=null
    if(generation===duelGeneration&&duelSnapshot&&duelSnapshot.phase!=='unavailable'){const done=['finished','cancelled'].includes(duelSnapshot.phase)&&duelSnapshot.result;duelTimer=setTimeout(()=>enviarControlesDuelo(generation),done?1200:duelFailures?Math.min(2000,250*duelFailures):Math.max(0,50-(performance.now()-started)))}
  }
}
function mostrarOverlayDuelo(title,copy){$('duel-guide').hidden=true;sections.duelo.classList.remove('arcade-learning');$('duel-overlay').hidden=false;$('duel-overlay-title').textContent=title;$('duel-overlay-copy').textContent=copy;$('duel-resume').hidden=true;$('duel-return').hidden=true}
function mostrarResultadoDuelo(){
  const snapshot=duelSnapshot,result=snapshot.result,key=JSON.stringify(result)||snapshot.phase
  if(key===duelResultKey)return;duelResultKey=key;limpiarControlesDuelo()
  if(!result){mostrarOverlayDuelo('Combate terminado','Guardando el resultado y las recompensas…');return}
  const title=result.outcome==='cancelled'?'No se inició el combate':result.outcome==='victoria'?'¡La victoria es tuya!':result.outcome==='empate'?'¡Combate empatado!':'Tu rival ganó esta vez'
  let copy=result.outcome==='cancelled'?'El rival no estuvo listo a tiempo. No se modificaron tus recursos.':result.reason==='abandoned'?'El combate terminó por abandono.':result.reason==='disconnected'?'El combate terminó por desconexión.':result.reason==='time'?'Se agotó el tiempo. El resultado se decidió por la salud restante.':'El combate se decidió en la arena.'
  if(result.economy?.reward){const r=result.economy.reward;copy+=result.economy.capped?' Alcanzaste el límite diario de entrenamientos premiados.':` Premio: ${r.gold} oro, ${r.jade} jade y ${r.obsidian} obsidiana.`}
  if(result.economy?.delta){const d=result.economy.delta;copy+=` Cambio de recursos: ${d.gold>=0?'+':''}${d.gold} oro, ${d.jade>=0?'+':''}${d.jade} jade y ${d.obsidian>=0?'+':''}${d.obsidian} obsidiana.`}
  if(result.missionResult?.firstCompletion)copy+=' Misión superada: tus recompensas y desbloqueos están guardados.'
  mostrarOverlayDuelo(title,copy);$('duel-return').hidden=false;$('duel-return').textContent=snapshot.mode==='pvp'?'Volver a la arena':snapshot.mode==='mision'?'Volver a misiones':'Volver a modos'
  void cargarProgreso().catch(()=>{});void actualizarPerfil()
}
async function salirDuelo(){
  if(!duelSnapshot)return
  if(['finished','cancelled'].includes(duelSnapshot.phase)){if(duelSnapshot.result)await volverDelDuelo();return}
  const wasPaused=duelPaused;limpiarControlesDuelo();if(duelSnapshot.mode!=='pvp')duelPaused=true
  const accepted=await confirmarJugador('¿Abandonar el combate? Si ya comenzó, contará como derrota.')
  if(!duelSnapshot)return
  if(!accepted){duelPaused=wasPaused;return}
  try{const snapshot=await api(`/combate/${encodeURIComponent(duelSnapshot.id)}/abandonar`,{method:'POST',headers:cabeceras()});duelSnapshot=snapshot;duelPrediction=duelClone(snapshot.state);mostrarResultadoDuelo()}catch(error){$('duel-status').textContent=error.message}
}
async function volverDelDuelo(){
  if(duelReturning||!duelSnapshot)return;duelReturning=true;$('duel-return').disabled=true
  const mode=duelSnapshot.mode
  try{
    if(mode==='pvp')await api(`/mokepon/${encodeURIComponent(jugadorId)}/finalizar`,{method:'POST',headers:cabeceras()})
    limpiarBatalla()
    if(mode==='pvp'&&salaActual){$('room-dock').hidden=false;mostrarSolo('mapa');iniciarMapa();void actualizarEstadoSala().catch(error=>console.warn(error.message))}
    else if(mode==='mision'){renderMisiones();mostrarSolo('misiones')}
    else mostrarModos()
    void cargarProgreso().then(()=>{if(mode==='mision'&&!sections.misiones.hidden)renderMisiones()}).catch(()=>{})
  }catch(error){$('duel-status').textContent=error.message;duelReturning=false;$('duel-return').disabled=false}
}
function leerMandoDuelo(){
  let pads=[];try{pads=navigator.getGamepads?.()||[]}catch{}
  const pad=duelReader.read(pads)
  if(pad.disconnected){limpiarControlesDuelo();if(duelSnapshot?.mode!=='pvp')mostrarGuiaDuelo()}
  duelGamepadInput=pad.input
  duelPadLabel=pad.connected&&pad.supported?(/dualsense|054c.*0ce6/i.test(pad.id)?'DualSense conectado':'Mando conectado'):''
  if(pad.pausePressed&&duelSnapshot&&!['finished','cancelled'].includes(duelSnapshot.phase)){if(duelPaused)continuarDuelo();else mostrarGuiaDuelo()}
  if(duelPaused||['finished','cancelled','unavailable'].includes(duelSnapshot?.phase)||window.MayabUIController?.isDialogOpen())window.MayabUIController?.navigate(pad)
  else window.MayabUIController?.clear()
}
function animarDuelo(time,generation){
  if(generation!==duelGeneration||!duelSnapshot||sections.duelo.hidden)return
  leerMandoDuelo();if(generation!==duelGeneration||!duelSnapshot)return
  if(!duelLastFrame)duelLastFrame=time
  if(duelSnapshot.phase==='playing'&&!duelSnapshot.paused&&performance.now()-duelLastResponse<700){
    duelAccumulator+=Math.min(time-duelLastFrame,70)
    while(duelAccumulator>=1000/60){const inputs=[...duelSnapshot.inputs];inputs[duelSnapshot.side]=inputDuelo();MayabDuel.step(duelPrediction,inputs);duelAccumulator-=1000/60}
  }else duelAccumulator=0
  duelLastFrame=time;dibujarDuelo();duelFrameId=requestAnimationFrame(t=>animarDuelo(t,generation))
}
function dibujarDuelo(){
  const s=duelPrediction;if(!s)return
  const c=duelContext,viewport=duelCanvas.parentElement,w=viewport.clientWidth,h=viewport.clientHeight;if(!w||!h)return
  const ratio=Math.min(devicePixelRatio||1,2),pw=Math.round(w*ratio),ph=Math.round(h*ratio)
  if(duelCanvas.width!==pw||duelCanvas.height!==ph){duelCanvas.width=pw;duelCanvas.height=ph;duelCamera=null}
  c.setTransform(ratio,0,0,ratio,0,0)
  const a=s.fighters[0],b=s.fighters[1],left=Math.min(a.x,b.x),right=Math.max(a.x+a.w,b.x+b.w),top=Math.min(a.y,b.y)
  const scale=Math.min(w/Math.max(530,right-left+200),h/Math.max(330,450-top+160),1.5)
  const target={scale,x:(left+right)/2,y:(top+450)/2+10}
  if(!duelCamera)duelCamera={...target};else for(const key of ['scale','x','y'])duelCamera[key]+=(target[key]-duelCamera[key])*.1
  const theme=duelSnapshot.arena==='volcan'?arcadeThemes.volcan:duelSnapshot.arena==='lago'?arcadeThemes.ruinas:arcadeThemes.selva
  const gradient=c.createLinearGradient(0,0,0,h);gradient.addColorStop(0,theme.sky[0]);gradient.addColorStop(1,theme.sky[1]);c.fillStyle=gradient;c.fillRect(0,0,w,h)
  c.save();c.translate(w/2,h/2);c.scale(duelCamera.scale,duelCamera.scale);c.translate(-duelCamera.x,-duelCamera.y)
  const image=arcadeImage(`./assets/${duelSnapshot.arena==='selva'?'mokemap':'arena-'+duelSnapshot.arena}.png`)
  if(image.complete&&image.naturalWidth){c.globalAlpha=.28;c.drawImage(image,0,-90,960,650);c.globalAlpha=1}
  c.fillStyle=theme.far;for(let i=0;i<8;i++){const x=i*165-150;c.beginPath();c.moveTo(x,450);c.lineTo(x+100,100+(i%3)*35);c.lineTo(x+220,450);c.fill()}
  c.fillStyle=theme.soil;c.fillRect(-2000,450,5000,2000);c.fillStyle=theme.edge;c.fillRect(-2000,450,5000,7)
  for(const platform of s.platforms.filter(p=>p.h<90)){c.fillStyle=theme.soil;c.fillRect(platform.x,platform.y,platform.w,platform.h);c.fillStyle=theme.edge;c.fillRect(platform.x,platform.y,platform.w,5)}
  for(const shot of s.shots)dibujarPoderArcade(shot,MayabArcade.POWERS[s.fighters[shot.owner].guardian],s.tick/60,c)
  for(let i=0;i<2;i++){
    const p=s.fighters[i];dibujarPersonaje(fotoGuardian(p.guardian,duelSnapshot.skins[i]),p.x,p.y,p.w,p.h,p.facing,p.hurt>0,s.tick/60,c)
    if(p.blocking)dibujarEscudoArcade(p,s.tick/60,c)
    if(p.attack){c.strokeStyle='#ffe2a1';c.lineWidth=5;c.beginPath();c.arc(p.x+p.w/2,p.y+p.h/2,62,p.facing>0?-.95:Math.PI-.95,p.facing>0?.95:Math.PI+.95);c.stroke()}
  }
  c.restore()
  for(let i=0;i<2;i++){const p=duelSnapshot.state.fighters[i];$(`duel-life-${i}`).value=p.hp;$(`duel-guard-${i}`).value=p.stamina;$(`duel-hp-${i}`).textContent=`Salud ${p.hp} / 100 · Escudo ${Math.round(p.stamina)}%`}
  const seconds=Math.max(0,Math.ceil((MayabDuel.MAX_TICKS-duelSnapshot.state.tick)/60));$('duel-clock').textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`
  if(performance.now()-duelLastResponse>1000)$('duel-status').textContent='Reconectando… Los controles se enviarán al recuperar la conexión.'
  else $('duel-status').textContent=duelSnapshot.phase==='waiting'?'Esperando a que ambos guardianes estén listos…':duelSnapshot.phase==='countdown'?`El combate comienza en ${Math.max(1,Math.ceil(duelSnapshot.countdown/60))}…`:duelSnapshot.paused?'Combate en pausa':duelSnapshot.phase==='playing'?`${duelPadLabel||'Teclado o controles táctiles'} · ${duelSnapshot.mode==='pvp'?'Combate en línea sin pausa':'Salta, ataca y defiende'}`:'Combate terminado'
  if(duelSnapshot.phase==='countdown'&&!duelPaused){c.fillStyle='#f9e5aa';c.font='700 48px Georgia';c.textAlign='center';c.fillText(String(Math.max(1,Math.ceil(duelSnapshot.countdown/60))),w/2,h/2)}
}
window.addEventListener('keydown',event=>{
  if(sections.duelo.hidden||window.MayabUIController?.isDialogOpen())return
  if(['KeyP','Escape'].includes(event.code)){event.preventDefault();if(!event.repeat){if(duelPaused)continuarDuelo();else mostrarGuiaDuelo()}return}
  if(duelKeyMap[event.code]){if(event.target instanceof HTMLButtonElement&&['Space','Enter'].includes(event.code))return;event.preventDefault();if(!duelPaused)duelKeys.add(event.code)}
})
window.addEventListener('keyup',event=>duelKeys.delete(event.code))
function perderFocoDuelo(){if(sections.duelo.hidden)return;limpiarControlesDuelo();if(duelSnapshot?.mode!=='pvp')mostrarGuiaDuelo()}
window.addEventListener('blur',perderFocoDuelo);document.addEventListener('visibilitychange',()=>{if(document.hidden)perderFocoDuelo()})
window.addEventListener('orientationchange',perderFocoDuelo)
for(const button of document.querySelectorAll('[data-duel-input]')){
  button.addEventListener('pointerdown',event=>{event.preventDefault();if(duelPaused||!duelSnapshot)return;button.setPointerCapture(event.pointerId);duelPointers.set(event.pointerId,Number(button.dataset.duelInput));button.classList.add('pressed')})
  const release=event=>{duelPointers.delete(event.pointerId);button.classList.remove('pressed')};for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,release)
}
$('duel-start').onclick=continuarDuelo;$('duel-resume').onclick=continuarDuelo;$('duel-help').onclick=mostrarGuiaDuelo;$('duel-pause').onclick=()=>duelPaused?continuarDuelo():mostrarGuiaDuelo;$('duel-exit').onclick=salirDuelo;$('duel-return').onclick=volverDelDuelo
