"use client";

import { Button, FormField, Input } from "@app/ui";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { EmailField, FormError, LocaleField, useFieldError } from "@/components/auth-form-shell";
import type { Locale } from "@/i18n/locales";
import { IDLE } from "@/lib/action-result";
import { staffLoginAction } from "@/lib/admin/actions";

/**
 * Formulario de acceso del PERSONAL.
 *
 * REUTILIZA LAS PIEZAS DEL ESCAPARATE (`auth-form-shell`) A PROPOSITO. El
 * campo de correo, el aviso de error del formulario y la asociacion accesible
 * de un error con su campo son identicos, y duplicarlos aqui significaria que
 * un dia el panel dejara de anunciar los errores a un lector de pantalla y
 * nadie se enterara.
 *
 * Lo que NO se reutiliza es la accion: `staffLoginAction` llama a LA MISMA ruta
 * de la API -no existe `/admin/login`, DEC-006- pero redirige dentro de
 * `/admin`. Plantilla: correo y contrasena, y se entra directo al panel.
 *
 * ES UN `<form>` CON SERVER ACTION y funciona sin JavaScript. `useActionState`
 * esta solo para conservar el error sin recargar. La contrasena no pasa por
 * JavaScript de cliente: no hay estado controlado, no hay `onChange` y no hay
 * `fetch`. Y no hay token de vuelta: la sesion llega en una cookie `httpOnly`
 * que este componente nunca ve.
 */
export function StaffLoginForm({
  locale,
  returnPath,
}: {
  readonly locale: Locale;
  readonly returnPath: string | null;
}) {
  const t = useTranslations("admin.auth");
  const [state, formAction, pending] = useActionState(staffLoginAction, IDLE);
  const fieldError = useFieldError(state);

  return (
    <form action={formAction} className="flex flex-col gap-s5">
      <LocaleField locale={locale} />
      {returnPath === null ? null : <input type="hidden" name="next" value={returnPath} />}

      <FormError result={state} />

      {/*
       * Cuanto hay que esperar tras un bloqueo. El backend publica
       * `retry_after_seconds` en el 423 y aqui se convierte a minutos
       * redondeando HACIA ARRIBA: decir "en 14 minutos" cuando faltan 14 y
       * medio manda a alguien a chocar otra vez con el mismo bloqueo.
       */}
      {state.retryAfterSeconds === null ? null : (
        <p className="text-body-sm text-text-muted">
          {t("lockedRetry", { minutes: Math.ceil(state.retryAfterSeconds / 60) })}
        </p>
      )}

      <EmailField result={state} />

      <FormField label={t("passwordLabel")} required error={fieldError("password")}>
        <Input name="password" type="password" autoComplete="current-password" />
      </FormField>

      <Button type="submit" variant="accent" size="lg" fullWidth loading={pending}>
        {t("signInSubmit")}
      </Button>
    </form>
  );
}
