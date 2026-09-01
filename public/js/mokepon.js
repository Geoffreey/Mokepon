const $ = (id) => document.getElementById(id)
const sections = { registro:$('registro-jugador'), activacion:$('activar-cuenta'), lobby:$('seleccionar-sala'), guardian:$('seleccionar-mascota'), mapa:$('ver-mapa'), batalla:$('seleccionar-ataque') }
const mapa=$('mapa'), lienzo=mapa.getContext('2d'), dpr=Math.min(window.devicePixelRatio||1,2)
const anchoMapa=Math.min(Math.max(window.innerWidth-64,240),800), altoMapa=anchoMapa*0.75
mapa.width=Math.round(anchoMapa*dpr); mapa.height=Math.round(altoMapa*dpr); lienzo.setTransform(dpr,0,0,dpr,0,0)
const mapaBackground=new Image()

let jugadorId=null, jugadorToken=null, authToken=localStorage.getItem('mokeponAuthToken'), nombreJugador='', salaActual=null, enemigoId=null, modoAuth='login'
let captchaWidgetId=null,captchaActivo=false,usuarioPendiente='',reenvioToken=''
let mokepones=[], mokeponesEnemigos=[], mascotaJugador='', mascotaJugadorObjeto=null
let ataqueJugador=[], ataqueEnemigo=[], botones=[], indexAtaqueJugador='', indexAtaqueEnemigo=''
let victoriasJugador=0, victoriasEnemigo=0, intervaloMapa=null, intervaloSala=null, intervaloAtaques=null
let sesionInvalida=false, desafioEnCurso=false, ultimoMensajeId=null

class Mokepon {
  constructor(nombre,foto,elemento,leyenda,id=null,nombreJugadorRival='') {
    this.id=id;this.nombre=nombre;this.foto=foto;this.elemento=elemento;this.leyenda=leyenda;this.nombreJugador=nombreJugadorRival
    this.ataques=[];this.ancho=anchoMapa<500?54:68;this.alto=this.ancho
    this.x=aleatorio(0,anchoMapa-this.ancho);this.y=aleatorio(0,altoMapa-this.alto)
    this.mapaFoto=new Image();this.mapaFoto.src=foto;this.velocidadX=0;this.velocidadY=0
  }
  pintar(){
    lienzo.save();lienzo.shadowColor='rgba(0,0,0,.5)';lienzo.shadowBlur=10;lienzo.drawImage(this.mapaFoto,this.x,this.y,this.ancho,this.alto);lienzo.restore()
    if(this.nombreJugador){lienzo.font='700 11px system-ui';lienzo.textAlign='center';lienzo.lineWidth=3;lienzo.strokeStyle='rgba(3,12,9,.8)';lienzo.strokeText(this.nombreJugador,this.x+this.ancho/2,this.y-5);lienzo.fillStyle='#f6f1df';lienzo.fillText(this.nombreJugador,this.x+this.ancho/2,this.y-5)}
  }
}

const ataquesAgua=[{icono:'💧',tipo:'AGUA'},{icono:'💧',tipo:'AGUA'},{icono:'💧',tipo:'AGUA'},{icono:'🔥',tipo:'FUEGO'},{icono:'🌿',tipo:'TIERRA'}]
const ataquesTierra=[{icono:'🌿',tipo:'TIERRA'},{icono:'🌿',tipo:'TIERRA'},{icono:'🌿',tipo:'TIERRA'},{icono:'💧',tipo:'AGUA'},{icono:'🔥',tipo:'FUEGO'}]
const ataquesFuego=[{icono:'🔥',tipo:'FUEGO'},{icono:'🔥',tipo:'FUEGO'},{icono:'🔥',tipo:'FUEGO'},{icono:'💧',tipo:'AGUA'},{icono:'🌿',tipo:'TIERRA'}]
const balam=new Mokepon("B'alam",'./assets/balam.png','Fuego · Jaguar de obsidiana','Corazón del volcán')
const iq=new Mokepon("Iq'",'./assets/iq.png','Agua · Quetzal de la lluvia','Aliento de las nubes')
const kabrak=new Mokepon('Kabrak','./assets/kabrak.png','Tierra · Guardián del maíz','Fuerza de la montaña')
balam.ataques=ataquesFuego;iq.ataques=ataquesAgua;kabrak.ataques=ataquesTierra;mokepones=[balam,iq,kabrak]

