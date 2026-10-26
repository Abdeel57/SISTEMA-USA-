#!/usr/bin/env node
/**
 * Genera el PATRON TOPOGRAFICO del sistema de diseno: curvas de nivel como las
 * de un mapa de terreno, con anillos cerrados alrededor de "islas" y bandas
 * paralelas a distancia constante, en un mosaico que se repite SIN costura.
 *
 *   node packages/design-system/scripts/generate-topo.mjs [--seed N] [--preview salida.png]
 *
 * Escribe `packages/design-system/topo-paths.mjs`, que es lo que consume
 * `tailwind-preset.mjs`. Con `--preview` rasteriza ademas una muestra (negro
 * sobre blanco, como un mapa) para mirarla antes de adoptar una semilla.
 *
 * COMO SE CONSTRUYE
 *   1. Un terreno periodico: suma de ondas sinusoidales con frecuencias
 *      ENTERAS respecto del mosaico, asi que el campo vale lo mismo en los
 *      bordes opuestos y el patron encaja consigo mismo al repetirse.
 *   2. La "costa" es la curva donde el terreno vale cero. Se calcula la
 *      distancia euclidea CON SIGNO de cada punto a esa costa (transformada
 *      de distancia de Felzenszwalb, sobre un dominio doblado para respetar
 *      la periodicidad).
 *   3. Las curvas de nivel de esa distancia, a intervalos iguales, son las
 *      lineas: por eso van equiespaciadas y rodean las islas en anillos, en
 *      vez de ser ondas paralelas sueltas.
 *   4. Marching squares para extraer cada nivel, union de segmentos en
 *      polilineas y simplificacion (Douglas-Peucker) para que el SVG pese poco.
 *
 * Es determinista: la misma semilla produce byte a byte el mismo archivo.
 */

/* eslint-disable security/detect-object-injection, security/detect-non-literal-fs-filename, security/detect-non-literal-require --
 * Herramienta de construccion sobre buffers numericos propios; los indices son
 * coordenadas de malla, nunca entrada de usuario. */

import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "topo-paths.mjs");
const MONOREPO_ROOT = join(HERE, "..", "..", "..");

// --- Parametros -------------------------------------------------------------

/** Mosaico en pixeles CSS. 4:3 para que la repeticion no delate una direccion. */
const TILE = { width: 1200, height: 900 };
/** Resolucion de la malla, en pixeles por celda. */
const STEP = 3;
/** Separacion entre curvas de nivel, en pixeles. */
const SPACING = 18;
/** Cada cuantas curvas va una MAESTRA (mas gruesa), como en un mapa real. */
const INDEX_EVERY = 4;
/** Tolerancia de simplificacion, en pixeles. */
const TOLERANCE = 0.55;
/** Pasadas de suavizado del campo: redondean los picos de las curvas. */
const BLUR_PASSES = 6;

const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : (args[index + 1] ?? null);
};
const SEED = Number(argValue("--seed") ?? 7);
const PREVIEW = argValue("--preview");

// --- Aleatoriedad determinista ---------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- 1. Terreno periodico ---------------------------------------------------

const N = Math.round(TILE.width / STEP);
const M = Math.round(TILE.height / STEP);

/**
 * Frecuencias enteras (ciclos por mosaico). Bajas, para que haya tres o
 * cuatro "islas" por mosaico y no un ruido fino.
 */
const FREQUENCIES = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
  [2, 1],
  [1, 2],
  [2, -1],
  [-1, 2],
  [2, 2],
  [3, 1],
  [3, 2],
  [2, 3],
  [3, -2],
  [1, -3],
  [4, 1],
  [1, 4],
  [3, 3],
  [4, -2],
  [-2, 4],
];

function buildField(seed) {
  const random = mulberry32(seed);
  const waves = FREQUENCIES.map(([i, j]) => {
    const magnitude = Math.hypot(i, j);
    return {
      i,
      j,
      // Amplitud decreciente con la frecuencia: las ondas largas mandan y las
      // cortas solo anaden islas pequenas.
      amplitude: (0.6 + random() * 0.8) / magnitude ** 0.75,
      phase: random() * Math.PI * 2,
    };
  });

  const field = new Float64Array(N * M);
  for (let y = 0; y < M; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N;
      const v = y / M;
      let value = 0;
      for (const wave of waves) {
        value += wave.amplitude * Math.sin(Math.PI * 2 * (wave.i * u + wave.j * v) + wave.phase);
      }
      field[y * N + x] = value;
    }
  }
  return field;
}

