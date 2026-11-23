# Guardianes del Mayab

Videojuego web multijugador.

## Desarrollo local

```bash
docker compose up --build
```

Disponible en `http://localhost:8080`. El Compose local define explícitamente
`NODE_ENV=development`, permitiendo HTTP únicamente para desarrollo y
simuladores locales.
Si ese puerto está ocupado, define `MOKEPON_PORT` en `.env`.

### Conexión con DBeaver

El Compose de desarrollo publica PostgreSQL únicamente en `127.0.0.1`. Crea
una conexión de tipo **PostgreSQL** en DBeaver con estos valores:

```text
Host: localhost
Puerto: 5432
Base de datos: mokepon
Usuario: mokepon
Contraseña: mokepon
SSL: desactivado
```

Si el puerto 5432 ya está ocupado, agrega por ejemplo `POSTGRES_PORT=55432` al
archivo `.env` y utiliza `55432` en DBeaver. Pulsa **Probar conexión**; DBeaver
puede solicitar descargar el controlador PostgreSQL la primera vez.

Las tablas se encuentran en `Databases > mokepon > Schemas > public > Tables`.
Las más útiles para administración son `accounts`, `battles`,
`battle_results`, `account_sessions` y `audit_events`. No edites manualmente
hashes de contraseñas o tokens de sesión.

## Panel de administración

Configura `ADMIN_USERNAMES` con uno o más usuarios separados por comas y
reinicia la aplicación. Las cuentas deben existir previamente; el rol queda
guardado en PostgreSQL. Por ejemplo:

```text
ADMIN_USERNAMES=geoff69,otro_admin
```

El panel está disponible en `/admin/`. Permite buscar usuarios, consultar su
progreso y actividad, guardar notas internas de soporte, bloquear o reactivar
cuentas, cerrar sesiones y revisar el registro general de auditoría. Todas las
acciones de soporte se auditan. El servidor comprueba el rol en cada petición;
ocultar la página no se utiliza como mecanismo de seguridad.

El restablecimiento de contraseña se inicia desde la ficha del usuario. Soporte
no define ni puede ver la nueva clave: el sistema envía al correo registrado un
enlace de un solo uso que expira en 30 minutos. Al completarlo se invalidan las
sesiones anteriores de la cuenta.

El mismo flujo está disponible para el usuario final mediante **¿Olvidaste tu
contraseña?** en el formulario de inicio de sesión. La solicitud exige el
correo registrado y reCAPTCHA, aplica límites por IP y siempre devuelve una
respuesta genérica para impedir que terceros averigüen qué correos existen.

Las cuentas, sesiones, activaciones, puntos, historial y auditoría se guardan
en PostgreSQL. Docker Compose crea la base y su volumen persistente
automáticamente. El nivel aumenta cada 5 batallas; una victoria otorga 30
puntos, un empate 10 y una derrota 5.

El esquema está versionado en `db/migrations/001_initial.sql` e incluye claves
foráneas, restricciones de integridad e índices para autenticación, historial,
clasificación y consultas de auditoría. En una instalación sin Compose,
configura `DATABASE_URL`; opcionalmente ajusta `DB_POOL_MAX`, `DB_SSL` y
`DB_SSL_REJECT_UNAUTHORIZED`.

Para importar cuentas de la versión anterior basada en JSON, inicia PostgreSQL
y ejecuta una sola vez `pnpm migrate:json`. La importación es idempotente,
conserva credenciales, estadísticas y sesiones vigentes, y no modifica el
archivo de origen.

## Seguridad de cuentas

Configura estas variables en `.env` antes de desplegar:

```text
RECAPTCHA_SITE_KEY=clave_publica_recaptcha_v2
RECAPTCHA_SECRET_KEY=clave_privada_recaptcha_v2
SMTP_HOST=mail.privateemail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=cuentas@tu-dominio.com
SMTP_PASSWORD=contraseña_o_clave_de_aplicacion
EMAIL_FROM="Guardianes del Mayab <cuentas@tu-dominio.com>"
IPINFO_TOKEN=token_ipinfo
```

Las claves de reCAPTCHA deben corresponder al tipo **v2 Checkbox** y tener
autorizado el dominio del juego. El correo utiliza SMTP cifrado de Namecheap
Private Email; se recomienda una contraseña de aplicación. `IPINFO_TOKEN` es opcional; sin él se conserva la IP y, cuando el
proxy la proporciona, el país, pero no se consulta ciudad o región.

Los códigos de activación duran 15 minutos y admiten cinco intentos. En
desarrollo, si no hay credenciales SMTP, el código se imprime únicamente
en el log del contenedor. Este comportamiento está deshabilitado en producción.

La auditoría se almacena en `audit_events`. Incluye evento, fecha, usuario, IP,
ubicación aproximada y agente del navegador; nunca guarda contraseñas, códigos
ni tokens de sesión.

## Producción

La imagen Docker utiliza `NODE_ENV=production` de forma predeterminada. Debe
ejecutarse detrás de un proxy o balanceador TLS que envíe
`X-Forwarded-Proto: https`.

