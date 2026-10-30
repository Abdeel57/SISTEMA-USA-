"use server";

import { localeTag } from "@/i18n/locales";
import { redirect } from "@/i18n/navigation";
import { reserveOrder } from "@/lib/api";

import { fromFailure, invalid, SUCCEEDED, type ActionResult } from "./action-result";
import { composeWhatsApp } from "./dial-codes";
import { localeFrom, textFrom } from "./form-input";
import { mutableSession } from "./session-server";

/**
 * "Apartar" sin cuenta (0042): el WhatsApp con su lada, el nombre y, si se
 * quiere, los apellidos.
 *
 * El carrito viaja en la cookie del visitante; `mutableSession()` la reenvia a
 * la API y propaga al navegador la sesion que la API abre al apartar. Con esa
 * sesion la pagina del pedido ensena a quien pagar y deja subir la captura.
 *
 * Aqui solo se comprueba que el formulario este completo y que el numero tenga
 * pinta de numero; la API lo vuelve a validar todo y es quien decide.
 */
export async function reserveOrderAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const locale = localeFrom(formData);
  if (locale === null) return invalid("VALIDATION_FAILED");

  const typedPhone = textFrom(formData, "whatsapp");
  if (typedPhone === null) return invalid("FIELD_REQUIRED", "whatsapp");
  const contactPhone = composeWhatsApp(textFrom(formData, "dial_country") ?? "", typedPhone);
  if (contactPhone === null) return invalid("PHONE_INVALID", "whatsapp");

  const firstName = textFrom(formData, "first_name");
  if (firstName === null) return invalid("FIELD_REQUIRED", "first_name");
  const lastName = textFrom(formData, "last_name");

  const order = await reserveOrder(
    {
      contact_phone: contactPhone,
      first_name: firstName,
      ...(lastName === null ? {} : { last_name: lastName }),
      language_preference: localeTag(locale),
    },
    locale,
    await mutableSession(),
  );

  if (!order.ok) {
    const phoneRejected =
      order.error.kind === "http" &&
      order.error.status === 422 &&
      JSON.stringify(order.error.details ?? null).includes("contact_phone");
    return phoneRejected ? invalid("PHONE_INVALID", "whatsapp") : fromFailure(order.error);
  }

  // `redirect` de next-intl no se declara `never` (ver `auth-actions.ts`).
  redirect({ href: `/orders/${encodeURIComponent(order.data.id)}/confirmation`, locale });
  return SUCCEEDED;
}