function mostrarSolo(nombre){Object.values(sections).forEach((s)=>s.hidden=true);if(nombre)sections[nombre].hidden=false}
function cabeceras(json=false){const headers={Authorization:`Bearer ${jugadorToken}`};if(json)headers['Content-Type']='application/json';return headers}
async function api(url,opciones={}){
  const res=await fetch(url,opciones)
  if(res.status===401&&jugadorToken&&!sesionInvalida){sesionInvalida=true;localStorage.removeItem('mokeponAuthToken');alert('Tu sesión terminó. Volveremos al inicio.');location.reload();throw new Error('Sesión inválida')}
  if(!res.ok){let data={};try{data=await res.json()}catch{}const error=new Error(data.error||'No se pudo completar la acción');error.data=data;throw error}
  return res.status===204?null:res.json()
}

async function iniciarJuego(){
  mostrarSolo('registro');$('room-dock').hidden=true;$('reiniciar').hidden=true;renderGuardianes();configurarControlesMapa()
  $('form-nombre').addEventListener('submit',registrarJugador);$('boton-mascota').addEventListener('click',seleccionarMascotaJugador)
  $('boton-reiniciar').addEventListener('click',volverArena);$('boton-salir-sala').addEventListener('click',salirSala);$('form-chat').addEventListener('submit',enviarChat)
  $('tab-login').onclick=()=>cambiarModoAuth('login');$('tab-registro').onclick=()=>cambiarModoAuth('registro');$('boton-cerrar-sesion').onclick=cerrarSesion
  $('form-activacion').addEventListener('submit',activarCuenta);$('boton-reenviar').onclick=reenviarCodigo;await configurarCaptcha()
  if(authToken){try{const perfil=await api('/auth/perfil',{headers:{Authorization:`Bearer ${authToken}`}});await iniciarJugador(perfil)}catch{localStorage.removeItem('mokeponAuthToken');authToken=null}}
}

