"use server";

import { revalidatePath } from "next/cache";

import { fromFailure, invalid, SUCCEEDED, type ActionResult } from "@/lib/action-result";
import { updateAdminBrand, type AdminBrandInput } from "@/lib/api";
import { localeFrom, textFrom } from "@/lib/form-input";
import { mutableSession } from "@/lib/session-server";

import {
  BRAND_LIMITS,
  isEmailLike,
  isUuid,
  normalizeColor,
  normalizeDomain,
  normalizePrefix,
  parsePatternOpacity,
} from "./brand-input";
import { isIanaTimeZone } from "./catalog-input";
import { mediaFrom } from "./image-upload";

/**
 * Guardar la marca del sitio desde el panel (§17, migracion 0040).
 *
 * UN FORMULARIO, LA FILA ENTERA. `PUT /admin/brand` reemplaza la fila completa
 * -un parche parcial dejaria una marca a medias entre dos guardados-, asi que
 * la accion lee TODOS los campos y rechaza el primero que falle, junto a su
 * campo, antes de llamar a la API. La API revalida y es quien decide (422).
 *
 * EL LOGOTIPO VA POR `POST /admin/media` (§14), como una foto del catalogo, y
 * aqui viaja solo su `id`. Tres casos:
 *
 *   - se eligio un fichero ......... se sube y va su `id`;
 *   - se marco "quitar" ............ va `null` (vuelve el simbolo de la plantilla);
 *   - no se toco ................... va el `id` ACTUAL, que el formulario
 *                                    repite en un campo oculto. Un `PUT` sin el
 *                                    lo borraria, porque reemplaza la fila.
 *
 * El campo oculto es ENTRADA DE USUARIO como cualquier otro: se comprueba que
 * sea un UUID o vacio. Que exista lo comprueba la API (422 si no).
 *
 * LA FOTO SE SUBE LO ULTIMO: un formulario invalido no deja un logotipo
 * guardado que nadie va a usar.
 *
 * SE REVALIDA EL SITIO PUBLICO ENTERO, no solo el panel: la marca esta en cada
 * pagina (cabecera, pie, colores, documentos legales), y `GET /config` la sirve
 * en el siguiente render.
 */

type Reading<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly result: ActionResult };

/** Texto obligatorio, recortado, de hasta `max` caracteres. */
function requiredText(formData: FormData, field: string, max: number): Reading<string> {
  const value = textFrom(formData, field);
  if (value === null) return { ok: false, result: invalid("FIELD_REQUIRED", field) };
  if (value.length > max) return { ok: false, result: invalid("TEXT_TOO_LONG", field) };
  return { ok: true, value };
}

/** Texto opcional: vacio vale, pero tampoco puede pasarse de `max`. */
function optionalText(formData: FormData, field: string, max: number): Reading<string> {
  const value = textFrom(formData, field) ?? "";
  if (value.length > max) return { ok: false, result: invalid("TEXT_TOO_LONG", field) };
  return { ok: true, value };
}

