/**
 * Lectura y normalizacion de los campos de la marca del sitio (§17, migracion
 * 0040).
 *
 * VIVE APARTE DE `brand-actions.ts` POR DOS RAZONES
 * -------------------------------------------------
 * 1. Todo lo que exporta un modulo `"use server"` se convierte en una accion
 *    invocable desde el navegador. Estas funciones son ayudantes puros, no
 *    acciones.
 * 2. El formulario (cliente) necesita los mismos LIMITES para que el navegador
 *    frene antes de enviar (`maxLength`, `pattern`), y la lista de zonas
 *    horarias para el `<datalist>`. Un modulo sin importaciones de servidor
 *    puede entrar en el bundle del cliente; la accion no.
 *
 * ESTA VALIDACION NO ES AUTORITATIVA, como el resto de `form-input.ts`: la API
 * revalida todo (422 `VALIDATION_FAILED`) y las CHECK de la 0040 debajo. Aqui
 * se comprueba para contestar rapido, junto al campo, y para NORMALIZAR lo que
 * la API normalizaria igual: dominio y colores en minusculas, prefijos en
 * mayusculas. Mandar lo normalizado hace que lo que se ve en pantalla despues
 * de guardar sea lo mismo que se tecleo, sin sorpresas.
 */

/** Longitudes maximas de los textos, las de `PUT /admin/brand`. */
export const BRAND_LIMITS = {
  name: 60,
  wordmarkLead: 30,
  wordmarkTail: 30,
  legalName: 120,
  legalEntityDescription: 120,
  legalGoverningLawState: 60,
  legalVenue: 120,
  legalStreet: 160,
  legalCityStateZip: 120,
  /** Intensidad del patron de fondo, en por ciento: de 0 (oculto) a este tope. */
  patternOpacityMax: 40,
} as const;

/** Prefijos de numeracion: `^[A-Z0-9]{2,8}$` despues de pasar a mayusculas. */
export const BRAND_PREFIX_PATTERN = /^[A-Z0-9]{2,8}$/u;

/**
 * Zonas IANA que se OFRECEN en el `<datalist>` del formulario: las de Estados
 * Unidos y Mexico, que es donde operan los clientes de la plantilla. No es una
 * lista cerrada -se puede teclear cualquier zona valida- y por eso no es una
 * regla: es una comodidad para no tener que recordar `America/Chicago`.
 */
export const BRAND_TIME_ZONE_SUGGESTIONS: readonly string[] = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Puerto_Rico",
  "America/Mexico_City",
  "America/Monterrey",
  "America/Chihuahua",
  "America/Hermosillo",
  "America/Mazatlan",
  "America/Tijuana",
  "America/Cancun",
  "America/Merida",
  "America/Matamoros",
  "America/Ojinaga",
];

/**
 * Dominio normalizado, o `null` si no es un host.
 *
 * ES AMABLE A PROPOSITO: quien pega la direccion de su web desde el navegador
 * trae `https://` delante y una barra detras. Se quitan los dos antes de
 * comprobar, en vez de rechazar algo que todo el mundo entiende. Lo que queda
 * tiene que ser un host con al menos un punto: etiquetas de letras, cifras y
 * guiones, sin empezar ni acabar en guion.
 */
export function normalizeDomain(raw: string): string | null {
  const host = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//u, "")
    .replace(/\/+$/u, "");

  if (host.length === 0 || host.length > 253) return null;

  const label = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
  return new RegExp(`^${label}(?:\\.${label})+$`, "u").test(host) ? host : null;
}

/** Prefijo de numeracion en mayusculas, o `null` si no cumple el patron. */
export function normalizePrefix(raw: string): string | null {
  const prefix = raw.trim().toUpperCase();
  return BRAND_PREFIX_PATTERN.test(prefix) ? prefix : null;
}

/** Color `#rrggbb` en minusculas, o `null`. Es lo que devuelve `<input type="color">`. */
export function normalizeColor(raw: string): string | null {
  const color = raw.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/u.test(color) ? color : null;
}

/** Intensidad del patron: entero de 0 a `patternOpacityMax`, o `null`. */
export function parsePatternOpacity(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d{1,3}$/u.test(text)) return null;

  const value = Number.parseInt(text, 10);
  return value <= BRAND_LIMITS.patternOpacityMax ? value : null;
}

/**
 * Si tiene forma de correo. Una comprobacion minima -algo, arroba, algo, punto,
 * algo-, la misma que hace `type="email"` en el navegador: la API es quien
 * decide, y aqui solo se evita mandar un texto que claramente no lo es.
 */
export function isEmailLike(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(raw);
}

/** Si es un UUID, que es la forma del `id` de `POST /admin/media`. */
export function isUuid(raw: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(raw);
}
