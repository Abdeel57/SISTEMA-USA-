# Plantilla Sorteos

Plataforma bilingüe (español / inglés) de **e-commerce + sweepstakes** para
Estados Unidos, lista para montarse con la marca de cada cliente.

Los usuarios compran mercancía y esas compras **pueden generar
participaciones** conforme a las **Official Rules** de cada promoción, junto a
un mecanismo **AMOE** (entrada gratuita). Incluye tienda, carrito, pedidos,
pago en efectivo (y Stripe opcional), participaciones auditables, panel de
administración, exportes y auditoría.

> No es una página de venta de boletos, ni una rifa, ni una lotería.

---

## Montar un cliente nuevo

**La marca se configura desde el panel de administración, sin tocar código ni
redesplegar**: `https://<dominio-de-web>/admin` → **Marca**. Ahí se editan el
nombre, el logotipo tipográfico (dos líneas), el logotipo gráfico (se sube como
una foto del catálogo), los dos colores de la paleta (el resto se deriva solo),
la intensidad del patrón de fondo, la razón social, dirección, estado y
tribunales que llevan los textos legales, el correo de contacto, el dominio, los
prefijos de pedidos y participaciones y la zona horaria del corte de caja. Se
aplica en la siguiente petición de la tienda y queda en la auditoría.

Lo que sigue viviendo en el código:

| Qué                                                                   | Dónde                                                                                                                               |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Valores **iniciales** de la marca (se copian a la base el primer día) | `packages/brand/src/brand.config.ts` — solo mientras nadie haya guardado desde el panel; después manda la base de datos             |
| Paleta de respaldo y superficies fijas (negros, banda clara, estados) | `packages/design-system/src/styles/tokens.css`; los tokens de marca y acento los sobreescribe la web con lo guardado en el panel    |
| Símbolo de respaldo (sin logotipo subido)                             | `apps/web/brand/logo.svg` → `node apps/web/scripts/build-brand-assets.mjs` (el símbolo lo sustituye el logotipo subido en el panel) |
| Pixel de Meta y llaves de Stripe                                      | Variables de entorno en Railway (opcionales)                                                                                        |

Pasos:

1. Despliega (ver abajo) y entra al panel.
2. En **Marca**, rellena los datos del cliente, sube su logotipo y elige sus
   colores. Opcional: deja también esos valores en `brand.config.ts` para que
   una base nueva arranque ya con ellos.
3. El icono de la pestaña, el de la pantalla de inicio del teléfono y la imagen
   de la vista previa al compartir el enlace salen solos del logotipo y el color
   guardados (`/brand-icon.png`). No hay que regenerar nada.
4. **Textos legales.** Términos, Privacidad y Aviso de California
   (`apps/web/src/legal/`) toman los datos del cliente de la marca guardada,
   pero **los redactó el abogado de otro negocio**: el cliente debe revisarlos
   con el suyo antes de publicar una promoción. Las Official Rules de cada
   promoción se cargan desde el panel.

---

## Desplegar en Railway

Resumen (detalle en [docs/DEPLOYMENT_RAILWAY.md](docs/DEPLOYMENT_RAILWAY.md)):

1. Sube el código a un repositorio nuevo de GitHub.
2. En Railway: proyecto vacío → base de datos **PostgreSQL** (nombre
   `Postgres`) → servicio **`api`** y servicio **`web`** desde el repositorio.
3. Genera las variables en tu máquina:

   ```bash
   node scripts/railway-env.mjs admin@dominio-del-cliente.com
   ```

   Pega cada bloque en **Variables → Raw Editor** de su servicio. La salida
   incluye la contraseña inicial del panel.

4. Genera dominio para `api` y `web` (Settings → Networking).
5. Despliega `api` primero y luego `web`.

### Acceso al panel

`https://<dominio-de-web>/admin`, con `ADMIN_EMAIL` y `ADMIN_PASSWORD`. Solo
contraseña: **sin código, sin QR, sin segunda persona**. El administrador se
crea solo en cada despliegue de `api` y tiene todos los permisos. Para cambiar
su contraseña: cambia `ADMIN_PASSWORD` en Railway y redespliega `api`.

### Pagos

Por defecto solo hay **pago en efectivo**, que se confirma desde el panel. Para
cobrar con tarjeta, en el servicio `api` se pone `PAYMENT_PROVIDER=stripe`,
`PAYMENT_PROVIDER_API_KEY` y `PAYMENT_WEBHOOK_SIGNING_SECRET` con las llaves del
cliente (ver `.env.example`).

### Lo que la plantilla no hace

- **No envía correos ni SMS.** El alta y el acceso de los clientes son con
  correo y contraseña, sin verificación.
- Si un cliente olvida su contraseña, se la cambia el administrador desde
  **Panel → Participantes**.

---

## Desarrollo local

Requiere Node 24 y pnpm 10.

```bash
pnpm install
cp .env.example .env        # valores de desarrollo
pnpm dev                    # web y api (la api necesita PostgreSQL)
pnpm typecheck && pnpm test # comprobaciones
```

Las pruebas de integración (`pnpm test:integration`) y las e2e necesitan
Docker y PostgreSQL.

---

## Estructura

```text
apps/
  api/            API HTTP (Fastify)
  web/            Tienda, portal del participante y panel (Next.js)
packages/
  brand/          Configuracion de marca del cliente
  database/       Esquema, migraciones (Drizzle) y arranque de la base
  design-system/  Colores y tokens visuales
  ui/             Componentes
  security/       Sesiones, permisos y validacion de entorno
  sweepstakes/    Motor de participaciones y AMOE
  commerce/       Pedidos y pagos
  audit/ tpa/     Auditoria, exportes y administrador externo
docs/             Arquitectura, decisiones, contrato de la API, despliegue
scripts/          Variables de Railway y utilidades
```

---

## Reglas que se mantienen

- Las Official Rules las determina el abogado del cliente. Nadie inventa
  requisitos legales.
- Lo legal y comercial crítico es **configurable**, nunca fijo en el código.
- Español e inglés son idiomas de primera clase.
- Las participaciones son **auditables** y **no se borran**: devoluciones,
  contracargos y descalificaciones se reflejan con movimientos.
- Un sorteo interno **no se activa sin autorización**.
- **Sin secretos en el repositorio.**

La documentación completa del diseño está en [CLAUDE.md](CLAUDE.md) y en
[`docs/`](docs/).
