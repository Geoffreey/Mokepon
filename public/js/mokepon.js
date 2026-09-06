const $ = (id) => document.getElementById(id)
const sections = { registro:$('registro-jugador'), activacion:$('activar-cuenta'), recuperacion:$('recuperar-cuenta'), modos:$('seleccionar-modo'), misiones:$('seleccionar-mision'), lobby:$('seleccionar-sala'), guardian:$('seleccionar-mascota'), mapa:$('ver-mapa'), batalla:$('seleccionar-ataque') }
const mapa=$('mapa'), lienzo=mapa.getContext('2d'), dpr=Math.min(window.devicePixelRatio||1,2)
const anchoMapa=Math.min(Math.max(window.innerWidth-64,240),800), altoMapa=anchoMapa*0.75
mapa.width=Math.round(anchoMapa*dpr); mapa.height=Math.round(altoMapa*dpr); lienzo.setTransform(dpr,0,0,dpr,0,0)
const mapaBackground=new Image()

let jugadorId=null, jugadorToken=null, authToken=localStorage.getItem('mokeponAuthToken'), nombreJugador='', salaActual=null, enemigoId=null, modoAuth='login'
let captchaWidgetId=null,captchaRecuperacionId=null,captchaActivo=false,captchaSiteKey='',usuarioPendiente='',reenvioToken=''
let mokepones=[], mokeponesEnemigos=[], mascotaJugador='', mascotaJugadorObjeto=null
let ataqueJugador=[], ataqueEnemigo=[], botones=[], indexAtaqueJugador='', indexAtaqueEnemigo=''
let victoriasJugador=0, victoriasEnemigo=0, intervaloMapa=null, intervaloSala=null, intervaloAtaques=null
let sesionInvalida=false, desafioEnCurso=false, ultimoMensajeId=null
let modoJuego='pvp',misionActual=null,progresoAventura=null,estadisticasJugador=null
let direccionEnemigoLocal={x:2,y:1},cambioDireccionLocal=0
let skinJugador='clasico'

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
const ataquesCadejo=[{icono:'🔥',tipo:'FUEGO',nombre:'Llama del camino'},{icono:'🔥',tipo:'FUEGO',nombre:'Brasa nocturna'},{icono:'🌿',tipo:'TIERRA',nombre:'Huella de ceniza'},{icono:'🌿',tipo:'TIERRA',nombre:'Manto de obsidiana'},{icono:'💧',tipo:'AGUA',nombre:'Rocío lunar'}]
const ataquesTzikin=[{icono:'💧',tipo:'AGUA',nombre:'Lluvia de plumas'},{icono:'💧',tipo:'AGUA',nombre:'Ojo de tormenta'},{icono:'🔥',tipo:'FUEGO',nombre:'Ala solar'},{icono:'🔥',tipo:'FUEGO',nombre:'Destello celeste'},{icono:'🌿',tipo:'TIERRA',nombre:'Raíz del cielo'}]
const ataquesSipak=[{icono:'🌿',tipo:'TIERRA',nombre:'Placa tectónica'},{icono:'🌿',tipo:'TIERRA',nombre:'Embate de ceiba'},{icono:'💧',tipo:'AGUA',nombre:'Marea antigua'},{icono:'💧',tipo:'AGUA',nombre:'Escama de río'},{icono:'🔥',tipo:'FUEGO',nombre:'Aliento volcánico'}]
const ataquesBatz=[{icono:'🌿',tipo:'TIERRA',nombre:'Salto de ceiba'},{icono:'🌿',tipo:'TIERRA',nombre:'Liana ancestral'},{icono:'🔥',tipo:'FUEGO',nombre:'Fruto solar'},{icono:'🔥',tipo:'FUEGO',nombre:'Chispa creadora'},{icono:'💧',tipo:'AGUA',nombre:'Lluvia del dosel'}]
const ataquesTacuatzin=[{icono:'💧',tipo:'AGUA',nombre:'Luna protectora'},{icono:'💧',tipo:'AGUA',nombre:'Río nocturno'},{icono:'🌿',tipo:'TIERRA',nombre:'Semilla oculta'},{icono:'🌿',tipo:'TIERRA',nombre:'Paso de montaña'},{icono:'🔥',tipo:'FUEGO',nombre:'Fuego del marsupio'}]
const balam=new Mokepon("B'alam",'./assets/balam.png','Fuego · Jaguar de obsidiana','Corazón del volcán')
const iq=new Mokepon("Iq'",'./assets/iq.png','Agua · Quetzal de la lluvia','Aliento de las nubes')
const kabrak=new Mokepon('Kabrak','./assets/kabrak.png','Tierra · Guardián del maíz','Fuerza de la montaña')
const cadejo=new Mokepon('Cadejo','./assets/cadejo.png','Fuego · Protector de los caminos','Llama entre la noche')
const tzikin=new Mokepon("Tz'ikin",'./assets/tzikin.png','Agua · Ave de la tormenta','Mirada sobre las nubes')
const sipak=new Mokepon('Sipak','./assets/sipak.png','Tierra · Guardián del río','Memoria de piedra y maíz')
const batz=new Mokepon("B'atz",'./assets/batz.png','Tierra · Mono araña del dosel','Tejedor de caminos y destinos')
const tacuatzin=new Mokepon('Tacuatzin','./assets/tacuatzin.png','Fuego · Guardián nocturno','Portador del fuego ancestral')
batz.premium={victorias:10,puntos:500};tacuatzin.premium={victorias:25,puntos:1200}
balam.ataques=ataquesFuego;iq.ataques=ataquesAgua;kabrak.ataques=ataquesTierra;cadejo.ataques=ataquesCadejo;tzikin.ataques=ataquesTzikin;sipak.ataques=ataquesSipak;batz.ataques=ataquesBatz;tacuatzin.ataques=ataquesTacuatzin;mokepones=[balam,iq,kabrak,cadejo,tzikin,sipak,batz,tacuatzin]

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
  $('boton-reiniciar').addEventListener('click',volverArena);$('boton-abandonar-batalla').addEventListener('click',abandonarBatallaLocal);$('boton-salir-sala').addEventListener('click',salirSala);$('form-chat').addEventListener('submit',enviarChat)
  $('tab-login').onclick=()=>cambiarModoAuth('login');$('tab-registro').onclick=()=>cambiarModoAuth('registro');$('boton-cerrar-sesion').onclick=cerrarSesion;$('boton-olvide-clave').onclick=mostrarRecuperacion;$('boton-volver-login').onclick=()=>{mostrarSolo('registro');reiniciarCaptcha()};$('form-recuperacion').onsubmit=solicitarRestablecimiento
  $('form-activacion').addEventListener('submit',activarCuenta);$('boton-reenviar').onclick=reenviarCodigo;await configurarCaptcha()
  document.querySelectorAll('[data-mode]').forEach((boton)=>boton.onclick=()=>seleccionarModo(boton.dataset.mode));$('volver-modos-lobby').onclick=mostrarModos;$('volver-modos-misiones').onclick=mostrarModos;$('volver-modos-guardian').onclick=volverDesdeGuardian
  if(authToken){try{const perfil=await api('/auth/perfil',{headers:{Authorization:`Bearer ${authToken}`}});await iniciarJugador(perfil)}catch{localStorage.removeItem('mokeponAuthToken');authToken=null}}
}