// --- 2. Distancia con signo a la costa -------------------------------------

/** Transformada de distancia 1D exacta (Felzenszwalb y Huttenlocher). */
function edt1d(f, n, out, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    out[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/**
 * Distancia euclidea (en celdas) de cada celda a la celda mas cercana que
 * cumple `isFeature`, sobre un dominio periodico. Se calcula en un dominio
 * 2x2 veces mayor y se recorta el centro: asi cada celda ve a sus vecinas
 * "del otro lado del borde" sin casos especiales.
 */
function periodicDistance(isFeature) {
  const W = N * 2;
  const H = M * 2;
  const INF = 1e12;
  const grid = new Float64Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      grid[y * W + x] = isFeature((x + N / 2) % N, (y + M / 2) % M) ? 0 : INF;
    }
  }
  const maxDim = Math.max(W, H);
  const f = new Float64Array(maxDim);
  const out = new Float64Array(maxDim);
  const v = new Int32Array(maxDim);
  const z = new Float64Array(maxDim + 1);

  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = grid[y * W + x];
    edt1d(f, H, out, v, z);
    for (let y = 0; y < H; y++) grid[y * W + x] = out[y];
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) f[x] = grid[y * W + x];
    edt1d(f, W, out, v, z);
    for (let x = 0; x < W; x++) grid[y * W + x] = out[x];
  }

  const result = new Float64Array(N * M);
  for (let y = 0; y < M; y++) {
    for (let x = 0; x < N; x++) {
      result[y * N + x] = Math.sqrt(grid[(y + M / 2) * W + (x + N / 2)]);
    }
  }
  return result;
}

function signedDistance(field) {
  const inside = (x, y) => field[y * N + x] > 0;
  const toOutside = periodicDistance((x, y) => !inside(x, y));
  const toInside = periodicDistance(inside);
  const sd = new Float64Array(N * M);
  for (let i = 0; i < N * M; i++) {
    const x = i % N;
    const y = (i - x) / N;
    sd[i] = (inside(x, y) ? toOutside[i] - 0.5 : -(toInside[i] - 0.5)) * STEP;
  }
  return sd;
}

/** Suavizado 3x3 periodico: quita los picos que dejan las medianas. */
function blur(values, passes) {
  let current = values;
  for (let pass = 0; pass < passes; pass++) {
    const next = new Float64Array(N * M);
    for (let y = 0; y < M; y++) {
      const y0 = (y + M - 1) % M;
      const y1 = (y + 1) % M;
      for (let x = 0; x < N; x++) {
        const x0 = (x + N - 1) % N;
        const x1 = (x + 1) % N;
        next[y * N + x] =
          (current[y0 * N + x0] +
            current[y0 * N + x] +
            current[y0 * N + x1] +
            current[y * N + x0] +
            current[y * N + x] +
            current[y * N + x1] +
            current[y1 * N + x0] +
            current[y1 * N + x] +
            current[y1 * N + x1]) /
          9;
      }
    }
    current = next;
  }
  return current;
}

// --- 3 y 4. Curvas de nivel ---------------------------------------------------

/** Segmentos de la curva de nivel `level`, en pixeles, con vuelta al borde. */
function marchingSquares(values, level) {
  const segments = [];
  const at = (x, y) => values[(y % M) * N + (x % N)] - level;
  const lerp = (x0, y0, v0, x1, y1, v1) => {
    const t = v0 / (v0 - v1);
    return [(x0 + (x1 - x0) * t) * STEP, (y0 + (y1 - y0) * t) * STEP];
  };

  for (let y = 0; y < M; y++) {
    for (let x = 0; x < N; x++) {
      const a = at(x, y);
      const b = at(x + 1, y);
      const c = at(x + 1, y + 1);
      const d = at(x, y + 1);
      const index = (a > 0 ? 8 : 0) | (b > 0 ? 4 : 0) | (c > 0 ? 2 : 0) | (d > 0 ? 1 : 0);
      if (index === 0 || index === 15) continue;

      const top = () => lerp(x, y, a, x + 1, y, b);
      const right = () => lerp(x + 1, y, b, x + 1, y + 1, c);
      const bottom = () => lerp(x, y + 1, d, x + 1, y + 1, c);
      const left = () => lerp(x, y, a, x, y + 1, d);

      switch (index) {
        case 1:
        case 14:
          segments.push([left(), bottom()]);
          break;
        case 2:
        case 13:
          segments.push([bottom(), right()]);
          break;
        case 3:
        case 12:
          segments.push([left(), right()]);
          break;
        case 4:
        case 11:
          segments.push([top(), right()]);
          break;
        case 6:
        case 9:
          segments.push([top(), bottom()]);
          break;
        case 7:
        case 8:
          segments.push([left(), top()]);
          break;
        case 5:
        case 10: {
          // Silla de montar: el centro decide como se conectan.
          const center = (a + b + c + d) / 4;
          if ((index === 5) === center > 0) {
            segments.push([left(), top()], [bottom(), right()]);
          } else {
            segments.push([left(), bottom()], [top(), right()]);
          }
          break;
        }
        default:
          break;
      }
    }
  }
  return segments;
}

