"use server";

import { revalidatePath } from "next/cache";

import { isLocale } from "@/i18n/locales";
import { fromFailure, invalid, SUCCEEDED, type ActionResult } from "@/lib/action-result";
import { setAdminPaymentSettings } from "@/lib/api";
import { checkboxFrom, textFrom } from "@/lib/form-input";
import { mutableSession } from "@/lib/session-server";

/**
 * Guardar las formas de pago desde el panel (0041).
 *
 * Activar Zelle exige a nombre de quien esta la cuenta y el correo o telefono
 * registrado en Zelle: es lo que el comprador ve para transferir. Se comprueba
 * aqui, junto al campo, y la API lo vuelve a comprobar (422) igual que la CHECK
 * de la base de datos.
 */
export async function setPaymentSettingsAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const rawLocale = formData.get("locale");
  if (typeof rawLocale !== "string" || !isLocale(rawLocale)) return invalid("VALIDATION_FAILED");
  const locale = rawLocale;

  const zelleEnabled = checkboxFrom(formData, "zelle_enabled");
  const cashEnabled = checkboxFrom(formData, "cash_enabled");
  const recipientName = textFrom(formData, "zelle_recipient_name");
  const recipient = textFrom(formData, "zelle_recipient");

  if (recipientName !== null && recipientName.length > 80) {
    return invalid("TEXT_TOO_LONG", "zelle_recipient_name");
  }
  if (recipient !== null && recipient.length > 120) {
    return invalid("TEXT_TOO_LONG", "zelle_recipient");
  }
  if (zelleEnabled && recipientName === null) {
    return invalid("FIELD_REQUIRED", "zelle_recipient_name");
  }
  if (zelleEnabled && recipient === null) return invalid("FIELD_REQUIRED", "zelle_recipient");

  const result = await setAdminPaymentSettings(
    {
      cash_enabled: cashEnabled,
      zelle_enabled: zelleEnabled,
      zelle_recipient_name: recipientName,
      zelle_recipient: recipient,
    },
    locale,
    await mutableSession(),
  );
  if (!result.ok) return fromFailure(result.error);

  revalidatePath("/admin", "layout");
  return SUCCEEDED;
}
