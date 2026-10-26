"use client";

import { Button, FormField, Input } from "@app/ui";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import type { Locale } from "@/i18n/locales";
import { IDLE } from "@/lib/action-result";
import type { ConsentRequirement } from "@/lib/api";
import { registerAction } from "@/lib/auth-actions";

import {
  EmailField,
  FormError,
  LocaleField,
  NewPasswordFields,
  useFieldError,
} from "./auth-form-shell";
import { ConsentFieldset, EligibilityFields } from "./eligibility-fields";

/**
 * Formulario de alta: correo y contrasena (plantilla).
 *
 * FECHA DE NACIMIENTO Y ESTADO SE PREGUNTAN, NO SE JUZGAN (DEC-067)
 * -----------------------------------------------------------------
 * Las Official Rules definen al "Entrant" por edad y estado de residencia, y
 * para saber si una compra da participaciones hay que conocer las dos cosas.
 * Este formulario las recoge; NO decide nada con ellas -ni avisa de "no puedes
 * participar"- porque que edad y que estados cuentan lo fija cada edicion, y el
 * backend lo evalua al otorgar. Comprar mercancia esta permitido igualmente.
 *
 * LOS CONSENTIMIENTOS SON DATO, NO CODIGO
 * ---------------------------------------
 * Las casillas que se pintan llegan de `GET /config` (`required_consents`), con
 * su clave, su version y si son obligatorias: hoy, Reglas Oficiales, Terminos y
 * Privacidad (DEC-067). Si el backend no publicara ninguno no se pintaria
 * ninguna casilla: mejor ninguna que una inventada.
 *
 * La VERSION viaja de vuelta con cada consentimiento aceptado. "Acepto las
 * reglas" sin decir que version se acepto es una afirmacion sin fecha.
 */
export function RegisterForm({
  locale,
  consents,
  returnPath,
  passwordMinimum = null,
}: {
  readonly locale: Locale;
  readonly consents: readonly ConsentRequirement[];
  readonly returnPath: string | null;
  /** `password_policy.minimum_length` de `GET /config`; `null` si no se publico. */
  readonly passwordMinimum?: number | null;
}) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(registerAction, IDLE);
  const fieldError = useFieldError(state);

  return (
    <form action={formAction} className="flex flex-col gap-s5">
      <LocaleField locale={locale} />
      {returnPath === null ? null : <input type="hidden" name="next" value={returnPath} />}

      <FormError result={state} />

      <EmailField result={state} />

      <FormField
        label={t("fields.displayName")}
        description={t("fields.displayNameHint")}
        error={fieldError("display_name")}
      >
        <Input name="display_name" type="text" autoComplete="name" />
      </FormField>

      <EligibilityFields result={state} />

      <NewPasswordFields result={state} minimumLength={passwordMinimum} />

      <ConsentFieldset result={state} consents={consents} />

      <Button type="submit" variant="accent" size="lg" fullWidth loading={pending}>
        {t("register.submit")}
      </Button>
    </form>
  );
}
