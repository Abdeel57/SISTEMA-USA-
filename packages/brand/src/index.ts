/**
 * `@app/brand`: la marca del cliente y como se inserta en los textos.
 *
 * DOS FUENTES, UNA FORMA
 *   - `BRAND` (de `brand.config.ts`) son los valores INICIALES: con ellos se
 *     siembra la base de datos en el primer despliegue.
 *   - Lo que manda en produccion es el perfil guardado en la tabla
 *     `brand_profile`, que el administrador edita desde el panel. La API lo
 *     publica en `GET /config` y la web lo aplica en cada peticion.
 *   Las dos tienen la forma `BrandProfile`, asi que todo lo que acepta un
 *   perfil funciona igual con el archivo que con la base de datos.
 *
 * MARCADORES EN LOS TEXTOS
 *   Los diccionarios de `apps/web` y los documentos legales no llevan escrito
 *   el nombre de ningun cliente: llevan MARCADORES como `[[brand.name]]`, y
 *   `withBrand()` los sustituye al cargarlos. Se usan corchetes dobles y no
 *   llaves porque los diccionarios son ICU (next-intl): `{nombre}` ya
 *   significa "argumento" y romperia el mensaje.
 */

import { BRAND } from "./brand.config.js";

export { BRAND };

/** Forma del perfil de marca, tanto el del archivo como el de la base de datos. */
export interface BrandProfile {
  readonly name: string;
  readonly wordmark: { readonly lead: string; readonly tail: string };
  readonly legal: {
    readonly name: string;
    readonly entityDescription: string;
    readonly governingLawState: string;
    readonly venue: string;
    readonly address: { readonly street: string; readonly cityStateZip: string };
  };
  readonly contact: { readonly email: string };
  readonly domain: string;
  readonly numbering: { readonly orderPrefix: string; readonly entryPrefix: string };
  readonly timeZone: string;
}

export type Brand = BrandProfile;

/** URL publica de la web, con protocolo y sin barra final. */
export const brandSiteUrl = (brand: BrandProfile = BRAND): string => `https://${brand.domain}`;

export const BRAND_SITE_URL = brandSiteUrl(BRAND);

/** Marcadores admitidos en los textos y su valor para un perfil dado. */
export function brandTokens(brand: BrandProfile = BRAND): Readonly<Record<string, string>> {
  return Object.freeze({
    "[[brand.name]]": brand.name,
    "[[brand.nameUpper]]": brand.name.toUpperCase(),
    "[[brand.wordmarkLead]]": brand.wordmark.lead,
    "[[brand.wordmarkTail]]": brand.wordmark.tail,
    "[[brand.legalName]]": brand.legal.name,
    "[[brand.legalNameUpper]]": brand.legal.name.toUpperCase(),
    "[[brand.legalEntity]]": brand.legal.entityDescription,
    "[[brand.governingLawState]]": brand.legal.governingLawState,
    "[[brand.venue]]": brand.legal.venue,
    "[[brand.street]]": brand.legal.address.street,
    "[[brand.cityStateZip]]": brand.legal.address.cityStateZip,
    "[[brand.email]]": brand.contact.email,
    "[[brand.domain]]": brand.domain,
    "[[brand.url]]": brandSiteUrl(brand),
  });
}

export const BRAND_TOKENS = brandTokens(BRAND);

const TOKEN_PATTERN = /\[\[brand\.[a-zA-Z]+\]\]/gu;

/**
 * Sustituye los marcadores de marca de un texto.
 *
 * Un marcador desconocido NO se deja pasar en silencio: lanza. Un
 * `[[brand.nmae]]` publicado tal cual en la pagina de Terminos es peor que un
 * fallo al arrancar, que se ve en el primer despliegue.
 */
export function brandText(text: string, brand: BrandProfile = BRAND): string {
  const tokens = brandTokens(brand);
  return text.replace(TOKEN_PATTERN, (token) => {
    const value = tokens[token];
    if (value === undefined) {
      throw new Error(`Marcador de marca desconocido: ${token}`);
    }
    return value;
  });
}

/**
 * Aplica `brandText` a todas las cadenas de una estructura (objetos y listas),
 * conservando su forma. Es lo que se usa con los diccionarios y los
 * documentos legales.
 */
export function withBrand<T>(value: T, brand: BrandProfile = BRAND): T {
  if (typeof value === "string") {
    return brandText(value, brand) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => withBrand(item, brand)) as T;
  }
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = withBrand(item, brand);
    }
    return out as T;
  }
  return value;
}

const PREFIX_SHAPE = /^[A-Z0-9]{2,8}$/u;
const HOST_SHAPE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/iu;
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;

/** `true` si `timeZone` es una zona IANA que este Node conoce. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Comprueba un perfil. La llaman `db:bootstrap` antes de sembrar y la API
 * antes de guardar lo que manda el panel, para que un valor invalido falle con
 * un mensaje claro en vez de con un error del motor.
 */
export function brandProfileProblems(brand: BrandProfile = BRAND): readonly string[] {
  const problems: string[] = [];
  const nonEmpty: readonly (readonly [string, string, number])[] = [
    ["name", brand.name, 60],
    ["wordmark.lead", brand.wordmark.lead, 30],
    ["legal.name", brand.legal.name, 120],
    ["legal.entityDescription", brand.legal.entityDescription, 120],
    ["legal.governingLawState", brand.legal.governingLawState, 60],
    ["legal.venue", brand.legal.venue, 120],
    ["legal.address.street", brand.legal.address.street, 160],
    ["legal.address.cityStateZip", brand.legal.address.cityStateZip, 120],
  ];
  for (const [field, value, max] of nonEmpty) {
    if (value.trim() === "") problems.push(`${field} no puede estar vacio.`);
    else if (value.length > max) problems.push(`${field} supera ${String(max)} caracteres.`);
  }
  if (brand.wordmark.tail.length > 30) problems.push("wordmark.tail supera 30 caracteres.");
  if (!PREFIX_SHAPE.test(brand.numbering.orderPrefix)) {
    problems.push(
      `numbering.orderPrefix debe ser de 2 a 8 mayusculas o cifras (es "${brand.numbering.orderPrefix}").`,
    );
  }
  if (!PREFIX_SHAPE.test(brand.numbering.entryPrefix)) {
    problems.push(
      `numbering.entryPrefix debe ser de 2 a 8 mayusculas o cifras (es "${brand.numbering.entryPrefix}").`,
    );
  }
  if (!HOST_SHAPE.test(brand.domain)) {
    problems.push(`domain va sin protocolo ni barras, como "mimarca.com" (es "${brand.domain}").`);
  }
  if (!EMAIL_SHAPE.test(brand.contact.email)) {
    problems.push(`contact.email no parece un correo (es "${brand.contact.email}").`);
  }
  if (!isValidTimeZone(brand.timeZone)) {
    problems.push(`timeZone no es una zona IANA valida (es "${brand.timeZone}").`);
  }
  return problems;
}

/** Nombre anterior; se conserva para quien ya lo importaba. */
export const brandConfigProblems = (): readonly string[] => brandProfileProblems(BRAND);