async function registrarJugador(event){
  event.preventDefault();const boton=$('boton-auth');boton.disabled=true;$('error-registro').textContent=''
  const body={usuario:$('usuario').value.trim(),clave:$('clave').value,captchaToken:obtenerCaptcha()};if(modoAuth==='registro'){body.nombre=$('nombre-jugador').value.trim();body.correo=$('correo').value.trim()}
  try{const data=await api(`/auth/${modoAuth}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(data.requiereActivacion){mostrarActivacion(body.usuario,data.correoEnmascarado,data.reenvioToken);return}authToken=data.token;localStorage.setItem('mokeponAuthToken',authToken);await iniciarJugador(data)}
  catch(error){if(error.data?.requiereActivacion)mostrarActivacion(body.usuario,null,error.data.reenvioToken);else $('error-registro').textContent=error.message;boton.disabled=false;reiniciarCaptcha()}
}
function cambiarModoAuth(modo){modoAuth=modo;const registro=modo==='registro';$('campos-registro').hidden=!registro;$('nombre-jugador').required=registro;$('correo').required=registro;$('boton-olvide-clave').hidden=registro;$('clave').autocomplete=registro?'new-password':'current-password';$('tab-login').classList.toggle('active',!registro);$('tab-registro').classList.toggle('active',registro);$('boton-auth').firstChild.textContent=registro?'Crear cuenta ':'Entrar al mundo ';$('error-registro').textContent='';reiniciarCaptcha()}
async function configurarCaptcha(){try{const config=await api('/auth/config');captchaActivo=config.captchaActivo;captchaSiteKey=config.recaptchaSiteKey;if(!captchaActivo){$('captcha-aviso').textContent=config.modoDesarrollo?'reCAPTCHA en modo local: configura las claves para probar la protección real.':'reCAPTCHA no está disponible.';$('captcha-aviso-recuperacion').textContent=$('captcha-aviso').textContent;return}$('captcha-aviso').textContent='Cargando verificación…';window.onRecaptchaReady=()=>{try{captchaWidgetId=window.grecaptcha.render('captcha-container',{sitekey:captchaSiteKey,theme:'dark'});$('captcha-aviso').textContent=''}catch{$('captcha-aviso').textContent='No se pudo mostrar reCAPTCHA. Recarga la página o desactiva el bloqueador para este sitio.'}};const script=document.createElement('script');script.src='https://www.google.com/recaptcha/api.js?onload=onRecaptchaReady&render=explicit&hl=es-419';script.async=true;script.defer=true;script.onerror=()=>{$('captcha-aviso').textContent='Google reCAPTCHA fue bloqueado. Desactiva el bloqueador para este sitio y recarga.'};document.head.appendChild(script)}catch{$('captcha-aviso').textContent='No se pudo cargar reCAPTCHA.'}}
function obtenerCaptcha(){return captchaActivo&&window.grecaptcha&&captchaWidgetId!==null?window.grecaptcha.getResponse(captchaWidgetId):'desarrollo-local'}
function reiniciarCaptcha(){if(captchaActivo&&window.grecaptcha&&captchaWidgetId!==null)window.grecaptcha.reset(captchaWidgetId)}
function mostrarRecuperacion(){mostrarSolo('recuperacion');$('mensaje-recuperacion').textContent='';$('error-recuperacion').textContent='';if(captchaActivo&&window.grecaptcha&&captchaRecuperacionId===null){captchaRecuperacionId=window.grecaptcha.render('captcha-recuperacion',{sitekey:captchaSiteKey,theme:'dark'});$('captcha-aviso-recuperacion').textContent=''}}
async function solicitarRestablecimiento(event){event.preventDefault();const formulario=event.currentTarget,boton=formulario.querySelector('.primary-button');boton.disabled=true;$('error-recuperacion').textContent='';$('mensaje-recuperacion').textContent='';const captchaToken=captchaActivo&&window.grecaptcha&&captchaRecuperacionId!==null?window.grecaptcha.getResponse(captchaRecuperacionId):'desarrollo-local';try{const data=await api('/auth/solicitar-restablecimiento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({correo:$('correo-recuperacion').value.trim(),captchaToken})});$('mensaje-recuperacion').textContent=data.mensaje;formulario.reset()}catch(error){$('error-recuperacion').textContent=error.message}finally{boton.disabled=false;if(captchaActivo&&window.grecaptcha&&captchaRecuperacionId!==null)window.grecaptcha.reset(captchaRecuperacionId)}}
function mostrarActivacion(usuario,correo,token){usuarioPendiente=usuario;reenvioToken=token||'';$('mensaje-activacion').textContent=correo?`Enviamos un código de seis dígitos a ${correo}. Expira en 15 minutos.`:'Ingresa el código enviado a tu correo o solicita uno nuevo.';$('boton-auth').disabled=false;mostrarSolo('activacion')}
async function activarCuenta(event){event.preventDefault();const boton=event.currentTarget.querySelector('.primary-button');boton.disabled=true;$('error-activacion').textContent='';try{const data=await api('/auth/activar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuario:usuarioPendiente,codigo:$('codigo-activacion').value.trim()})});authToken=data.token;localStorage.setItem('mokeponAuthToken',authToken);await iniciarJugador(data)}catch(error){$('error-activacion').textContent=error.message;boton.disabled=false}}
async function reenviarCodigo(){const boton=$('boton-reenviar');boton.disabled=true;$('error-activacion').textContent='';try{const data=await api('/auth/reenviar-codigo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuario:usuarioPendiente,reenvioToken})});if(data.reenvioToken)reenvioToken=data.reenvioToken;$('error-activacion').textContent=data.mensaje}catch(error){$('error-activacion').textContent=error.message}finally{boton.disabled=false}}
async function iniciarJugador(perfil){const data=await api('/unirse',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${authToken}`},body:'{}'});jugadorId=data.id;jugadorToken=data.token;nombreJugador=data.nombre;$('jugador-badge').textContent=`● ${nombreJugador}`;$('jugador-badge').hidden=false;$('boton-cerrar-sesion').hidden=false;renderPerfil(perfil.estadisticas||data.estadisticas);$('modo-nivel').textContent=`Nivel ${perfil.estadisticas?.nivel||data.estadisticas?.nivel||1}`;await cargarProgreso();mostrarModos()}
function renderPerfil(stats){if(!stats)return;estadisticasJugador=stats;$('perfil-nivel').textContent=`Nivel ${stats.nivel}`;$('perfil-puntos').textContent=stats.puntos;$('perfil-batallas').textContent=stats.batallas;$('perfil-victorias').textContent=stats.victorias;const log=$('perfil-historial');log.innerHTML=stats.historial.length?stats.historial.slice(0,4).map((b)=>`<span class="battle-entry ${b.resultado==='victoria'?'win':b.resultado==='derrota'?'loss':''}">${b.resultado} · ${b.oponente}</span>`).join(''):'<span class="battle-entry">Aún no hay batallas</span>'}
async function actualizarPerfil(){if(!authToken)return;try{const perfil=await api('/auth/perfil',{headers:{Authorization:`Bearer ${authToken}`}});renderPerfil(perfil.estadisticas)}catch{}}
async function cerrarSesion(){try{await api('/auth/logout',{method:'POST',headers:{Authorization:`Bearer ${authToken}`}})}catch{}localStorage.removeItem('mokeponAuthToken');location.reload()}

