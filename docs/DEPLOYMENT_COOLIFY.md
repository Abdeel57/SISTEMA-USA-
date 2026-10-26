# Despliegue en Coolify (servidor propio)

Desde 2026-10-26 las paginas se alojan en un VPS de Hostinger con
[Coolify](https://coolify.io). `docs/DEPLOYMENT_RAILWAY.md` queda como
referencia de la instalacion anterior.

**Un cliente = un proyecto de Coolify** con una aplicacion "Docker Compose"
hecha desde este repositorio. Cada cliente tiene su propia base de datos, sus
propias contrasenas y sus dominios; no comparten nada. El codigo es el mismo
para todos: la marca de cada uno (nombre, logo, colores, datos legales) se
guarda desde su panel, en su base de datos.

| Pieza                         | Que es                                                                |
| ----------------------------- | --------------------------------------------------------------------- |
| `Dockerfile`                  | Una imagen con todo el monorepo compilado; la usan `api` y `web`.     |
| `docker-compose.yml`          | Los tres servicios de un cliente: `db` (PostgreSQL), `api` y `web`.   |
| `scripts/docker/api-start.sh` | `db:bootstrap` (migraciones, roles, marca, cuentas) y despues la API. |
| `scripts/coolify/*.mjs`       | Los dos comandos: lanzar un cliente nuevo y actualizar todos.         |

---

## Lanzar un cliente nuevo (con el comando)

1. Que los dos dominios apunten a la IP del servidor (registro **A**): el de la
   pagina (`cliente.com`) y el de la API (`api.cliente.com`). Sin eso Let's
   Encrypt no emite el certificado y la API no arranca (exige HTTPS).
2. En tu maquina, con `COOLIFY_URL` y `COOLIFY_TOKEN` puestos (o en
   `scripts/coolify/.env.coolify`, que git ignora):

   ```bash
   node scripts/coolify/nuevo-cliente.mjs --nombre "Cliente" --dominio cliente.com --admin tu@correo.com
   ```

   Opcional: `--cliente-email` y `--cliente-clave` crean ademas la cuenta del
   panel para el cliente (esa contrasena es solo la inicial; la cambia el).

3. Al terminar imprime la direccion del panel, el correo y la contrasena. En el
   panel: **Marca** -> nombre, logo, colores, datos legales y dominio.

## Lanzar un cliente nuevo (a mano, desde Coolify)

1. **Projects -> + Add** -> nombre del cliente.
2. **+ New -> Private Repository (with GitHub App)** -> `Abdeel57/SISTEMA-USA-`, rama
   `main`, **Build Pack: Docker Compose**, archivo `/docker-compose.yml`.
3. **Domains**: servicio `web` -> `https://cliente.com:8080`; servicio `api` ->
   `https://api.cliente.com:8080` (el `:8080` es el puerto interno).
4. **Environment Variables**: rellenar `ADMIN_EMAIL`. Las `SERVICE_*` las
   genera Coolify; `SERVICE_PASSWORD_ADMIN` es la contrasena del panel.
5. **Deploy**.

## Actualizar todas las paginas

Con **Auto Deploy** activo en cada aplicacion, subir cambios a la rama `main`
despliega todas solas. Para forzarlo:

```bash
node scripts/coolify/actualizar-todos.mjs           # despliega todas
node scripts/coolify/actualizar-todos.mjs --listar  # solo las lista
```

Cada despliegue corre `db:bootstrap` antes de arrancar la API: las migraciones
nuevas se aplican solas y los datos de cada cliente no se tocan.

---

## Variables

Todas estan declaradas en `docker-compose.yml`; en Coolify solo se rellenan
estas:

| Variable                                                                         | Para que                                                                 |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `ADMIN_EMAIL` (obligatoria)                                                      | Correo del administrador del panel.                                      |
| `SERVICE_PASSWORD_ADMIN`                                                         | Su contrasena. Cambiarla + redesplegar = contrasena nueva.               |
| `CLIENT_ADMIN_EMAIL`, `CLIENT_ADMIN_PASSWORD`                                    | Cuenta del panel para el cliente (solo se crea una vez).                 |
| `PAYMENT_PROVIDER`, `PAYMENT_PROVIDER_API_KEY`, `PAYMENT_WEBHOOK_SIGNING_SECRET` | Stripe: `stripe` + las dos llaves del cliente. Sin ellas, solo efectivo. |
| `NEXT_PUBLIC_META_PIXEL_ID`                                                      | Pixel de Meta del cliente.                                               |

El webhook de Stripe de cada cliente va a
`https://api.cliente.com/api/v1/webhooks/payments/stripe`.

## Comprobar que salio bien

- `https://cliente.com/healthz` -> `{"status":"ok"}`
- `https://api.cliente.com/api/v1/health/ready` -> 200
- En Coolify, los tres servicios en verde (**healthy**).

## Problemas frecuentes

| Sintoma                                          | Causa casi segura                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| `api` se reinicia y el log dice `API_PUBLIC_URL` | El dominio de `api` no es `https://`.                                   |
| Despliegue bloqueado por `ADMIN_EMAIL`           | Falta rellenarla en Environment Variables.                              |
| Certificado invalido                             | El dominio todavia no apunta a la IP del servidor.                      |
| `web` en error y `api` sana                      | `api` aun estaba arrancando; espera al healthcheck o redespliega `web`. |
