"use client";

import { Alert, Button, Checkbox, FormField, Input } from "@app/ui";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { ImageUploadField } from "@/components/admin/image-upload-field";
import { FormError, LocaleField, useFieldError } from "@/components/auth-form-shell";
import type { Locale } from "@/i18n/locales";
import { IDLE } from "@/lib/action-result";
import { setPaymentSettingsAction } from "@/lib/admin/payment-settings-actions";
import type { AdminPaymentSettings } from "@/lib/api";

/**
 * Formas de pago de la tienda: Zelle (0041) y Venmo (0042), cada uno con su
 * cuenta, y efectivo en un punto de venta. La tarjeta no se edita aqui: depende
 * de las llaves de Stripe del despliegue, y la pagina solo dice si esta
 * disponible.
 *
 * Las transferencias van primero porque es lo que se configura una vez y se
 * olvida: los campos de cada cuenta van justo debajo de su casilla. El QR de
 * Venmo se sube como el logotipo; el id de la imagen actual viaja oculto para
 * conservarla si no se elige otra.
 */
export function PaymentSettingsForm({
  locale,
  settings,
}: {
  readonly locale: Locale;
  readonly settings: AdminPaymentSettings;
}) {
  const t = useTranslations("admin.payments");
  const [state, formAction, pending] = useActionState(setPaymentSettingsAction, IDLE);
  const fieldError = useFieldError(state);

  return (
    <form action={formAction} className="flex flex-col gap-s5">
      <LocaleField locale={locale} />

      <FormError result={state} />
      {state.status === "ok" ? <Alert tone="success">{t("saved")}</Alert> : null}

      <fieldset className="flex flex-col gap-s4 rounded-lg border border-border p-s4">
        <legend className="px-s1 font-display text-heading-sm font-bold text-text">
          {t("zelleHeading")}
        </legend>

        <Checkbox
          name="zelle_enabled"
          label={t("zelleEnabledLabel")}
          description={t("zelleEnabledHint")}
          defaultChecked={settings.zelle_enabled}
        />

        <FormField
          label={t("recipientNameLabel")}
          description={t("recipientNameHint")}
          error={fieldError("zelle_recipient_name")}
        >
          <Input
            name="zelle_recipient_name"
            maxLength={80}
            autoComplete="off"
            defaultValue={settings.zelle_recipient_name ?? ""}
          />
        </FormField>

        <FormField
          label={t("recipientLabel")}
          description={t("recipientHint")}
          error={fieldError("zelle_recipient")}
        >
          <Input
            name="zelle_recipient"
            maxLength={120}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={settings.zelle_recipient ?? ""}
          />
        </FormField>
      </fieldset>

      <fieldset className="flex flex-col gap-s4 rounded-lg border border-border p-s4">
        <legend className="px-s1 font-display text-heading-sm font-bold text-text">
          {t("venmoHeading")}
        </legend>

        <input type="hidden" name="venmo_qr_media_id" value={settings.venmo_qr_media_id ?? ""} />

        <Checkbox
          name="venmo_enabled"
          label={t("venmoEnabledLabel")}
          description={t("venmoEnabledHint")}
          defaultChecked={settings.venmo_enabled ?? false}
        />

        <FormField
          label={t("venmoNameLabel")}
          description={t("venmoNameHint")}
          error={fieldError("venmo_recipient_name")}
        >
          <Input
            name="venmo_recipient_name"
            maxLength={80}
            autoComplete="off"
            defaultValue={settings.venmo_recipient_name ?? ""}
          />
        </FormField>

        <FormField
          label={t("venmoHandleLabel")}
          description={t("venmoHandleHint")}
          error={fieldError("venmo_handle")}
        >
          <Input
            name="venmo_handle"
            maxLength={41}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={
              settings.venmo_handle === null || settings.venmo_handle === undefined
                ? ""
                : `@${settings.venmo_handle}`
            }
          />
        </FormField>

        <div className="flex flex-col gap-s2">
          <ImageUploadField
            name="venmo_qr"
            label={t("venmoQrLabel")}
            currentUrl={settings.venmo_qr_url ?? null}
            error={fieldError("venmo_qr_file")}
          />
          <p className="text-caption text-text-subtle">{t("venmoQrHint")}</p>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-s4 rounded-lg border border-border p-s4">
        <legend className="px-s1 font-display text-heading-sm font-bold text-text">
          {t("cashHeading")}
        </legend>

        <Checkbox
          name="cash_enabled"
          label={t("cashEnabledLabel")}
          description={t("cashEnabledHint")}
          defaultChecked={settings.cash_enabled}
        />
      </fieldset>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={pending}
        className="w-full sm:w-auto sm:self-start"
      >
        {t("save")}
      </Button>
    </form>
  );
}
