// ---------------------------------------------------------------------------
// Patron topografico como SVG, a partir de la geometria de `topo-paths.mjs`.
//
// Lo usan dos consumidores: el preset de Tailwind (para los tokens con `data:`
// URI de las tintas fijas) y `apps/web` (para servir el patron con el color de
// marca que el administrador haya elegido, en tiempo de ejecucion). Una sola
// funcion para que los dos dibujen exactamente lo mismo.
// ---------------------------------------------------------------------------

import { TOPO_PATHS, TOPO_TILE } from "./topo-paths.mjs";

export { TOPO_PATHS, TOPO_TILE };

/** Las curvas MAESTRAS van mas gruesas y algo mas opacas que las ordinarias. */
const INDEX_WIDTH_FACTOR = 1.6;
const INDEX_OPACITY_FACTOR = 1.6;

/**
 * Las tres tintas del sistema, sin el color (que pone quien las usa):
 *   - `brand`: sobre las superficies oscuras, con el color de marca. La
 *     opacidad es la elegida por el cliente (version "F").
 *   - `ink`: negra, para la banda del premio, que lleva el color de marca de
 *     fondo (un patron de marca sobre marca no se ve).
 *   - `soft`: negra y tenue, para las superficies claras de mercancia, donde
 *     un trazo mas fuerte competiria con las fotografias.
 */
export const TOPO_INKS = Object.freeze({
  brand: Object.freeze({ opacity: 0.16, width: 1 }),
  ink: Object.freeze({ opacity: 0.1, width: 1.2 }),
  soft: Object.freeze({ opacity: 0.045, width: 1 }),
});

const round = (value, decimals) => Math.round(value * 10 ** decimals) / 10 ** decimals;

/**
 * El SVG del mosaico, como texto.
 *
 * @param {{ stroke: string, opacity: number, width: number }} ink
 * @returns {string}
 */
export function topoSvg({ stroke, opacity, width }) {
  const { width: w, height: h } = TOPO_TILE;
  const group = (index, strokeOpacity, strokeWidth) =>
    `<g fill='none' stroke='${stroke}' stroke-opacity='${String(strokeOpacity)}' stroke-width='${String(strokeWidth)}' stroke-linecap='round' stroke-linejoin='round'>` +
    TOPO_PATHS.filter((path) => path.index === index)
      .map(({ d }) => `<path d='${d}'/>`)
      .join("") +
    `</g>`;
  return [
    `<svg xmlns='http://www.w3.org/2000/svg' width='${String(w)}' height='${String(h)}' viewBox='0 0 ${String(w)} ${String(h)}'>`,
    group(false, opacity, width),
    group(
      true,
      Math.min(1, round(opacity * INDEX_OPACITY_FACTOR, 3)),
      round(width * INDEX_WIDTH_FACTOR, 2),
    ),
    `</svg>`,
  ].join("");
}

/**
 * El mismo SVG como `url("data:...")` listo para `background-image`.
 *
 * No va en base64: el SVG queda legible en las herramientas de desarrollo y
 * pesa menos. Y no se codifica ENTERO con `encodeURIComponent`, que escaparia
 * tambien espacios y comillas: los atributos van entre comillas simples y solo
 * se escapan los caracteres que un `url()` de CSS no puede llevar en claro.
 *
 * @param {{ stroke: string, opacity: number, width: number }} ink
 * @returns {string}
 */
export function topoDataUri(ink) {
  const encoded = topoSvg(ink)
    .replace(/%/g, "%25")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/#/g, "%23");
  return `url("data:image/svg+xml,${encoded}")`;
}
