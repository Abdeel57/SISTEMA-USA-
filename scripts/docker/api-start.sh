#!/bin/sh
# ---------------------------------------------------------------------------
# Arranque del servicio `api` en Docker (Coolify).
#
# Hace lo que en Railway hacian `preDeployCommand` + `startCommand`: primero
# `db:bootstrap` (migraciones, contrasenas de los roles, marca inicial y
# cuentas del panel; todo idempotente) y despues el servidor. Si el bootstrap
# falla, el contenedor no arranca y Coolify lo marca como caido.
# ---------------------------------------------------------------------------
set -eu

# Coolify pasa como cadena VACIA las variables opcionales que nadie relleno, y
# la API distingue "vacia" de "ausente": una llave de Stripe vacia es un error
# de configuracion, una ausente es "Stripe apagado". Las vacias se quitan.
for name in PAYMENT_PROVIDER_API_KEY PAYMENT_WEBHOOK_SIGNING_SECRET; do
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    unset "$name"
  fi
done

pnpm --filter @app/database run db:bootstrap

exec node --enable-source-maps apps/api/dist/server.js
