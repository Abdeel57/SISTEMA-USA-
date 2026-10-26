/**
 * Cliente minimo de la API de Coolify para los scripts de despliegue.
 *
 * Lee la conexion de dos variables de entorno, que NUNCA se escriben en el
 * repositorio:
 *
 *   COOLIFY_URL    p. ej. http://2.25.81.43:8000  (sin barra final)
 *   COOLIFY_TOKEN  token de "Keys & Tokens -> API Tokens" (read, write, deploy)
 *
 * Tambien se pueden poner en `scripts/coolify/.env.coolify` (ignorado por git:
 * `.gitignore` excluye `.env.*`).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const localEnv = join(here, ".env.coolify");

if (existsSync(localEnv)) {
  for (const line of readFileSync(localEnv, "utf8").split(/\r?\n/u)) {
    const match = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/u.exec(line);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}

const baseUrl = (process.env.COOLIFY_URL ?? "").replace(/\/+$/u, "");
const token = process.env.COOLIFY_TOKEN ?? "";

if (baseUrl === "" || token === "") {
  console.error(
    "Faltan COOLIFY_URL y COOLIFY_TOKEN (variables de entorno o scripts/coolify/.env.coolify).",
  );
  process.exit(1);
}

/** Llamada a `/api/v1/...`. Lanza con el cuerpo de la respuesta si no es 2xx. */
export async function coolify(method, path, body) {
  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data;
  try {
    data = text === "" ? null : JSON.parse(text);
  } catch {
    data = text;
  }
  if (!response.ok) {
    const detail = typeof data === "string" ? data : JSON.stringify(data);
    throw new Error(`${method} ${path} -> ${String(response.status)}: ${detail}`);
  }
  return data;
}

/** El repositorio de la plantilla, tal como lo guarda Coolify (`usuario/repo`). */
export const TEMPLATE_REPOSITORY = process.env.TEMPLATE_REPOSITORY ?? "Abdeel57/plantilla-sorteos";
export const TEMPLATE_BRANCH = process.env.TEMPLATE_BRANCH ?? "main";

/** Lee `--clave valor` y `--clave=valor` de la linea de comandos. */
export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) continue;
    const [key, inline] = current.slice(2).split("=", 2);
    if (inline !== undefined) {
      args[key] = inline;
    } else if (argv[index + 1] !== undefined && !argv[index + 1].startsWith("--")) {
      args[key] = argv[index + 1];
      index += 1;
    } else {
      args[key] = "true";
    }
  }
  return args;
}
