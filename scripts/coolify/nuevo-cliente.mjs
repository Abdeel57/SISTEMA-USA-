#!/usr/bin/env node
/**
 * Lanza la pagina de un cliente nuevo en Coolify, de principio a fin.
 *
 *   node scripts/coolify/nuevo-cliente.mjs \
 *     --nombre "Rifas Lopez" \
 *     --dominio rifaslopez.com \
 *     --admin tu-correo@ejemplo.com
 *
 * Opcionales:
 *   --api api.rifaslopez.com     dominio del servicio `api` (por defecto api.<dominio>)
 *   --cliente-email x@y.com      crea tambien la cuenta del panel para el cliente
 *   --cliente-clave "..."        su contrasena INICIAL (minimo 8; luego la cambia el)
 *   --servidor <uuid>            si Coolify gestiona mas de un servidor
 *   --github-app <uuid>          si hay mas de una GitHub App privada
 *   --sin-esperar                no esperar a que termine el despliegue
 *
 * Que hace:
 *   1. Crea un proyecto de Coolify con el nombre del cliente.
 *   2. Crea dentro una aplicacion "Docker Compose" desde el repositorio de la
 *      plantilla (`docker-compose.yml`): base de datos, api y web propias.
 *   3. Le asigna los dos dominios con HTTPS automatico.
 *   4. Pone el correo del administrador y una contrasena nueva para el panel.
 *      El resto de contrasenas las genera Coolify (variables SERVICE_*).
 *   5. Despliega y espera a que termine.
 *
 * Antes: los dos dominios tienen que apuntar (registro A) a la IP del
 * servidor, o Let's Encrypt no podra emitir el certificado.
 *
 * La marca del cliente (nombre, logo, colores, datos legales) se pone despues
 * desde su panel: https://<dominio>/admin -> Marca.
 */
/* eslint-disable no-console -- herramienta de linea de comandos: su salida ES la consola. */
import { randomBytes } from "node:crypto";

import { coolify, parseArgs, TEMPLATE_BRANCH, TEMPLATE_REPOSITORY } from "./coolify-api.mjs";

const args = parseArgs(process.argv.slice(2));

const name = (args.nombre ?? "").trim();
const webDomain = normalizeDomain(args.dominio ?? "");
const apiDomain = normalizeDomain(args.api ?? (webDomain === "" ? "" : `api.${webDomain}`));
const adminEmail = (args.admin ?? "").trim().toLowerCase();

if (name === "" || webDomain === "" || adminEmail === "") {
  console.error(
    'Uso: node scripts/coolify/nuevo-cliente.mjs --nombre "Cliente" --dominio cliente.com --admin tu@correo.com',
  );
  process.exit(1);
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(adminEmail)) {
  console.error(`--admin no parece un correo: ${adminEmail}`);
  process.exit(1);
}
if (args["cliente-email"] !== undefined && (args["cliente-clave"] ?? "").length < 8) {
  console.error(
    "--cliente-clave es obligatoria con --cliente-email y debe tener al menos 8 caracteres.",
  );
  process.exit(1);
}

/** `https://Dominio.com/` -> `dominio.com`. */
function normalizeDomain(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//u, "")
    .replace(/\/.*$/u, "");
}

/** Facil de teclear la primera vez: letras y numeros, sin simbolos. */
function newPassword() {
  for (;;) {
    const candidate = randomBytes(12).toString("base64url").replace(/[-_]/gu, "");
    if (candidate.length >= 14) return candidate.slice(0, 14);
  }
}

async function pickServer() {
  if (args.servidor !== undefined) return args.servidor;
  const servers = await coolify("GET", "/servers");
  if (!Array.isArray(servers) || servers.length === 0)
    throw new Error("Coolify no tiene servidores.");
  if (servers.length > 1) {
    console.error("Hay varios servidores; elige uno con --servidor <uuid>:");
    for (const server of servers) console.error(`  ${server.uuid}  ${server.name}  ${server.ip}`);
    process.exit(1);
  }
  return servers[0].uuid;
}

