/**
 * Tipos de solicitud de privacidad (DEC-063) que `/privacychoices` enumera al
 * explicar como escribir al correo de contacto. Plantilla: ya no hay
 * formulario ni ruta `POST /privacy-requests`; la solicitud llega por correo.
 *
 * Modulo sin dependencias a proposito: un import de servidor dentro de un
 * componente de cliente rompe el build de Next aunque tsc y vitest pasen.
 */
export const PRIVACY_REQUEST_TYPES = [
  "ACCESS",
  "DELETE",
  "CORRECT",
  "OPT_OUT_SALE_SHARING",
  "LIMIT_SENSITIVE",
  "APPEAL",
  "OTHER",
] as const;

export type PrivacyRequestType = (typeof PRIVACY_REQUEST_TYPES)[number];

export function isPrivacyRequestType(value: string | null): value is PrivacyRequestType {
  return value !== null && (PRIVACY_REQUEST_TYPES as readonly string[]).includes(value);
}
