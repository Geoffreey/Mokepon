const express = require("express")
const helmet = require("helmet")
const { rateLimit } = require("express-rate-limit")
const { randomUUID, randomInt } = require("crypto")
const { scryptSync, timingSafeEqual, createHash } = require("crypto")
const fs = require("fs")
const path = require("path")
const nodemailer = require("nodemailer")
const app = express()
const PORT = process.env.PORT || 8080
const esProduccion = process.env.NODE_ENV === "production"
const origenPublico = process.env.PUBLIC_ORIGIN ? new URL(process.env.PUBLIC_ORIGIN) : null

if (origenPublico && origenPublico.protocol !== "https:") {
  throw new Error("PUBLIC_ORIGIN debe utilizar HTTPS en producción.")
}
const DURACION_SESION_MS = 15 * 60 * 1000
const MOKEPONES_VALIDOS = new Set(["B'alam", "Iq'", "Kabrak"])
const ATAQUES_VALIDOS = new Set(["FUEGO", "AGUA", "TIERRA"])
const MAX_JUGADORES_SALA = 8
const jugadores = []
const RUTA_DATOS = process.env.DATA_FILE || path.join(__dirname, "data", "accounts.json")
const RUTA_AUDITORIA = process.env.AUDIT_FILE || path.join(__dirname, "data", "audit.jsonl")
const DURACION_LOGIN_MS = 30 * 24 * 60 * 60 * 1000
const DURACION_CODIGO_MS = 15 * 60 * 1000
const RECAPTCHA_SITE_KEY = process.env.RECAPTCHA_SITE_KEY || ""
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY || ""
const CAPTCHA_ACTIVO = Boolean(RECAPTCHA_SITE_KEY && RECAPTCHA_SECRET_KEY)
const SMTP_CONFIGURADO = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.EMAIL_FROM)
const transporteCorreo = SMTP_CONFIGURADO ? nodemailer.createTransport({
  host:process.env.SMTP_HOST,
  port:Number(process.env.SMTP_PORT || 465),
  secure:String(process.env.SMTP_SECURE ?? "true").toLowerCase() === "true",
  auth:{ user:process.env.SMTP_USER, pass:process.env.SMTP_PASSWORD },
  connectionTimeout:8000,
  greetingTimeout:8000,
  socketTimeout:12000,
  disableFileAccess:true,
  disableUrlAccess:true
}) : null
let cuentas = []
try { cuentas = JSON.parse(fs.readFileSync(RUTA_DATOS, "utf8")).cuentas || [] } catch (error) { if (error.code !== "ENOENT") throw error }
cuentas.forEach((cuenta)=>{if(cuenta.activa===undefined)cuenta.activa=true})

