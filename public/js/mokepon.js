const sectionSeleccionarAtaque = document.getElementById('seleccionar-ataque')
const sectionReiniciar = document.getElementById('reiniciar')
const botonMascotaJugador = document.getElementById('boton-mascota')
const botonReiniciar = document.getElementById('boton-reiniciar')
sectionReiniciar.style.display = 'none'

const sectionSeleccionarMascota = document.getElementById('seleccionar-mascota')
const spanMascotaJugador = document.getElementById('mascota-jugador')

const spanMascotaEnemigo = document.getElementById('mascota-enemigo')

const spanVidasJugador = document.getElementById('vidas-jugador')
const spanVidasEnemigo = document.getElementById('vidas-enemigo')

const sectionMensajes = document.getElementById('resultado')
const ataquesDelJugador = document.getElementById('ataques-del-jugador')
const ataquesDelEnemigo = document.getElementById('ataques-del-enemigo')
const contenedorTarjetas = document.getElementById('contenedorTarjetas')
const contenedorAtaques = document.getElementById('contenedorAtaques')

const sectionVerMapa = document.getElementById('ver-mapa')
const mapa = document.getElementById('mapa')
const botonArriba = document.getElementById('boton-arriba')
const botonAbajo = document.getElementById('boton-abajo')
const botonIzquierda = document.getElementById('boton-izquierda')
const botonDerecha = document.getElementById('boton-derecha')

let jugadorId = null
let jugadorToken = null
let enemigoId = null
let mokepones = []
let mokeponesEnemigos = []
let ataqueJugador = []
let ataqueEnemigo = []
let opcionDeMokepones
let inputHipodoge
let inputCapipepo
let inputRatigueya
let mascotaJugador
let mascotaJugadorObjeto
let ataquesMokepon
let ataquesMokeponEnemigo
let botonFuego
let botonAgua
let botonTierra
let botones = []
let indexAtaqueJugador
let indexAtaqueEnemigo
let victoriasJugador = 0
let victoriasEnemigo = 0
let vidasJugador = 3
let vidasEnemigo = 3
let lienzo = mapa.getContext("2d")
let intervalo
let sesionInvalida = false
let mapaBackground = new Image()
mapaBackground.src = './assets/mokemap.png'
let alturaQueBuscamos
let anchoDelMapa = window.innerWidth - 20
const anchoMaximoDelMapa = 350

if (anchoDelMapa > anchoMaximoDelMapa) {
    anchoDelMapa = anchoMaximoDelMapa - 20
}

alturaQueBuscamos = anchoDelMapa * 600 / 800

mapa.width = anchoDelMapa
mapa.height = alturaQueBuscamos

class Mokepon {
    constructor(nombre, foto, vida, fotoMapa, id = 0) {
        this.id = id
        this.nombre = nombre
        this.foto = foto
        this.vida = vida
        this.ataques = []
        this.ancho = 40
        this.alto = 40
        this.x = aleatorio(0, mapa.width - this.ancho)
        this.y = aleatorio(0, mapa.height - this.alto)
        this.mapaFoto = new Image()
        this.mapaFoto.src = fotoMapa
        this.velocidadX = 0
        this.velocidadY = 0
    }

    pintarMokepon() {
        lienzo.drawImage(
            this.mapaFoto,
            this.x,
            this.y,
            this.ancho,
            this.alto
        )
    }
}

let hipodoge = new Mokepon('Hipodoge', './assets/mokepons_mokepon_hipodoge_attack.png', 5, './assets/hipodoge.png')

let capipepo = new Mokepon('Capipepo', './assets/mokepons_mokepon_capipepo_attack.png', 5, './assets/capipepo.png')

let ratigueya = new Mokepon('Ratigueya', './assets/mokepons_mokepon_ratigueya_attack.png', 5, './assets/ratigueya.webp')

const HIPODOGE_ATAQUES = [
    { nombre: '💧', id: 'boton-agua' },
    { nombre: '💧', id: 'boton-agua' },
    { nombre: '💧', id: 'boton-agua' },
    { nombre: '🔥', id: 'boton-fuego' },
    { nombre: '🌱', id: 'boton-tierra' },
]