async function registrarJugador(event){
  event.preventDefault();const boton=$('boton-auth');boton.disabled=true;$('error-registro').textContent=''
  const body={usuario:$('usuario').value.trim(),clave:$('clave').value,captchaToken:obtenerCaptcha()};if(modoAuth==='registro'){body.nombre=$('nombre-jugador').value.trim();body.correo=$('correo').value.trim()}
  try{const data=await api(`/auth/${modoAuth}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(data.requiereActivacion){mostrarActivacion(body.usuario,data.correoEnmascarado,data.reenvioToken);return}authToken=data.token;localStorage.setItem('mokeponAuthToken',authToken);await iniciarJugador(data)}
  catch(error){if(error.data?.requiereActivacion)mostrarActivacion(body.usuario,null,error.data.reenvioToken);else $('error-registro').textContent=error.message;boton.disabled=false;reiniciarCaptcha()}
}
function cambiarModoAuth(modo){modoAuth=modo;const registro=modo==='registro';$('campos-registro').hidden=!registro;$('nombre-jugador').required=registro;$('correo').required=registro;$('clave').autocomplete=registro?'new-password':'current-password';$('tab-login').classList.toggle('active',!registro);$('tab-registro').classList.toggle('active',registro);$('boton-auth').firstChild.textContent=registro?'Crear cuenta ':'Entrar al mundo ';$('error-registro').textContent='';reiniciarCaptcha()}
async function configurarCaptcha(){try{const config=await api('/auth/config');captchaActivo=config.captchaActivo;if(!captchaActivo){$('captcha-aviso').textContent=config.modoDesarrollo?'reCAPTCHA en modo local: configura las claves para probar la protección real.':'reCAPTCHA no está disponible.';return}$('captcha-aviso').textContent='Cargando verificación…';window.onRecaptchaReady=()=>{try{captchaWidgetId=window.grecaptcha.render('captcha-container',{sitekey:config.recaptchaSiteKey,theme:'dark'});$('captcha-aviso').textContent=''}catch{$('captcha-aviso').textContent='No se pudo mostrar reCAPTCHA. Recarga la página o desactiva el bloqueador para este sitio.'}};const script=document.createElement('script');script.src='https://www.google.com/recaptcha/api.js?onload=onRecaptchaReady&render=explicit&hl=es-419';script.async=true;script.defer=true;script.onerror=()=>{$('captcha-aviso').textContent='Google reCAPTCHA fue bloqueado. Desactiva el bloqueador para este sitio y recarga.'};document.head.appendChild(script)}catch{$('captcha-aviso').textContent='No se pudo cargar reCAPTCHA.'}}
function obtenerCaptcha(){return captchaActivo&&window.grecaptcha&&captchaWidgetId!==null?window.grecaptcha.getResponse(captchaWidgetId):'desarrollo-local'}
function reiniciarCaptcha(){if(captchaActivo&&window.grecaptcha&&captchaWidgetId!==null)window.grecaptcha.reset(captchaWidgetId)}
function mostrarActivacion(usuario,correo,token){usuarioPendiente=usuario;reenvioToken=token||'';$('mensaje-activacion').textContent=correo?`Enviamos un código de seis dígitos a ${correo}. Expira en 15 minutos.`:'Ingresa el código enviado a tu correo o solicita uno nuevo.';$('boton-auth').disabled=false;mostrarSolo('activacion')}
async function activarCuenta(event){event.preventDefault();const boton=event.currentTarget.querySelector('.primary-button');boton.disabled=true;$('error-activacion').textContent='';try{const data=await api('/auth/activar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuario:usuarioPendiente,codigo:$('codigo-activacion').value.trim()})});authToken=data.token;localStorage.setItem('mokeponAuthToken',authToken);await iniciarJugador(data)}catch(error){$('error-activacion').textContent=error.message;boton.disabled=false}}
async function reenviarCodigo(){const boton=$('boton-reenviar');boton.disabled=true;$('error-activacion').textContent='';try{const data=await api('/auth/reenviar-codigo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuario:usuarioPendiente,reenvioToken})});if(data.reenvioToken)reenvioToken=data.reenvioToken;$('error-activacion').textContent=data.mensaje}catch(error){$('error-activacion').textContent=error.message}finally{boton.disabled=false}}
async function iniciarJugador(perfil){const data=await api('/unirse',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${authToken}`},body:'{}'});jugadorId=data.id;jugadorToken=data.token;nombreJugador=data.nombre;$('jugador-badge').textContent=`● ${nombreJugador}`;$('jugador-badge').hidden=false;$('boton-cerrar-sesion').hidden=false;renderPerfil(perfil.estadisticas||data.estadisticas);mostrarSolo('lobby');await obtenerSalas();clearInterval(intervaloSala);intervaloSala=setInterval(actualizarMultijugador,1500)}
function renderPerfil(stats){if(!stats)return;$('perfil-nivel').textContent=`Nivel ${stats.nivel}`;$('perfil-puntos').textContent=stats.puntos;$('perfil-batallas').textContent=stats.batallas;$('perfil-victorias').textContent=stats.victorias;const log=$('perfil-historial');log.innerHTML=stats.historial.length?stats.historial.slice(0,4).map((b)=>`<span class="battle-entry ${b.resultado==='victoria'?'win':b.resultado==='derrota'?'loss':''}">${b.resultado} · ${b.oponente}</span>`).join(''):'<span class="battle-entry">Aún no hay batallas</span>'}
async function actualizarPerfil(){if(!authToken)return;try{const perfil=await api('/auth/perfil',{headers:{Authorization:`Bearer ${authToken}`}});renderPerfil(perfil.estadisticas)}catch{}}
async function cerrarSesion(){try{await api('/auth/logout',{method:'POST',headers:{Authorization:`Bearer ${authToken}`}})}catch{}localStorage.removeItem('mokeponAuthToken');location.reload()}

