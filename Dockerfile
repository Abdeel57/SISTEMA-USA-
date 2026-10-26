# ---------------------------------------------------------------------------
# Imagen unica de la plantilla: `api` y `web` salen de aqui (Coolify).
#
# Es la misma receta que usaba Railpack en Railway: todo el monorepo, con sus
# dependencias, compilado con Turborepo. Una sola imagen para los dos servicios
# porque comparten paquetes (`@app/brand`, `@app/database`...), y
# `docker-compose.yml` decide que arranca cada uno.
#
# NODE_ENV NO se fija antes de instalar: con `production`, pnpm se saltaria las
# dependencias de desarrollo, y TypeScript y Next las necesitan para compilar
# (y `db:bootstrap` compila su script antes de correrlo, como en Railway).
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1

# La version exacta de `packageManager` en package.json.
RUN npm install -g pnpm@10.15.0

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile \
 && pnpm exec turbo run build --filter=@app/api... --filter=@app/web...

ENV NODE_ENV=production

# Sin CMD propio: lo pone cada servicio en `docker-compose.yml`.