/** Une segmentos sueltos en polilineas (abiertas o cerradas). */
function joinSegments(segments) {
  const key = ([x, y]) => `${Math.round(x * 100)},${Math.round(y * 100)}`;
  const byStart = new Map();
  for (const segment of segments) {
    for (const [from, to] of [
      [segment[0], segment[1]],
      [segment[1], segment[0]],
    ]) {
      const k = key(from);
      if (!byStart.has(k)) byStart.set(k, []);
      byStart.get(k).push({ segment, to });
    }
  }
  const used = new Set();
  const lines = [];

  for (const segment of segments) {
    if (used.has(segment)) continue;
    used.add(segment);
    const line = [segment[0], segment[1]];

    // Se extiende hacia los dos lados hasta que no haya continuacion.
    for (const direction of [1, -1]) {
      for (;;) {
        const tip = direction === 1 ? line[line.length - 1] : line[0];
        const next = (byStart.get(key(tip)) ?? []).find((entry) => !used.has(entry.segment));
        if (next === undefined) break;
        used.add(next.segment);
        if (direction === 1) line.push(next.to);
        else line.unshift(next.to);
      }
    }
    lines.push(line);
  }
  return lines;
}

function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const length = Math.hypot(bx - ax, by - ay);
  let maxDistance = 0;
  let maxIndex = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const distance =
      length === 0
        ? Math.hypot(px - ax, py - ay)
        : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length;
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }
  if (maxDistance <= tolerance) return [points[0], points[points.length - 1]];
  return [
    ...simplify(points.slice(0, maxIndex + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(maxIndex), tolerance),
  ];
}

const fmt = (value) => {
  const rounded = Math.round(value * 10) / 10;
  return String(rounded).replace(/^(-?)0\./, "$1.");
};

/** `M x y l dx dy ... [z]`, con coordenadas a una decima de pixel. */
function toPathData(points, closed) {
  let [cx, cy] = points[0];
  let d = `M${fmt(cx)} ${fmt(cy)}`;
  let lastRounded = [Math.round(cx * 10), Math.round(cy * 10)];
  for (const [x, y] of points.slice(1)) {
    const rx = Math.round(x * 10);
    const ry = Math.round(y * 10);
    const dx = (rx - lastRounded[0]) / 10;
    const dy = (ry - lastRounded[1]) / 10;
    if (dx === 0 && dy === 0) continue;
    d += `l${fmt(dx)} ${fmt(dy)}`;
    lastRounded = [rx, ry];
    cx = x;
    cy = y;
  }
  return closed ? `${d}z` : d;
}

function contourPaths(sd) {
  const min = sd.reduce((a, b) => Math.min(a, b), Infinity);
  const max = sd.reduce((a, b) => Math.max(a, b), -Infinity);
  const paths = [];
  for (let level = Math.ceil(min / SPACING) * SPACING; level <= max; level += SPACING) {
    // La curva de nivel 0 es la costa, y cada INDEX_EVERY a partir de ella una
    // maestra; el resto es el mismo numero con signo, asi que `%` basta.
    const index = Math.round(level / SPACING) % INDEX_EVERY === 0;
    for (const line of joinSegments(marchingSquares(sd, level))) {
      const [sx, sy] = line[0];
      const [ex, ey] = line[line.length - 1];
      const closed = Math.hypot(ex - sx, ey - sy) < 0.01;
      const points = simplify(closed ? line.slice(0, -1) : line, TOLERANCE);
      // Lo que queda tras simplificar un anillo minusculo no dibuja nada util.
      if (points.length < (closed ? 4 : 2)) continue;
      paths.push({ d: toPathData(points, closed), index });
    }
  }
  return paths;
}

