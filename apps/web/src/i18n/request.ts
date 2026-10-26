import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { loadBrand } from "@/lib/brand-server";

import { loadMessages } from "./messages";
import { routing } from "./routing";

/**
 * Configuracion por peticion de next-intl.
 *
 * Sobre `timeZone`
 * ----------------
 * DEC-011 prohibe usar la zona horaria del navegador o la del servidor como
 * fuente de verdad. Aqui se fija UTC como zona NEUTRA de formateo: garantiza
 * que servidor y cliente rendericen lo mismo y evita el aviso de next-intl.
 *
 * Cualquier instante legalmente relevante (apertura y cierre de promocion,
 * plazos de las Official Rules) NO se formatea con esta zona: se formatea
 * explicitamente contra `promotion.legal_timezone`, que llega desde la API.
 * Ver `src/i18n/formatters.ts`.
 *
 * Sobre la marca
 * --------------
 * Los diccionarios llevan marcadores `[[brand.*]]` y aqui se rellenan con la
 * marca GUARDADA DESDE EL PANEL (`loadBrand`, una lectura de `GET /config` por
 * peticion, compartida con el layout). Si la API no responde, se rellenan con
 * los valores iniciales de `packages/brand`: la pagina nunca sale con un
 * marcador sin sustituir.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const brand = await loadBrand();

  return {
    locale,
    messages: await loadMessages(locale, brand.profile),
    timeZone: "UTC",
  };
});