const CAPIPEPO_ATAQUES = [
    { nombre: '🌱', id: 'boton-tierra' },
    { nombre: '🌱', id: 'boton-tierra' },
    { nombre: '🌱', id: 'boton-tierra' },
    { nombre: '💧', id: 'boton-agua' },
    { nombre: '🔥', id: 'boton-fuego' },
]

const RATIGUEYA_ATAQUES = [
    { nombre: '🔥', id: 'boton-fuego' },
    { nombre: '🔥', id: 'boton-fuego' },
    { nombre: '🔥', id: 'boton-fuego' },
    { nombre: '💧', id: 'boton-agua' },
    { nombre: '🌱', id: 'boton-tierra' },
]

hipodoge.ataques.push(...HIPODOGE_ATAQUES)
capipepo.ataques.push(...CAPIPEPO_ATAQUES)
ratigueya.ataques.push(...RATIGUEYA_ATAQUES)

mokepones.push(hipodoge, capipepo, ratigueya)

function iniciarJuego() {
    sectionSeleccionarAtaque.style.display = 'none'
    sectionVerMapa.style.display = 'none'
    botonMascotaJugador.disabled = true

    mokepones.forEach((mokepon) => {
        opcionDeMokepones = `
        <input type="radio" name="mascota" id=${mokepon.nombre} />
        <label class="tarjeta-de-mokepon" for=${mokepon.nombre}>
            <p>${mokepon.nombre}</p>
            <img src=${mokepon.foto} alt=${mokepon.nombre}>
        </label>
        `
        contenedorTarjetas.innerHTML += opcionDeMokepones

        inputHipodoge = document.getElementById('Hipodoge')
        inputCapipepo = document.getElementById('Capipepo')
        inputRatigueya = document.getElementById('Ratigueya')
    })

    botonMascotaJugador.addEventListener('click', seleccionarMascotaJugador)
    botonReiniciar.addEventListener('click', reiniciarJuego)
    configurarControlesMapa()

    unirseAlJuego().then(() => {
        botonMascotaJugador.disabled = false
    })
}

function unirseAlJuego() {
    return fetch("/unirse", { method: "POST" })
        .then((res) => {
            if (!res.ok) throw new Error("No se pudo crear la sesión")
            return res.json()
        })
        .then(({ id, token }) => {
            jugadorId = id
            jugadorToken = token
            console.log("Jugador conectado:", jugadorId)
        })
}

function cabecerasAutenticadas(conJson = false) {
    const headers = {
        "Authorization": `Bearer ${jugadorToken}`
    }

    if (conJson) {
        headers["Content-Type"] = "application/json"
    }

    return headers
}

function revisarSesion(res) {
    if (res.status === 401 && !sesionInvalida) {
        sesionInvalida = true
        clearInterval(intervalo)
        alert("Tu sesión terminó. El juego se volverá a conectar.")
        location.reload()
    }

    return res
}

function seleccionarMascotaJugador() {
    if (!jugadorId) {
        alert("Espera un momento, aún se está conectando el jugador")
        return
    }

    if (inputHipodoge.checked) {
        spanMascotaJugador.textContent = inputHipodoge.id
        mascotaJugador = inputHipodoge.id
    } else if (inputCapipepo.checked) {
        spanMascotaJugador.textContent = inputCapipepo.id
        mascotaJugador = inputCapipepo.id
    } else if (inputRatigueya.checked) {
        spanMascotaJugador.textContent = inputRatigueya.id
        mascotaJugador = inputRatigueya.id
    } else {
        alert('Selecciona una mascota')
        return
    }

    sectionSeleccionarMascota.style.display = 'none'

    seleccionarMokepon(mascotaJugador)
    extraerAtaques(mascotaJugador)
    sectionVerMapa.style.display = 'flex'

    setTimeout(() => {
        iniciarMapa()
    }, 200)
}


function seleccionarMokepon(mascotaJugador) {
    if (!jugadorId) return

    fetch(`/mokepon/${encodeURIComponent(jugadorId)}`, {
        method: "post",
        headers: cabecerasAutenticadas(true),
        body: JSON.stringify({
            mokepon: mascotaJugador
        })
    })
}

