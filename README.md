# Guardianes del Mayab

Videojuego web multijugador.

## Desarrollo local

```bash
docker compose up --build
```

Disponible en `http://localhost:8080`. El Compose local define explícitamente
`NODE_ENV=development`, permitiendo HTTP únicamente para desarrollo y
simuladores locales.

Las cuentas, puntos e historial se guardan en `data/accounts.json`. Para usar
otro volumen persistente, configura `DATA_FILE` con la ruta completa del
archivo. El nivel aumenta cada 5 batallas; una victoria otorga 30 puntos, un
empate 10 y una derrota 5.

## Seguridad de cuentas

Configura estas variables en `.env` antes de desplegar:

```text
RECAPTCHA_SITE_KEY=clave_publica_recaptcha_v2
RECAPTCHA_SECRET_KEY=clave_privada_recaptcha_v2
RESEND_API_KEY=re_xxxxxxxxx
EMAIL_FROM=Guardianes del Mayab <cuentas@tu-dominio.com>
IPINFO_TOKEN=token_ipinfo
```

Las claves de reCAPTCHA deben corresponder al tipo **v2 Checkbox** y tener
autorizado el dominio del juego. Resend requiere verificar el dominio del
remitente. `IPINFO_TOKEN` es opcional; sin él se conserva la IP y, cuando el
proxy la proporciona, el país, pero no se consulta ciudad o región.

Los códigos de activación duran 15 minutos y admiten cinco intentos. En
desarrollo, si no hay credenciales de Resend, el código se imprime únicamente
en el log del contenedor. Este comportamiento está deshabilitado en producción.

La auditoría se escribe como JSON Lines en `data/audit.jsonl` y rota al llegar
a 10 MB. Incluye evento, fecha, usuario, IP, ubicación aproximada y agente del
navegador; nunca guarda contraseñas, códigos ni tokens de sesión.

## Producción

La imagen Docker utiliza `NODE_ENV=production` de forma predeterminada. Debe
ejecutarse detrás de un proxy o balanceador TLS que envíe
`X-Forwarded-Proto: https`.

Configura `PUBLIC_ORIGIN` con el origen HTTPS canónico, por ejemplo:

```text
PUBLIC_ORIGIN=https://juego.example.com
```

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
