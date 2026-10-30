"use server";

import { ADMIN_MEDIA_CONTENT_TYPES, ADMIN_MEDIA_MAX_BYTES, uploadPaymentReceipt } from "@/lib/api";

import { fromFailure, invalid, SUCCEEDED, type ActionResult } from "./action-result";
import { localeFrom, textFrom } from "./form-input";
import { mutableSession } from "./session-server";

/**
 * Sube la captura del pago de un pedido por Zelle (0041) o Venmo (0042).
 *
 * El fichero viaja en el formulario hasta aqui y desde aqui a la API, en
 * base64: el navegador no habla con la API. Tipo y tamano se comprueban ANTES
 * de subir, con los mismos limites que la API, para contestar junto al campo
 * sin gastar la subida; la API vuelve a comprobarlo todo -y decide el tipo por
 * la firma de los bytes, no por lo que diga el navegador-.
 *
 * Que el pedido sea del participante y siga pendiente lo decide la API: aqui
 * no se lee nada del pedido.
 */

const ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const FIELD = "receipt_file";

export async function uploadPaymentReceiptAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const locale = localeFrom(formData);
  const orderId = textFrom(formData, "order_id");
  if (locale === null || orderId === null || !ORDER_ID.test(orderId)) {
    return invalid("VALIDATION_FAILED");
  }

  const raw = formData.get(FIELD);
  if (typeof raw !== "object" || raw === null || raw.size === 0) {
    return invalid("RECEIPT_FILE_REQUIRED", FIELD);
  }
  if (!(ADMIN_MEDIA_CONTENT_TYPES as readonly string[]).includes(raw.type)) {
    return invalid("MEDIA_TYPE_UNSUPPORTED", FIELD);
  }
  if (raw.size > ADMIN_MEDIA_MAX_BYTES) return invalid("MEDIA_TOO_LARGE", FIELD);

  // 0042: la app con la que pago. Solo los dos valores que existen; otro
  // cualquiera se trata como no dicho y la API usa el canal del pedido.
  const typedChannel = textFrom(formData, "payment_channel");
  const channel = typedChannel === "ZELLE" || typedChannel === "VENMO" ? typedChannel : undefined;

  const bytes = Buffer.from(await raw.arrayBuffer());
  const uploaded = await uploadPaymentReceipt(
    orderId,
    bytes.toString("base64"),
    locale,
    await mutableSession(),
    channel,
  );

  if (!uploaded.ok) return fromFailure(uploaded.error, FIELD);
  return SUCCEEDED;
}