function extraerAtaques(mascotaJugador) {
    let ataques
    for (let i = 0; i < mokepones.length; i++) {
        if (mascotaJugador === mokepones[i].nombre) {
            ataques = mokepones[i].ataques
        }

    }
    mostrarAtaques(ataques)
}

function mostrarAtaques(ataques) {
    ataques.forEach((ataque) => {
        ataquesMokepon = `
        <button id=${ataque.id} class="boton-de-ataque BAtaque">${ataque.nombre}</button>
        `
        contenedorAtaques.innerHTML += ataquesMokepon
    })

    botonFuego = document.getElementById('boton-fuego')
    botonAgua = document.getElementById('boton-agua')
    botonTierra = document.getElementById('boton-tierra')
    botones = document.querySelectorAll('.BAtaque')
}

function secuenciaAtaque() {
    botones.forEach((boton) => {
        boton.addEventListener('click', (e) => {
            if (e.target.textContent === '🔥') {
                ataqueJugador.push('FUEGO')
                console.log(ataqueJugador)
                boton.style.background = '#112f58'
                boton.disabled = true
            } else if (e.target.textContent === '💧') {
                ataqueJugador.push('AGUA')
                console.log(ataqueJugador)
                boton.style.background = '#112f58'
                boton.disabled = true
            } else {
                ataqueJugador.push('TIERRA')
                console.log(ataqueJugador)
                boton.style.background = '#112f58'
                boton.disabled = true
            }

            if (ataqueJugador.length === 5) {
                enviarAtaques()
            }
        })
    })
}

function enviarAtaques() {
    console.log('Enviar ataques', ataqueJugador);

    fetch(`/mokepon/${encodeURIComponent(jugadorId)}/ataques`, {
        method: "post",
        headers: cabecerasAutenticadas(true),
        body: JSON.stringify({
            ataques: ataqueJugador
        })
    })

    intervalo = setInterval(obtenerAtaques, 250)
}

function obtenerAtaques() {
    console.log('OBTENER ATAQUES');

    fetch(`/mokepon/${encodeURIComponent(enemigoId)}/ataques`, {
        headers: cabecerasAutenticadas()
    })
        .then(revisarSesion)
        .then(function (res) {
            if (res.ok) {
                res.json()
                    .then(function ({ ataques }) {
                        if (ataques.length === 5) {
                            ataqueEnemigo = ataques
                            combate()
                        }
                    })
            }
        })
}

function seleccionarMascotaEnemigo(enemigo) {
    spanMascotaEnemigo.textContent = enemigo.nombre
    ataquesMokeponEnemigo = enemigo.ataques
    secuenciaAtaque()
}


// function ataqueAleatorioEnemigo() {
//     console.log('Ataques enemigo', ataquesMokeponEnemigo);
//     let ataqueAleatorio = aleatorio(0,ataquesMokeponEnemigo.length -1)

//     if (ataqueAleatorio == 0 || ataqueAleatorio ==1) {
//         ataqueEnemigo.push('FUEGO')
//     } else if (ataqueAleatorio == 3 || ataqueAleatorio == 4) {
//         ataqueEnemigo.push('AGUA')
//     } else {
//         ataqueEnemigo.push('TIERRA')
//     }
//     console.log(ataqueEnemigo)
//     iniciarPelea()
// }

// function iniciarPelea() {
//     if (ataqueJugador.length === 5) {
//         combate()
//     }
// }

function indexAmbosOponente(jugador, enemigo) {
    indexAtaqueJugador = ataqueJugador[jugador]
    indexAtaqueEnemigo = ataqueEnemigo[enemigo]
}

