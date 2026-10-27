#!/usr/bin/env node
/**
 * Genera el PNG del simbolo de respaldo a partir del simbolo de la plantilla.
 *
 * ENTRADA
 * -------
 *   brand/logo.svg   simbolo cuadrado con fondo transparente (preferido)
 *   brand/logo.png   alternativa, si solo hay un PNG
 *
 * Es solo el SIMBOLO: el nombre se compone con la tipografia de marca a partir
 * de `packages/brand` (ver `src/components/brand-lockup.tsx`), que escala sin
 * halos a cualquier tamano y cambia de cliente sin cambiar de imagen.
 *
 * QUE PRODUCE
 * -----------
 *   public/brand/brand-mark.png   el simbolo, fondo transparente
 *
 * Es el respaldo de cuando el panel no ha subido ningun logotipo. El icono de
 * la pestana ya no se genera aqui: lo dibuja la web en cada peticion con el
 * logotipo y el color guardados (`src/app/brand-icon.png/route.ts`).
 *
 * USO
 * ---
 *   node scripts/build-brand-assets.mjs
 *
 * El PNG resultante se versiona, de modo que ni el build ni CI ejecutan esto.
 */

/* eslint-disable security/detect-non-literal-fs-filename --
 * Herramienta de construccion, no codigo servido: las rutas salen de la
 * estructura del repositorio, nunca de entrada de usuario. */

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const SOURCES = [join(APP_DIR, "brand", "logo.svg"), join(APP_DIR, "brand", "logo.png")];
const OUT_MARK = join(APP_DIR, "public", "brand", "brand-mark.png");

/**
 * Lado del PNG del simbolo. 512 es mas del doble del mayor tamano al que se
 * usa, asi que cubre pantallas de alta densidad: `next/image` sirve la escala
 * que cada hueco necesita.
 */
const MARK_SIZE = 512;

function log(message) {
  process.stdout.write(`${message}\n`);
}

async function main() {
  const source = SOURCES.find((path) => existsSync(path));
  if (source === undefined) {
    throw new Error(`No se encuentra el simbolo: ${SOURCES.join(" ni ")}`);
  }

  await mkdir(dirname(OUT_MARK), { recursive: true });
  // `density` alto para que un SVG se rasterice nitido antes de reducirlo.
  await sharp(source, { density: 384 })
    .resize({
      width: MARK_SIZE,
      height: MARK_SIZE,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toFile(OUT_MARK);
  log(`[brand] escrito ${OUT_MARK}`);
}

main().catch((error) => {
  log(`[brand] error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
