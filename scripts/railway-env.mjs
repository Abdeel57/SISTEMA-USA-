#!/usr/bin/env node
/**
 * Genera el bloque de variables de entorno para Railway (DEC-043).
 *
 *   node scripts/railway-env.mjs
 *   node scripts/railway-env.mjs admin@dominio-del-cliente.com
 *
 * Imprime dos bloques listos para pegar en el "Raw Editor" de variables de
 * Railway, uno por servicio. Los secretos se generan aqui, en tu maquina, y
 * NO se escriben en ningun archivo: van a la salida estandar y de ahi al
 * gestor de variables de Railway. El repositorio nunca los ve.
 *
 * Todo lo que aparece como `${{...}}` es una referencia de Railway y debe
 * pegarse TAL CUAL: Railway la resuelve al desplegar. No la sustituyas a mano.
 *
 * Si lo ejecutas dos veces obtendras secretos distintos. Eso es correcto para
 * la primera instalacion; para rotarlos despues, ver la nota del final.
 */

import { randomBytes } from "node:crypto";

/**
 * `apps/api/src/config/env.ts` rechaza en produccion cualquier secreto que
 * contenga un marcador de la plantilla (FAKE, CHANGE_ME, REPLACE, EJEMPLO,
 * EXAMPLE). Un valor aleatorio puede contener uno por pura casualidad; sale
 * mas barato descartarlo y volver a tirar.
 *
 * base64url: solo `A-Z a-z 0-9 _ -`, porque estas contrasenas se incrustan
 * dentro de una URL de conexion de PostgreSQL.
 */
const PLACEHOLDER_MARKERS = /FAKE|CHANGE_ME|REPLACE|EJEMPLO|EXAMPLE/i;

const secret = (bytes = 32) => {
  for (;;) {
    const candidate = randomBytes(bytes).toString("base64url");
    if (!PLACEHOLDER_MARKERS.test(candidate)) {
      return candidate;
    }
  }
};

const adminEmail = (process.argv[2] ?? "admin@dominio-del-cliente.com").trim().toLowerCase();

const sessionSecret = secret(48);
const appPassword = secret(24);
const migratorPassword = secret(24);
const readonlyPassword = secret(24);
// Legible y facil de teclear la primera vez; se cambia en Railway cuando se quiera.
const adminPassword = secret(12);

const api = `NODE_ENV=production
TZ=UTC
LOG_LEVEL=info

PORT=8080
API_HOST=::
API_PORT=8080
API_PUBLIC_URL=https://\${{RAILWAY_PUBLIC_DOMAIN}}
API_BODY_LIMIT_BYTES=1048576
API_CORS_ALLOWED_ORIGINS=https://\${{web.RAILWAY_PUBLIC_DOMAIN}}
API_REQUEST_ID_HEADER=x-request-id
API_RATE_LIMIT_WINDOW_SECONDS=60
API_RATE_LIMIT_MAX_REQUESTS=120

DATABASE_NETWORK=private
DATABASE_SSL_MODE=disable
DATABASE_URL_APP=postgresql://app_runtime:\${{DB_APP_PASSWORD}}@\${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/\${{Postgres.PGDATABASE}}
DATABASE_POOL_MAX=10
DATABASE_STATEMENT_TIMEOUT_MS=15000

DATABASE_URL_SUPERUSER=\${{Postgres.DATABASE_URL}}
DB_APP_PASSWORD=${appPassword}
DB_MIGRATOR_PASSWORD=${migratorPassword}
DB_READONLY_PASSWORD=${readonlyPassword}

SESSION_SECRET=${sessionSecret}
SESSION_COOKIE_NAME=app_session
SESSION_COOKIE_DOMAIN=\${{web.RAILWAY_PUBLIC_DOMAIN}}
SESSION_COOKIE_SECURE=true
SESSION_TTL_MINUTES=1440
ADMIN_SESSION_TTL_MINUTES=480
ADMIN_SESSION_IDLE_TIMEOUT_MINUTES=15

PAYMENT_PROVIDER=none
DEFAULT_CURRENCY=USD

ADMIN_EMAIL=${adminEmail}
ADMIN_PASSWORD=${adminPassword}
ADMIN_NAME=Administrador`;

// Stripe (DEC-059) nace APAGADO (`PAYMENT_PROVIDER=none`): solo hay pago en
// efectivo confirmado desde el panel. Para cobrar con tarjeta se cambia a
// `PAYMENT_PROVIDER=stripe` y se anaden PAYMENT_PROVIDER_API_KEY y
// PAYMENT_WEBHOOK_SIGNING_SECRET con las llaves del cliente (ver `.env.example`).

const web = `NODE_ENV=production
TZ=UTC
PORT=8080
API_BASE_URL=http://\${{api.RAILWAY_PRIVATE_DOMAIN}}:8080/api/v1
WEB_ENABLE_API_MOCKS=false`;

// Meta Pixel: apagado salvo que se anada NEXT_PUBLIC_META_PIXEL_ID con el ID
// del pixel del cliente en el servicio "web".

const rule = "=".repeat(74);

process.stdout.write(`${rule}
VARIABLES PARA RAILWAY - Plantilla Sorteos (DEC-043)
${rule}

CONTIENE SECRETOS RECIEN GENERADOS. No pegues esta salida en un chat, un
issue ni un commit. Solo en el gestor de variables de Railway.

Los nombres de servicio importan: este bloque asume que has llamado a los
servicios exactamente "api", "web" y "Postgres". Si usas otros nombres,
ajusta las referencias \${{...}} en consecuencia.

${rule}
SERVICIO "api"  ->  Variables  ->  Raw Editor  ->  pegar todo esto
${rule}

${api}

${rule}
SERVICIO "web"  ->  Variables  ->  Raw Editor  ->  pegar todo esto
${rule}

${web}

${rule}

ACCESO AL PANEL
  Direccion:   https://<dominio-de-web>/admin
  Correo:      ${adminEmail}
  Contrasena:  ${adminPassword}

El administrador se crea (o se actualiza) solo, en cada despliegue de "api",
a partir de ADMIN_EMAIL y ADMIN_PASSWORD. Para cambiar la contrasena del
panel: cambia ADMIN_PASSWORD en Railway y redespliega "api".

NOTA SOBRE ROTACION
Volver a ejecutar este script genera secretos nuevos. Si ya habias
desplegado, cambiar DB_APP_PASSWORD aqui NO basta: la contrasena del rol
en PostgreSQL solo se actualiza cuando vuelve a correr \`db:bootstrap\`, que
sucede en el siguiente despliegue de "api". Cambia la variable y redespliega;
entre ambos momentos la API no podra conectarse.

SESSION_SECRET es distinto: rotarlo invalida todas las sesiones abiertas.
`);