function combate() {
    clearInterval(intervalo)
    console.log('COMBATE');

    for (let index = 0; index < ataqueJugador.length; index++) {
        if (ataqueJugador[index] === ataqueEnemigo[index]) {
            indexAmbosOponente(index, index)
            crearMensaje("EMPATE")
        } else if (ataqueJugador[index] === 'FUEGO' && ataqueEnemigo[index] === 'TIERRA') {
            indexAmbosOponente(index, index)
            crearMensaje("GANASTE")
            victoriasJugador++
            spanVidasJugador.textContent = victoriasJugador
        } else if (ataqueJugador[index] === 'AGUA' && ataqueEnemigo[index] === 'FUEGO') {
            indexAmbosOponente(index, index)
            crearMensaje("GANASTE")
            victoriasJugador++
            spanVidasJugador.textContent = victoriasJugador
        } else if (ataqueJugador[index] === 'TIERRA' && ataqueEnemigo[index] === 'AGUA') {
            indexAmbosOponente(index, index)
            crearMensaje("GANASTE")
            victoriasJugador++
            spanVidasJugador.textContent = victoriasJugador
        } else {
            indexAmbosOponente(index, index)
            crearMensaje("PERDISTE")
            victoriasEnemigo++
            spanVidasEnemigo.textContent = victoriasEnemigo
        }
    }

    revisarVidas()
}

function revisarVidas() {
    if (victoriasJugador === victoriasEnemigo) {
        crearMensajeFinal("Esto fue un empate!!!")
    } else if (victoriasJugador > victoriasEnemigo) {
        crearMensajeFinal("FELICITACIONES! Ganaste :)")
    } else {
        crearMensajeFinal('Lo siento, perdiste :(')
    }
}

function crearMensaje(resultado) {


    let nuevoAtaqueDelJugador = document.createElement('p')
    let nuevoAtaqueDelEnemigo = document.createElement('p')

    sectionMensajes.textContent = resultado
    nuevoAtaqueDelJugador.textContent = indexAtaqueJugador
    nuevoAtaqueDelEnemigo.textContent = indexAtaqueEnemigo

    ataquesDelJugador.appendChild(nuevoAtaqueDelJugador)
    ataquesDelEnemigo.appendChild(nuevoAtaqueDelEnemigo)
}

function crearMensajeFinal(resultadoFinal) {


    sectionMensajes.textContent = resultadoFinal



    sectionReiniciar.style.display = 'block'
}

async function reiniciarJuego() {
    console.log("Reiniciando juego...")

    if (intervalo) {
        clearInterval(intervalo)
    }

    const jugadorIdAnterior = jugadorId

    if (jugadorIdAnterior) {
        try {
            await fetch(`/mokepon/${encodeURIComponent(jugadorIdAnterior)}`, {
                method: "DELETE",
                headers: cabecerasAutenticadas()
            })
        } catch (error) {
            console.error("No se pudo cerrar la sesión anterior", error)
        }
    }

    jugadorId = null
    jugadorToken = null
    enemigoId = null
    mokeponesEnemigos = []
    location.reload()
}

function aleatorio(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min)
}

function pintarCanvas() {
    mascotaJugadorObjeto.x = mascotaJugadorObjeto.x + mascotaJugadorObjeto.velocidadX
    mascotaJugadorObjeto.y = mascotaJugadorObjeto.y + mascotaJugadorObjeto.velocidadY
    lienzo.clearRect(0, 0, mapa.width, mapa.height)
    lienzo.drawImage(
        mapaBackground,
        0,
        0,
        mapa.width,
        mapa.height
    )
    mascotaJugadorObjeto.pintarMokepon()

    enviarPosicion(mascotaJugadorObjeto.x, mascotaJugadorObjeto.y)

    mokeponesEnemigos.forEach(function (mokepon) {
        mokepon.pintarMokepon()
        revisarColision(mokepon)
    })
}