async function cargarProgreso(){progresoAventura=await api('/aventura/progreso',{headers:{Authorization:`Bearer ${authToken}`}});$('cartera-jade').textContent=progresoAventura.wallet.jade;$('cartera-obsidiana').textContent=progresoAventura.wallet.obsidian;$('cartera-oro').textContent=progresoAventura.wallet.gold}
function mostrarModos(){detenerIntervalosJuego();clearInterval(intervaloSala);modoJuego='pvp';misionActual=null;$('room-dock').hidden=true;mostrarSolo('modos')}
async function seleccionarModo(modo){modoJuego=modo;if(modo==='pvp'){mostrarSolo('lobby');await obtenerSalas();clearInterval(intervaloSala);intervaloSala=setInterval(actualizarMultijugador,1500);return}if(modo==='misiones'){await cargarProgreso();renderMisiones();mostrarSolo('misiones');return}prepararGuardian()}
function prepararGuardian(){renderGuardianes();$('boton-mascota').disabled=false;$('boton-mascota').querySelector('span').textContent=modoJuego==='pvp'?'Entrar a la arena':modoJuego==='mision'?'Comenzar misión':'Iniciar entrenamiento';$('subtitulo-guardian').textContent=modoJuego==='pvp'?'Forma un vínculo y entra a la arena con los jugadores de tu sala.':modoJuego==='mision'?`Elige quién te acompañará en “${misionActual.name}”.`:'Elige un guardián para entrenar contra la máquina.';$('volver-modos-guardian').hidden=modoJuego==='pvp'&&Boolean(salaActual);mostrarSolo('guardian')}
function volverDesdeGuardian(){if(salaActual){salirSala();return}if(modoJuego==='mision'){mostrarSolo('misiones');return}mostrarModos()}
function iconoMoneda(tipo,cantidad){const nombres={jade:'Jade',obsidian:'Obsidiana',gold:'Oro'};return `<span class="currency-item"><img src="./assets/currency-${tipo}.png" alt="${nombres[tipo]}"><b>${cantidad}</b><small>${nombres[tipo]}</small></span>`}
function recompensaVisual(reward){return `${iconoMoneda('jade',reward.jade)}${iconoMoneda('obsidian',reward.obsidian)}${iconoMoneda('gold',reward.gold)}`}
function renderMisiones(){const contenedor=$('contenedor-misiones');contenedor.innerHTML='';progresoAventura.missions.forEach((mision)=>{const boton=document.createElement('button');boton.className='mission-card';boton.disabled=!mision.unlocked;const reward=mision.reward;boton.innerHTML=`<span class="mission-status">${mision.completed?'✓ Completada':mision.unlocked?'Disponible':'🔒 Bloqueada'}</span><strong>${mision.name}</strong><p>${mision.description}</p><span class="mission-reward">${recompensaVisual(reward)}</span>`;boton.onclick=()=>{modoJuego='mision';misionActual=mision;prepararGuardian()};contenedor.appendChild(boton)})}

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
  salaActual=sala;mapaBackground.src=sala.mapa;$('nombre-sala-actual').textContent=sala.nombre;$('titulo-arena').textContent=sala.nombre;$('rol-sala').textContent=sala.soyCreador?'Anfitrión':'Participante';$('panel-chat').hidden=false;document.querySelector('.map-hint').textContent='Acércate a otro guardián para iniciar un duelo.';$('room-dock').hidden=false;mostrarSolo('guardian');actualizarEstadoSala()
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
  const contenedor=$('contenedorTarjetas');contenedor.innerHTML='';$('selector-skins').hidden=true;mokepones.forEach((m)=>{const desbloqueado=guardianDisponible(m),victorias=Math.min(estadisticasJugador?.victorias||0,m.premium?.victorias||0),puntos=Math.min(estadisticasJugador?.puntos||0,m.premium?.puntos||0),premium=m.premium?`<span class="premium-badge">${desbloqueado?'✦ Premium desbloqueado':'◆ Premium bloqueado'}</span><span class="premium-progress">${victorias}/${m.premium.victorias} victorias · ${puntos}/${m.premium.puntos} puntos</span>`:'';contenedor.insertAdjacentHTML('beforeend',`<input type="radio" name="mascota" id="${m.nombre}" value="${m.nombre}" ${desbloqueado?'':'disabled'}><label class="tarjeta-de-mokepon ${m.premium?'premium-card':''} ${desbloqueado?'':'locked'}" for="${m.nombre}" aria-disabled="${!desbloqueado}"><img src="${m.foto}" alt="Guardián ${m.nombre}"><span class="card-copy">${premium}<span class="card-element">${m.elemento}</span><span class="card-name">${m.nombre}</span><span class="card-lore">${m.leyenda}</span></span></label>`)});document.querySelectorAll('input[name="mascota"]:not(:disabled)').forEach((input)=>input.addEventListener('change',()=>renderSkins(input.value)))
}
function guardianDisponible(mokepon){if(!mokepon.premium)return true;const estado=progresoAventura?.guardianesPremium?.find((item)=>item.nombre===mokepon.nombre);if(estado)return estado.desbloqueado;return Boolean(estadisticasJugador&&estadisticasJugador.victorias>=mokepon.premium.victorias&&estadisticasJugador.puntos>=mokepon.premium.puntos)}
function fotoGuardian(nombre,skin='clasico'){if(nombre==="B'alam"&&skin==='balam-nocturno')return './assets/balam-nocturno.png';return mokepones.find((m)=>m.nombre===nombre)?.foto||'./assets/balam.png'}
function renderSkins(guardian){const skins=[{id:'clasico',nombre:'Clásico',foto:fotoGuardian(guardian)}],desbloqueos=progresoAventura?.unlocks||[];if(guardian==="B'alam"&&desbloqueos.some((u)=>u.type==='skin'&&u.id==='balam-nocturno'))skins.push({id:'balam-nocturno',nombre:"B'alam Nocturno",foto:'./assets/balam-nocturno.png'});skinJugador='clasico';$('contenedor-skins').innerHTML=skins.map((skin,i)=>`<span class="skin-option"><input type="radio" name="skin" id="skin-${skin.id}" value="${skin.id}" ${i===0?'checked':''}><label for="skin-${skin.id}"><img src="${skin.foto}" alt="Skin ${skin.nombre}"><span><b>${skin.nombre}</b><small>${skin.id==='clasico'?'Disponible':'Desbloqueado'}</small></span></label></span>`).join('');document.querySelectorAll('input[name="skin"]').forEach((input)=>input.addEventListener('change',()=>{skinJugador=input.value}));$('selector-skins').hidden=false}
async function seleccionarMascotaJugador(){
  const seleccionado=document.querySelector('input[name="mascota"]:checked');if(!seleccionado){alert('Elige un guardián');return}
  const guardianElegido=mokepones.find((m)=>m.nombre===seleccionado.value);if(!guardianDisponible(guardianElegido)){alert('Este guardián premium todavía está bloqueado.');renderGuardianes();return}
  mascotaJugador=seleccionado.value;skinJugador=document.querySelector('input[name="skin"]:checked')?.value||'clasico';$('boton-mascota').disabled=true
  try{$('mascota-jugador').textContent=mascotaJugador;$('imagen-combate-jugador').src=fotoGuardian(mascotaJugador,skinJugador);$('imagen-combate-jugador').alt=`${mascotaJugador}, skin ${skinJugador}`;$('nombre-combate-jugador').textContent=nombreJugador;mostrarAtaques(obtenerObjetoMascota().ataques);if(modoJuego!=='pvp'){prepararMapaLocal();return}await api(`/mokepon/${encodeURIComponent(jugadorId)}`,{method:'POST',headers:cabeceras(true),body:JSON.stringify({mokepon:mascotaJugador,skin:skinJugador})});mostrarSolo('mapa');iniciarMapa();await actualizarEstadoSala()}catch(e){alert(e.message);$('boton-mascota').disabled=false}
}
function mostrarAtaques(ataques){const nombres={FUEGO:'Fuego',AGUA:'Agua',TIERRA:'Tierra'};$('contenedorAtaques').innerHTML=ataques.map((a)=>`<button class="boton-de-ataque BAtaque" data-ataque="${a.tipo}" title="${a.nombre||nombres[a.tipo]}"><span class="attack-icon">${a.icono}</span><span class="attack-name">${a.nombre||nombres[a.tipo]}</span></button>`).join('');botones=[...document.querySelectorAll('.BAtaque')]}

