import sharp from "sharp";

import { SURFACES, toHex } from "./brand-palette";

/**
 * Dibuja el icono del sitio: el logotipo sobre una placa del color de fondo de
 * la tienda, con un filete del color de marca. Es el mismo dibujo que hacia
 * `scripts/build-brand-assets.mjs` para el antiguo `src/app/icon.png`, ahora en
 * cada peticion y con la marca guardada desde el panel.
 *
 * POR QUE UNA PLACA Y NO EL LOGOTIPO SOLO
 * ---------------------------------------
 * La pestana del navegador puede ser clara u oscura, y un logotipo con fondo
 * transparente desaparece en una de las dos. La placa garantiza el contraste
 * con cualquier logotipo y le da forma cuadrada aunque el logotipo no lo sea:
 * se encaja dentro (`fit: "contain"`), nunca se estira ni se recorta.
 */

/** La geometria se declara sobre 512 px y se escala al lado pedido. */
const BASE = 512;
const INSET = 8;
const RADIUS = 96;
const STROKE = 12;
const PADDING = 72;

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 } as const;

/**
 * `borderHex` llega de `effectiveBrandHex`, que siempre devuelve `#rrggbb`. Se
 * comprueba igualmente porque se escribe dentro de un SVG: lo que no tenga esa
 * forma no entra.
 */
const HEX = /^#[0-9a-f]{6}$/u;

export async function renderBrandIcon({
  logo,
  borderHex,
  size,
}: {
  /** Los bytes del logotipo: PNG, JPEG o WebP. */
  readonly logo: Uint8Array;
  readonly borderHex: string;
  readonly size: number;
}): Promise<Buffer> {
  const border = HEX.test(borderHex) ? borderHex : "#38bdf8";
  const plate = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(size)}" height="${String(size)}" viewBox="0 0 ${String(BASE)} ${String(BASE)}">` +
      `<rect x="${String(INSET)}" y="${String(INSET)}" width="${String(BASE - INSET * 2)}" height="${String(BASE - INSET * 2)}" rx="${String(RADIUS)}" ` +
      `fill="${toHex(SURFACES.bg)}" stroke="${border}" stroke-width="${String(STROKE)}"/>` +
      `</svg>`,
  );

  const padding = Math.round((PADDING * size) / BASE);
  const inner = size - padding * 2;

  const mark = await sharp(logo)
    .resize({ width: inner, height: inner, fit: "contain", background: TRANSPARENT })
    .png()
    .toBuffer();

  return sharp(plate)
    .composite([{ input: mark, left: padding, top: padding }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}
