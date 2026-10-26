#!/usr/bin/env node
/**
 * Genera los PNG de marca a partir del simbolo del cliente.
 *
 * ENTRADA
 * -------
 *   brand/logo.svg   simbolo cuadrado con fondo transparente (preferido)
 *   brand/logo.png   alternativa, si el cliente solo tiene un PNG
 *
 * Es solo el SIMBOLO: el nombre se compone con la tipografia de marca a partir
 * de `packages/brand` (ver `src/components/brand-lockup.tsx`), que escala sin
 * halos a cualquier tamano y cambia de cliente sin cambiar de imagen.
 *
 * QUE PRODUCE
 * -----------
 *   public/brand/brand-mark.png   el simbolo, fondo transparente
 *   src/app/icon.png              el simbolo sobre placa oscura (favicon)
 *
 * USO
 * ---
 *   node scripts/build-brand-assets.mjs
 *
 * `sharp` no es dependencia declarada de esta app: llega al arbol a traves de
 * Next. El script lo localiza y, si no esta, lo dice y no hace nada. Los PNG
 * resultantes se versionan, de modo que ni el build ni CI ejecutan esto.
 */

/* eslint-disable security/detect-non-literal-fs-filename, security/detect-non-literal-require --
 * Herramienta de construccion, no codigo servido: las rutas salen de la
 * estructura del repositorio, nunca de entrada de usuario. */

import { existsSync, readdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const MONOREPO_ROOT = join(APP_DIR, "..", "..");

const SOURCES = [join(APP_DIR, "brand", "logo.svg"), join(APP_DIR, "brand", "logo.png")];
const OUT_MARK = join(APP_DIR, "public", "brand", "brand-mark.png");
const OUT_ICON = join(APP_DIR, "src", "app", "icon.png");

/**
 * Lado del PNG del simbolo. 512 es mas del doble del mayor tamano al que se
 * usa, asi que cubre pantallas de alta densidad: `next/image` sirve la escala
 * que cada hueco necesita.
 */
const MARK_SIZE = 512;

/**
 * Favicon: placa del color de fondo del sitio con un filete del color de
 * marca. Si se cambia la paleta de `tokens.css`, se cambian tambien estos dos.
 */
const ICON_SIZE = 512;
const ICON_PADDING = 72;
const ICON_PLATE = "#080a0e";
const ICON_BORDER = "#38bdf8";

function log(message) {
  process.stdout.write(`${message}\n`);
}

/**
 * Localiza `sharp`: primero por resolucion normal y, si falla, en el almacen de
 * pnpm del monorepo, donde vive como dependencia transitiva de Next.
 */
function loadSharp() {
  try {
    return require("sharp");
  } catch {
    // Se busca en el almacen.
  }

  const store = join(MONOREPO_ROOT, "node_modules", ".pnpm");
  if (!existsSync(store)) return null;

  for (const candidate of readdirSync(store).filter((entry) => entry.startsWith("sharp@"))) {
    const entry = join(store, candidate, "node_modules", "sharp");
    if (!existsSync(entry)) continue;
    try {
      return require(entry);
    } catch {
      // Se prueba el siguiente.
    }
  }

  return null;
}

async function main() {
  const sharp = loadSharp();

  if (sharp === null) {
    log("[brand] sharp no esta disponible en este arbol.");
    log("[brand] los PNG versionados en public/brand y src/app siguen siendo validos.");
    return;
  }

  const source = SOURCES.find((path) => existsSync(path));
  if (source === undefined) {
    throw new Error(`No se encuentra el simbolo: ${SOURCES.join(" ni ")}`);
  }

  // `density` alto para que un SVG se rasterice nitido antes de reducirlo.
  const load = () => sharp(source, { density: 384 });

  await mkdir(dirname(OUT_MARK), { recursive: true });
  await load()
    .resize({
      width: MARK_SIZE,
      height: MARK_SIZE,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toFile(OUT_MARK);
  log(`[brand] escrito ${OUT_MARK}`);

  const inner = ICON_SIZE - ICON_PADDING * 2;
  const markForIcon = await load()
    .resize({
      width: inner,
      height: inner,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const plate = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(ICON_SIZE)}" height="${String(ICON_SIZE)}">` +
      `<rect x="8" y="8" width="${String(ICON_SIZE - 16)}" height="${String(ICON_SIZE - 16)}" rx="96" ` +
      `fill="${ICON_PLATE}" stroke="${ICON_BORDER}" stroke-width="12"/>` +
      `</svg>`,
  );

  await mkdir(dirname(OUT_ICON), { recursive: true });
  await sharp(plate)
    .composite([{ input: markForIcon, left: ICON_PADDING, top: ICON_PADDING }])
    .png({ compressionLevel: 9 })
    .toFile(OUT_ICON);
  log(`[brand] escrito ${OUT_ICON}`);
}

main().catch((error) => {
  log(`[brand] error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