Configura `PUBLIC_ORIGIN` con el origen HTTPS canónico, por ejemplo:

```text
PUBLIC_ORIGIN=https://juego.example.com
```

Define también `POSTGRES_PASSWORD` con una clave larga y única. PostgreSQL solo
se conecta a la red interna del stack. Para administración se publica solamente
en `127.0.0.1:55432`, accesible desde DBeaver mediante un túnel SSH; no queda
expuesto a Internet.

En DBeaver configura PostgreSQL con host `localhost`, puerto `55432`, base
`mokepon` y usuario `mokepon`. En la pestaña SSH activa el túnel hacia el VPS
por el puerto SSH configurado. No abras el puerto 55432 en el firewall público.

En producción se habilitan CSP, HSTS y las demás cabeceras de Helmet. Las
solicitudes HTTP se redirigen al origen configurado; si falta
`PUBLIC_ORIGIN`, se rechazan con `426 Upgrade Required` para evitar servir la
aplicación accidentalmente por una conexión insegura.

### Despliegue con Nginx Proxy Manager

El archivo `compose.production.yml` no publica puertos en el host. Conecta el
contenedor `mokepon_web` a la red externa `proxy_net`; Nginx Proxy Manager debe
usar `mokepon_web` como hostname y `8080` como puerto interno.

```bash
cp .env.production.example .env.production
docker compose --env-file .env.production -f compose.production.yml up -d --build
```

## Arcade · Senderos del Mayab

