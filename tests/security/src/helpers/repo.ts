/**
 * Utilidades para recorrer el repositorio desde los tests de invariante.
 *
 * Estos tests miran el repositorio como lo miraria un auditor: leyendo lo que
 * hay escrito, no lo que un modulo exporta. Una invariante que solo se
 * comprueba sobre el codigo que la implementa no detecta al que la ignora.
 */

import { readdirSync, readFileSync, statSync, type Dirent } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

/**
 * Directorios que el caminante nunca abre: dependencias, caches y salidas de
 * compilacion. Nada de lo que hay dentro lo escribio una persona del equipo,
 * asi que un hallazgo ahi no es un defecto del repositorio: es ruido. Y un
 * escaner ruidoso acaba desactivado, que es la unica forma de fallo que
 * ninguno de estos tests puede detectar por si mismo.
 */
const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  ".turbo",
  "coverage",
  "playwright-report",
  "test-results",
]);

/**
 * Prefijos de directorio ignorados.
 *
 * `.next` no es UN directorio, es una familia: `apps/web` compila a `.next`, el
 * smoke de `scripts/smoke.mjs` usa su propio `distDir` en `.next-smoke` para no
 * pisar al servidor de desarrollo vivo, y el build aislado escribe en
 * `.next-build`. `.gitignore` ya trata a los tres como artefactos.
 *
 * Enumerarlos uno a uno fue precisamente el defecto: el caminante bajaba a
 * `apps/web/.next-smoke/server/middleware.js` -un bundle de webpack con mas de
 * cien `eval(` y expresiones regulares generadas- y el escaner de `HO-014`
 * devolvia 45 falsos positivos. En CI, con el smoke corriendo antes que los
 * tests, eso es un rojo permanente. Se ignora la familia entera para que el
 * cuarto `distDir` que alguien invente no repita la historia.
 */
const IGNORED_DIRECTORY_PREFIXES: readonly string[] = [".next"];

/** Si el caminante debe saltarse un directorio, por su nombre. */
export function isIgnoredDirectory(name: string): boolean {
  return (
    IGNORED_DIRECTORIES.has(name) ||
    IGNORED_DIRECTORY_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
}

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".jsonc",
  ".yml",
  ".yaml",
  ".toml",
  ".sql",
  ".md",
  ".env",
  ".example",
  ".sh",
]);

let cachedRoot: string | null = null;

/** Raiz del monorepo: el directorio que contiene `pnpm-workspace.yaml`. */
export function repoRoot(): string {
  if (cachedRoot !== null) {
    return cachedRoot;
  }
  let current = resolve(import.meta.dirname);
  for (let depth = 0; depth < 10; depth += 1) {
    try {
      statSync(join(current, "pnpm-workspace.yaml"));
      cachedRoot = current;
      return current;
    } catch {
      const parent = resolve(current, "..");
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }
  throw new Error("No se encuentra la raiz del monorepo (pnpm-workspace.yaml).");
}

export interface RepoFile {
  /** Ruta relativa a la raiz, siempre con separador '/'. */
  readonly path: string;
  readonly absolutePath: string;
}

function isTextFile(name: string): boolean {
  if (name === ".env.example" || name === ".gitleaks.toml" || name === ".nvmrc") {
    return true;
  }
  const dot = name.lastIndexOf(".");
  return dot > 0 && TEXT_EXTENSIONS.has(name.slice(dot));
}

/**
 * Que es cada entrada: directorio, fichero u otra cosa.
 *
 * El `Dirent` no basta. En una carpeta sincronizada con OneDrive ("archivos a
 * peticion") cada fichero lleva un punto de reanalisis, y Node lo clasifica
 * como ENLACE SIMBOLICO: ni `isFile()` ni `isDirectory()` son ciertos, y el
 * caminante se saltaba el repositorio entero sin que nada fallara. Para esas
 * entradas se pregunta al sistema de ficheros siguiendo el enlace, que es lo
 * que un auditor haria al abrir el fichero.
 */
function kindOf(directory: string, entry: Dirent): "directory" | "file" | "other" {
  if (entry.isDirectory()) return "directory";
  if (entry.isFile()) return "file";
  if (!entry.isSymbolicLink()) return "other";
  try {
    const stats = statSync(join(directory, entry.name));
    return stats.isDirectory() ? "directory" : stats.isFile() ? "file" : "other";
  } catch {
    return "other";
  }
}

/** Todos los ficheros de texto del repositorio, saltando artefactos. */
export function listRepoTextFiles(startAt = repoRoot()): readonly RepoFile[] {
  const root = repoRoot();
  const files: RepoFile[] = [];

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const kind = kindOf(directory, entry);
      if (kind === "directory") {
        if (!isIgnoredDirectory(entry.name)) {
          walk(join(directory, entry.name));
        }
        continue;
      }
      if (kind !== "file" || !isTextFile(entry.name)) {
        continue;
      }
      const absolutePath = join(directory, entry.name);
      files.push({
        absolutePath,
        path: relative(root, absolutePath).split(sep).join("/"),
      });
    }
  };

  walk(startAt);
  return files;
}

export function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot(), relativePath), "utf8");
}

export function repoPathExists(relativePath: string): boolean {
  try {
    statSync(join(repoRoot(), relativePath));
    return true;
  } catch {
    return false;
  }
}