function iniciarMapa(){
  mascotaJugadorObjeto=obtenerObjetoMascota();mascotaJugadorObjeto.mapaFoto.src=fotoGuardian(mascotaJugador,skinJugador);mascotaJugadorObjeto.x=aleatorio(20,Math.max(20,anchoMapa-mascotaJugadorObjeto.ancho-20));mascotaJugadorObjeto.y=aleatorio(20,Math.max(20,altoMapa-mascotaJugadorObjeto.alto-20));desafioEnCurso=false
  clearInterval(intervaloMapa);intervaloMapa=setInterval(pintarCanvas,50);window.addEventListener('keydown',teclaPresionada);window.addEventListener('keyup',detenerMovimiento)
}
function prepararMapaLocal(){
  const rivalesDisponibles=mokepones.filter((m)=>m.nombre!==mascotaJugador),nombreEnemigo=misionActual?.enemy||rivalesDisponibles[aleatorio(0,rivalesDisponibles.length-1)].nombre,base=mokepones.find((m)=>m.nombre===nombreEnemigo)
  const enemigo=new Mokepon(base.nombre,base.foto,base.elemento,base.leyenda,'maquina',modoJuego==='mision'?'Guardián de misión':'Máquina')
  enemigo.x=anchoMapa-enemigo.ancho-30;enemigo.y=altoMapa-enemigo.alto-30;mokeponesEnemigos=[enemigo];direccionEnemigoLocal={x:-2,y:-1};cambioDireccionLocal=Date.now()+1200
  mapaBackground.src=modoJuego==='mision'?(misionActual.id==='fuego-ancestral'?'./assets/arena-volcan.png':misionActual.id==='voz-lago'?'./assets/arena-lago.png':'./assets/mokemap.png'):'./assets/arena-cueva.png'
  $('titulo-arena').textContent=modoJuego==='mision'?misionActual.name:'Arena de entrenamiento';document.querySelector('.map-hint').textContent='Explora la arena y acércate al guardián para iniciar el combate.';$('panel-chat').hidden=true;$('room-dock').hidden=true;mostrarSolo('mapa');iniciarMapa()
}
function pintarCanvas(){
  mascotaJugadorObjeto.x=Math.max(0,Math.min(anchoMapa-mascotaJugadorObjeto.ancho,mascotaJugadorObjeto.x+mascotaJugadorObjeto.velocidadX));mascotaJugadorObjeto.y=Math.max(0,Math.min(altoMapa-mascotaJugadorObjeto.alto,mascotaJugadorObjeto.y+mascotaJugadorObjeto.velocidadY))
  lienzo.clearRect(0,0,anchoMapa,altoMapa);lienzo.drawImage(mapaBackground,0,0,anchoMapa,altoMapa);mascotaJugadorObjeto.pintar();if(modoJuego==='pvp')enviarPosicion();else moverEnemigoLocal()
  mokeponesEnemigos.forEach((m)=>{m.pintar();revisarColision(m)})
}
function moverEnemigoLocal(){const enemigo=mokeponesEnemigos[0];if(!enemigo)return;if(Date.now()>cambioDireccionLocal||enemigo.x<=0||enemigo.x>=anchoMapa-enemigo.ancho||enemigo.y<=0||enemigo.y>=altoMapa-enemigo.alto){direccionEnemigoLocal={x:aleatorio(-2,2),y:aleatorio(-2,2)};cambioDireccionLocal=Date.now()+aleatorio(900,1800)}enemigo.x=Math.max(0,Math.min(anchoMapa-enemigo.ancho,enemigo.x+direccionEnemigoLocal.x));enemigo.y=Math.max(0,Math.min(altoMapa-enemigo.alto,enemigo.y+direccionEnemigoLocal.y))}
async function enviarPosicion(){
  const xNormalizada=mascotaJugadorObjeto.x/Math.max(1,anchoMapa-mascotaJugadorObjeto.ancho)*1000
  const yNormalizada=mascotaJugadorObjeto.y/Math.max(1,altoMapa-mascotaJugadorObjeto.alto)*1000
  try{const data=await api(`/mokepon/${encodeURIComponent(jugadorId)}/posicion`,{method:'POST',headers:cabeceras(true),body:JSON.stringify({x:xNormalizada,y:yNormalizada})});mokeponesEnemigos=data.enemigos.map((e)=>{const base=mokepones.find((m)=>m.nombre===e.mokepon.nombre);if(!base)return null;const rival=new Mokepon(base.nombre,fotoGuardian(base.nombre,e.mokepon.skin),base.elemento,base.leyenda,e.id,e.nombreJugador);rival.skin=e.mokepon.skin||'clasico';rival.x=e.x/1000*Math.max(1,anchoMapa-rival.ancho);rival.y=e.y/1000*Math.max(1,altoMapa-rival.alto);return rival}).filter(Boolean)}catch(e){console.warn(e.message)}
}
function mover(dx,dy){if(!mascotaJugadorObjeto)return;mascotaJugadorObjeto.velocidadX=dx;mascotaJugadorObjeto.velocidadY=dy}
function detenerMovimiento(){if(mascotaJugadorObjeto){mascotaJugadorObjeto.velocidadX=0;mascotaJugadorObjeto.velocidadY=0}}
function configurarBoton(boton,dx,dy){boton.addEventListener('pointerdown',(evento)=>{evento.preventDefault();boton.setPointerCapture?.(evento.pointerId);mover(dx,dy)});['pointerup','pointercancel','pointerleave','lostpointercapture'].forEach((evento)=>boton.addEventListener(evento,detenerMovimiento));boton.addEventListener('contextmenu',(evento)=>evento.preventDefault())}
function configurarControlesMapa(){configurarBoton($('boton-arriba'),0,-6);configurarBoton($('boton-abajo'),0,6);configurarBoton($('boton-izquierda'),-6,0);configurarBoton($('boton-derecha'),6,0)}
function teclaPresionada(e){const movimientos={ArrowUp:[0,-6],ArrowDown:[0,6],ArrowLeft:[-6,0],ArrowRight:[6,0]};if(movimientos[e.key]){e.preventDefault();mover(...movimientos[e.key])}}
function obtenerObjetoMascota(){return mokepones.find((m)=>m.nombre===mascotaJugador)}
function aleatorio(min,max){return Math.floor(Math.random()*(max-min+1)+min)}

