import { BRAND } from "@app/brand";

import { CALIFORNIA_NOTICE } from "./california-notice";
import { PRIVACY_POLICY } from "./privacy-policy";
import { TERMS_AND_CONDITIONS } from "./terms-and-conditions";
import type { LegalDocument } from "./types";

/**
 * Rutas de los documentos legales.
 *
 * `/privacychoices` no es negociable: la Politica de Privacidad y el Aviso de
 * California publican esa URL literal (`https://<dominio>/privacychoices`)
 * como la via para ejercer derechos. Sin prefijo de idioma, el middleware la
 * lleva a `/en` o `/es`.
 */
export const LEGAL_ROUTES = {
  terms: "/terms",
  privacy: "/privacy",
  californiaNotice: "/california-notice",
  privacyChoices: "/privacychoices",
} as const;

/** Los tres documentos, en el orden en que se enlazan. */
export const LEGAL_DOCUMENTS: readonly {
  readonly route: string;
  readonly labelKey: "terms" | "privacy" | "californiaNotice";
  readonly document: LegalDocument;
}[] = [
  { route: LEGAL_ROUTES.terms, labelKey: "terms", document: TERMS_AND_CONDITIONS },
  { route: LEGAL_ROUTES.privacy, labelKey: "privacy", document: PRIVACY_POLICY },
  {
    route: LEGAL_ROUTES.californiaNotice,
    labelKey: "californiaNotice",
    document: CALIFORNIA_NOTICE,
  },
];

/**
 * Datos de contacto del negocio que publica el pie. Salen de la configuracion
 * de marca (`packages/brand/src/brand.config.ts`).
 */
export const BUSINESS_CONTACT = {
  legalName: BRAND.legal.name,
  email: BRAND.contact.email,
  street: BRAND.legal.address.street,
  cityStateZip: BRAND.legal.address.cityStateZip,
} as const;