async function actualizarMultijugador(){if(!jugadorToken)return;try{if(salaActual)await actualizarEstadoSala();else await obtenerSalas()}catch(error){console.warn(error.message)}}
async function obtenerSalas(){
  const data=await api('/salas',{headers:cabeceras()})
  if(data.salaActual&&!salaActual){const sala=data.salas.find((s)=>s.id===data.salaActual);if(sala)entrarSala(sala)}
  renderSalas(data.salas)
}
function renderSalas(salas){
  const contenedor=$('contenedor-salas');contenedor.innerHTML=''
  salas.forEach((sala)=>{const card=document.createElement('article');card.className='room-card';const accion=sala.disponible?'Crear sala':sala.solicitudPendiente?'Esperando aprobación':'Solicitar acceso';card.innerHTML=`<img src="${sala.mapa}" alt=""><div class="room-card-content"><span class="room-state ${sala.disponible?'':'busy'}">${sala.disponible?'Arena disponible':`Sala de ${sala.creador}`}</span><h2>${sala.nombre}</h2><p>${sala.descripcion}</p><div class="room-meta"><span>${sala.jugadores}/${sala.capacidad} jugadores</span><button class="room-action" ${sala.solicitudPendiente?'disabled':''}>${accion}</button></div></div>`
    card.querySelector('button').addEventListener('click',()=>sala.disponible?crearSala(sala.id):solicitarSala(sala.id));contenedor.appendChild(card)
  })
}
async function crearSala(id){try{const data=await api(`/salas/${id}/crear`,{method:'POST',headers:cabeceras()});entrarSala(data.sala)}catch(e){$('estado-lobby').textContent=e.message;await obtenerSalas()}}
async function solicitarSala(id){try{await api(`/salas/${id}/solicitar`,{method:'POST',headers:cabeceras()});$('estado-lobby').textContent='Solicitud enviada. Esperando la aprobación del anfitrión…';await obtenerSalas()}catch(e){$('estado-lobby').textContent=e.message}}
function entrarSala(sala){
  salaActual=sala;mapaBackground.src=sala.mapa;$('nombre-sala-actual').textContent=sala.nombre;$('titulo-arena').textContent=sala.nombre;$('rol-sala').textContent=sala.soyCreador?'Anfitrión':'Participante';$('room-dock').hidden=false;mostrarSolo('guardian');actualizarEstadoSala()
}
async function salirSala(){if(!salaActual)return;const mensaje=salaActual.soyCreador?'Al salir cerrarás la sala para todos. ¿Continuar?':'¿Salir de esta sala?';if(!confirm(mensaje))return;await api(`/salas/${salaActual.id}/salir`,{method:'DELETE',headers:cabeceras()});detenerIntervalosJuego();salaActual=null;$('room-dock').hidden=true;mostrarSolo('lobby');await obtenerSalas()}

async function actualizarEstadoSala(){
  if(!salaActual)return;const estado=await api(`/salas/${salaActual.id}/estado`,{headers:cabeceras()})
  if(!estado.soyMiembro){detenerIntervalosJuego();salaActual=null;$('room-dock').hidden=true;mostrarSolo('lobby');$('estado-lobby').textContent='La sala fue cerrada por el anfitrión.';await obtenerSalas();return}
  salaActual={...salaActual,...estado};$('rol-sala').textContent=estado.soyCreador?'Anfitrión':'Participante';renderMiembros(estado.miembros);renderSolicitudes(estado.solicitudes);renderChat(estado.mensajes)
  if(estado.estadoJuego==='batalla'&&estado.duelo&&!enemigoId) activarBatalla(estado.duelo)
}
function renderMiembros(miembros){$('miembros-sala').innerHTML=miembros.map((m)=>`<span class="member-chip">${m.nombre}${m.guardian?` · ${m.guardian}`:''}</span>`).join('')}
function renderSolicitudes(solicitudes){
  const contenedor=$('solicitudes-sala');contenedor.innerHTML='';solicitudes.forEach((s)=>{const item=document.createElement('span');item.className='request-item';item.append(document.createTextNode(`${s.nombre} quiere entrar`));const aceptar=document.createElement('button');aceptar.className='request-action';aceptar.textContent='Aceptar';aceptar.onclick=()=>responderSolicitud(s.id,true);const rechazar=document.createElement('button');rechazar.className='request-action reject';rechazar.textContent='×';rechazar.onclick=()=>responderSolicitud(s.id,false);item.append(aceptar,rechazar);contenedor.appendChild(item)})
}
async function responderSolicitud(id,aceptar){await api(`/salas/${salaActual.id}/solicitudes/responder`,{method:'POST',headers:cabeceras(true),body:JSON.stringify({jugadorId:id,aceptar})});await actualizarEstadoSala()}

