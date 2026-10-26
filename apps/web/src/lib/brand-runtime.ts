import { BRAND, type BrandProfile } from "@app/brand";

import type { PublicBrand } from "./api/contract";
import {
  brandThemeCss,
  DEFAULT_BRAND_COLORS,
  patternVersion,
  type BrandColors,
} from "./brand-palette";

/**
 * La marca en tiempo de ejecucion: lo que la API publico en `GET /config`
 * (`brand`, §17) convertido a lo que cada pieza de la web necesita.
 *
 * ESTE MODULO ES PURO. La lectura de la API esta en `brand-server.ts`; aqui
 * solo se traduce, y por eso se puede probar sin red y usar desde cualquier
 * sitio que ya tenga un `PublicBrand` a mano.
 */
export interface RuntimeBrand {
  /** La forma de `@app/brand`: lo que rellena `[[brand.*]]` en textos y documentos legales. */
  readonly profile: BrandProfile;
  readonly colors: BrandColors;
  /** 0..40. */
  readonly patternOpacityPercent: number;
  /** Ruta del logotipo subido, o `null` para el simbolo de la plantilla. */
  readonly logoUrl: string | null;
  /** El dominio con y sin `www`, en minusculas: lo que decide si un enlace es "de este sitio". */
  readonly siteHosts: readonly string[];
  /** Version del patron topografico (color + intensidad), para su URL cacheable. */
  readonly patternVersion: string;
  /** La hoja en linea que sobreescribe los tokens de color del design system. */
  readonly themeCss: string;
  /** `false` cuando la API no publico `brand` y todo son los valores iniciales. */
  readonly fromApi: boolean;
}

/** `example.com` -> `["example.com", "www.example.com"]`. */
export function siteHostsOf(domain: string): readonly string[] {
  const host = domain.trim().toLowerCase();
  return host.startsWith("www.") ? [host.slice(4), host] : [host, `www.${host}`];
}

const DEFAULT_OPACITY_PERCENT = 16;

function profileOf(brand: PublicBrand): BrandProfile {
  return {
    name: brand.name,
    wordmark: { lead: brand.wordmark.lead, tail: brand.wordmark.tail },
    legal: {
      name: brand.legal.name,
      entityDescription: brand.legal.entity_description,
      governingLawState: brand.legal.governing_law_state,
      venue: brand.legal.venue,
      address: { street: brand.legal.street, cityStateZip: brand.legal.city_state_zip },
    },
    contact: { email: brand.contact_email },
    domain: brand.domain,
    numbering: {
      orderPrefix: brand.numbering.order_prefix,
      entryPrefix: brand.numbering.entry_prefix,
    },
    timeZone: brand.time_zone,
  };
}

/**
 * Construye la marca de ejecucion. Con `null` -la API no publico `brand` o no
 * respondio- devuelve los valores iniciales de `packages/brand`, que es lo que
 * la plantilla mostraba antes de que existiera el panel.
 */
export function runtimeBrandFrom(brand: PublicBrand | null): RuntimeBrand {
  const profile = brand === null ? BRAND : profileOf(brand);
  const colors: BrandColors =
    brand === null
      ? DEFAULT_BRAND_COLORS
      : { brand: brand.colors.brand.toLowerCase(), accent: brand.colors.accent.toLowerCase() };
  const patternOpacityPercent =
    brand === null
      ? DEFAULT_OPACITY_PERCENT
      : Math.min(40, Math.max(0, Math.round(brand.pattern_opacity_percent)));

  return {
    profile,
    colors,
    patternOpacityPercent,
    logoUrl: brand?.logo_url ?? null,
    siteHosts: siteHostsOf(profile.domain),
    patternVersion: patternVersion(colors, patternOpacityPercent),
    themeCss: brandThemeCss(colors, patternOpacityPercent),
    fromApi: brand !== null,
  };
}

/** La marca inicial, sin red. Para tests y para cuando la API no responde. */
export const DEFAULT_RUNTIME_BRAND: RuntimeBrand = runtimeBrandFrom(null);
