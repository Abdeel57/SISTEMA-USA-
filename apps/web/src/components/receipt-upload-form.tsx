"use client";

import { Alert, Button, cn, FOCUS_VISIBLE_CLASSES, FormField, useFormField } from "@app/ui";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, type ChangeEvent } from "react";

import type { Locale } from "@/i18n/locales";
import { useRouter } from "@/i18n/navigation";
import { IDLE } from "@/lib/action-result";
// De la hoja y no del indice: el indice arrastra `http.ts`, que es de servidor.
import { ADMIN_MEDIA_CONTENT_TYPES, ADMIN_MEDIA_MAX_BYTES } from "@/lib/api/admin-contract";
import { downscale, replaceInputFile } from "@/lib/image-downscale";
import { uploadPaymentReceiptAction } from "@/lib/payment-receipt-actions";

import { FormError, useFieldError } from "./auth-form-shell";

/**
 * Subida del comprobante de Zelle (0041).
 *
 * Un `<input type="file">` dentro de un formulario normal: funciona sin
 * JavaScript, como el resto del sitio. Con JavaScript, la captura se reduce en
 * el telefono antes de enviarla (`lib/image-downscale.ts`), y al terminar la
 * pagina se vuelve a pedir para ensenar el comprobante ya recibido.
 */
export function ReceiptUploadForm({
  orderId,
  locale,
  hasReceipt,
}: {
  readonly orderId: string;
  readonly locale: Locale;
  /** Ya hay uno subido: el boton dice "subir otro". */
  readonly hasReceipt: boolean;
}) {
  const t = useTranslations("orderConfirmation.zelle");
  const [state, formAction, pending] = useActionState(uploadPaymentReceiptAction, IDLE);
  const fieldError = useFieldError(state);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "ok") router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-s3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="order_id" value={orderId} />

      <FormError result={state} />

      <FormField
        label={hasReceipt ? t("uploadAnotherLabel") : t("uploadLabel")}
        description={t("uploadHint")}
        required
        error={fieldError("receipt_file")}
      >
        <ReceiptFileInput />
      </FormField>

      <Button type="submit" variant={hasReceipt ? "secondary" : "buy"} loading={pending}>
        {hasReceipt ? t("uploadAnotherCta") : t("uploadCta")}
      </Button>

      {state.status === "ok" ? <Alert tone="success">{t("uploaded")}</Alert> : null}
    </form>
  );
}

/**
 * El input, cableado al `FormField` que lo envuelve. Componente aparte porque
 * `useFormField` lee el contexto del `FormField`, y un hook solo ve el de sus
 * ancestros.
 */
function ReceiptFileInput() {
  const field = useFormField();

  async function handleChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget;
    const picked = input.files?.[0];
    if (picked === undefined) return;

    const reduced = await downscale(picked);
    const sent = reduced !== picked && replaceInputFile(input, reduced) ? reduced : picked;

    // Ni reducida cabe: se vacia para no mandar algo que la API va a rechazar.
    // El servidor contestara "elige la foto" junto al campo.
    if (sent.size > ADMIN_MEDIA_MAX_BYTES) input.value = "";
  }

  return (
    <input
      type="file"
      name="receipt_file"
      // La misma lista que valida la API. En iOS ademas hace que una foto HEIC
      // de la galeria llegue ya convertida a JPEG.
      accept={ADMIN_MEDIA_CONTENT_TYPES.join(",")}
      id={field?.controlId}
      aria-describedby={field?.describedBy}
      aria-invalid={field?.invalid === true ? true : undefined}
      onChange={(event) => {
        void handleChange(event);
      }}
      // 16px para que Safari en iOS no haga zoom al tocar el campo.
      className={cn(
        "block min-h-control-md w-full rounded-md border bg-surface text-body-md text-text-muted",
        "file:mr-3 file:min-h-control-md file:cursor-pointer file:border-0 file:border-r file:border-border",
        "file:bg-surface-sunken file:px-3 file:py-2.5 file:text-body-md file:font-medium file:text-text",
        FOCUS_VISIBLE_CLASSES,
        field?.invalid === true ? "border-danger" : "border-border-strong",
      )}
    />
  );
}