function guardarCuentas() {
  fs.mkdirSync(path.dirname(RUTA_DATOS), { recursive:true })
  const temporal = `${RUTA_DATOS}.${process.pid}.tmp`
  fs.writeFileSync(temporal, JSON.stringify({ cuentas }, null, 2), { mode:0o600 })
  fs.renameSync(temporal, RUTA_DATOS)
}
const normalizarUsuario = (usuario) => typeof usuario === "string" ? usuario.trim().toLowerCase() : ""
const usuarioValido = (usuario) => /^[a-z0-9_.-]{3,24}$/.test(normalizarUsuario(usuario))
const claveValida = (clave) => typeof clave === "string" && clave.length >= 8 && clave.length <= 72
const correoValido = (correo) => typeof correo === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim()) && correo.trim().length <= 254
function hashClave(clave, salt=randomUUID()) { return { salt, hash:scryptSync(clave, salt, 64).toString("hex") } }
function verificarClave(clave, cuenta) { const esperado=Buffer.from(cuenta.passwordHash,"hex"), recibido=scryptSync(clave,cuenta.passwordSalt,64); return esperado.length===recibido.length&&timingSafeEqual(esperado,recibido) }
const hashToken = (token) => createHash("sha256").update(token).digest("hex")
const ipCliente = (req) => String(req.ip || req.socket.remoteAddress || "desconocida").replace(/^::ffff:/, "").slice(0, 64)
async function ubicacionIp(ip,paisProxy) {
  if (["127.0.0.1", "::1", "desconocida"].includes(ip) || ip.startsWith("10.") || ip.startsWith("192.168.")) return { tipo:"local" }
  if (!process.env.IPINFO_TOKEN) return { pais:paisProxy||null, fuente:paisProxy?"proxy":"sin-configurar" }
  try { const respuesta=await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${encodeURIComponent(process.env.IPINFO_TOKEN)}`,{signal:AbortSignal.timeout(2500)});if(!respuesta.ok)throw new Error("geo");const data=await respuesta.json();return { ciudad:data.city||null,region:data.region||null,pais:data.country||null,fuente:"ipinfo" } } catch { return { pais:null,fuente:"no-disponible" } }
}
async function auditar(req,evento,datos={}) {
  const ip=ipCliente(req),paisProxy=String(req.get("cf-ipcountry")||"").slice(0,2)||null,ubicacion=await ubicacionIp(ip,paisProxy),entrada={fecha:new Date().toISOString(),evento,cuentaId:datos.cuentaId||null,usuario:datos.usuario||null,ip,ubicacion,agente:String(req.get("user-agent")||"").slice(0,300),exito:datos.exito!==false}
  fs.mkdirSync(path.dirname(RUTA_AUDITORIA),{recursive:true});try{if(fs.statSync(RUTA_AUDITORIA).size>10*1024*1024)fs.renameSync(RUTA_AUDITORIA,`${RUTA_AUDITORIA}.1`)}catch(error){if(error.code!=="ENOENT")throw error}fs.appendFileSync(RUTA_AUDITORIA,`${JSON.stringify(entrada)}\n`,{mode:0o600})
}
async function verificarCaptcha(token,req) {
  if(!CAPTCHA_ACTIVO)return !esProduccion
  if(typeof token!=="string"||!token)return false
  try { const body=new URLSearchParams({secret:RECAPTCHA_SECRET_KEY,response:token,remoteip:ipCliente(req)});const respuesta=await fetch("https://www.google.com/recaptcha/api/siteverify",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body,signal:AbortSignal.timeout(5000)});const data=await respuesta.json();return data.success===true } catch { return false }
}
function generarCodigo(cuenta) { const codigo=String(randomInt(100000,1000000)),reenvioToken=randomUUID()+randomUUID();cuenta.activacion={codigoHash:hashToken(codigo),reenvioHash:hashToken(reenvioToken),expira:Date.now()+DURACION_CODIGO_MS,intentos:0};return {codigo,reenvioToken} }
async function enviarCodigo(cuenta,codigo) {
  if(!transporteCorreo){if(!esProduccion){console.log(`[DESARROLLO] Código de activación para ${cuenta.usuario}: ${codigo}`);return}throw new Error("Servicio de correo no configurado")}
  await transporteCorreo.sendMail({from:process.env.EMAIL_FROM,to:cuenta.correo,subject:"Activa tu cuenta de Guardianes del Mayab",text:`Tu código de activación es: ${codigo}\n\nExpira en 15 minutos. Si no solicitaste esta cuenta, ignora este mensaje.`})
}
function estadisticas(cuenta) {
  const historial=cuenta.historial||[], batallas=cuenta.batallas??historial.length, victorias=cuenta.victorias??historial.filter((b)=>b.resultado==="victoria").length, derrotas=cuenta.derrotas??historial.filter((b)=>b.resultado==="derrota").length, empates=cuenta.empates??batallas-victorias-derrotas
  return { puntos:cuenta.puntos||0, nivel:Math.floor(batallas/5)+1, batallas, victorias, derrotas, empates, historial:historial.slice(-10).reverse() }
}
const salas = [
  { id:"selva", nombre:"Templos de la Selva", descripcion:"Pirámides entre ceibas y piedra antigua", mapa:"./assets/mokemap.png" },
  { id:"volcan", nombre:"Corazón del Volcán", descripcion:"Obsidiana, fuego y cumbres sagradas", mapa:"./assets/arena-volcan.png" },
  { id:"lago", nombre:"Espejo de Atitlán", descripcion:"Islas de jade sobre aguas turquesa", mapa:"./assets/arena-lago.png" },
  { id:"cueva", nombre:"Cueva de Jade", descripcion:"Cenotes luminosos bajo la montaña", mapa:"./assets/arena-cueva.png" }
].map((arena) => ({ ...arena, creadorId:null, miembros:[], solicitudes:[], mensajes:[] }))

app.set("trust proxy", 1)
app.disable("x-powered-by")
const opcionesHelmet = {
  contentSecurityPolicy: {
    directives: {
      styleSrc: ["'self'"],
      styleSrcAttr: ["'none'"],
      scriptSrc: ["'self'", "https://www.google.com", "https://www.gstatic.com"],
      frameSrc: ["'self'", "https://www.google.com", "https://recaptcha.google.com"],
      ...(esProduccion ? {} : { upgradeInsecureRequests: null })
    }
  }
}
if (!esProduccion) opcionesHelmet.strictTransportSecurity = false
app.use(helmet(opcionesHelmet))
app.use((req, res, next) => {
  if (!esProduccion || req.secure) return next()
  if (origenPublico) return res.redirect(308, new URL(req.originalUrl, origenPublico).toString())
  return res.status(426).json({ error: "Esta aplicación requiere una conexión HTTPS segura." })
})
app.use(express.json({ limit:"4kb", strict:true }))
app.use(express.static("public"))
const limiteUnirse = rateLimit({ windowMs:600000, limit:30, standardHeaders:"draft-8", legacyHeaders:false })
const limitePosicion = rateLimit({ windowMs:1000, limit:100, standardHeaders:"draft-8", legacyHeaders:false })
const limiteAcciones = rateLimit({ windowMs:60000, limit:180, standardHeaders:"draft-8", legacyHeaders:false })
const limiteChat = rateLimit({ windowMs:10000, limit:12, standardHeaders:"draft-8", legacyHeaders:false })
const limiteActivacion = rateLimit({ windowMs:15*60*1000, limit:8, standardHeaders:"draft-8", legacyHeaders:false })

class Jugador {
  constructor(id, token, nombre, cuentaId) { this.id=id; this.token=token; this.nombre=nombre; this.cuentaId=cuentaId; this.salaId=null; this.oponenteId=null; this.estadoJuego="lobby"; this.ultimaActividad=Date.now() }
  actualizarActividad() { this.ultimaActividad=Date.now() }
}
function autenticarCuenta(req,res,next) {
  const auth=req.get("authorization")||"", token=auth.startsWith("Bearer ")?auth.slice(7):"", tokenHash=hashToken(token)
  const cuenta=cuentas.find((c)=>c.sesiones?.some((s)=>s.tokenHash===tokenHash&&s.expira>Date.now()))
  if(!cuenta)return res.status(401).json({error:"Inicia sesión nuevamente."})
  req.cuenta=cuenta;req.loginToken=token;next()
}
const buscarSala = (id) => salas.find((s) => s.id === id)
const buscarJugador = (id) => jugadores.find((j) => j.id === id)
const esMiembro = (sala, id) => Boolean(sala?.miembros.includes(id))
const nombreValido = (nombre) => typeof nombre === "string" && /^[\p{L}\p{N}_ .'-]{2,20}$/u.test(nombre.trim())
const textoValido = (texto) => typeof texto === "string" && texto.trim().length > 0 && texto.trim().length <= 180
const coordenadaValida = (valor) => typeof valor === "number" && Number.isFinite(valor) && valor >= 0 && valor <= 1000

function autenticarJugador(req,res,next) {
  const auth=req.get("authorization")||""
  const jugador=jugadores.find((j)=>j.token===(auth.startsWith("Bearer ")?auth.slice(7):""))
  if(!jugador) return res.status(401).json({error:"Sesión de jugador inválida."})
  jugador.actualizarActividad(); req.jugador=jugador; next()
}
function autorizarJugadorPropio(req,res,next) {
  if(req.jugador.id!==req.params.jugadorId) return res.status(403).json({error:"No puedes modificar otro jugador."})
  next()
}
function abandonarSala(jugador) {
  if(!jugador.salaId) return
  const sala=buscarSala(jugador.salaId)
  if(!sala) return
  if(sala.creadorId===jugador.id) {
    sala.miembros.forEach((id)=>{ const miembro=buscarJugador(id); if(miembro){miembro.salaId=null;miembro.oponenteId=null;miembro.estadoJuego="lobby"} })
    sala.creadorId=null; sala.miembros=[]; sala.solicitudes=[]; sala.mensajes=[]
  } else {
    sala.miembros=sala.miembros.filter((id)=>id!==jugador.id)
    sala.solicitudes=sala.solicitudes.filter((id)=>id!==jugador.id)
  }
  const rival=buscarJugador(jugador.oponenteId); if(rival) rival.oponenteId=null
  jugador.salaId=null; jugador.oponenteId=null; jugador.estadoJuego="lobby"
}
function resumenSala(sala,jugador) {
  const creador=buscarJugador(sala.creadorId)
  return { id:sala.id,nombre:sala.nombre,descripcion:sala.descripcion,mapa:sala.mapa,disponible:!sala.creadorId,creador:creador?.nombre||null,jugadores:sala.miembros.length,capacidad:MAX_JUGADORES_SALA,soyCreador:sala.creadorId===jugador.id,soyMiembro:esMiembro(sala,jugador.id),solicitudPendiente:sala.solicitudes.includes(jugador.id) }
}

function crearLogin(cuenta) { const token=randomUUID()+randomUUID(), sesion={tokenHash:hashToken(token),expira:Date.now()+DURACION_LOGIN_MS}; cuenta.sesiones=(cuenta.sesiones||[]).filter((s)=>s.expira>Date.now()).slice(-4);cuenta.sesiones.push(sesion);guardarCuentas();return token }
app.get("/auth/config",(req,res)=>res.json({captchaActivo:CAPTCHA_ACTIVO,recaptchaSiteKey:RECAPTCHA_SITE_KEY,modoDesarrollo:!esProduccion}))
app.post("/auth/registro",limiteUnirse,async(req,res,next)=>{
  try {
  if(!await verificarCaptcha(req.body?.captchaToken,req)){void auditar(req,"captcha_fallido",{usuario:normalizarUsuario(req.body?.usuario),exito:false});return res.status(400).json({error:"Completa la verificación reCAPTCHA."})}
  const usuario=normalizarUsuario(req.body?.usuario), nombre=req.body?.nombre?.trim(), clave=req.body?.clave, correo=req.body?.correo?.trim().toLowerCase()
  if(!usuarioValido(usuario))return res.status(400).json({error:"El usuario debe tener de 3 a 24 letras, números, puntos, guiones o guion bajo."})
  if(!nombreValido(nombre))return res.status(400).json({error:"Usa un nombre visible de 2 a 20 caracteres."})
  if(!correoValido(correo))return res.status(400).json({error:"Ingresa un correo electrónico válido."})
  if(!claveValida(clave))return res.status(400).json({error:"La contraseña debe tener entre 8 y 72 caracteres."})
  if(cuentas.some((c)=>c.usuario===usuario))return res.status(409).json({error:"Ese usuario ya existe."})
  if(cuentas.some((c)=>c.correo===correo))return res.status(409).json({error:"Ese correo ya está registrado."})
  const password=hashClave(clave), cuenta={id:randomUUID(),usuario,nombre,correo,passwordSalt:password.salt,passwordHash:password.hash,activa:false,puntos:0,historial:[],sesiones:[]},activacion=generarCodigo(cuenta);cuentas.push(cuenta);guardarCuentas()
  try{await enviarCodigo(cuenta,activacion.codigo)}catch(error){cuentas=cuentas.filter((c)=>c.id!==cuenta.id);guardarCuentas();throw error}
  await auditar(req,"registro_pendiente",{cuentaId:cuenta.id,usuario});res.status(201).json({requiereActivacion:true,usuario,reenvioToken:activacion.reenvioToken,correoEnmascarado:correo.replace(/^(.{1,2}).*(@.*)$/,"$1***$2")})
  }catch(error){next(error)}
})
app.post("/auth/login",limiteUnirse,async(req,res,next)=>{
  try {
  if(!await verificarCaptcha(req.body?.captchaToken,req)){void auditar(req,"captcha_fallido",{usuario:normalizarUsuario(req.body?.usuario),exito:false});return res.status(400).json({error:"Completa la verificación reCAPTCHA."})}
  const cuenta=cuentas.find((c)=>c.usuario===normalizarUsuario(req.body?.usuario))
  if(!cuenta||!claveValida(req.body?.clave)||!verificarClave(req.body.clave,cuenta)){await auditar(req,"login_fallido",{usuario:normalizarUsuario(req.body?.usuario),exito:false});return res.status(401).json({error:"Usuario o contraseña incorrectos."})}
  if(cuenta.activa!==true){const reenvioToken=randomUUID()+randomUUID();cuenta.activacion=cuenta.activacion||{};cuenta.activacion.reenvioHash=hashToken(reenvioToken);guardarCuentas();await auditar(req,"login_cuenta_inactiva",{cuentaId:cuenta.id,usuario:cuenta.usuario,exito:false});return res.status(403).json({error:"Debes activar tu cuenta antes de iniciar sesión.",requiereActivacion:true,usuario:cuenta.usuario,reenvioToken})}
  const token=crearLogin(cuenta);await auditar(req,"login_exitoso",{cuentaId:cuenta.id,usuario:cuenta.usuario});res.json({token,usuario:cuenta.usuario,nombre:cuenta.nombre,estadisticas:estadisticas(cuenta)})
  }catch(error){next(error)}
})
app.post("/auth/activar",limiteActivacion,async(req,res,next)=>{try{const usuario=normalizarUsuario(req.body?.usuario),cuenta=cuentas.find((c)=>c.usuario===usuario),codigo=String(req.body?.codigo||"");if(!cuenta||cuenta.activa===true)return res.status(400).json({error:"Solicitud de activación inválida."});if(!cuenta.activacion||cuenta.activacion.expira<Date.now()||cuenta.activacion.intentos>=5)return res.status(400).json({error:"El código expiró. Solicita uno nuevo."});cuenta.activacion.intentos++;if(!/^\d{6}$/.test(codigo)||hashToken(codigo)!==cuenta.activacion.codigoHash){guardarCuentas();await auditar(req,"activacion_fallida",{cuentaId:cuenta.id,usuario,exito:false});return res.status(400).json({error:"Código incorrecto."})}cuenta.activa=true;delete cuenta.activacion;const token=crearLogin(cuenta);await auditar(req,"cuenta_activada",{cuentaId:cuenta.id,usuario});res.json({token,usuario,nombre:cuenta.nombre,estadisticas:estadisticas(cuenta)})}catch(error){next(error)}})
app.post("/auth/reenviar-codigo",limiteActivacion,async(req,res,next)=>{try{const cuenta=cuentas.find((c)=>c.usuario===normalizarUsuario(req.body?.usuario)),reenvioToken=String(req.body?.reenvioToken||"");if(!cuenta||cuenta.activa===true||!cuenta.activacion?.reenvioHash||hashToken(reenvioToken)!==cuenta.activacion.reenvioHash)return res.status(202).json({mensaje:"Si la solicitud es válida, enviaremos un código."});const activacion=generarCodigo(cuenta);guardarCuentas();await enviarCodigo(cuenta,activacion.codigo);await auditar(req,"codigo_reenviado",{cuentaId:cuenta.id,usuario:cuenta.usuario});res.status(202).json({mensaje:"Código enviado.",reenvioToken:activacion.reenvioToken})}catch(error){next(error)}})
app.get("/auth/perfil",autenticarCuenta,(req,res)=>{res.set("Cache-Control","no-store");res.json({usuario:req.cuenta.usuario,nombre:req.cuenta.nombre,estadisticas:estadisticas(req.cuenta)})})
app.post("/auth/logout",autenticarCuenta,async(req,res,next)=>{try{const tokenHash=hashToken(req.loginToken);req.cuenta.sesiones=req.cuenta.sesiones.filter((s)=>s.tokenHash!==tokenHash);guardarCuentas();await auditar(req,"logout",{cuentaId:req.cuenta.id,usuario:req.cuenta.usuario});res.status(204).end()}catch(error){next(error)}})
app.post("/unirse",limiteUnirse,autenticarCuenta,(req,res)=>{
  let jugador=jugadores.find((j)=>j.cuentaId===req.cuenta.id)
  if(!jugador){jugador=new Jugador(randomUUID(),randomUUID(),req.cuenta.nombre,req.cuenta.id);jugadores.push(jugador)}
  res.set("Cache-Control","no-store");res.status(201).json({id:jugador.id,token:jugador.token,nombre:jugador.nombre,estadisticas:estadisticas(req.cuenta)})
})
app.get("/salas",autenticarJugador,(req,res)=>{ res.set("Cache-Control","no-store"); res.json({salas:salas.map((s)=>resumenSala(s,req.jugador)),salaActual:req.jugador.salaId}) })
app.post("/salas/:salaId/crear",limiteAcciones,autenticarJugador,(req,res)=>{
  const sala=buscarSala(req.params.salaId)
  if(!sala) return res.status(404).json({error:"Arena no encontrada."})
  if(sala.creadorId) return res.status(409).json({error:"Esta arena ya tiene una sala activa."})
  abandonarSala(req.jugador); sala.creadorId=req.jugador.id; sala.miembros=[req.jugador.id]; sala.solicitudes=[]; sala.mensajes=[]; req.jugador.salaId=sala.id
  res.status(201).json({sala:resumenSala(sala,req.jugador)})
})
app.post("/salas/:salaId/solicitar",limiteAcciones,autenticarJugador,(req,res)=>{
  const sala=buscarSala(req.params.salaId)
  if(!sala?.creadorId) return res.status(404).json({error:"La sala ya no está disponible."})
  if(sala.miembros.length>=MAX_JUGADORES_SALA) return res.status(409).json({error:"La sala está llena."})
  if(req.jugador.salaId) return res.status(409).json({error:"Primero debes salir de tu sala actual."})
  if(!sala.solicitudes.includes(req.jugador.id)) sala.solicitudes.push(req.jugador.id)
  res.status(202).json({mensaje:"Solicitud enviada."})
})
app.post("/salas/:salaId/solicitudes/responder",limiteAcciones,autenticarJugador,(req,res)=>{
  const sala=buscarSala(req.params.salaId), solicitante=buscarJugador(req.body?.jugadorId)
  if(!sala||sala.creadorId!==req.jugador.id) return res.status(403).json({error:"Solo el anfitrión puede responder."})
  if(!solicitante||!sala.solicitudes.includes(solicitante.id)) return res.status(404).json({error:"Solicitud no encontrada."})
  sala.solicitudes=sala.solicitudes.filter((id)=>id!==solicitante.id)
  if(req.body.aceptar===true&&sala.miembros.length<MAX_JUGADORES_SALA&&!solicitante.salaId){sala.miembros.push(solicitante.id);solicitante.salaId=sala.id}
  res.status(204).end()
})
app.get("/salas/:salaId/estado",autenticarJugador,(req,res)=>{
  const sala=buscarSala(req.params.salaId); if(!sala) return res.status(404).json({error:"Sala no encontrada."})
  const solicitudes=sala.creadorId===req.jugador.id?sala.solicitudes.map(buscarJugador).filter(Boolean).map(({id,nombre})=>({id,nombre})):[]
  const miembros=sala.miembros.map(buscarJugador).filter(Boolean).map(({id,nombre,mokepon,estadoJuego})=>({id,nombre,guardian:mokepon?.nombre||null,estadoJuego}))
  const rival=buscarJugador(req.jugador.oponenteId)
  const duelo=req.jugador.estadoJuego==="batalla"&&rival?{enemigoId:rival.id,nombreJugador:rival.nombre,guardian:rival.mokepon?.nombre||null}:null
  res.set("Cache-Control","no-store");res.json({...resumenSala(sala,req.jugador),estadoJuego:req.jugador.estadoJuego,duelo,solicitudes,miembros,mensajes:esMiembro(sala,req.jugador.id)?sala.mensajes.slice(-50):[]})
})
app.delete("/salas/:salaId/salir",limiteAcciones,autenticarJugador,(req,res)=>{const sala=buscarSala(req.params.salaId);if(sala)sala.solicitudes=sala.solicitudes.filter((id)=>id!==req.jugador.id);abandonarSala(req.jugador);res.status(204).end()})
app.post("/salas/:salaId/chat",limiteChat,autenticarJugador,(req,res)=>{
  const sala=buscarSala(req.params.salaId); if(!esMiembro(sala,req.jugador.id)) return res.status(403).json({error:"No perteneces a esta sala."})
  if(!textoValido(req.body?.texto)) return res.status(400).json({error:"El mensaje debe tener entre 1 y 180 caracteres."})
  const mensaje={id:randomUUID(),jugadorId:req.jugador.id,nombre:req.jugador.nombre,texto:req.body.texto.trim(),fecha:Date.now()};sala.mensajes.push(mensaje);if(sala.mensajes.length>100)sala.mensajes.shift();res.status(201).json(mensaje)
})

app.post("/mokepon/:jugadorId",limiteAcciones,autenticarJugador,autorizarJugadorPropio,(req,res)=>{
  if(!req.jugador.salaId) return res.status(409).json({error:"Debes entrar a una sala."})
  if(!MOKEPONES_VALIDOS.has(req.body.mokepon)) return res.status(400).json({error:"Guardián inválido."})
  req.jugador.mokepon={nombre:req.body.mokepon};req.jugador.ataques=[];req.jugador.estadoJuego="arena";res.status(204).end()
})
app.post("/mokepon/:jugadorId/posicion",limitePosicion,autenticarJugador,autorizarJugadorPropio,(req,res)=>{
  if(!coordenadaValida(req.body.x)||!coordenadaValida(req.body.y)) return res.status(400).json({error:"Posición inválida."})
  const sala=buscarSala(req.jugador.salaId);if(!esMiembro(sala,req.jugador.id))return res.status(403).json({error:"No perteneces a una sala."})
  req.jugador.x=req.body.x;req.jugador.y=req.body.y
  if(req.jugador.estadoJuego!=="arena") return res.status(409).json({error:"Aún estás cerrando el duelo anterior."})
  const enemigos=sala.miembros.map(buscarJugador).filter((j)=>j&&j.id!==req.jugador.id&&j.mokepon&&j.estadoJuego==="arena"&&!j.oponenteId).map((j)=>({id:j.id,nombreJugador:j.nombre,mokepon:j.mokepon,x:j.x??0,y:j.y??0}))
  res.set("Cache-Control","no-store");res.json({enemigos})
})
app.post("/mokepon/:jugadorId/desafio",limiteAcciones,autenticarJugador,autorizarJugadorPropio,(req,res)=>{
  const rival=buscarJugador(req.body?.enemigoId)
  if(!rival||!req.jugador.salaId||rival.salaId!==req.jugador.salaId||req.jugador.estadoJuego!=="arena"||rival.estadoJuego!=="arena")return res.status(404).json({error:"Rival no disponible."})
  if((req.jugador.oponenteId&&req.jugador.oponenteId!==rival.id)||(rival.oponenteId&&rival.oponenteId!==req.jugador.id))return res.status(409).json({error:"Uno de los jugadores ya está en batalla."})
  const dueloId=randomUUID();req.jugador.oponenteId=rival.id;rival.oponenteId=req.jugador.id;req.jugador.dueloId=dueloId;rival.dueloId=dueloId;req.jugador.ataques=[];rival.ataques=[];req.jugador.estadoJuego="batalla";rival.estadoJuego="batalla";res.status(204).end()
})
app.post("/mokepon/:jugadorId/ataques",limiteAcciones,autenticarJugador,autorizarJugadorPropio,(req,res)=>{
  const ataques=req.body.ataques;if(!req.jugador.oponenteId)return res.status(409).json({error:"No tienes un duelo activo."})
  if(!Array.isArray(ataques)||ataques.length!==5||!ataques.every((a)=>ATAQUES_VALIDOS.has(a)))return res.status(400).json({error:"Secuencia de ataques inválida."})
  req.jugador.ataques=[...ataques];res.status(204).end()
})
app.get("/mokepon/:jugadorId/ataques",autenticarJugador,(req,res)=>{
  const rival=buscarJugador(req.params.jugadorId)
  if(!rival||req.jugador.oponenteId!==rival.id||rival.oponenteId!==req.jugador.id||rival.salaId!==req.jugador.salaId)return res.status(403).json({error:"Este jugador no es tu rival activo."})
  if(rival.ataques?.length===5&&req.jugador.ataques?.length===5) registrarResultado(req.jugador,rival)
  res.set("Cache-Control","no-store");res.json({ataques:rival.ataques||[]})
})
function gana(a,b){return(a==="FUEGO"&&b==="TIERRA")||(a==="AGUA"&&b==="FUEGO")||(a==="TIERRA"&&b==="AGUA")}
function registrarResultado(jugador,rival){
  if(!jugador.dueloId||jugador.dueloRegistrado===jugador.dueloId||rival.dueloRegistrado===jugador.dueloId)return
  let rondasJugador=0,rondasRival=0;for(let i=0;i<5;i++){if(gana(jugador.ataques[i],rival.ataques[i]))rondasJugador++;else if(gana(rival.ataques[i],jugador.ataques[i]))rondasRival++}
  const resultadoJugador=rondasJugador===rondasRival?"empate":rondasJugador>rondasRival?"victoria":"derrota", resultadoRival=resultadoJugador==="empate"?"empate":resultadoJugador==="victoria"?"derrota":"victoria"
  const cuentaJugador=cuentas.find((c)=>c.id===jugador.cuentaId),cuentaRival=cuentas.find((c)=>c.id===rival.cuentaId),fecha=Date.now()
  if(!cuentaJugador||!cuentaRival)return
  const agregar=(cuenta,oponente,guardian,resultado,aFavor,enContra)=>{cuenta.puntos=(cuenta.puntos||0)+(resultado==="victoria"?30:resultado==="empate"?10:5);cuenta.batallas=(cuenta.batallas??cuenta.historial?.length??0)+1;cuenta.victorias=(cuenta.victorias??cuenta.historial?.filter((b)=>b.resultado==="victoria").length??0)+(resultado==="victoria"?1:0);cuenta.derrotas=(cuenta.derrotas??cuenta.historial?.filter((b)=>b.resultado==="derrota").length??0)+(resultado==="derrota"?1:0);cuenta.empates=(cuenta.empates??cuenta.historial?.filter((b)=>b.resultado==="empate").length??0)+(resultado==="empate"?1:0);cuenta.historial=cuenta.historial||[];cuenta.historial.push({id:jugador.dueloId,fecha,oponente,guardian,resultado,rondasAFavor:aFavor,rondasEnContra:enContra});if(cuenta.historial.length>200)cuenta.historial.shift()}
  agregar(cuentaJugador,rival.nombre,jugador.mokepon?.nombre||null,resultadoJugador,rondasJugador,rondasRival);agregar(cuentaRival,jugador.nombre,rival.mokepon?.nombre||null,resultadoRival,rondasRival,rondasJugador)
  jugador.dueloRegistrado=jugador.dueloId;rival.dueloRegistrado=jugador.dueloId;guardarCuentas()
}
app.post("/mokepon/:jugadorId/finalizar",limiteAcciones,autenticarJugador,autorizarJugadorPropio,(req,res)=>{
  const rival=buscarJugador(req.jugador.oponenteId)
  if(rival)registrarResultado(req.jugador,rival)
  req.jugador.estadoJuego="arena";req.jugador.ataques=[]
  if(!rival||rival.oponenteId!==req.jugador.id){req.jugador.oponenteId=null;return res.status(204).end()}
  if(rival.estadoJuego==="arena"){rival.oponenteId=null;rival.ataques=[];req.jugador.oponenteId=null}
  res.status(204).end()
})
app.delete("/mokepon/:jugadorId",limiteAcciones,autenticarJugador,autorizarJugadorPropio,(req,res)=>{abandonarSala(req.jugador);const i=jugadores.findIndex((j)=>j.id===req.jugador.id);if(i>=0)jugadores.splice(i,1);res.status(204).end()})

app.use((error,req,res,next)=>{if(error.type==="entity.too.large")return res.status(413).json({error:"Solicitud demasiado grande."});if(error instanceof SyntaxError&&error.status===400&&"body" in error)return res.status(400).json({error:"JSON inválido."});console.error(error);res.status(500).json({error:"Error interno del servidor."})})
setInterval(()=>{const limite=Date.now()-DURACION_SESION_MS;for(let i=jugadores.length-1;i>=0;i--){if(jugadores[i].ultimaActividad<limite){abandonarSala(jugadores[i]);jugadores.splice(i,1)}}},60000).unref()
app.listen(PORT,"0.0.0.0",()=>console.log(`Servidor funcionando en puerto ${PORT}`))