/** La GitHub App privada de Coolify que tiene acceso al repositorio de la plantilla. */
async function pickGithubApp() {
  if (args["github-app"] !== undefined) return args["github-app"];
  const apps = await coolify("GET", "/github-apps");
  const privateApps = (Array.isArray(apps) ? apps : []).filter((app) => app.is_public !== true);
  const wanted = TEMPLATE_REPOSITORY.toLowerCase();
  for (const app of privateApps) {
    const repos = await coolify("GET", `/github-apps/${String(app.id)}/repositories`);
    const list = Array.isArray(repos) ? repos : (repos?.repositories ?? []);
    if (list.some((repo) => String(repo.full_name ?? "").toLowerCase() === wanted)) return app.uuid;
  }
  console.error(
    `Ninguna GitHub App de Coolify tiene acceso a ${TEMPLATE_REPOSITORY}. En GitHub: Settings -> Applications -> la app de Coolify -> Configure -> Repository access.`,
  );
  process.exit(1);
}

async function waitForDeployment(deploymentUuid) {
  const deadline = Date.now() + 20 * 60 * 1000;
  let last = "";
  while (Date.now() < deadline) {
    const deployment = await coolify("GET", `/deployments/${deploymentUuid}`);
    const status = String(deployment?.status ?? "");
    if (status !== last) {
      console.log(`   despliegue: ${status}`);
      last = status;
    }
    if (status === "finished") return true;
    if (["failed", "cancelled-by-user", "cancelled"].includes(status)) return false;
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  console.log("   el despliegue sigue en curso; revisalo en Coolify.");
  return false;
}

const serverUuid = await pickServer();
const githubAppUuid = await pickGithubApp();

console.log(`1. Proyecto "${name}"...`);
const project = await coolify("POST", "/projects", {
  name,
  description: `Plantilla Sorteos - ${webDomain}`,
});

console.log("2. Aplicacion (web + api + base de datos)...");
const application = await coolify("POST", "/applications/private-github-app", {
  project_uuid: project.uuid,
  server_uuid: serverUuid,
  environment_name: "production",
  github_app_uuid: githubAppUuid,
  git_repository: TEMPLATE_REPOSITORY,
  git_branch: TEMPLATE_BRANCH,
  build_pack: "dockercompose",
  docker_compose_location: "/docker-compose.yml",
  name: `sorteos-${webDomain}`,
  // El `:8080` es el puerto INTERNO del contenedor; el publico es el 443.
  docker_compose_domains: [
    { name: "web", domain: `https://${webDomain}:8080` },
    { name: "api", domain: `https://${apiDomain}:8080` },
  ],
  instant_deploy: false,
});

console.log("3. Variables del panel...");
const adminPassword = newPassword();
const variables = [
  { key: "ADMIN_EMAIL", value: adminEmail },
  { key: "SERVICE_PASSWORD_ADMIN", value: adminPassword },
];
if (args["cliente-email"] !== undefined) {
  variables.push(
    { key: "CLIENT_ADMIN_EMAIL", value: args["cliente-email"].trim().toLowerCase() },
    { key: "CLIENT_ADMIN_PASSWORD", value: args["cliente-clave"] },
    { key: "CLIENT_ADMIN_NAME", value: name },
  );
}
await coolify("PATCH", `/applications/${application.uuid}/envs/bulk`, { data: variables });

console.log("4. Desplegando (la primera vez tarda unos minutos)...");
// Desde Coolify 4.5 `/deploy` es POST ("This endpoint has changed to a POST request").
const deploy = await coolify("POST", `/deploy?uuid=${application.uuid}`);
const deploymentUuid = deploy?.deployments?.[0]?.deployment_uuid;
const ok =
  args["sin-esperar"] === undefined && typeof deploymentUuid === "string"
    ? await waitForDeployment(deploymentUuid)
    : null;

console.log(`
${"=".repeat(64)}
${name}${ok === false ? "  (REVISA EL DESPLIEGUE EN COOLIFY)" : ""}
${"=".repeat(64)}
Pagina:   https://${webDomain}
Panel:    https://${webDomain}/admin
Correo:   ${adminEmail}
Clave:    ${adminPassword}
API:      https://${apiDomain}
Coolify:  proyecto ${project.uuid}, aplicacion ${application.uuid}

Guarda la clave del panel: no se vuelve a mostrar. Se cambia en Coolify
(variable SERVICE_PASSWORD_ADMIN) y redesplegando.
Siguiente paso: en el panel, "Marca" -> nombre, logo, colores y datos legales.
`);