// --- Salida ---------------------------------------------------------------------

function svgOf(paths, { stroke, opacity, width, background }) {
  const group = (items, strokeWidth) =>
    `<g fill='none' stroke='${stroke}' stroke-opacity='${String(opacity)}' stroke-width='${String(strokeWidth)}' stroke-linecap='round' stroke-linejoin='round'>` +
    items.map(({ d }) => `<path d='${d}'/>`).join("") +
    `</g>`;
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' width='${String(TILE.width)}' height='${String(TILE.height)}' viewBox='0 0 ${String(TILE.width)} ${String(TILE.height)}'>` +
    (background ? `<rect width='100%' height='100%' fill='${background}'/>` : "") +
    group(
      paths.filter((path) => !path.index),
      width,
    ) +
    group(
      paths.filter((path) => path.index),
      width * 2,
    ) +
    `</svg>`
  );
}

function loadSharp() {
  const require = createRequire(import.meta.url);
  try {
    return require("sharp");
  } catch {
    // Se busca en el almacen de pnpm.
  }
  const store = join(MONOREPO_ROOT, "node_modules", ".pnpm");
  if (!existsSync(store)) return null;
  for (const candidate of readdirSync(store).filter((entry) => entry.startsWith("sharp@"))) {
    const entry = join(store, candidate, "node_modules", "sharp");
    if (!existsSync(entry)) continue;
    try {
      return require(entry);
    } catch {
      // Siguiente.
    }
  }
  return null;
}

async function main() {
  const field = buildField(SEED);
  const sd = blur(signedDistance(field), BLUR_PASSES);
  const paths = contourPaths(sd);
  const bytes = paths.reduce((sum, { d }) => sum + d.length, 0);
  const indexCount = paths.filter((path) => path.index).length;

  const header = `// GENERADO por scripts/generate-topo.mjs (semilla ${String(SEED)}). No se edita a mano:
// se vuelve a generar con \`node packages/design-system/scripts/generate-topo.mjs --seed ${String(SEED)}\`.
//
// Curvas de nivel de un terreno periodico: el mosaico encaja consigo mismo
// por los cuatro lados. Cada entrada es el \`d\` de un <path> en pixeles del
// mosaico; las curvas que salen por un borde entran por el opuesto a la misma
// altura. \`index: true\` marca las curvas MAESTRAS (una de cada ${String(INDEX_EVERY)}), que se
// dibujan mas gruesas, como en un mapa.
`;
  const body =
    `export const TOPO_SEED = ${String(SEED)};\n` +
    `export const TOPO_TILE = Object.freeze({ width: ${String(TILE.width)}, height: ${String(TILE.height)} });\n` +
    `export const TOPO_PATHS = Object.freeze([\n${paths
      .map(({ d, index }) => `  { d: "${d}", index: ${String(index)} },`)
      .join("\n")}\n]);\n`;
  writeFileSync(OUT, `${header}\n${body}`, "utf8");
  process.stdout.write(
    `[topo] semilla ${String(SEED)}: ${String(paths.length)} curvas (${String(indexCount)} maestras), ${String(Math.round(bytes / 1024))} KB de trazado -> ${OUT}\n`,
  );

  if (PREVIEW !== null) {
    const sharp = loadSharp();
    if (sharp === null) {
      process.stdout.write("[topo] sharp no disponible: sin vista previa.\n");
      return;
    }
    const svg = svgOf(paths, { stroke: "#111111", opacity: 1, width: 1.2, background: "#ffffff" });
    // Dos mosaicos de ancho, para ver la costura.
    await sharp(Buffer.from(svg), { density: 96 }).extend({ right: 0 }).png().toFile(PREVIEW);
    const twice = await sharp({
      create: {
        width: TILE.width * 2,
        height: TILE.height,
        channels: 3,
        background: "#ffffff",
      },
    })
      .composite([
        { input: Buffer.from(svg), left: 0, top: 0 },
        { input: Buffer.from(svg), left: TILE.width, top: 0 },
      ])
      .png()
      .toBuffer();
    writeFileSync(PREVIEW.replace(/\.png$/u, "-x2.png"), twice);
    process.stdout.write(`[topo] vista previa en ${PREVIEW} (y -x2 con dos mosaicos)\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`[topo] error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