function revisarColision(enemigo){if(desafioEnCurso)return;const separado=mascotaJugadorObjeto.y+mascotaJugadorObjeto.alto<enemigo.y||mascotaJugadorObjeto.y>enemigo.y+enemigo.alto||mascotaJugadorObjeto.x+mascotaJugadorObjeto.ancho<enemigo.x||mascotaJugadorObjeto.x>enemigo.x+enemigo.ancho;if(!separado)iniciarDesafio(enemigo)}
async function iniciarDesafio(enemigo){
  desafioEnCurso=true;detenerMovimiento();if(modoJuego!=='pvp'){activarBatallaLocal(enemigo);return}
  try{await api(`/mokepon/${encodeURIComponent(jugadorId)}/desafio`,{method:'POST',headers:cabeceras(true),body:JSON.stringify({enemigoId:enemigo.id})});activarBatalla({enemigoId:enemigo.id,nombreJugador:enemigo.nombreJugador,guardian:enemigo.nombre,skin:enemigo.skin})}
  catch(e){desafioEnCurso=false;mascotaJugadorObjeto.x=Math.max(0,mascotaJugadorObjeto.x-20)}
}
function activarBatalla(duelo){
  if(enemigoId||!duelo?.enemigoId||!duelo.guardian)return
  clearInterval(intervaloMapa);detenerMovimiento();desafioEnCurso=true;enemigoId=duelo.enemigoId
  $('capitulo-batalla').textContent='Capítulo III · Duelo de sala';$('boton-abandonar-batalla').hidden=true;$('mascota-enemigo').textContent=duelo.guardian;$('imagen-combate-enemigo').src=fotoGuardian(duelo.guardian,duelo.skin);$('nombre-combate-enemigo').textContent=duelo.nombreJugador||'Rival'
  ataqueJugador=[];ataqueEnemigo=[];mostrarAtaques(obtenerObjetoMascota().ataques);mostrarSolo('batalla');secuenciaAtaque()
}
function activarBatallaLocal(enemigo=mokeponesEnemigos[0]){clearInterval(intervaloMapa);enemigoId='maquina';desafioEnCurso=true;$('capitulo-batalla').textContent=modoJuego==='mision'?'Crónica · Misión individual':'Entrenamiento · Contra la máquina';$('mascota-enemigo').textContent=enemigo?.nombre||misionActual?.enemy||'Guardián ancestral';$('imagen-combate-enemigo').src=fotoGuardian(enemigo?.nombre||misionActual?.enemy);$('nombre-combate-enemigo').textContent=modoJuego==='mision'?misionActual.name:'Máquina';$('boton-abandonar-batalla').hidden=false;ataqueJugador=[];ataqueEnemigo=[];victoriasJugador=0;victoriasEnemigo=0;mostrarAtaques(obtenerObjetoMascota().ataques);mostrarSolo('batalla');secuenciaAtaque()}
function secuenciaAtaque(){botones.forEach((boton)=>boton.onclick=()=>{ataqueJugador.push(boton.dataset.ataque);boton.disabled=true;if(ataqueJugador.length===5)enviarAtaques()})}
async function enviarAtaques(){try{if(modoJuego!=='pvp'){const data=await api('/aventura/combate',{method:'POST',headers:{Authorization:`Bearer ${authToken}`,'Content-Type':'application/json'},body:JSON.stringify({mode:modoJuego==='mision'?'mision':'maquina',missionId:misionActual?.id,guardian:mascotaJugador,enemy:mokeponesEnemigos[0]?.nombre,attacks:ataqueJugador})});ataqueEnemigo=data.enemyAttacks;$('mascota-enemigo').textContent=data.enemy;combate(data);return}await api(`/mokepon/${encodeURIComponent(jugadorId)}/ataques`,{method:'POST',headers:cabeceras(true),body:JSON.stringify({ataques:ataqueJugador})});intervaloAtaques=setInterval(obtenerAtaques,500)}catch(e){alert(e.message);botones.forEach((boton)=>boton.disabled=false);ataqueJugador=[]}}
async function obtenerAtaques(){try{const data=await api(`/mokepon/${encodeURIComponent(enemigoId)}/ataques`,{headers:cabeceras()});if(data.ataques.length===5){clearInterval(intervaloAtaques);ataqueEnemigo=data.ataques;combate()}}catch(e){console.warn(e.message)}}
function combate(datosServidor=null){for(let i=0;i<5;i++){indexAtaqueJugador=ataqueJugador[i];indexAtaqueEnemigo=ataqueEnemigo[i];if(indexAtaqueJugador===indexAtaqueEnemigo)crearMensaje('EMPATE');else if((indexAtaqueJugador==='FUEGO'&&indexAtaqueEnemigo==='TIERRA')||(indexAtaqueJugador==='AGUA'&&indexAtaqueEnemigo==='FUEGO')||(indexAtaqueJugador==='TIERRA'&&indexAtaqueEnemigo==='AGUA')){victoriasJugador++;crearMensaje('GANASTE')}else{victoriasEnemigo++;crearMensaje('PERDISTE')}}$('vidas-jugador').textContent=victoriasJugador;$('vidas-enemigo').textContent=victoriasEnemigo;let final=victoriasJugador===victoriasEnemigo?'El duelo terminó en empate':victoriasJugador>victoriasEnemigo?'¡La victoria es tuya!':'Tu rival ganó esta vez';if(datosServidor?.missionResult?.firstCompletion){const u=misionActual.unlock;$('resultado').innerHTML=`${final}<span class="battle-reward">${recompensaVisual(misionActual.reward)}</span><small>Desbloqueaste ${u.type}: ${u.id}.</small>`}else{$('resultado').textContent=datosServidor?.missionResult&&!datosServidor.missionResult.firstCompletion?`${final} Ya habías reclamado la recompensa de esta misión.`:final}$('reiniciar').hidden=false;$('boton-reiniciar').textContent=modoJuego==='pvp'?'Volver a la arena':modoJuego==='mision'?'Volver a misiones':'Entrenar otra vez'}
function crearMensaje(resultado){$('resultado').textContent=resultado;const propio=document.createElement('p'),rival=document.createElement('p');propio.dataset.attack=indexAtaqueJugador;rival.dataset.attack=indexAtaqueEnemigo;$('ataques-del-jugador').appendChild(propio);$('ataques-del-enemigo').appendChild(rival)}
function limpiarBatalla(){ataqueJugador=[];ataqueEnemigo=[];victoriasJugador=0;victoriasEnemigo=0;enemigoId=null;desafioEnCurso=false;$('vidas-jugador').textContent='0';$('vidas-enemigo').textContent='0';$('ataques-del-jugador').innerHTML='';$('ataques-del-enemigo').innerHTML='';$('resultado').textContent='Elige tu secuencia';$('reiniciar').hidden=true;$('boton-abandonar-batalla').hidden=true}
async function abandonarBatallaLocal(){if(modoJuego==='pvp')return;limpiarBatalla();if(modoJuego==='mision'){await cargarProgreso();renderMisiones();mostrarSolo('misiones');return}mostrarModos()}
async function volverArena(){if(modoJuego==='pvp'){try{await api(`/mokepon/${encodeURIComponent(jugadorId)}/finalizar`,{method:'POST',headers:cabeceras()});await actualizarPerfil()}catch{}}limpiarBatalla();if(modoJuego==='mision'){await cargarProgreso();renderMisiones();mostrarSolo('misiones');return}if(modoJuego==='maquina'){prepararMapaLocal();return}mostrarAtaques(obtenerObjetoMascota().ataques);mostrarSolo('mapa');iniciarMapa()}
function detenerIntervalosJuego(){clearInterval(intervaloMapa);clearInterval(intervaloAtaques);mokeponesEnemigos=[];mascotaJugadorObjeto=null}

window.addEventListener('load',iniciarJuego)
