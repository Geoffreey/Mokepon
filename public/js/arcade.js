/* Arcade UI: rendering and input; rules live in arcade-engine.js. */
'use strict'
let arcadeLevelId='selva', arcadeLevels=[], arcadeState=null, arcadeRunId=null
let arcadeFrame=0, arcadeLastTime=0, arcadeAccumulator=0, arcadePaused=false, arcadeInputs=[], arcadeSaving=false, arcadeSaved=false
const arcadeGamepadReader=MayabGamepad.createReader()
let arcadeGamepadInput=0,arcadeGamepadStatus='',arcadeMenuIndex=0,arcadeLoopGeneration=0
const arcadeKeys=new Set(), arcadePointers=new Map(), arcadeImages=new Map()
const arcadeCanvas=$('arcade-canvas'), arcadeContext=arcadeCanvas.getContext('2d')
const arcadeThemes={
  selva:{sky:['#082e35','#257361'],far:'#194b46',tree:'#0c4239',leaf:'#246a4b',soil:'#253d32',edge:'#99b85b',accent:'#c6f090'},
  ruinas:{sky:['#182f45','#758a85'],far:'#3c5660',tree:'#243f48',leaf:'#47695a',soil:'#39494b',edge:'#b6b58a',accent:'#f0da94'},
  volcan:{sky:['#281c35','#9e493a'],far:'#593347',tree:'#412735',leaf:'#673c3f',soil:'#362b38',edge:'#ed9d61',accent:'#ffd58e'}
}
function arcadeImage(src){if(!arcadeImages.has(src)){const img=new Image();img.src=src;arcadeImages.set(src,img)}return arcadeImages.get(src)}
async function abrirArcade(){
  detenerArcade();modoJuego='arcade';mostrarSolo('arcadeNiveles');$('arcade-lista').textContent='Abriendo los senderos…'
  try{
    const data=await api('/arcade/progreso',{headers:{Authorization:`Bearer ${authToken}`}});arcadeLevels=data.levels
    $('arcade-lista').innerHTML=''
    for(const level of arcadeLevels){
      const button=document.createElement('button');button.className=`arcade-level arcade-level-${level.theme}`;button.disabled=!level.unlocked
      button.innerHTML=`<span class="chapter">${level.region}</span><span class="arcade-level-art">${level.theme==='selva'?'🌿':level.theme==='ruinas'?'🛕':'🌋'}</span><strong>${level.name}</strong><small>Guardián del sendero · ${level.boss}</small><span class="arcade-level-reward">${recompensaVisual(level.reward)}</span><span class="arcade-level-status">${level.completed?'✓ Superada · Volver a jugar':level.unlocked?'Explorar sendero →':'🔒 Supera el sendero anterior'}</span>`
      button.onclick=()=>{arcadeLevelId=level.id;prepararGuardian()};$('arcade-lista').appendChild(button)
    }
  }catch(error){$('arcade-lista').textContent=error.message}
}
async function iniciarArcade(){
  detenerArcade();$('boton-mascota').disabled=true
  const run=await api('/arcade/iniciar',{method:'POST',headers:{Authorization:`Bearer ${authToken}`,'Content-Type':'application/json'},body:JSON.stringify({levelId:arcadeLevelId,guardian:mascotaJugador})})
  arcadeRunId=run.id;arcadeState=MayabArcade.create(run.levelId,mascotaJugador);arcadeInputs=[];arcadePaused=true;arcadeSaved=false;arcadeSaving=false;arcadeAccumulator=0;arcadeLastTime=0
  const level=MayabArcade.LEVELS.find(l=>l.id===run.levelId)
  arcadeImage(fotoGuardian(mascotaJugador,skinJugador));arcadeImage(fotoGuardian(level.boss))
  for(const type of ['gold','jade','obsidian'])arcadeImage(`./assets/currency-${type}.png`)
  $('arcade-region').textContent=level.region;$('arcade-titulo').textContent=level.name
  mostrarSolo('arcadeJuego');configurarVistaArcade();$('arcade-pausa').disabled=false;$('arcade-pausa').textContent='Pausar'
  mostrarGuiaArcade()
  arcadeFrame=requestAnimationFrame(arcadeLoop);$('arcade-tutorial-play').focus({preventScroll:true})
}
function detenerArcade(){arcadeLoopGeneration++;cancelAnimationFrame(arcadeFrame);arcadeFrame=0;arcadeGamepadInput=0;arcadeGamepadReader.block();arcadeKeys.clear();arcadePhysicalKeys.clear();soltarPunterosArcade();arcadePaused=true;document.body.classList.remove('arcade-active');if(document.fullscreenElement===sections.arcadeJuego)document.exitFullscreen().catch(()=>{})}
function mostrarGuiaArcade(){
  if(!arcadeState||arcadeState.status!=='playing')return
  arcadePaused=true;arcadeGamepadInput=0;arcadeGamepadReader.block();arcadeKeys.clear();arcadePhysicalKeys.clear();soltarPunterosArcade()
  const power=MayabArcade.POWERS[arcadeState.guardian]
  $('arcade-tutorial-power').textContent=`${arcadeState.guardian} · ${power.name}. Lanza tu ataque con K o Z hacia donde estés mirando. Se recarga automáticamente; no consume oro, jade ni obsidiana.`
  $('arcade-tutorial-play').textContent=arcadeState.tick?'Volver a la aventura':'¡Entrar al sendero!'
  $('arcade-tutorial').hidden=false;$('arcade-tutorial-content').scrollTop=0;sections.arcadeJuego.classList.add('arcade-learning');$('arcade-overlay').hidden=true;$('arcade-pausa').textContent='Continuar'
}
function ocultarGuiaArcade(){$('arcade-tutorial').hidden=true;sections.arcadeJuego.classList.remove('arcade-learning')}
function arcadeOverlay(title,copy,action){
  ocultarGuiaArcade()
  $('arcade-overlay').hidden=false;$('arcade-overlay-title').textContent=title;$('arcade-overlay-copy').textContent=copy
  $('arcade-continuar').hidden=!action;$('arcade-continuar').textContent=action||'Continuar'
  $('arcade-reintentar').hidden=!arcadeState||arcadeState.status==='playing';$('arcade-mapa').disabled=false
}
function arcadeResume(){if(!arcadeState||arcadeState.status!=='playing')return;ocultarGuiaArcade();arcadePaused=false;arcadeGamepadInput=0;arcadeGamepadReader.block();arcadeKeys.clear();arcadePhysicalKeys.clear();soltarPunterosArcade();arcadeLastTime=0;$('arcade-overlay').hidden=true;$('arcade-pausa').textContent='Pausar';arcadeCanvas.focus({preventScroll:true})}
function arcadePause(){if(!arcadeState||arcadeState.status!=='playing'||sections.arcadeJuego.hidden||!$('arcade-tutorial').hidden)return;arcadePaused=true;arcadeGamepadInput=0;arcadeGamepadReader.block();arcadeKeys.clear();arcadePhysicalKeys.clear();soltarPunterosArcade();$('arcade-pausa').textContent='Continuar';arcadeOverlay('Un respiro en el sendero','Tu aventura está en pausa. Continúa cuando estés listo.','Continuar')}
function arcadeInput(){let input=arcadeGamepadInput;for(const value of arcadeKeys)input|=value;for(const value of arcadePointers.values())input|=value;return input}
function arcadeRecord(input){const previous=arcadeInputs[arcadeInputs.length-1];if(previous&&previous[0]===input)previous[1]++;else arcadeInputs.push([input,1])}
function arcadeLoop(time){
  const generation=arcadeLoopGeneration
  if(sections.arcadeJuego.hidden){detenerArcade();return}
  actualizarMandoArcade()
  if(generation!==arcadeLoopGeneration)return
  if(!arcadeLastTime)arcadeLastTime=time
  if(!arcadePaused&&arcadeState.status==='playing'&&!document.hidden){
    arcadeAccumulator+=Math.min(time-arcadeLastTime,100)
    while(arcadeAccumulator>=1000/60&&arcadeState.status==='playing'){
      const input=arcadeInput();arcadeRecord(input);MayabArcade.step(arcadeState,input);arcadeAccumulator-=1000/60
    }
    if(arcadeState.status==='won'){
      arcadePaused=true;void guardarArcade()
    }else if(arcadeState.status==='lost'){
      arcadePaused=true;$('arcade-pausa').disabled=true
      arcadeOverlay('El sendero te espera',arcadeState.event==='timeout'?'Se terminó el tiempo de este intento. Vuelve a intentarlo.':'Te quedaste sin vidas. Mantén la distancia y lanza tu poder con K o Z. Evita tocar el chichicaste y esquiva las ondas del jefe.',null)
    }
  }
  arcadeLastTime=time;dibujarArcade();arcadeFrame=requestAnimationFrame(arcadeLoop)
}
async function guardarArcade(){
  if(arcadeSaving||arcadeSaved)return
  arcadeSaving=true;$('arcade-pausa').disabled=true;$('arcade-salir').disabled=true
  arcadeOverlay('¡Guardián vencido!','Guardando tu avance y los tesoros del sendero…',null)
  $('arcade-reintentar').hidden=true;$('arcade-mapa').disabled=true
  try{
    const result=await api('/arcade/finalizar',{method:'POST',headers:{Authorization:`Bearer ${authToken}`,'Content-Type':'application/json'},body:JSON.stringify({id:arcadeRunId,inputs:arcadeInputs})})
    arcadeSaved=true
    const index=MayabArcade.LEVELS.findIndex(l=>l.id===arcadeLevelId),next=MayabArcade.LEVELS[index+1]
    const reward=result.reward
    arcadeOverlay(index===2?'¡Conquistaste el Mayab!':'¡Sendero superado!',result.firstCompletion?`Guardaste ${reward.gold} oro, ${reward.jade} jade y ${reward.obsidian} obsidiana.${next?' Nuevo sendero desbloqueado: '+next.name+'.':' Completaste las tres pantallas.'}`:'Ya habías recibido los tesoros de este sendero. ¡Buen combate!',next?'Siguiente pantalla →':null)
    $('arcade-continuar').onclick=async()=>{if(next){arcadeLevelId=next.id;await reiniciarArcade()}else arcadeResume()}
    await cargarProgreso()
  }catch(error){
    if(arcadeSaved){$('arcade-overlay-copy').textContent+=' Tu avance está guardado; la cartera se actualizará al volver.'}
    else{arcadeOverlay('Falta guardar tu victoria',`${error.message} Tu partida sigue aquí; vuelve a intentar el guardado.`,'Reintentar guardado');$('arcade-continuar').onclick=()=>guardarArcade();$('arcade-reintentar').hidden=true}
  }finally{arcadeSaving=false;$('arcade-mapa').disabled=false;$('arcade-salir').disabled=false}
}
async function reiniciarArcade(){
  $('arcade-reintentar').disabled=true;$('arcade-continuar').disabled=true
  try{$('arcade-continuar').onclick=arcadeResume;await iniciarArcade()}catch(error){arcadeOverlay('No se pudo abrir el sendero',error.message,null)}
  finally{$('arcade-reintentar').disabled=false;$('arcade-continuar').disabled=false}
}
function dibujarArcade(){
  const s=arcadeState;if(!s)return
  const c=arcadeContext,level=MayabArcade.LEVELS.find(l=>l.id===s.levelId),theme=arcadeThemes[level.theme],p=s.player
  const viewWidth=arcadeCanvas.width,camera=Math.max(0,Math.min(s.width-viewWidth,p.x-viewWidth*.3125)),t=s.tick/60
  const sky=c.createLinearGradient(0,0,0,540);sky.addColorStop(0,theme.sky[0]);sky.addColorStop(1,theme.sky[1]);c.fillStyle=sky;c.fillRect(0,0,viewWidth,540)
  c.fillStyle=level.theme==='volcan'?'#f2b57c':'#f4deb3';c.globalAlpha=.6;c.beginPath();c.arc(viewWidth*.78-camera*.06,90,38,0,Math.PI*2);c.fill();c.globalAlpha=1
  // Three parallax layers, with ruins and ceibas drawn in the world palette.
  for(let layer=0;layer<3;layer++){
    const speed=.1+layer*.13;c.fillStyle=layer===0?theme.far:theme.tree;c.globalAlpha=.45+layer*.15
    for(let i=0;i<12;i++){
      const x=i*180-(camera*speed)%180-80,y=270+layer*55
      if(level.theme==='volcan'){
        c.beginPath();c.moveTo(x-100,500);c.lineTo(x+80,y-100-(i%3)*25);c.lineTo(x+260,500);c.fill()
      }else{
        c.fillRect(x+35,y,22,240);c.beginPath();c.ellipse(x+45,y-12,95-layer*12,65,0,0,Math.PI*2);c.fill()
        c.beginPath();c.moveTo(x+38,y+80);c.lineTo(x-12,y+30);c.lineTo(x+40,y+45);c.fill()
      }
    }
  }
  c.globalAlpha=1
  for(let i=0;i<5;i++){
    const x=380+i*650-camera*.5;c.fillStyle=theme.far
    for(let j=0;j<5;j++)c.fillRect(x+j*18,385-j*24,210-j*36,24)
    c.fillStyle=theme.sky[0];c.fillRect(x+92,295,25,45)
  }
  // Floating pollen and embers use simulation time, so pausing freezes the scene.
  c.fillStyle=theme.accent;c.globalAlpha=.6
  for(let i=0;i<22;i++){const x=((i*137-camera*.4+t*8)%1020+1020)%1020;c.beginPath();c.arc(x,90+(i*73)%320+Math.sin(t+i)*8,1.5,0,Math.PI*2);c.fill()}
  c.globalAlpha=1;c.save();c.translate(-camera,0)
  for(const platform of s.platforms){
    c.fillStyle=theme.soil;c.fillRect(platform.x,platform.y,platform.w,platform.h)
    c.fillStyle=theme.edge;c.fillRect(platform.x,platform.y,platform.w,6)
    c.fillStyle='rgba(0,0,0,.18)'
    for(let x=platform.x+12;x<platform.x+platform.w;x+=48){c.fillRect(x,platform.y+14,32,3);c.fillRect(x+8,platform.y+40,30,3)}
    if(level.theme==='selva'){c.strokeStyle=theme.leaf;c.lineWidth=3;for(let x=platform.x+14;x<platform.x+platform.w;x+=45){c.beginPath();c.moveTo(x,platform.y);c.lineTo(x+4,platform.y-12);c.lineTo(x+10,platform.y-4);c.stroke()}}
  }
  // Lit checkpoint and the final arena boundary.
  c.fillStyle=theme.accent;c.fillRect(2670,355,5,95);c.beginPath();c.moveTo(2675,355);c.lineTo(2710,367);c.lineTo(2675,380);c.fill()
  if(s.boss.active&&s.boss.hp>0){c.fillStyle='#f4cd7180';c.fillRect(2690,240,5,210)}
  for(const coin of s.coins)if(!coin.taken){
    const y=coin.y+Math.sin(t*3+coin.x)*3,img=arcadeImage(`./assets/currency-${coin.type}.png`)
    c.shadowColor=coin.type==='jade'?'#78ffc2':'#ffd77b';c.shadowBlur=12
    if(img.complete&&img.naturalWidth)c.drawImage(img,coin.x,y,24,24)
    else{c.fillStyle=coin.type==='gold'?'#f5c76b':coin.type==='jade'?'#79edaa':'#b4a1f3';c.beginPath();c.arc(coin.x+11,y+11,9,0,Math.PI*2);c.fill()}
    c.shadowBlur=0
  }
  for(const enemy of s.enemies)if(enemy.hp>0)dibujarPeligroSelva(enemy,t)
  for(const shot of s.playerShots)dibujarPoderArcade(shot,MayabArcade.POWERS[s.guardian],t)
  const b=s.boss
  if(b.hp>0){
    if(b.active&&b.cooldown<=35){c.strokeStyle='#ffd57d';c.lineWidth=3;c.beginPath();c.arc(b.x+b.w/2,b.y+b.h/2,64+Math.sin(t*16)*4,0,Math.PI*2);c.stroke();c.fillStyle='#ffd57d';c.font='bold 24px system-ui';c.textAlign='center';c.fillText('!',b.x+b.w/2,b.y-20)}
    dibujarPersonaje(fotoGuardian(level.boss),b.x,b.y,b.w,b.h,b.facing,b.hurt>0,t)
    if(!b.active){c.fillStyle='#fff1c9';c.font='600 13px system-ui';c.textAlign='center';c.fillText(level.boss,b.x+b.w/2,b.y-16)}
  }
  for(const shot of s.projectiles){c.fillStyle='#fbbf6e';c.shadowColor='#f6b453';c.shadowBlur=18;c.beginPath();c.ellipse(shot.x+16,shot.y+15,19,15,0,0,Math.PI*2);c.fill();c.shadowBlur=0}
  if(p.invincible===0||s.tick%10<6)dibujarPersonaje(fotoGuardian(mascotaJugador,skinJugador),p.x,p.y,p.w,p.h,p.facing,false,t)
  if(p.attack){c.strokeStyle='#f8e4a4';c.lineWidth=6;c.shadowColor='#fff1bf';c.shadowBlur=15;c.beginPath();const x=p.x+p.w/2;c.arc(x,p.y+p.h/2,62,p.facing>0?-.95:Math.PI-.95,p.facing>0?.95:Math.PI+.95);c.stroke();c.shadowBlur=0}
  c.restore()
  if(b.active){
    const barWidth=Math.min(440,viewWidth-60),barX=(viewWidth-barWidth)/2
    c.fillStyle='#0b191cdd';c.fillRect(barX,20,barWidth,48);c.fillStyle='#f6eac9';c.textAlign='center';c.font='600 13px system-ui';c.fillText(`${level.boss} · Guardián del sendero`,viewWidth/2,39)
    c.fillStyle='#392e32';c.fillRect(barX+20,49,barWidth-40,7);c.fillStyle=b.cooldown<=35?'#ffd57d':'#da8265';c.fillRect(barX+20,49,(barWidth-40)*b.hp/b.maxHp,7)
  }else{
    c.fillStyle='#ffffff20';c.fillRect(30,26,viewWidth-60,3);c.fillStyle=theme.accent;c.fillRect(30,26,(viewWidth-60)*Math.min(p.x/2700,1),3)
  }
  $('arcade-vida').textContent=`Salud ${'♥'.repeat(Math.max(0,p.hp))}${'♡'.repeat(5-Math.max(0,p.hp))}`
  $('arcade-vida').setAttribute('aria-label',`Salud: ${p.hp} de 5 corazones`)
  $('arcade-intentos').textContent=`Intentos: ${p.lives} / 3`
  $('arcade-poder').textContent=`${MayabArcade.POWERS[s.guardian].name} · ${p.shootCooldown?'Recargando…':arcadeGamepadStatus==='connected'?'B / ○ · Listo':'K / Z · Listo'}`
  $('arcade-bolsa').textContent=`Oro ${s.loot.gold} · Jade ${s.loot.jade} · Obsidiana ${s.loot.obsidian}`
  $('arcade-objetivo').textContent=b.active?(s.projectiles.some(shot=>Math.abs(shot.x-p.x)<180)?'¡Salta! Onda de piedra':b.cooldown<=35?'¡Prepárate! Onda de piedra':`⚔ ${level.boss}`):p.x>2450?'⚑ Punto de control cercano':'Encuentra al guardián →'
}
function dibujarPersonaje(src,x,y,w,h,facing,hurt,t){
  const c=arcadeContext,img=arcadeImage(src)
  c.fillStyle='#06171966';c.beginPath();c.ellipse(x+w/2,y+h,w*.45,6,0,0,Math.PI*2);c.fill()
  c.save();c.translate(x+w/2,y+h);c.scale(facing,1)
  if(hurt)c.globalAlpha=.55
  if(img.complete&&img.naturalWidth){const scale=Math.min((w+20)/img.naturalWidth,(h+12)/img.naturalHeight);c.drawImage(img,-img.naturalWidth*scale/2,-img.naturalHeight*scale+Math.sin(t*7)*1.5,img.naturalWidth*scale,img.naturalHeight*scale)}
  else{c.fillStyle='#e2d396';c.fillRect(-w/2,-h,w,h)}
  c.restore()
}
const arcadeKeyMap={ArrowLeft:1,KeyA:1,ArrowRight:2,KeyD:2,Space:4,ArrowUp:4,KeyW:4,KeyJ:8,KeyX:8,KeyK:16,KeyZ:16}
// Track physical keys separately so releasing A does not release a held left arrow.
const arcadePhysicalKeys=new Set()
function actualizarTeclasArcade(){arcadeKeys.clear();if(arcadePaused)return;for(const code of arcadePhysicalKeys)if(arcadeKeyMap[code])arcadeKeys.add(arcadeKeyMap[code])}
window.addEventListener('keydown',event=>{
  if(sections.arcadeJuego.hidden)return
  if(event.target instanceof HTMLButtonElement&&['Space','Enter'].includes(event.code))return
  if(['KeyP','Escape'].includes(event.code)){event.preventDefault();if(!$('arcade-tutorial').hidden)return;if(!event.repeat){arcadePhysicalKeys.clear();if(arcadePaused&&arcadeState?.status==='playing')arcadeResume();else arcadePause()}return}
  if(arcadeKeyMap[event.code]){event.preventDefault();if(!arcadePaused){arcadePhysicalKeys.add(event.code);actualizarTeclasArcade()}}
})
window.addEventListener('keyup',event=>{arcadePhysicalKeys.delete(event.code);actualizarTeclasArcade()})
window.addEventListener('blur',()=>{arcadePhysicalKeys.clear();arcadePause()})
document.addEventListener('visibilitychange',()=>{if(document.hidden){arcadePhysicalKeys.clear();arcadePause()}})
for(const button of document.querySelectorAll('[data-arcade-input]')){
  button.addEventListener('pointerdown',event=>{event.preventDefault();if(arcadePaused)return;button.setPointerCapture(event.pointerId);arcadePointers.set(event.pointerId,Number(button.dataset.arcadeInput));button.classList.add('pressed')})
  const release=event=>{arcadePointers.delete(event.pointerId);button.classList.remove('pressed')}
  button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release)
}
$('arcade-ayuda').onclick=mostrarGuiaArcade;$('arcade-tutorial-play').onclick=arcadeResume
$('arcade-volver').onclick=()=>{detenerArcade();mostrarModos()}
$('arcade-pausa').onclick=()=>arcadePaused?arcadeResume():arcadePause()
$('arcade-continuar').onclick=arcadeResume;$('arcade-reintentar').onclick=reiniciarArcade
async function salirArcade(){if(arcadeSaving)return;detenerArcade();await abrirArcade()}
$('arcade-salir').onclick=salirArcade;$('arcade-mapa').onclick=salirArcade