function enviarPosicion(x, y) {
    if (!jugadorId) return

    fetch(`/mokepon/${encodeURIComponent(jugadorId)}/posicion`, {
        method: "post",
        headers: cabecerasAutenticadas(true),
        body: JSON.stringify({
            x,
            y
        })
    })
        .then(revisarSesion)
        .then(function (res) {
            if (res.ok) {
                res.json()
                    .then(function ({ enemigos }) {
                        mokeponesEnemigos = enemigos
                            .filter(function (enemigo) {
                                return enemigo.mokepon
                            })
                            .map(function (enemigo) {
                                let mokeponEnemigo = null
                                const mokeponNombre = enemigo.mokepon.nombre || ""

                                if (mokeponNombre === "Hipodoge") {
                                    mokeponEnemigo = new Mokepon('Hipodoge', './assets/mokepons_mokepon_hipodoge_attack.png', 5, './assets/hipodoge.png', enemigo.id)
                                } else if (mokeponNombre === "Capipepo") {
                                    mokeponEnemigo = new Mokepon('Capipepo', './assets/mokepons_mokepon_capipepo_attack.png', 5, './assets/capipepo.png', enemigo.id)
                                } else if (mokeponNombre === "Ratigueya") {
                                    mokeponEnemigo = new Mokepon('Ratigueya', './assets/mokepons_mokepon_ratigueya_attack.png', 5, './assets/ratigueya.webp', enemigo.id)
                                }

                                if (!mokeponEnemigo) return null

                                mokeponEnemigo.x = enemigo.x || 0
                                mokeponEnemigo.y = enemigo.y || 0

                                return mokeponEnemigo
                            })
                            .filter(function (enemigo) {
                                return enemigo !== null
                            })
                    })
            }
        })
}

function moverDerecha() {
    mascotaJugadorObjeto.velocidadX = 5
}

function moverIzquierda() {
    mascotaJugadorObjeto.velocidadX = -5
}

function moverAbajo() {
    mascotaJugadorObjeto.velocidadY = 5
}

function moverArriba() {
    mascotaJugadorObjeto.velocidadY = -5
}

function detenerMovimiento() {
    mascotaJugadorObjeto.velocidadX = 0
    mascotaJugadorObjeto.velocidadY = 0
}

function configurarBotonMovimiento(boton, mover) {
    boton.addEventListener('pointerdown', mover)
    boton.addEventListener('pointerup', detenerMovimiento)
    boton.addEventListener('pointercancel', detenerMovimiento)
    boton.addEventListener('pointerleave', detenerMovimiento)
}

function configurarControlesMapa() {
    configurarBotonMovimiento(botonArriba, moverArriba)
    configurarBotonMovimiento(botonAbajo, moverAbajo)
    configurarBotonMovimiento(botonIzquierda, moverIzquierda)
    configurarBotonMovimiento(botonDerecha, moverDerecha)
}

function sePresionoUnaTecla(event) {
    switch (event.key) {
        case 'ArrowUp':
            moverArriba()
            break
        case 'ArrowDown':
            moverAbajo()
            break
        case 'ArrowLeft':
            moverIzquierda()
            break
        case 'ArrowRight':
            moverDerecha()
            break
        default:
            break
    }
}

function iniciarMapa() {

    mascotaJugadorObjeto = obtenerObjetoMascota(mascotaJugador)
    console.log(mascotaJugadorObjeto, mascotaJugador);
    intervalo = setInterval(pintarCanvas, 50)

    window.addEventListener('keydown', sePresionoUnaTecla)

    window.addEventListener('keyup', detenerMovimiento)
}

function obtenerObjetoMascota() {
    for (let i = 0; i < mokepones.length; i++) {
        if (mascotaJugador === mokepones[i].nombre) {
            return mokepones[i]
        }

    }
}

function revisarColision(enemigo) {
    const arribaEnemigo = enemigo.y
    const abajoEnemigo = enemigo.y + enemigo.alto
    const derechaEnemigo = enemigo.x + enemigo.ancho
    const izquierdaEnemigo = enemigo.x

    const arribaMascota =
        mascotaJugadorObjeto.y
    const abajoMascota =
        mascotaJugadorObjeto.y + mascotaJugadorObjeto.alto
    const derechaMascota =
        mascotaJugadorObjeto.x + mascotaJugadorObjeto.ancho
    const izquierdaMascota =
        mascotaJugadorObjeto.x

    if (
        abajoMascota < arribaEnemigo ||
        arribaMascota > abajoEnemigo ||
        derechaMascota < izquierdaEnemigo ||
        izquierdaMascota > derechaEnemigo
    ) {
        return
    }

    detenerMovimiento()
    clearInterval(intervalo)
    console.log('Se detecto una colision');

    enemigoId = enemigo.id
    sectionSeleccionarAtaque.style.display = 'flex'
    sectionVerMapa.style.display = 'none'
    seleccionarMascotaEnemigo(enemigo)
}

window.addEventListener('load', iniciarJuego)
