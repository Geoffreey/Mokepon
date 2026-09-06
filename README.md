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