function dibujarPoderArcade(shot,power,t){
  const c=arcadeContext,dir=Math.sign(shot.vx),x=shot.x+shot.w/2,y=shot.y+shot.h/2
  c.save();c.translate(x,y);c.scale(dir,1)
  c.shadowBlur=18;c.shadowColor=power.color
  for(let i=4;i>0;i--){c.globalAlpha=(5-i)*.13;c.fillStyle=power.color;c.beginPath();c.ellipse(-i*9,Math.sin(t*15-i)*2,13-i,6-i*.6,0,0,Math.PI*2);c.fill()}
  c.globalAlpha=1;c.fillStyle=power.color
  if(shot.element==='earth'){
    c.rotate(t*9);c.beginPath();c.moveTo(15,0);c.lineTo(0,-10);c.lineTo(-13,0);c.lineTo(0,10);c.closePath();c.fill();c.strokeStyle='#f0ffdc';c.lineWidth=2;c.stroke()
  }else{
    c.beginPath();c.moveTo(-23,0);c.quadraticCurveTo(-7,-13,7,-9);c.quadraticCurveTo(23,0,7,9);c.quadraticCurveTo(-7,13,-23,0);c.fill()
  }
  c.fillStyle='#fff8db';c.beginPath();c.ellipse(3,-2,5,4,0,0,Math.PI*2);c.fill();c.restore()
}
function dibujarPeligroSelva(enemy,t){
  const c=arcadeContext,x=enemy.x+enemy.w/2,y=enemy.y+enemy.h
  c.save();c.translate(x,y);c.scale(enemy.dir,1)
  c.fillStyle='#03140d66';c.beginPath();c.ellipse(0,-1,28,5,0,0,Math.PI*2);c.fill()
  if(enemy.cooldown)c.globalAlpha=.6
  c.lineCap='round';c.lineJoin='round'
  if(enemy.type==='chichicaste'){
    c.strokeStyle='#9ab67b';c.lineWidth=3;c.beginPath();c.moveTo(0,0);c.lineTo(-2,-41);c.stroke()
    for(let i=0;i<4;i++){
      const dir=i%2?1:-1,by=-8-i*8,sway=Math.sin(t*2+i)*1.5
      c.save();c.translate(-1,by);c.rotate(dir*.22+sway*.025);c.scale(dir,1)
      c.fillStyle=i%2?'#83ab4d':'#aac66b';c.strokeStyle='#d8d59a';c.lineWidth=.8
      c.beginPath();c.moveTo(0,0);c.lineTo(5,-7);c.lineTo(8,-5);c.lineTo(12,-11);c.lineTo(15,-8);c.lineTo(23,-14);c.lineTo(20,-4);c.lineTo(23,-2);c.lineTo(14,3);c.lineTo(14,6);c.lineTo(7,5);c.closePath();c.fill();c.stroke()
      c.beginPath();c.moveTo(0,0);c.lineTo(21,-11);c.stroke()
      for(let j=0;j<3;j++){c.beginPath();c.moveTo(7+j*4,-2-j*2);c.lineTo(7+j*4,-6-j*2);c.stroke()}
      c.restore()
    }
    c.fillStyle='#d9d998';for(let i=0;i<6;i++){c.beginPath();c.arc((i%2?1:-1)*5,-32-i*2,1.5,0,Math.PI*2);c.fill()}
  }else if(enemy.type==='serpent'){
    const sway=Math.sin(t*8)*4
    c.strokeStyle='#183f2c';c.lineWidth=14;c.beginPath();c.moveTo(-25,-5);c.bezierCurveTo(-15,-24,9,8,15,-13);c.bezierCurveTo(19,-22,7,-30,19,-33+sway*.4);c.stroke()
    c.strokeStyle='#82a856';c.lineWidth=9;c.stroke()
    c.strokeStyle='#dfc47e';c.lineWidth=2
    for(let i=0;i<4;i++){const px=-18+i*8;c.beginPath();c.moveTo(px,-9);c.lineTo(px+2,-14);c.lineTo(px+5,-10);c.stroke()}
    c.fillStyle='#9eb968';c.beginPath();c.ellipse(20,-33+sway*.4,10,6,-.15,0,Math.PI*2);c.fill()
    c.fillStyle='#eecb66';c.beginPath();c.arc(24,-35+sway*.4,2,0,Math.PI*2);c.fill();c.fillStyle='#152b1c';c.fillRect(24,-37+sway*.4,1,4)
    if(Math.sin(t*7)>.3){c.strokeStyle='#d97e79';c.lineWidth=1;c.beginPath();c.moveTo(29,-32);c.lineTo(37,-32);c.lineTo(40,-34);c.moveTo(37,-32);c.lineTo(40,-30);c.stroke()}
  }else{
    const spider=enemy.type==='tarantula',legs=spider?4:3
    c.strokeStyle=spider?'#a97a52':'#b38b64';c.lineWidth=3
    for(let side=-1;side<=1;side+=2)for(let i=0;i<legs;i++){
      const offset=Math.sin(t*11+i*1.8+side)*3
      c.beginPath();c.moveTo((i-1.5)*5,-15);c.lineTo(side*(18+i*1.6),-20+i*3+offset);c.lineTo(side*(26+i),-3+offset*.4);c.stroke()
      c.fillStyle='#d3a274';c.beginPath();c.arc(side*(18+i*1.6),-20+i*3+offset,2,0,Math.PI*2);c.fill()
    }
    c.fillStyle=spider?'#553d34':'#70563c';c.beginPath();c.ellipse(-7,-17,spider?15:14,spider?12:8,-.2,0,Math.PI*2);c.fill()
    c.fillStyle=spider?'#8a6046':'#b58b54';c.beginPath();c.ellipse(9,-17,9,8,0,0,Math.PI*2);c.fill()
    if(spider){
      c.strokeStyle='#b88a61';c.lineWidth=1
      for(let i=0;i<8;i++){const a=i*Math.PI/4;c.beginPath();c.moveTo(-7+Math.cos(a)*10,-17+Math.sin(a)*8);c.lineTo(-7+Math.cos(a)*17,-17+Math.sin(a)*14);c.stroke()}
      c.strokeStyle='#e0c5a0';c.lineWidth=2;for(const i of [-1,1]){c.beginPath();c.moveTo(15,-15+i*3);c.lineTo(21,-12+i*3);c.lineTo(18,-8+i*3);c.stroke()}
    }else{
      c.strokeStyle='#bc925e';c.lineWidth=6;c.beginPath();c.moveTo(-19,-18);c.bezierCurveTo(-36,-33,-24,-47,-11,-38+Math.sin(t*4)*2);c.stroke()
      c.fillStyle='#ecd29b';c.beginPath();c.moveTo(-12,-40);c.lineTo(-5,-33);c.lineTo(-15,-34);c.fill()
      c.lineWidth=3;for(const side of [-1,1]){c.beginPath();c.moveTo(12,-17);c.lineTo(25,-17+side*9);c.lineTo(32,-18+side*7);c.moveTo(25,-17+side*9);c.lineTo(30,-13+side*10);c.stroke()}
    }
    c.fillStyle='#eed79f';for(const i of [-1,1]){c.beginPath();c.arc(14,-20+i*2,1.4,0,Math.PI*2);c.fill()}
  }
  c.restore()
}

