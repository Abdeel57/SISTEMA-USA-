# Despliegue en Railway

Registro operativo de DEC-043. Railway aloja los tres componentes —`apps/web`,
`apps/api` y PostgreSQL— dentro de un mismo proyecto, comunicados por su red
privada.

> **Antes de publicar una promoción**, la marca del cliente tiene que estar
> guardada desde el panel (**Marca**; `packages/brand/src/brand.config.ts` son
> solo los valores iniciales, ver el README de la raíz) y los textos legales
> revisados por su abogado. Ninguna página puede presentar una promoción como
> vigente hasta que existan Official Rules aprobadas.

---

## Antes de empezar

- El repositorio debe estar subido a GitHub (Railway despliega desde el repo).
  Para cada cliente: un repositorio nuevo y un proyecto de Railway nuevo. Las
  instalaciones no comparten nada (base de datos, secretos ni dominios).
- Una cuenta en [railway.com](https://railway.com).
- Node instalado en tu máquina, solo para generar los secretos del paso 5.

No hace falta Docker, ni la CLI de Railway, ni tocar ningún archivo.

---

## Los 7 pasos

Los 7 pasos valen igual desde el dashboard. También se puede hacer todo desde
la CLI de Railway:

```bash
railway init --name <nombre-del-cliente> --workspace "<workspace>"
railway add --database postgres            # se llama Postgres
railway add --service api                  # vacío; el repo se conecta al final
railway add --service web
railway domain --service api               # antes de las variables: las referencian
railway domain --service web
node scripts/railway-env.mjs admin@dominio-del-cliente.com   # y aplicar con `railway variables --set`
railway service source connect --repo <usuario>/<repositorio> --branch main --service api
railway service source connect --repo <usuario>/<repositorio> --branch main --service web
```

Conectar el repo **al final** importa: es lo que dispara el primer despliegue, y
para entonces las variables y los ajustes de servicio ya tienen que estar.

### 1. Proyecto vacío

En Railway: **New Project → Empty Project**.

Se empieza vacío a propósito. Si eliges "Deploy from GitHub repo", Railway
detecta el monorepo pnpm e intenta crear un servicio por paquete desplegable,
incluidos los que no son servicios. Sale más barato crear los dos que
queremos.

### 2. PostgreSQL

**+ New → Database → PostgreSQL**.

Déjalo con su nombre por defecto, **`Postgres`**. Las variables del paso 5 lo
referencian por ese nombre.

### 3. Servicio `api`

**+ New → GitHub Repo →** selecciona el repositorio.

Luego, en **Settings** del servicio:

| Campo        | Valor |
| ------------ | ----- |
| Service Name | `api` |

**Config-as-code está deprecado (agosto de 2026).** Railway ya no acepta fijar
`railway.json` como archivo de configuración por su API ("Config as Code is
deprecated. Use Infrastructure as Code (.railway/railway.ts)"). El archivo
`apps/api/railway.json` **se conserva como fuente de verdad legible**, y sus
campos se aplican directamente al servicio con la mutación
`serviceInstanceUpdate` de la API pública (`railway api`): `builder`,
`buildCommand`, `watchPatterns`, `startCommand`, `healthcheckPath`,
`healthcheckTimeout`, `restartPolicyType`, `restartPolicyMaxRetries` y
`preDeployCommand`. Son los mismos nombres, uno a uno. En el dashboard es
**Settings → Build / Deploy** del servicio.

No pongas Root Directory: el build necesita la raíz del monorepo.

### 4. Servicio `web`

**+ New → GitHub Repo →** el **mismo** repositorio otra vez.

| Campo        | Valor |
| ------------ | ----- |
| Service Name | `web` |

Mismo mecanismo que `api`, con `apps/web/railway.json` como fuente.

### 5. Variables

En tu máquina:

```bash
node scripts/railway-env.mjs admin@dominio-del-cliente.com
```

Imprime dos bloques con los secretos ya generados, y la dirección, el correo
y la contraseña inicial del panel. En Railway, para cada servicio:
**Variables → Raw Editor →** pegar el bloque correspondiente.

Las opcionales se añaden aparte, cuando el cliente las tenga:

- `api`: `PAYMENT_PROVIDER=stripe`, `PAYMENT_PROVIDER_API_KEY` y
  `PAYMENT_WEBHOOK_SIGNING_SECRET` para cobrar con tarjeta (sin ellas, solo
  efectivo).
- `web`: `NEXT_PUBLIC_META_PIXEL_ID` con el pixel de Meta del cliente (sin
  ella, el pixel no se carga).

Los `${{...}}` son referencias de Railway y **se pegan tal cual**: Railway los
resuelve al desplegar. No los sustituyas a mano.

La salida contiene secretos reales. No la pegues en un chat, un issue ni un
commit.

### 6. Dominios

En **Settings → Networking → Generate Domain**, para **ambos** servicios.

- `web` lo necesita porque es la web pública.
- `api` lo necesita porque su esquema de entorno exige un `API_PUBLIC_URL`
  sobre HTTPS, y además te deja consultar `/api/v1/health/ready` para
  diagnosticar. El navegador nunca lo usa: `web` habla con `api` por la red
  privada.

### 7. Desplegar

**Deploy** en `api`, y cuando termine, en `web`. Ese orden importa solo la
primera vez: `api` es quien crea el esquema de la base de datos.

---

## Qué ocurre en cada despliegue de `api`

Antes de arrancar el proceso, Railway ejecuta `preDeployCommand`:

```
pnpm --filter @app/database run db:bootstrap
```

Que hace cuatro cosas, todas idempotentes:

1. Aplica las migraciones pendientes con el superusuario del proveedor.
2. Asigna a `app_migrator`, `app_runtime` y `app_readonly_report` las contraseñas
   que llegan por variables de entorno.
3. Copia la marca inicial de `packages/brand` (nombre, datos legales, correo,
   dominio, prefijos, zona horaria) a la fila `brand_profile`, **solo mientras
   nadie haya guardado desde el panel**; después manda lo guardado.
4. Crea o pone al día el **administrador del panel** con `ADMIN_EMAIL`,
   `ADMIN_PASSWORD` y `ADMIN_NAME`: todos los roles de personal, sin segundo
   factor. Si `ADMIN_PASSWORD` cambió, fija la nueva y cierra sus sesiones; si
   no cambió, no toca nada. Si además hay `CLIENT_ADMIN_EMAIL` y
   `CLIENT_ADMIN_PASSWORD`, crea la **cuenta del cliente** con la misma
   autoridad; esa contraseña es solo la inicial y no se vuelve a tocar.

Existe porque en una base recién creada hay un arranque en frío circular: el
rol `app_migrator` lo crea la migración `0000_baseline.sql`, y se crea **sin
contraseña** a propósito —una contraseña dentro de una migración sería una
contraseña versionada—. El único credencial que existe el minuto cero es el
superusuario que crea Railway.

Si el bootstrap falla, el despliegue se detiene y **no se promociona la
versión nueva**: la anterior sigue sirviendo.

---

## Acceso al panel

`https://<dominio-de-web>/admin`, con `ADMIN_EMAIL` y `ADMIN_PASSWORD`. Solo
contraseña: sin código ni QR. Para cambiar la contraseña, cambia
`ADMIN_PASSWORD` en el servicio `api` y redespliega `api`.

**Cuenta para el cliente.** Pon `CLIENT_ADMIN_EMAIL` y `CLIENT_ADMIN_PASSWORD`
(una contraseña sencilla, mínimo 8 caracteres) en el servicio `api` y
redespliega `api`. El cliente entra con ellas y la cambia en **Mi cuenta** (el
correo arriba a la derecha en la computadora, o “Más” en el teléfono). Desde
ese momento la contraseña es suya: ningún despliegue la vuelve a poner.

---

## Comprobar que salió bien

```bash
curl -i https://<dominio-de-web>/healthz          # {"status":"ok"}
curl -i https://<dominio-de-api>/api/v1/health/ready
```

`/api/v1/health/ready` devuelve `503` si la base de datos no responde. Es el
healthcheck que usa Railway, así que un despliegue que no consiga hablar con
PostgreSQL falla de forma visible en vez de servir páginas de error.

---

## Decisiones que hay detrás, y sus trampas

Están todas en DEC-043. Resumen de las que muerden si se cambian sin pensar:

**`API_HOST=::` y no `0.0.0.0`.** La red privada de Railway es IPv6. Un
proceso que solo escuche en IPv4 es invisible dentro de ella, y `web` no
podría llamar a `api` aunque ambos estén sanos. Escuchar en `::` da doble pila
y sirve para los dos caminos.

**`PORT=8080` fijado a mano en `api`.** Railway asigna un `PORT` solo si no lo
defines tú. Aquí se define porque `${{api.RAILWAY_PRIVATE_DOMAIN}}` necesita
un puerto conocido: la referencia `${{api.PORT}}` **no** resuelve al puerto que
el servicio esté escuchando en tiempo de ejecución, solo a una variable puesta
a mano.

**`DATABASE_NETWORK=private` con `DATABASE_SSL_MODE=disable`.** Es la única
concesión de seguridad del despliegue, y está documentada como tal. Railway
emite certificados autofirmados, así que `verify-full` es inalcanzable contra
su Postgres gestionado. Se rechazó `require` a propósito: cifra sin verificar,
no protege de un intermediario y encima aparenta que sí. Lo que se sustituye
es una garantía criptográfica por una topológica, y solo se sostiene mientras
la base **no** tenga un endpoint público. El valor por defecto del esquema
sigue siendo `public` → `verify-full`.

> **Si algún día generas un dominio público para el servicio `Postgres`, esta
> decisión deja de ser válida.** Hoy no hay ningún control automático que lo
> detecte. Está anotado en `docs/AGENT_HANDOFF.md` (HO-022) para revisión de
> `security`.

**Las migraciones las aplica el superusuario.** DEC-003 pedía separar
`migrator` del propietario del esquema; Railway no cede la propiedad de
`public`. Lo que sí se conserva es la separación que de verdad protege el
ledger: la aplicación corre como `app_runtime`, que nunca recibe `UPDATE`/`DELETE`
sobre ledger ni auditoría (DEC-007), y eso lo garantizan los `GRANT`
explícitos de cada migración, que se aplican sea quien sea quien las ejecute.

> **Pero esto no sale gratis, y la primera versión de este documento lo
> presentaba como si lo fuera.** `DATABASE_URL_SUPERUSER` se declara entre las
> variables del servicio `api`, y en Railway el `preDeployCommand` comparte
> entorno con el proceso que sirve: esa credencial vive en el `process.env` de
> un proceso de larga duración expuesto a Internet. DEC-007 y DEC-012 se
> aplican con **triggers**, y un trigger no defiende del propietario de la
> tabla — desde ese rol se desactivan con `SET session_replication_role`.
>
> La formulación correcta: no rebaja nada **para el rol de aplicación**, y
> concentra una credencial capaz de saltarse los triggers en el proceso más
> expuesto. La corrección completa, con la refutación de la auditoría, está en
> DEC-043.

---

## Rotar secretos

Cambiar `DB_APP_PASSWORD` en Railway **no** cambia la contraseña del rol en
PostgreSQL por sí solo: eso ocurre cuando vuelve a correr `db:bootstrap`, es
decir en el siguiente despliegue de `api`. Cambia la variable y redespliega.
Entre ambos momentos la API no podrá conectarse.

`SESSION_SECRET` se valida al arrancar pero hoy no firma nada: las sesiones
son tokens opacos guardados por su hash en la base de datos. Cambiarlo no
cierra sesiones.

`ADMIN_PASSWORD` funciona igual que las de los roles: cambia la variable y
redespliega `api`; el bootstrap fija la nueva contraseña del panel.

---

## Problemas frecuentes

| Síntoma                                        | Causa casi segura                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| `api` no arranca y lista variables inválidas   | Falta alguna variable del bloque, o se pegó un `${{...}}` ya sustituido a mano. |
| `web` sirve páginas con estado de error        | `API_BASE_URL` mal formada, o `api` aún no ha desplegado.                       |
| `web` no alcanza a `api`                       | `API_HOST` no es `::`, o los servicios no se llaman exactamente `api` y `web`.  |
| El healthcheck de `api` da 503                 | El bootstrap no llegó a crear los roles, o `DATABASE_URL_APP` apunta mal.       |
| El build de `api` no encuentra `@app/database` | Se puso un Root Directory. El build necesita la raíz del monorepo.              |
