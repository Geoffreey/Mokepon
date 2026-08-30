const express = require("express")
const helmet = require("helmet")
const { rateLimit } = require("express-rate-limit")
const { randomUUID } = require("crypto")

const app = express()
const PORT = process.env.PORT || 8080
const DURACION_SESION_MS = 5 * 60 * 1000
const MOKEPONES_VALIDOS = new Set(["Hipodoge", "Capipepo", "Ratigueya"])
const ATAQUES_VALIDOS = new Set(["FUEGO", "AGUA", "TIERRA"])
const jugadores = []

app.set("trust proxy", 1)
app.disable("x-powered-by")
app.use(helmet())
app.use(express.json({ limit: "2kb", strict: true }))
app.use(express.static("public"))

const limiteUnirse = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Espera unos minutos." }
})

const limitePosicion = rateLimit({
  windowMs: 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Demasiadas actualizaciones de posición." }
})

const limiteAcciones = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes." }
})

const limiteConsultaAtaques = rateLimit({
  windowMs: 1000,
  limit: 50,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Demasiadas consultas de ataques." }
})

class Jugador {
  constructor(id, token) {
    this.id = id
    this.token = token
    this.ultimaActividad = Date.now()
  }

  actualizarActividad() {
    this.ultimaActividad = Date.now()
  }

  asignarMokepon(mokepon) {
    this.mokepon = mokepon
    this.actualizarActividad()
  }

  actualizarPosicion(x, y) {
    this.x = x
    this.y = y
    this.actualizarActividad()
  }

  asignarAtaques(ataques) {
    this.ataques = ataques
    this.actualizarActividad()
  }
}

class Mokepon {
  constructor(nombre) {
    this.nombre = nombre
  }
}

function autenticarJugador(req, res, next) {
  const authorization = req.get("authorization") || ""
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : ""
  const jugador = jugadores.find((item) => item.token === token)

  if (!jugador) {
    return res.status(401).json({ error: "Sesión de jugador inválida." })
  }

  jugador.actualizarActividad()
  req.jugador = jugador
  next()
}

function autorizarJugadorPropio(req, res, next) {
  if (req.jugador.id !== req.params.jugadorId) {
    return res.status(403).json({ error: "No puedes modificar otro jugador." })
  }

  next()
}

function coordenadaValida(valor) {
  return typeof valor === "number" && Number.isFinite(valor) && valor >= 0 && valor <= 1000
}

app.post("/unirse", limiteUnirse, (req, res) => {
  const jugador = new Jugador(randomUUID(), randomUUID())
  jugadores.push(jugador)

  res.set("Cache-Control", "no-store")
  res.status(201).json({
    id: jugador.id,
    token: jugador.token
  })
})

app.post("/mokepon/:jugadorId", limiteAcciones, autenticarJugador, autorizarJugadorPropio, (req, res) => {
  const nombre = req.body.mokepon

  if (!MOKEPONES_VALIDOS.has(nombre)) {
    return res.status(400).json({ error: "Mokepon inválido." })
  }

  req.jugador.asignarMokepon(new Mokepon(nombre))
  res.status(204).end()
})

app.post("/mokepon/:jugadorId/posicion", limitePosicion, autenticarJugador, autorizarJugadorPropio, (req, res) => {
  const { x, y } = req.body

  if (!coordenadaValida(x) || !coordenadaValida(y)) {
    return res.status(400).json({ error: "Posición inválida." })
  }

  req.jugador.actualizarPosicion(x, y)

  const enemigos = jugadores
    .filter((jugador) => jugador.id !== req.jugador.id && jugador.mokepon)
    .map((jugador) => ({
      id: jugador.id,
      mokepon: { nombre: jugador.mokepon.nombre },
      x: jugador.x ?? 0,
      y: jugador.y ?? 0
    }))

  res.set("Cache-Control", "no-store")
  res.json({ enemigos })
})

app.post("/mokepon/:jugadorId/ataques", limiteAcciones, autenticarJugador, autorizarJugadorPropio, (req, res) => {
  const ataques = req.body.ataques
  const ataquesValidos = Array.isArray(ataques)
    && ataques.length === 5
    && ataques.every((ataque) => ATAQUES_VALIDOS.has(ataque))

  if (!ataquesValidos) {
    return res.status(400).json({ error: "Secuencia de ataques inválida." })
  }

  req.jugador.asignarAtaques([...ataques])
  res.status(204).end()
})

app.get("/mokepon/:jugadorId/ataques", limiteConsultaAtaques, autenticarJugador, (req, res) => {
  const jugador = jugadores.find((item) => item.id === req.params.jugadorId)

  if (!jugador) {
    return res.status(404).json({ error: "Jugador no encontrado." })
  }

  jugador.actualizarActividad()
  res.set("Cache-Control", "no-store")
  res.json({ ataques: jugador.ataques || [] })
})

app.delete("/mokepon/:jugadorId", limiteAcciones, autenticarJugador, autorizarJugadorPropio, (req, res) => {
  const jugadorIndex = jugadores.findIndex((jugador) => jugador.id === req.jugador.id)
  jugadores.splice(jugadorIndex, 1)
  res.status(204).end()
})

app.use((error, req, res, next) => {
  if (error.type === "entity.too.large") {
    return res.status(413).json({ error: "Solicitud demasiado grande." })
  }

  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({ error: "JSON inválido." })
  }

  console.error(error)
  res.status(500).json({ error: "Error interno del servidor." })
})

setInterval(() => {
  const limiteActividad = Date.now() - DURACION_SESION_MS

  for (let index = jugadores.length - 1; index >= 0; index--) {
    if (jugadores[index].ultimaActividad < limiteActividad) {
      jugadores.splice(index, 1)
    }
  }
}, 60 * 1000).unref()

app.listen(PORT, () => {
  console.log(`Servidor funcionando en puerto ${PORT}`)
})
