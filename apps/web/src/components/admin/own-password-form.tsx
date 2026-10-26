"use client";

import { Alert, Button } from "@app/ui";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { FormError, LocaleField, PasswordField } from "@/components/auth-form-shell";
import type { Locale } from "@/i18n/locales";
import { IDLE } from "@/lib/action-result";
import { changeOwnPasswordAction } from "@/lib/admin/actions";

/**
 * "Cambiar mi contrasena", en Mi cuenta.
 *
 * Es como quien recibe una contrasena inicial la cambia por una suya, sin
 * depender de quien desplego el sitio. Pide la actual -la API la exige- y la
 * nueva dos veces: un error de tecleo en la nueva dejaria fuera a su dueno.
 *
 * El minimo de longitud se ensena si `GET /config` lo publico; si no, llega con
 * el 422 `WEAK_PASSWORD` y se pinta junto al campo con el numero de la API.
 */
export function OwnPasswordForm({
  locale,
  minimumLength,
}: {
  readonly locale: Locale;
  /** `password_policy.minimum_length` de `GET /config`; `null` si no se publico. */
  readonly minimumLength: number | null;
}) {
  const t = useTranslations("admin.account");
  const [state, formAction, pending] = useActionState(changeOwnPasswordAction, IDLE);

  return (
    <form action={formAction} className="flex flex-col gap-s4">
      <LocaleField locale={locale} />

      <FormError result={state} />

      {state.status === "ok" ? <Alert tone="success">{t("saved")}</Alert> : null}

      <PasswordField
        result={state}
        name="current_password"
        label={t("currentLabel")}
        purpose="current-password"
      />

      <PasswordField
        result={state}
        name="password"
        label={t("newLabel")}
        purpose="new-password"
        description={
          minimumLength === null ? t("newHint") : t("newHintMinimum", { count: minimumLength })
        }
        minimumLength={minimumLength}
      />

      <PasswordField
        result={state}
        name="password_confirmation"
        label={t("confirmLabel")}
        purpose="new-password"
        minimumLength={minimumLength}
      />

      <Button
        type="submit"
        variant="primary"
        loading={pending}
        className="w-full sm:w-auto sm:self-start"
      >
        {t("submit")}
      </Button>
    </form>
  );
}
