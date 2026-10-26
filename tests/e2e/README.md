# `tests/e2e` — recorrido de punta a punta

Navegador → `apps/web` → `apps/api` → PostgreSQL real. Es la única red del
repositorio que ejercita el autorizador de verdad, sesiones de verdad y filas de
verdad. Responde a `HO-030`.

Propietario: `security-integration` (DEC-024).

---

## Lo que este paquete NO es

- **No es el humo.** `pnpm --filter @app/web smoke` recorre 50+ rutas contra el
  servidor de _mocks_ de `apps/web`: no toca `apps/api`, ni una migración, ni el
  ledger. Sigue siendo útil y sigue corriendo; prueba otra cosa.
- **No sustituye a los tests de integración.** `packages/database` comprueba
  `GRANT`, triggers y columnas generadas contra el motor. Eso vive allí.

---

## Estado: nunca se ha ejecutado

Se escribió en una máquina **sin Docker, sin PostgreSQL y sin
`@playwright/test` instalado**. Lo único que se ha verificado localmente es la
sintaxis (`pnpm --filter @app/tests-e2e run typecheck`) y el lint. La primera
ejecución real es la de CI.

### Dependencia nueva

`@playwright/test` **no estaba en el lockfile**. Sí aparece en `pnpm-lock.yaml`,
pero como _peer dependency opcional de `next`_, que es otra cosa: no se instala.

Hasta que alguien ejecute **una vez** `pnpm install` en la raíz, el paso de
instalación de **todos** los jobs de CI falla con `ERR_PNPM_OUTDATED_LOCKFILE`,
porque además `tests/e2e` es un _importer_ nuevo del workspace. Es deliberado
que falle así: relajar `--frozen-lockfile` convertiría un control de cadena de
suministro en un adorno.

```bash
pnpm install
pnpm --filter @app/tests-e2e exec playwright install --with-deps chromium
```

---

## Por qué el código es `.mjs` y no TypeScript

`eslint.config.mjs` de la raíz aplica la capa _type-aware_ a `**/*.{ts,tsx}` de
todo el repositorio. Con `@playwright/test` sin instalar, TypeScript no resuelve
el módulo, las importaciones quedan como `any` y `no-unsafe-call` /
`no-unsafe-member-access` ponen en rojo `pnpm run lint:root` **para todo el
mundo** (medido: 8 errores en un fichero de 6 líneas).

En `.mjs` esa capa no se aplica y el paquete puede existir en el árbol sin
romper los gates de nadie mientras la dependencia no esté. Precedente:
`apps/web/scripts/smoke.mjs`.

Si algún día se quiere TypeScript aquí, el requisito previo es que
`@playwright/test` esté instalado en todos los clones.

---

## Dos modos

| Modo    | Cómo                                         | Qué prueba                                             |
| ------- | -------------------------------------------- | ------------------------------------------------------ |
| `full`  | por defecto; es el de CI                     | el sistema entero contra PostgreSQL real               |
| `mocks` | `E2E_MODE=mocks pnpm ... run test:e2e:mocks` | solo la **mecánica** de Playwright, contra los _mocks_ |

En `mocks` solo corren las pruebas etiquetadas `@mockable`. Etiquetar una que
dependa de datos sembrados la haría fallar contra los _fixtures_ del mock, y ese
fallo no diría nada sobre el sistema.

---

## Cómo se ejecuta en local (con Docker y PostgreSQL)

```bash
# 1. base de datos y migraciones
export DATABASE_URL_MIGRATOR=postgresql://postgres:postgres@127.0.0.1:5432/app_e2e
pnpm --filter @app/database run db:migrate

# 2. escenario  (necesita DATABASE_URL_APP)
node tests/e2e/seed/seed-e2e.mjs

# 3. recorrido  (Playwright levanta apps/api y apps/web)
pnpm --filter @app/tests-e2e run test:e2e
```

El escenario deja lo que ha generado —los identificadores— en
`E2E_FIXTURE_FILE` (por defecto, el temporal del sistema). **Fuera del árbol del
repositorio**, para que un artefacto generado no ensucie `git status` ni acabe
versionado el día que alguien haga `git add -A`.

---

## El escenario sembrado

`seed/seed-e2e.mjs`, en una única transacción, con el rol `app` (DEC-003):

- un participante **con credencial Argon2id**, porque `apps/api` no tiene
  endpoint de registro;
- dos cuentas de personal que entran **solo con correo y contraseña** (la
  plantilla no tiene segundo factor): `PROMOTION_MANAGER` y
  `COMPLIANCE_OFFICER`, **un rol cada una**. No es por separación de funciones
  —la plantilla no la tiene, y el administrador real, que crea `db:bootstrap`
  desde `ADMIN_EMAIL`/`ADMIN_PASSWORD`, lleva todos los roles—, sino para que
  las pruebas puedan comprobar la matriz rol × capacidad (por ejemplo, que
  `PROMOTION_MANAGER` no activa reglas);
- un producto con una variante a 2500 unidades menores USD;
- una promoción **ACTIVE** con su versión de reglas **ACTIVE**;
- `amoe_enabled` y `manual_adjustments_enabled` encendidos **con motivo y
  actor**, vía el trigger de DEC-013, de modo que queda la fila de
  `feature_flag_changes`.

### Sobre las claves legales

DEC-012 impide activar una promoción con claves legales sin resolver, y
`docs/LEGAL_PENDING.md` las tiene todas en `TBD`. El escenario las resuelve con
**texto de relleno que lo dice en el propio dato**:

```
E2E FIXTURE - PROVISIONAL, SIN VALOR LEGAL. Ver docs/LEGAL_PENDING.md.
```

Eso **no** decide nada legal: hace que la promoción pueda existir en `ACTIVE`
dentro de una base de datos efímera. Ningún valor del escenario debe copiarse a
ningún otro entorno, y ninguna prueba afirma una cifra que dependa de una regla
legal (por eso `04-cart-checkout` comprueba que la cotización viene **anclada** a
la versión de reglas, y no cuántas participaciones da).

Los textos que se sirven **en los dos idiomas** llevan el relleno etiquetado —
`E2E FIXTURE (EN) - …` y `E2E FIXTURE (ES) - …`, vía `fillerFor()`— porque
`06-amoe` comprueba que la página inglesa **no** trae el texto castellano. Con
el mismo comienzo en ambos, esa comprobación se cumpliría sola.

---

## Pasos bloqueados

`lib/blockers.mjs` enumera los defectos que hoy impiden completar un paso, con
fichero y evidencia. Las pruebas de esos pasos **afirman el comportamiento
correcto** y están marcadas `test.fixme`, nunca reescritas para afirmar el
defecto: una prueba que afirma un fallo lo convierte en contrato y se pone roja
el día que alguien lo arregla.

Apagar un bloqueo es cambiar una línea de ese fichero, en el mismo commit que lo
arregla.