export async function updateBrandAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const locale = localeFrom(formData);
  if (locale === null) return invalid("VALIDATION_FAILED");

  // --- Identidad.
  const name = requiredText(formData, "name", BRAND_LIMITS.name);
  if (!name.ok) return name.result;

  const wordmarkLead = requiredText(formData, "wordmark_lead", BRAND_LIMITS.wordmarkLead);
  if (!wordmarkLead.ok) return wordmarkLead.result;

  const wordmarkTail = optionalText(formData, "wordmark_tail", BRAND_LIMITS.wordmarkTail);
  if (!wordmarkTail.ok) return wordmarkTail.result;

  // --- Colores y patron.
  const brandColor = normalizeColor(textFrom(formData, "color_brand") ?? "");
  if (brandColor === null) return invalid("COLOR_INVALID", "color_brand");

  const accentColor = normalizeColor(textFrom(formData, "color_accent") ?? "");
  if (accentColor === null) return invalid("COLOR_INVALID", "color_accent");

  const patternOpacity = parsePatternOpacity(textFrom(formData, "pattern_opacity_percent") ?? "");
  if (patternOpacity === null) {
    return invalid("PATTERN_OPACITY_INVALID", "pattern_opacity_percent");
  }

  // --- Datos legales.
  const legalName = requiredText(formData, "legal_name", BRAND_LIMITS.legalName);
  if (!legalName.ok) return legalName.result;

  const legalEntity = requiredText(
    formData,
    "legal_entity_description",
    BRAND_LIMITS.legalEntityDescription,
  );
  if (!legalEntity.ok) return legalEntity.result;

  const legalState = requiredText(
    formData,
    "legal_governing_law_state",
    BRAND_LIMITS.legalGoverningLawState,
  );
  if (!legalState.ok) return legalState.result;

  const legalVenue = requiredText(formData, "legal_venue", BRAND_LIMITS.legalVenue);
  if (!legalVenue.ok) return legalVenue.result;

  const legalStreet = requiredText(formData, "legal_street", BRAND_LIMITS.legalStreet);
  if (!legalStreet.ok) return legalStreet.result;

  const legalCity = requiredText(formData, "legal_city_state_zip", BRAND_LIMITS.legalCityStateZip);
  if (!legalCity.ok) return legalCity.result;

  // --- Contacto y dominio.
  const contactEmail = textFrom(formData, "contact_email");
  if (contactEmail === null) return invalid("FIELD_REQUIRED", "contact_email");
  if (!isEmailLike(contactEmail)) return invalid("EMAIL_INVALID", "contact_email");

  const rawDomain = textFrom(formData, "domain");
  if (rawDomain === null) return invalid("FIELD_REQUIRED", "domain");
  const domain = normalizeDomain(rawDomain);
  if (domain === null) return invalid("DOMAIN_INVALID", "domain");

  // --- Numeracion y zona horaria.
  const rawOrderPrefix = textFrom(formData, "order_prefix");
  if (rawOrderPrefix === null) return invalid("FIELD_REQUIRED", "order_prefix");
  const orderPrefix = normalizePrefix(rawOrderPrefix);
  if (orderPrefix === null) return invalid("PREFIX_INVALID", "order_prefix");

  const rawEntryPrefix = textFrom(formData, "entry_prefix");
  if (rawEntryPrefix === null) return invalid("FIELD_REQUIRED", "entry_prefix");
  const entryPrefix = normalizePrefix(rawEntryPrefix);
  if (entryPrefix === null) return invalid("PREFIX_INVALID", "entry_prefix");

  const timeZone = textFrom(formData, "time_zone");
  if (timeZone === null) return invalid("FIELD_REQUIRED", "time_zone");
  if (!isIanaTimeZone(timeZone)) return invalid("TIMEZONE_INVALID", "time_zone");

  // --- Logotipo actual (campo oculto): UUID o vacio.
  const currentLogoId = textFrom(formData, "logo_media_id");
  if (currentLogoId !== null && !isUuid(currentLogoId)) {
    return invalid("VALIDATION_FAILED", "logo_media_id");
  }

  const session = await mutableSession();

  // --- Logotipo nuevo, si lo hay. Lo ultimo, para no subir nada en vano.
  const logo = await mediaFrom(formData, "logo", locale, session);
  if (!logo.ok) return logo.result;

  const logoMediaId =
    logo.asset === undefined ? currentLogoId : logo.asset === null ? null : logo.asset.id;

  const input: AdminBrandInput = {
    name: name.value,
    wordmark: { lead: wordmarkLead.value, tail: wordmarkTail.value },
    legal: {
      name: legalName.value,
      entity_description: legalEntity.value,
      governing_law_state: legalState.value,
      venue: legalVenue.value,
      street: legalStreet.value,
      city_state_zip: legalCity.value,
    },
    contact_email: contactEmail,
    domain,
    time_zone: timeZone,
    numbering: { order_prefix: orderPrefix, entry_prefix: entryPrefix },
    colors: { brand: brandColor, accent: accentColor },
    pattern_opacity_percent: patternOpacity,
    logo_media_id: logoMediaId,
  };

  const result = await updateAdminBrand(input, locale, session);
  if (!result.ok) return fromFailure(result.error);

  // La marca esta en todo el sitio publico, no solo en el panel.
  revalidatePath("/", "layout");
  revalidatePath("/admin", "layout");
  return SUCCEEDED;
}
