/**
 * Paleta derivada de los DOS colores que elige el administrador.
 *
 * `packages/design-system/src/styles/tokens.css` declara una paleta completa
 * -marca, acento y sus variantes de hover, pulsado, lavado, tinta sobre claro,
 * texto sobre oscuro- escrita a mano para la plantilla. Desde que la marca se
 * edita en el panel (migracion 0040) esos tokens se SOBREESCRIBEN en cada
 * peticion a partir de `colors.brand` y `colors.accent`, y este modulo es
 * quien deriva el resto. Las reglas son las mismas que fijaron los tokens
 * originales:
 *
 *   - sobre fondo oscuro, hover y pulsado ACLARAN (oscurecer se lee como
 *     desactivar); el pulsado del acento es la excepcion y oscurece, porque el
 *     techo lo pone el texto que lleva encima;
 *   - la tinta de marca sobre la banda clara (`light-gold`) es el mismo color
 *     llevado a la sombra hasta medir 4,5:1 sobre el blanco calido;
 *   - el texto de acento sobre negro (`accent-text`) es el acento llevado a la
 *     luz hasta medir 4,5:1 sobre el fondo;
 *   - el texto sobre un relleno (`on-brand`, `on-accent`) es blanco o casi
 *     negro, el que mas contraste de;
 *   - un color de marca demasiado oscuro para leerse sobre negro se aclara
 *     hasta 4,5:1: un titular invisible es peor que un tono un poco distinto
 *     del elegido. El panel lo avisa.
 *
 * TODO ES PURO Y SIN DEPENDENCIAS: se ejecuta en el servidor de Next en cada
 * peticion y se prueba sin DOM.
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** `#rrggbb` -> canales, o `null` si no tiene esa forma. */
export function parseHex(hex: string): Rgb | null {
  const match = /^#([0-9a-f]{6})$/iu.exec(hex.trim());
  if (match === null) return null;
  const value = Number.parseInt(match[1] ?? "0", 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

export function toHex(rgb: Rgb): string {
  const part = (channel: number): string =>
    Math.round(Math.min(255, Math.max(0, channel)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}`;
}

/** La forma que consumen los tokens: canales separados por espacio (`56 189 248`). */
export function channels(rgb: Rgb): string {
  return `${String(Math.round(rgb.r))} ${String(Math.round(rgb.g))} ${String(Math.round(rgb.b))}`;
}

/** Luminancia relativa (WCAG 2.x). */
function luminance(rgb: Rgb): number {
  const linear = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(rgb.r) + 0.7152 * linear(rgb.g) + 0.0722 * linear(rgb.b);
}

/** Relacion de contraste WCAG entre dos colores (1..21). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/** Mezcla lineal: `amount` 0 = `from`, 1 = `to`. */
export function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  const t = Math.min(1, Math.max(0, amount));
  return {
    r: from.r + (to.r - from.r) * t,
    g: from.g + (to.g - from.g) * t,
    b: from.b + (to.b - from.b) * t,
  };
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/** Las superficies fijas del sistema (`tokens.css`). No las elige el cliente. */
export const SURFACES: { readonly bg: Rgb; readonly lightBg: Rgb } = Object.freeze({
  /** `--app-color-bg` */
  bg: { r: 8, g: 10, b: 14 },
  /** `--app-color-light-bg`: la banda clara de mercancia. */
  lightBg: { r: 246, g: 248, b: 251 },
});

/**
 * Lleva `color` hacia `towards` (blanco o negro) en pasos pequenos hasta que
 * contraste al menos `ratio` con `against`. Si ya contrasta, no lo toca. Nunca
 * pasa de 60 pasos: el ultimo tono es el mas cercano posible al elegido.
 */
export function ensureContrast(
  color: Rgb,
  against: Rgb,
  ratio: number,
  towards: "lighter" | "darker",
): Rgb {
  const target = towards === "lighter" ? WHITE : BLACK;
  let current = color;
  for (let step = 0; step < 60 && contrastRatio(current, against) < ratio; step += 1) {
    current = mix(current, target, 0.06);
  }
  return current;
}

/** Blanco o casi negro: el que mas contraste de sobre `fill`. */
function textOn(fill: Rgb): Rgb {
  return contrastRatio(fill, WHITE) >= contrastRatio(fill, SURFACES.bg) ? WHITE : SURFACES.bg;
}

/** Los dos colores que elige el administrador, como `#rrggbb`. */
export interface BrandColors {
  readonly brand: string;
  readonly accent: string;
}

/** Los colores INICIALES de la plantilla (`tokens.css`). */
export const DEFAULT_BRAND_COLORS: BrandColors = Object.freeze({
  brand: "#38bdf8",
  accent: "#2563eb",
});

/* Los mismos dos colores ya parseados, para no depender de `parseHex` aqui. */
const FALLBACK_BRAND: Rgb = { r: 56, g: 189, b: 248 };
const FALLBACK_ACCENT: Rgb = { r: 37, g: 99, b: 235 };

/** Minimo AA para texto normal. */
const TEXT_CONTRAST = 4.5;

/**
 * Los tokens de color que dependen de la marca, listos para `:root`.
 *
 * Un hex invalido cae al color inicial de la plantilla en vez de producir un
 * `NaN` en la hoja de estilos: la API ya lo valida, y esto es la red por si
 * alguna vez llega otra cosa.
 */
export function brandCssVariables(colors: BrandColors): Readonly<Record<string, string>> {
  const brandInput = parseHex(colors.brand) ?? FALLBACK_BRAND;
  const accentInput = parseHex(colors.accent) ?? FALLBACK_ACCENT;

  // MARCA: titulares, filetes, cifras, foco. Tiene que leerse como texto sobre
  // el fondo oscuro.
  const brand = ensureContrast(brandInput, SURFACES.bg, TEXT_CONTRAST, "lighter");
  const brandHover = mix(brand, WHITE, 0.3);
  const brandActive = mix(brand, WHITE, 0.55);
  const brandSubtle = mix(brand, SURFACES.bg, 0.85);
  const onBrand = textOn(brand);
  // La tinta de marca sobre la banda clara: el color elegido llevado a la
  // sombra hasta leerse sobre blanco calido.
  const lightBrand = ensureContrast(brandInput, SURFACES.lightBg, TEXT_CONTRAST, "darker");

  // ACENTO: relleno de los botones de compra. El texto que lleva encima decide
  // su rampa.
  const accent = accentInput;
  const onAccent = textOn(accent);
  const accentHover = mix(accent, WHITE, 0.08);
  const accentActive = mix(accent, BLACK, 0.14);
  const accentSubtle = mix(accent, SURFACES.bg, 0.85);
  const accentText = ensureContrast(accentInput, SURFACES.bg, TEXT_CONTRAST, "lighter");
  const lightAccent = ensureContrast(accentInput, SURFACES.lightBg, TEXT_CONTRAST, "darker");

  return Object.freeze({
    "--app-color-brand": channels(brand),
    "--app-color-brand-hover": channels(brandHover),
    "--app-color-brand-active": channels(brandActive),
    "--app-color-brand-subtle": channels(brandSubtle),
    "--app-color-on-brand": channels(onBrand),
    "--app-color-focus": channels(brandHover),
    "--app-color-light-gold": channels(lightBrand),
    "--app-color-accent": channels(accent),
    "--app-color-accent-hover": channels(accentHover),
    "--app-color-accent-active": channels(accentActive),
    "--app-color-accent-subtle": channels(accentSubtle),
    "--app-color-on-accent": channels(onAccent),
    "--app-color-accent-text": channels(accentText),
    "--app-color-light-accent": channels(lightAccent),
  });
}

/** El color de marca tal como se pinta (ya aclarado si hacia falta), en hex. */
export function effectiveBrandHex(colors: BrandColors): string {
  const brandInput = parseHex(colors.brand) ?? FALLBACK_BRAND;
  return toHex(ensureContrast(brandInput, SURFACES.bg, TEXT_CONTRAST, "lighter"));
}

/**
 * Version corta y estable de un texto, para el `?v=` de un recurso de marca.
 *
 * Permite cachear el recurso un ano y aun asi ver el nuevo en cuanto cambie la
 * marca. FNV-1a de 32 bits: no es criptografia, es un nombre de fichero.
 */
export function shortHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Version de lo que dibuja el patron (color + intensidad): `/brand-pattern.svg?v=...`. */
export function patternVersion(colors: BrandColors, opacityPercent: number): string {
  return shortHash(`${effectiveBrandHex(colors)}|${String(opacityPercent)}`);
}

/**
 * La hoja de estilos en linea que sobreescribe los tokens de `tokens.css`.
 *
 * `:root:root` y no `:root`: la hoja de tokens tambien declara en `:root`, y
 * el orden de las dos en el `<head>` no esta garantizado. Duplicar el selector
 * sube la especificidad sin tocar la cascada de nada mas.
 *
 * El patron topografico se sirve como fichero (`/brand-pattern.svg`) y no como
 * `data:` en linea: pesa ~30 KB y asi viaja una vez y se cachea, en vez de ir
 * dentro del HTML de cada pagina.
 */
export function brandThemeCss(colors: BrandColors, opacityPercent: number): string {
  const variables = brandCssVariables(colors);
  const declarations = Object.entries(variables)
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
  const version = patternVersion(colors, opacityPercent);
  return `:root:root{${declarations};--app-pattern-topo:url("/brand-pattern.svg?v=${version}")}`;
}

/* --------------------------------------------------------------------------
 * TEMA CLARO DEL PANEL
 * ----------------------------------------------------------------------- */

/** El gris muy claro de fondo del panel (`--app-color-bg` dentro de `/admin`). */
const ADMIN_BG: Rgb = { r: 242, g: 244, b: 248 };
/** La tinta del panel (`--app-color-text` dentro de `/admin`). */
const ADMIN_INK: Rgb = { r: 15, g: 23, b: 42 };

/** Blanco o la tinta del panel: el que mas contraste de sobre `fill`. */
function textOnLight(fill: Rgb): Rgb {
  return contrastRatio(fill, WHITE) >= contrastRatio(fill, ADMIN_INK) ? WHITE : ADMIN_INK;
}

/**
 * Lo que NO depende de la marca: superficies, textos, estados y sombras del
 * panel en claro. Cada texto mide al menos 4,5:1 sobre el fondo gris (el peor
 * caso: sobre el blanco de una tarjeta mide mas) y el borde fuerte -el de los
 * campos- 3:1, que es lo que WCAG 1.4.11 pide al contorno de un control.
 */
const ADMIN_FIXED: Readonly<Record<string, string>> = Object.freeze({
  "--app-color-bg": "242 244 248",
  "--app-color-surface": "255 255 255",
  "--app-color-surface-raised": "255 255 255",
  "--app-color-surface-sunken": "241 244 248",
  "--app-color-border": "223 228 236",
  "--app-color-border-strong": "122 134 154",
  "--app-color-text": "15 23 42",
  "--app-color-text-muted": "71 85 105",
  "--app-color-text-subtle": "90 104 126",
  "--app-color-text-inverse": "255 255 255",
  "--app-color-success": "21 128 61",
  "--app-color-success-subtle": "220 252 231",
  "--app-color-on-success": "255 255 255",
  "--app-color-warning": "180 83 9",
  "--app-color-warning-subtle": "254 243 199",
  "--app-color-on-warning": "255 255 255",
  "--app-color-danger": "185 28 28",
  "--app-color-danger-subtle": "254 226 226",
  "--app-color-on-danger": "255 255 255",
  "--app-color-info": "29 78 216",
  "--app-color-info-subtle": "219 234 254",
  "--app-color-on-info": "255 255 255",
  "--app-color-overlay": "15 23 42",
  "--app-color-skeleton": "226 232 240",
  // La banda clara del escaparate, por si alguna pantalla del panel la usa:
  // dentro del panel ES la pagina.
  "--app-color-light-bg": "242 244 248",
  "--app-color-light-surface": "255 255 255",
  "--app-color-light-surface-sunken": "241 244 248",
  "--app-color-light-border": "223 228 236",
  "--app-color-light-border-strong": "122 134 154",
  "--app-color-light-text": "15 23 42",
  "--app-color-light-text-muted": "71 85 105",
  "--app-shadow-sm": "0 1px 2px 0 rgb(15 23 42 / 0.06)",
  "--app-shadow-md": "0 1px 2px 0 rgb(15 23 42 / 0.05), 0 4px 12px -2px rgb(15 23 42 / 0.08)",
  "--app-shadow-lg": "0 1px 3px 0 rgb(15 23 42 / 0.06), 0 12px 28px -8px rgb(15 23 42 / 0.16)",
  "--app-shadow-xl": "0 24px 56px -12px rgb(15 23 42 / 0.28)",
  "--app-pattern-topo": "none",
});

/**
 * Los tokens del PANEL, que es blanco (el escaparate es oscuro).
 *
 * El cliente pidio un panel claro para trabajar a diario en la computadora y
 * en el telefono. No es otra paleta inventada: son los mismos dos colores de
 * la marca, llevados a la SOMBRA hasta leerse sobre el gris claro del panel,
 * igual que ya se hacia para la banda clara de la tienda. Asi, quien cambia
 * los colores en "Marca" ve el panel cambiar con ellos.
 *
 * Sobre claro el hover y el pulsado OSCURECEN, al reves que en la tienda.
 */
export function adminCssVariables(colors: BrandColors): Readonly<Record<string, string>> {
  const brandInput = parseHex(colors.brand) ?? FALLBACK_BRAND;
  const accentInput = parseHex(colors.accent) ?? FALLBACK_ACCENT;

  const brand = ensureContrast(brandInput, ADMIN_BG, TEXT_CONTRAST, "darker");
  const accent = accentInput;
  const accentText = ensureContrast(accentInput, ADMIN_BG, TEXT_CONTRAST, "darker");

  return Object.freeze({
    ...ADMIN_FIXED,
    "--app-color-brand": channels(brand),
    "--app-color-brand-hover": channels(mix(brand, BLACK, 0.12)),
    "--app-color-brand-active": channels(mix(brand, BLACK, 0.24)),
    "--app-color-brand-subtle": channels(mix(brand, WHITE, 0.9)),
    "--app-color-on-brand": channels(textOnLight(brand)),
    "--app-color-focus": channels(brand),
    "--app-color-light-gold": channels(brand),
    "--app-color-accent": channels(accent),
    "--app-color-accent-hover": channels(mix(accent, BLACK, 0.08)),
    "--app-color-accent-active": channels(mix(accent, BLACK, 0.18)),
    "--app-color-accent-subtle": channels(mix(accent, WHITE, 0.9)),
    "--app-color-on-accent": channels(textOnLight(accent)),
    "--app-color-accent-text": channels(accentText),
    "--app-color-light-accent": channels(accentText),
  });
}

/**
 * La hoja en linea del panel. Mismo `:root:root` que `brandThemeCss`, por el
 * mismo motivo, y ademas:
 *
 *   - `color-scheme: light`, para que las barras de desplazamiento, los
 *     calendarios y los `select` nativos salgan claros;
 *   - una sola letra, la de lectura (Inter): la condensada y la de titular
 *     son de cartel, y en una herramienta de trabajo cansan y ocupan;
 *   - en telefono el boton pequeno (`size="sm"`) sube a 44px: en el panel es
 *     el de las acciones de cada fila, y en una pantalla tactil tiene que
 *     poder pulsarse sin apuntar.
 */
export function adminThemeCss(colors: BrandColors): string {
  const declarations = Object.entries(adminCssVariables(colors))
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
  const type =
    "--app-font-display:var(--app-font-sans);--app-font-headline:var(--app-font-sans);" +
    "--app-tracking-display:-0.01em;--app-tracking-wide:0.02em";
  return (
    `:root:root{${declarations};${type};color-scheme:light}` +
    `@media (max-width:767px){:root:root{--app-control-height-sm:2.75rem}}`
  );
}

/* --------------------------------------------------------------------------
 * PAGINAS INTERIORES DE LA TIENDA EN CLARO (2026-10-13)
 * ----------------------------------------------------------------------- */

/** Lo unico en que las paginas interiores difieren del panel: la pagina es blanca. */
const STORE_LIGHT_OVERRIDES: Readonly<Record<string, string>> = Object.freeze({
  "--app-color-bg": "255 255 255",
  "--app-color-light-bg": "255 255 255",
});

/**
 * Los tokens de las paginas interiores de la tienda: todo lo que no es la
 * portada (carrito, catalogo, cuenta, pago, paginas legales...).
 *
 * El usuario pidio fondo BLANCO fuera de la portada, para que se note de un
 * vistazo que se ha salido de ella y para que formularios, precios y listas se
 * lean mejor. No es otra paleta: es la del panel -los mismos textos y estados,
 * y la marca llevada a la sombra hasta leerse sobre gris claro, asi que sobre
 * blanco contrasta todavia mas- con la pagina en blanco puro. A diferencia del
 * panel, conserva las letras de marca.
 *
 * Se aplica en `.app-theme-light` (ver `SiteMain`) y no en `:root`: la
 * cabecera, la franja de anuncio y el pie siguen oscuros en todas las paginas.
 * Tampoco aqui se toca el rojo de compra ni el oro, que son fijos.
 */
export function storeLightCssVariables(colors: BrandColors): Readonly<Record<string, string>> {
  return Object.freeze({ ...adminCssVariables(colors), ...STORE_LIGHT_OVERRIDES });
}

/**
 * La hoja de las paginas interiores. Va DETRAS de `brandThemeCss` en el mismo
 * `<style>`; el orden no importa para la cascada -las variables se declaran en
 * `<main>`, que esta por debajo de `:root` y por eso gana- pero si para
 * `brand-pattern.svg`, que lee el primer `--app-color-brand` de la hoja.
 */
export function storeLightThemeCss(colors: BrandColors): string {
  const declarations = Object.entries(storeLightCssVariables(colors))
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
  return `.app-theme-light{${declarations};color-scheme:light}`;
}