function actualizarMandoArcade(){
  let pads=[],available=typeof navigator.getGamepads==='function',blocked=false
  if(available){try{pads=navigator.getGamepads()}catch{blocked=true}}
  const pad=arcadeGamepadReader.read(pads)
  const status=!available||blocked?'unavailable':!pad.connected?'waiting':pad.supported?'connected':'unsupported'
  if(status!==arcadeGamepadStatus||pad.changed){
    arcadeGamepadStatus=status
    const labels={connected:'🎮 Mando conectado · A / ✕ salta · X / □ golpea · B / ○ lanza · Start pausa',
      waiting:'🎮 Conecta tu mando Bluetooth al dispositivo y pulsa un botón para detectarlo.',
      unsupported:'Mando detectado sin distribución estándar. Usa los botones en pantalla o un mando compatible.',
      unavailable:'Este navegador no permite leer el mando. Puedes jugar con los controles táctiles.'}
    $('arcade-mando').textContent=status==='connected'&&/dualsense|054c.*0ce6/i.test(pad.id)?'🎮 DualSense · ✕ salta · □ golpea · ○ / R2 lanza · Options pausa':labels[status];sections.arcadeJuego.classList.toggle('arcade-with-gamepad',status==='connected')
  }
  if(pad.disconnected){arcadeGamepadInput=0;arcadePause()}
  if(document.hidden){arcadeGamepadReader.block();arcadeGamepadInput=0;return}
  arcadeGamepadInput=arcadePaused?0:pad.input
  if(pad.pausePressed&&arcadeState?.status==='playing'&&$('arcade-tutorial').hidden){
    if(arcadePaused)arcadeResume();else arcadePause()
    return
  }
  if(window.MayabUIController){if(arcadePaused)window.MayabUIController.navigate(pad);else window.MayabUIController.clear();return}
  const menu=!$('arcade-tutorial').hidden?[$('arcade-tutorial-play')]:!$('arcade-overlay').hidden?['arcade-continuar','arcade-reintentar','arcade-mapa'].map($):[]
  const buttons=menu.filter(button=>!button.hidden&&!button.disabled&&button.getClientRects().length)
  document.querySelectorAll('.arcade-gamepad-focus').forEach(button=>button.classList.remove('arcade-gamepad-focus'))
  if(status==='connected'&&buttons.length){
    arcadeMenuIndex=((arcadeMenuIndex+pad.menuPressed)%buttons.length+buttons.length)%buttons.length
    buttons[arcadeMenuIndex].classList.add('arcade-gamepad-focus')
    if(pad.confirmPressed){arcadeGamepadReader.block();buttons[arcadeMenuIndex].click();arcadeMenuIndex=0}
  }else arcadeMenuIndex=0
}
$('arcade-pantalla').hidden=!document.fullscreenEnabled
$('arcade-pantalla').onclick=async()=>{
  try{
    if(document.fullscreenElement===sections.arcadeJuego)await document.exitFullscreen()
    else await sections.arcadeJuego.requestFullscreen()
  }catch{$('arcade-mando').textContent='No se pudo abrir la pantalla completa. Puedes girar el dispositivo y seguir jugando.'}
}
document.addEventListener('fullscreenchange',()=>{
  $('arcade-pantalla').textContent=document.fullscreenElement===sections.arcadeJuego?'Salir de pantalla completa':'Pantalla completa'
})
const arcadeLandscape=window.matchMedia('(orientation: landscape) and (max-height: 600px) and (max-width: 1200px)')
arcadeLandscape.addEventListener('change',()=>{
  if(!sections.arcadeJuego.hidden){arcadeKeys.clear();arcadePhysicalKeys.clear();soltarPunterosArcade();arcadeGamepadReader.block();arcadeGamepadInput=0;arcadePause()}
})

function soltarPunterosArcade(){arcadePointers.clear();document.querySelectorAll('.arcade-controls .pressed').forEach(button=>button.classList.remove('pressed'))}

// A closer camera in portrait makes characters readable without cropping the world vertically.
function configurarVistaArcade(){
  const portrait=window.matchMedia('(max-width: 760px) and (orientation: portrait)').matches
  const viewport=arcadeCanvas.parentElement
  const portraitWidth=viewport?.clientWidth&&viewport?.clientHeight?Math.round(540*viewport.clientWidth/viewport.clientHeight):420
  const width=portrait?Math.max(420,Math.min(720,portraitWidth)):960
  if(arcadeCanvas.width!==width)arcadeCanvas.width=width
}
window.addEventListener('resize',configurarVistaArcade)

if(typeof ResizeObserver!=='undefined')new ResizeObserver(configurarVistaArcade).observe(arcadeCanvas.parentElement)

for(const type of ['touchstart','touchmove','touchend','gesturestart','gesturechange','dblclick']){
  document.addEventListener(type,event=>{
    if(event.target.closest?.('.arcade-controls,.map-controls')&&event.cancelable)event.preventDefault()
  },{passive:false})
}
