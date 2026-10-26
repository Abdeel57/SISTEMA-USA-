#!/usr/bin/env node
/**
 * Vuelve a desplegar TODAS las paginas hechas con esta plantilla.
 *
 *   node scripts/coolify/actualizar-todos.mjs            # todas
 *   node scripts/coolify/actualizar-todos.mjs --listar   # solo ensena cuales son
 *
 * Busca en Coolify las aplicaciones cuyo repositorio es el de la plantilla y
 * les pide un despliegue: cada una construye la ultima version de su rama y
 * corre `db:bootstrap` (migraciones nuevas incluidas) antes de arrancar.
 *
 * Normalmente no hace falta: con "Auto Deploy" activo, subir cambios a GitHub
 * ya despliega todas. Esto sirve para forzarlo o cuando el aviso de GitHub no
 * llego.
 *
 * Los datos de cada cliente (marca, productos, pedidos, participaciones) viven
 * en SU base de datos y no se tocan.
 */
/* eslint-disable no-console -- herramienta de linea de comandos: su salida ES la consola. */
import { coolify, parseArgs, TEMPLATE_REPOSITORY } from "./coolify-api.mjs";

const args = parseArgs(process.argv.slice(2));
const target = TEMPLATE_REPOSITORY.toLowerCase();

const applications = await coolify("GET", "/applications");
const sites = (Array.isArray(applications) ? applications : []).filter(
  (application) => String(application.git_repository ?? "").toLowerCase() === target,
);

if (sites.length === 0) {
  console.log(`No hay aplicaciones del repositorio ${TEMPLATE_REPOSITORY}.`);
  process.exit(0);
}

console.log(`${String(sites.length)} pagina(s) de ${TEMPLATE_REPOSITORY}:`);
for (const site of sites) {
  const domains = Array.isArray(site.docker_compose_domains)
    ? site.docker_compose_domains.map((entry) => entry.domain).join(", ")
    : String(site.fqdn ?? "");
  console.log(`  - ${site.name}  ${domains}`);
}

if (args.listar !== undefined) process.exit(0);

let failures = 0;
for (const site of sites) {
  try {
    // Desde Coolify 4.5 `/deploy` es POST.
    await coolify("POST", `/deploy?uuid=${site.uuid}`);
    console.log(`  desplegando: ${site.name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FALLO ${site.name}: ${error.message}`);
  }
}

console.log(
  failures === 0
    ? "Listo: los despliegues estan en cola. El avance se ve en Coolify."
    : `${String(failures)} pagina(s) no se pudieron desplegar.`,
);
process.exit(failures === 0 ? 0 : 1);
