"use server";

import { revalidatePath } from "next/cache";

import { isLocale } from "@/i18n/locales";
import { fromFailure, invalid, SUCCEEDED, type ActionResult } from "@/lib/action-result";
import { setAdminPaymentSettings } from "@/lib/api";
import { checkboxFrom, textFrom } from "@/lib/form-input";
import { mutableSession } from "@/lib/session-server";

import { isUuid } from "./brand-input";
import { mediaFrom } from "./image-upload";

/** El usuario de Venmo como lo guarda la API: sin arroba. */
const VENMO_HANDLE = /^[A-Za-z0-9_-]{2,40}$/u;

/**
 * Guardar las formas de pago desde el panel (0041, 0042).
 *
 * Activar Zelle exige a nombre de quien esta la cuenta y el correo o telefono
 * registrado en Zelle; activar Venmo, el nombre y el usuario. Es lo que el
 * comprador ve para pagar. Se comprueba aqui, junto al campo, y la API lo
 * vuelve a comprobar (422) igual que la CHECK de la base de datos.
 *
 * El codigo QR de Venmo es una imagen como el logotipo: se sube a la
 * biblioteca y se guarda su id. Sin imagen nueva se conserva la que habia.
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

  // --- Venmo (0042).
  const venmoEnabled = checkboxFrom(formData, "venmo_enabled");
  const venmoName = textFrom(formData, "venmo_recipient_name");
  const typedHandle = textFrom(formData, "venmo_handle");
  const venmoHandle = typedHandle === null ? null : typedHandle.replace(/^@/u, "");

  if (venmoName !== null && venmoName.length > 80) {
    return invalid("TEXT_TOO_LONG", "venmo_recipient_name");
  }
  if (venmoHandle !== null && !VENMO_HANDLE.test(venmoHandle)) {
    return invalid("VENMO_HANDLE_INVALID", "venmo_handle");
  }
  if (venmoEnabled && venmoName === null) {
    return invalid("FIELD_REQUIRED", "venmo_recipient_name");
  }
  if (venmoEnabled && venmoHandle === null) return invalid("FIELD_REQUIRED", "venmo_handle");

  const currentQrId = textFrom(formData, "venmo_qr_media_id");
  if (currentQrId !== null && !isUuid(currentQrId)) {
    return invalid("VALIDATION_FAILED", "venmo_qr_media_id");
  }

  const session = await mutableSession();

  // Lo ultimo, para no subir nada en vano.
  const qr = await mediaFrom(formData, "venmo_qr", locale, session);
  if (!qr.ok) return qr.result;
  const venmoQrMediaId =
    qr.asset === undefined ? currentQrId : qr.asset === null ? null : qr.asset.id;

  const result = await setAdminPaymentSettings(
    {
      cash_enabled: cashEnabled,
      zelle_enabled: zelleEnabled,
      zelle_recipient_name: recipientName,
      zelle_recipient: recipient,
      venmo_enabled: venmoEnabled,
      venmo_recipient_name: venmoName,
      venmo_handle: venmoHandle,
      venmo_qr_media_id: venmoQrMediaId,
    },
    locale,
    session,
  );
  if (!result.ok) return fromFailure(result.error);

  revalidatePath("/admin", "layout");
  return SUCCEEDED;
}
