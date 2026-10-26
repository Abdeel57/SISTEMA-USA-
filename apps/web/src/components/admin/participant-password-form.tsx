"use client";

import { Alert, Button, buttonVariants, cn } from "@app/ui";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { FormError, LocaleField, PasswordField } from "@/components/auth-form-shell";
import type { Locale } from "@/i18n/locales";
import { IDLE } from "@/lib/action-result";
import { setParticipantPasswordAction } from "@/lib/admin/actions";

/**
 * "Cambiar contrasena" de un participante, en su fila del listado.
 *
 * Plantilla: no hay recuperacion por correo. Quien olvida su contrasena la pide
 * a la tienda, y quien opera le fija una nueva aqui y se la comunica. La API
 * cierra todas las sesiones abiertas de esa cuenta.
 *
 * VA PLEGADO (`<details>`) porque se pinta en cada fila: con el formulario
 * abierto en todas, la tabla dejaria de leerse. Abrirlo es un gesto deliberado.
 *
 * El minimo de longitud se ensena si `GET /config` lo publico; si no, llega con
 * el 422 `WEAK_PASSWORD` y `useFieldError` lo pinta junto al campo con el
 * numero de la API. La pantalla no escribe ninguna cifra propia.
 */
export function ParticipantPasswordForm({
  locale,
  participantId,
  minimumLength,
}: {
  readonly locale: Locale;
  readonly participantId: string;
  /** `password_policy.minimum_length` de `GET /config`; `null` si no se publico. */
  readonly minimumLength: number | null;
}) {
  const t = useTranslations("admin.participants");
  const [state, formAction, pending] = useActionState(setParticipantPasswordAction, IDLE);

  return (
    <details className="group min-w-0 sm:min-w-[14rem]">
      {/* El resumen tiene ASPECTO DE BOTON y 44px de alto: era un texto
          subrayado de 14px, dificil de acertar con el dedo y facil de
          confundir con un enlace a otra pantalla. Sigue siendo un `summary`
          nativo: abre y cierra sin JavaScript. */}
      <summary
        className={cn(
          buttonVariants({ variant: "secondary" }),
          "w-full cursor-pointer list-none sm:w-auto [&::-webkit-details-marker]:hidden",
        )}
      >
        {t("passwordToggle")}
      </summary>

      <form action={formAction} className="mt-s3 flex flex-col gap-s3">
        <LocaleField locale={locale} />
        <input type="hidden" name="participant_id" value={participantId} />

        <FormError result={state} />

        {state.status === "ok" ? <Alert tone="success">{t("passwordSaved")}</Alert> : null}

        <PasswordField
          result={state}
          name="password"
          label={t("passwordLabel")}
          purpose="new-password"
          description={
            minimumLength === null
              ? t("passwordHint")
              : t("passwordHintMinimum", { count: minimumLength })
          }
          minimumLength={minimumLength}
        />

        <Button
          type="submit"
          variant="primary"
          loading={pending}
          className="w-full sm:w-auto sm:self-start"
        >
          {t("passwordSubmit")}
        </Button>
      </form>
    </details>
  );
}