function renderChat(mensajes){
  const contenedor=$('mensajes-chat'),debeBajar=contenedor.scrollHeight-contenedor.scrollTop-contenedor.clientHeight<60
  if(!mensajes.length){contenedor.innerHTML='<p class="chat-empty">Todavía no hay mensajes.<br>Saluda a los guardianes.</p>';ultimoMensajeId=null;return}
  if(ultimoMensajeId===mensajes.at(-1).id)return;contenedor.innerHTML='';mensajes.forEach((m)=>{const item=document.createElement('div');item.className=`chat-message ${m.jugadorId===jugadorId?'mine':''}`;const autor=document.createElement('strong');autor.textContent=m.nombre;const texto=document.createElement('p');texto.textContent=m.texto;item.append(autor,texto);contenedor.appendChild(item)});ultimoMensajeId=mensajes.at(-1).id;if(debeBajar)contenedor.scrollTop=contenedor.scrollHeight
}
async function enviarChat(event){event.preventDefault();const input=$('mensaje-chat'),texto=input.value.trim();if(!texto||!salaActual)return;input.value='';try{await api(`/salas/${salaActual.id}/chat`,{method:'POST',headers:cabeceras(true),body:JSON.stringify({texto})});await actualizarEstadoSala()}catch(e){alert(e.message)}}

function renderGuardianes(){
  const contenedor=$('contenedorTarjetas');contenedor.innerHTML='';mokepones.forEach((m)=>{contenedor.insertAdjacentHTML('beforeend',`<input type="radio" name="mascota" id="${m.nombre}" value="${m.nombre}"><label class="tarjeta-de-mokepon" for="${m.nombre}"><img src="${m.foto}" alt="Guardián ${m.nombre}"><span class="card-copy"><span class="card-element">${m.elemento}</span><span class="card-name">${m.nombre}</span><span class="card-lore">${m.leyenda}</span></span></label>`)})
}
async function seleccionarMascotaJugador(){
  const seleccionado=document.querySelector('input[name="mascota"]:checked');if(!seleccionado){alert('Elige un guardián');return}
  mascotaJugador=seleccionado.value;$('boton-mascota').disabled=true
  try{await api(`/mokepon/${encodeURIComponent(jugadorId)}`,{method:'POST',headers:cabeceras(true),body:JSON.stringify({mokepon:mascotaJugador})});$('mascota-jugador').textContent=mascotaJugador;$('nombre-combate-jugador').textContent=nombreJugador;mostrarAtaques(obtenerObjetoMascota().ataques);mostrarSolo('mapa');iniciarMapa();await actualizarEstadoSala()}catch(e){alert(e.message);$('boton-mascota').disabled=false}
}
function mostrarAtaques(ataques){const nombres={FUEGO:'Fuego',AGUA:'Agua',TIERRA:'Tierra'};$('contenedorAtaques').innerHTML=ataques.map((a)=>`<button class="boton-de-ataque BAtaque" data-ataque="${a.tipo}"><span class="attack-icon">${a.icono}</span><span class="attack-name">${nombres[a.tipo]}</span></button>`).join('');botones=[...document.querySelectorAll('.BAtaque')]}