El menú incluye tres pantallas de plataformas: Selva (Kabrak), Ruinas (Sipak)
y Volcán (B'alam). El guardián elegido se mueve con flechas o A/D, salta con
Espacio, W o ↑ golpea de cerca con J/X y lanza su poder a distancia con K/Z. Cada guardián
tiene un proyectil de fuego, agua o tierra que se recarga automáticamente sin
gastar recursos. P o Escape pausa la partida. La guía inicial explica todos
los controles y puede abrirse de nuevo con **Controles**. Hay controles
táctiles y pausa automática al cambiar de pestaña. Cada intento tiene tres
vidas y un punto de control antes del jefe que restaura la salud. Los peligros
del camino incluyen tarántulas, serpientes, alacranes y chichicaste; esta última
es una planta fija que hace daño por contacto y no se elimina saltando encima. Al perder
una vida en el combate final, el jefe también recupera su salud.

Vencer desbloquea la siguiente pantalla. Los recursos recogidos más el premio
del nivel se acreditan una sola vez, en la primera victoria de cada pantalla;
repetir niveles no aumenta la cartera. Una partida en curso no se recupera
al recargar; las pantallas completadas y los recursos acreditados se conservan
en PostgreSQL. Los intentos expiran a las dos horas y duran hasta diez minutos
de juego activo. Iniciar un intento reemplaza cualquier otro que esté pendiente.

La simulación de 60 pasos por segundo se comparte entre cliente y servidor en
`public/js/arcade-engine.js`. El servidor reproduce los controles para verificar
la victoria y calcular el botín; no acepta cantidades ni resultados declarados
por el cliente. La migración `011_arcade.sql` conserva intentos y progreso; el
abono y el desbloqueo se ejecutan en una transacción idempotente.

Pruebas de físicas, victorias, replays y API (con PostgreSQL disponible):

```bash
docker exec mokepon node --test test/arcade-engine.test.js
```

### Celular horizontal y mandos

Al girar el dispositivo a horizontal (pantallas de hasta 1200 px de ancho y
600 px de alto), el arcade ocupa la vista, respeta las áreas seguras del
celular y dispone movimiento a la izquierda y acciones a la derecha. Al
cambiar entre vertical y horizontal, la partida se pausa. El botón **Pantalla
completa** se ofrece cuando el navegador lo admite; no es necesario para
usar el diseño horizontal.

Los mandos Bluetooth o USB se leen con Gamepad API, sin pedir acceso a Web
Bluetooth: primero se emparejan desde el sistema operativo. El navegador
debe reconocer su distribución como `standard`, permitir Gamepad API y servir
el juego mediante HTTPS (localhost también permite las pruebas locales).
Puede ser necesario pulsar y soltar un botón para que el navegador lo detecte.

- Palanca izquierda o cruceta: mover.
- A / ✕: saltar; confirmar en la guía y los menús.
- X / □: golpear.
- B / ○ o RT / R2: lanzar poder.
- Start / Options: pausar y continuar.
- Cruceta arriba/abajo: seleccionar acciones en los menús del arcade.

Los controles táctiles permanecen disponibles con un mando conectado. La
lectura aplica una zona muerta y espera a soltar botones tras una reconexión
o una pausa. Si se desconecta el mando seleccionado, la partida se pausa.
Las pruebas automatizadas simulan mandos estándar y desconexiones; la
compatibilidad de cada combinación de mando, sistema y navegador requiere
probarse con el dispositivo físico.

La guía del arcade ajusta su altura al panel disponible: el contenido se puede
desplazar y el botón de inicio permanece visible al pie. Los detalles del mando
y de los peligros se expanden dentro de la guía. En vertical, la cámara acerca
el escenario según el espacio disponible; en escritorio y horizontal mantiene
la vista panorámica. El escenario conserva su proporción y deja siempre espacio
para el encabezado, la cartera y los controles táctiles.

### Navegación completa con mando y controles táctiles

El mando permite recorrer las pantallas del juego y de restablecimiento de
contraseña: cruceta o palanca izquierda para seleccionar, A / ✕ para activar,
B / ○ para volver y palanca derecha para desplazar el contenido. Los campos
abren un teclado en pantalla; las cantidades y los selectores tienen editores
compatibles con mando. Los avisos y confirmaciones del juego también se pueden
aceptar o cancelar con el mando. Las verificaciones externas de reCAPTCHA y los
diálogos propios del navegador se completan con los controles del dispositivo.
En el mapa anterior al duelo, Start alterna entre explorar y navegar por los
menús. El arcade conserva sus controles de combate en tiempo real.

La barra del arcade distingue **Salud** (cinco corazones por intento) de
**Intentos** (tres al iniciar). Los controles continuos bloquean gestos de zoom
únicamente en sus zonas táctiles, incluidos sus iconos y textos; el resto del
contenido conserva la ampliación del navegador. Las entradas móviles usan
texto de al menos 16 px para evitar ampliaciones al enfocarlas.

Las pruebas `test/gamepad-ui.test.js` verifican la navegación espacial. Para
repetir las 17 comprobaciones con DOM real en desarrollo, copia temporalmente
`test/browser/controller.html` a `public/__controller-check.html` y
`test/browser/controller.js.txt` a `public/__controller-check.js`, abre
`/__controller-check.html` y pulsa **Ejecutar pruebas**. Elimina ambas copias
públicas al terminar; los archivos de prueba no se incluyen en la imagen.

### iPhone instalado, vista horizontal y DualSense

`manifest.webmanifest`, las etiquetas Apple y `icons/apple-touch-icon-v1.png`
definen el nombre, la portada y el modo de app instalada. No se añade caché
sin conexión ni service worker. Si iOS conserva la letra del acceso anterior,
vuelve a añadir el sitio a Inicio desde Safari para recoger el icono nuevo.

`mobile.css` adapta **todos los menús**, no solo el arcade. El encabezado se
mantiene visible y cada lista desplaza su propio contenido, respetando las áreas
seguras. `app-viewport.js` adapta la altura al viewport visual real de iPhone,
incluidos cambios de orientación y modo standalone, sin redimensionar durante
un gesto de ampliación.

La lectura de DualSense utiliza dirección dominante e histéresis para evitar
oscilación en diagonales. La palanca derecha desplaza en ambos ejes con velocidad
proporcional, independiente de los Hz de la pantalla. La navegación no desplaza
ancestros `overflow:hidden`; confirmar tampoco exige centrar la palanca izquierda.
Las pruebas unitarias incluyen perfiles DualSense estándar y el identificador
conocido sin `mapping`. Se verificaron menús y arcade en Chrome aislado, con
viewport móvil exacto (390×844 y 844×390), áreas seguras simuladas y entradas de
mando simuladas. La comprobación física en Safari/iPhone con DualSense sigue
requiriendo el dispositivo real.


## Duelos en tiempo real

Los duelos contra la máquina, las misiones y las salas en línea usan una arena
de plataformas: moverse, saltar, golpear, lanzar el poder del guardián y defender.
El escudo bloquea de frente, consume energía y se recupera al soltarlo. También
está disponible en Arcade. Teclado: A/D o flechas, espacio, J/X, K/Z y L/Shift.
DualSense: palanca izquierda, ✕, □, ○/R2 y R1/L1. La guía aparece antes del duelo.

`public/js/duel-engine.js` comparte la simulación entre navegador y servidor.
`server/combat-service.js` controla el reloj a 60 Hz, salud, impactos y resultado;
el cliente envía únicamente controles y secuencias y predice el dibujo. Las
rutas antiguas de ataques por turnos y resultados declarados devuelven 410.
Las recompensas y estadísticas conservan sus reglas y se guardan una sola vez.

Ambos jugadores deben confirmar que están listos. La espera vence a los 60 s.
En línea no hay pausa y una desconexión de 15 s cuenta como abandono. Contra
la máquina y en misiones se puede pausar; una desconexión vence a los 120 s.
Los combates duran hasta tres minutos activos; gana quien conserve más salud
al agotarse el tiempo. Los combates activos están en memoria y un reinicio
del servicio los interrumpe.

La cámara mantiene ambos guardianes visibles sin deformar la imagen. Las
vistas vertical y horizontal conservan áreas seguras, controles táctiles y
protección contra zoom accidental. Verificación: `docker exec mokepon npm test`
y revisión visual en 390×844, 844×390 y 1280×720. La emulación de mando no
sustituye una prueba física en iPhone con DualSense.
