function iniciarJuego(){
    let botonMacotaJugador = document.getElementById('boton-mascota')
    botonMacotaJugador.addEventListener('click', seleccionarMascotaJugador)
}

function seleccionarMascotaJugador() {
    let inputHipodoge = document.getElementById('hipodoge')
    let inputCapipepo = document.getElementById('capipepo')
    let inputRatigueya = document.getElementById('ratigueya')
    let spanMascotaJugador = document.getElementById('mascota-jugador')

    if (inputHipodoge.checked) {
        spanMascotaJugador.innerHTML = 'hipodoge'
        alert('Seleccionaste a Hipodogue')
    } else if (inputCapipepo.checked) {
        spanMascotaJugador.innerHTML = 'capipepo'
        alert('Seleccionaste a Capipepo')
    } else if (inputRatigueya.checked) {
        spanMascotaJugador.innerHTML = 'ratigueya'
        alert('Seleccionaste a Ratigueya')
    } else {
        alert('Selecciona una mascota')
    }

    seleccionarMascotaEnemigo()
}

function seleccionarMascotaEnemigo(){
    let ataqueAleatorio = aleatorio(1,3)
    let spanMascotaEnemigo = document.getElementById('mascota-enemigo')

    if (ataqueAleatorio == 1) {
        spanMascotaEnemigo.innerHTML = 'hipodogue'
    } else if (ataqueAleatorio == 2) {
        spanMascotaEnemigo.innerHTML = 'capipepo'
    } else {
        spanMascotaEnemigo.innerHTML = 'ratigueya'
    }
}

function aleatorio(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min)
}

window.addEventListener('load', iniciarJuego)