function iniciarMapa(){
  mascotaJugadorObjeto=obtenerObjetoMascota();mascotaJugadorObjeto.x=aleatorio(20,Math.max(20,anchoMapa-mascotaJugadorObjeto.ancho-20));mascotaJugadorObjeto.y=aleatorio(20,Math.max(20,altoMapa-mascotaJugadorObjeto.alto-20));desafioEnCurso=false
  clearInterval(intervaloMapa);intervaloMapa=setInterval(pintarCanvas,50);window.addEventListener('keydown',teclaPresionada);window.addEventListener('keyup',detenerMovimiento)
}
function pintarCanvas(){
  mascotaJugadorObjeto.x=Math.max(0,Math.min(anchoMapa-mascotaJugadorObjeto.ancho,mascotaJugadorObjeto.x+mascotaJugadorObjeto.velocidadX));mascotaJugadorObjeto.y=Math.max(0,Math.min(altoMapa-mascotaJugadorObjeto.alto,mascotaJugadorObjeto.y+mascotaJugadorObjeto.velocidadY))
  lienzo.clearRect(0,0,anchoMapa,altoMapa);lienzo.drawImage(mapaBackground,0,0,anchoMapa,altoMapa);mascotaJugadorObjeto.pintar();enviarPosicion()
  mokeponesEnemigos.forEach((m)=>{m.pintar();revisarColision(m)})
}
async function enviarPosicion(){
  const xNormalizada=mascotaJugadorObjeto.x/Math.max(1,anchoMapa-mascotaJugadorObjeto.ancho)*1000
  const yNormalizada=mascotaJugadorObjeto.y/Math.max(1,altoMapa-mascotaJugadorObjeto.alto)*1000
  try{const data=await api(`/mokepon/${encodeURIComponent(jugadorId)}/posicion`,{method:'POST',headers:cabeceras(true),body:JSON.stringify({x:xNormalizada,y:yNormalizada})});mokeponesEnemigos=data.enemigos.map((e)=>{const base=mokepones.find((m)=>m.nombre===e.mokepon.nombre);if(!base)return null;const rival=new Mokepon(base.nombre,base.foto,base.elemento,base.leyenda,e.id,e.nombreJugador);rival.x=e.x/1000*Math.max(1,anchoMapa-rival.ancho);rival.y=e.y/1000*Math.max(1,altoMapa-rival.alto);return rival}).filter(Boolean)}catch(e){console.warn(e.message)}
}
function mover(dx,dy){if(!mascotaJugadorObjeto)return;mascotaJugadorObjeto.velocidadX=dx;mascotaJugadorObjeto.velocidadY=dy}
function detenerMovimiento(){if(mascotaJugadorObjeto){mascotaJugadorObjeto.velocidadX=0;mascotaJugadorObjeto.velocidadY=0}}
function configurarBoton(boton,dx,dy){boton.addEventListener('pointerdown',()=>mover(dx,dy));['pointerup','pointercancel','pointerleave'].forEach((evento)=>boton.addEventListener(evento,detenerMovimiento))}
function configurarControlesMapa(){configurarBoton($('boton-arriba'),0,-6);configurarBoton($('boton-abajo'),0,6);configurarBoton($('boton-izquierda'),-6,0);configurarBoton($('boton-derecha'),6,0)}
function teclaPresionada(e){const movimientos={ArrowUp:[0,-6],ArrowDown:[0,6],ArrowLeft:[-6,0],ArrowRight:[6,0]};if(movimientos[e.key]){e.preventDefault();mover(...movimientos[e.key])}}
function obtenerObjetoMascota(){return mokepones.find((m)=>m.nombre===mascotaJugador)}
function aleatorio(min,max){return Math.floor(Math.random()*(max-min+1)+min)}

