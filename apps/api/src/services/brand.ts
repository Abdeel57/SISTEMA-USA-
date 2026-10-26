/**
 * Marca del sitio (tabla `brand_profile`, migracion 0040): forma publica y
 * traduccion entre el cable y el puerto.
 *
 * DOS SUPERFICIES, UNA FORMA
 *   `GET /config` publica la marca para que `apps/web` la aplique en cada
 *   peticion: nombre, logotipo, colores, datos legales, contacto, dominio,
 *   prefijos y zona horaria. `GET/PUT /admin/brand` devuelven lo mismo mas lo
 *   que solo interesa al panel (quien guardo y que imagen es el logotipo).
 *   La misma funcion produce las dos para que no puedan discrepar.
 *
 * NADA DE AQUI ES SECRETO. Todo lo que lleva la marca ya esta impreso en la
 * pagina publica: el pie, los Terminos, la Politica de Privacidad. Por eso
 * `GET /config` es PUBLIC y la ruta de lectura del panel es `ROUTINE`.
 */

import type { BrandProfile } from "@app/brand";
import type { z } from "zod";

import type { publicBrandSchema } from "../http/schemas.js";
import type { BrandProfileInput, BrandProfileRecord } from "./ports.js";

export type PublicBrand = z.infer<typeof publicBrandSchema>;

/** La forma de `GET /config` (`brand`). */
export function presentPublicBrand(record: BrandProfileRecord): PublicBrand {
  return {
    name: record.name,
    wordmark: { lead: record.wordmarkLead, tail: record.wordmarkTail },
    legal: {
      name: record.legalName,
      entity_description: record.legalEntity,
      governing_law_state: record.governingLawState,
      venue: record.venue,
      street: record.street,
      city_state_zip: record.cityStateZip,
    },
    contact_email: record.contactEmail,
    domain: record.domain,
    time_zone: record.timeZone,
    numbering: {
      order_prefix: record.orderNumberPrefix,
      entry_prefix: record.entryNumberPrefix,
    },
    colors: { brand: record.colorBrand, accent: record.colorAccent },
    pattern_opacity_percent: record.patternOpacityPercent,
    logo_url: record.logoUrl,
    updated_at: record.updatedAt.toISOString(),
  };
}

/** La forma del panel: lo publico mas el id del logotipo y quien guardo. */
export function presentAdminBrand(record: BrandProfileRecord): PublicBrand & {
  readonly logo_media_id: string | null;
  readonly updated_by_admin_user_id: string | null;
} {
  return {
    ...presentPublicBrand(record),
    logo_media_id: record.logoMediaId,
    updated_by_admin_user_id: record.updatedByAdminUserId,
  };
}

/**
 * El perfil con la forma de `@app/brand`, para pasar por `brandProfileProblems`
 * -la MISMA comprobacion que hace `db:bootstrap` con el archivo inicial-.
 */
export function brandProfileOf(input: BrandProfileInput): BrandProfile {
  return {
    name: input.name,
    wordmark: { lead: input.wordmarkLead, tail: input.wordmarkTail },
    legal: {
      name: input.legalName,
      entityDescription: input.legalEntity,
      governingLawState: input.governingLawState,
      venue: input.venue,
      address: { street: input.street, cityStateZip: input.cityStateZip },
    },
    contact: { email: input.contactEmail },
    domain: input.domain,
    numbering: { orderPrefix: input.orderNumberPrefix, entryPrefix: input.entryNumberPrefix },
    timeZone: input.timeZone,
  };
}

/** Campos de la fila, en el orden en que se comparan para la auditoria. */
const COMPARABLE_FIELDS: readonly (keyof BrandProfileInput)[] = [
  "name",
  "wordmarkLead",
  "wordmarkTail",
  "legalName",
  "legalEntity",
  "governingLawState",
  "venue",
  "street",
  "cityStateZip",
  "contactEmail",
  "domain",
  "timeZone",
  "orderNumberPrefix",
  "entryNumberPrefix",
  "colorBrand",
  "colorAccent",
  "patternOpacityPercent",
  "logoMediaId",
];

/** Que campos cambian entre dos perfiles. Para la traza, no para decidir nada. */
export function changedBrandFields(
  before: BrandProfileInput,
  after: BrandProfileInput,
): readonly string[] {
  return COMPARABLE_FIELDS.filter((field) => before[field] !== after[field]).map(String);
}