function revisarColision(enemigo){if(desafioEnCurso)return;const separado=mascotaJugadorObjeto.y+mascotaJugadorObjeto.alto<enemigo.y||mascotaJugadorObjeto.y>enemigo.y+enemigo.alto||mascotaJugadorObjeto.x+mascotaJugadorObjeto.ancho<enemigo.x||mascotaJugadorObjeto.x>enemigo.x+enemigo.ancho;if(!separado)iniciarDesafio(enemigo)}
async function iniciarDesafio(enemigo){
  desafioEnCurso=true;detenerMovimiento()
  try{await api(`/mokepon/${encodeURIComponent(jugadorId)}/desafio`,{method:'POST',headers:cabeceras(true),body:JSON.stringify({enemigoId:enemigo.id})});activarBatalla({enemigoId:enemigo.id,nombreJugador:enemigo.nombreJugador,guardian:enemigo.nombre})}
  catch(e){desafioEnCurso=false;mascotaJugadorObjeto.x=Math.max(0,mascotaJugadorObjeto.x-20)}
}
function activarBatalla(duelo){
  if(enemigoId||!duelo?.enemigoId||!duelo.guardian)return
  clearInterval(intervaloMapa);detenerMovimiento();desafioEnCurso=true;enemigoId=duelo.enemigoId
  $('mascota-enemigo').textContent=duelo.guardian;$('nombre-combate-enemigo').textContent=duelo.nombreJugador||'Rival'
  ataqueJugador=[];ataqueEnemigo=[];mostrarAtaques(obtenerObjetoMascota().ataques);mostrarSolo('batalla');secuenciaAtaque()
}
function secuenciaAtaque(){botones.forEach((boton)=>boton.onclick=()=>{ataqueJugador.push(boton.dataset.ataque);boton.disabled=true;if(ataqueJugador.length===5)enviarAtaques()})}
async function enviarAtaques(){try{await api(`/mokepon/${encodeURIComponent(jugadorId)}/ataques`,{method:'POST',headers:cabeceras(true),body:JSON.stringify({ataques:ataqueJugador})});intervaloAtaques=setInterval(obtenerAtaques,500)}catch(e){alert(e.message)}}
async function obtenerAtaques(){try{const data=await api(`/mokepon/${encodeURIComponent(enemigoId)}/ataques`,{headers:cabeceras()});if(data.ataques.length===5){clearInterval(intervaloAtaques);ataqueEnemigo=data.ataques;combate()}}catch(e){console.warn(e.message)}}
function combate(){for(let i=0;i<5;i++){indexAtaqueJugador=ataqueJugador[i];indexAtaqueEnemigo=ataqueEnemigo[i];if(indexAtaqueJugador===indexAtaqueEnemigo)crearMensaje('EMPATE');else if((indexAtaqueJugador==='FUEGO'&&indexAtaqueEnemigo==='TIERRA')||(indexAtaqueJugador==='AGUA'&&indexAtaqueEnemigo==='FUEGO')||(indexAtaqueJugador==='TIERRA'&&indexAtaqueEnemigo==='AGUA')){victoriasJugador++;crearMensaje('GANASTE')}else{victoriasEnemigo++;crearMensaje('PERDISTE')}}$('vidas-jugador').textContent=victoriasJugador;$('vidas-enemigo').textContent=victoriasEnemigo;const final=victoriasJugador===victoriasEnemigo?'El duelo terminó en empate':victoriasJugador>victoriasEnemigo?'¡La victoria es tuya!':'Tu rival ganó esta vez';$('resultado').textContent=final;$('reiniciar').hidden=false}
function crearMensaje(resultado){$('resultado').textContent=resultado;const propio=document.createElement('p'),rival=document.createElement('p');propio.dataset.attack=indexAtaqueJugador;rival.dataset.attack=indexAtaqueEnemigo;$('ataques-del-jugador').appendChild(propio);$('ataques-del-enemigo').appendChild(rival)}
async function volverArena(){try{await api(`/mokepon/${encodeURIComponent(jugadorId)}/finalizar`,{method:'POST',headers:cabeceras()});await actualizarPerfil()}catch{}ataqueJugador=[];ataqueEnemigo=[];victoriasJugador=0;victoriasEnemigo=0;enemigoId=null;desafioEnCurso=false;$('vidas-jugador').textContent='0';$('vidas-enemigo').textContent='0';$('ataques-del-jugador').innerHTML='';$('ataques-del-enemigo').innerHTML='';$('resultado').textContent='Elige tu secuencia';$('reiniciar').hidden=true;mostrarAtaques(obtenerObjetoMascota().ataques);mostrarSolo('mapa');iniciarMapa()}
function detenerIntervalosJuego(){clearInterval(intervaloMapa);clearInterval(intervaloAtaques);mokeponesEnemigos=[];mascotaJugadorObjeto=null}

window.addEventListener('load',iniciarJuego)
