"use client";

import { Button, cn, FormField, Input } from "@app/ui";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import type { Locale } from "@/i18n/locales";
import { IDLE } from "@/lib/action-result";
import type { DialOption } from "@/lib/dial-codes";
import { reserveOrderAction } from "@/lib/reserve-actions";

import { FormError, useFieldError } from "./auth-form-shell";

/**
 * "Apartar" sin cuenta (0042).
 *
 * Lo unico que se pide: WhatsApp con su lada, nombre y, si se quiere,
 * apellidos. Ni correo, ni contrasena, ni direccion: el organizador escribe por
 * WhatsApp para lo que falte. Al apartar, la pagina del pedido ensena como
 * pagar por Zelle o Venmo y deja subir ahi mismo la captura.
 *
 * LA LADA
 * -------
 * Un `<select>` nativo con todos los paises -el teclado y el lector de
 * pantalla lo manejan solos- tapado por una etiqueta corta ("US +1") para que
 * quepa al lado del numero. Los nombres llegan ya traducidos del servidor
 * (`dialOptions`): calcularlos aqui con el ICU del navegador podria no
 * coincidir con el del servidor y romper la hidratacion.
 */
export function ReserveForm({
  locale,
  dialOptions,
  defaultCountry,
  total,
}: {
  readonly locale: Locale;
  readonly dialOptions: readonly DialOption[];
  readonly defaultCountry: string;
  /** El total del carrito ya formateado, o `null` si no se pudo leer. */
  readonly total: string | null;
}) {
  const t = useTranslations("checkout.reserve");
  const [state, formAction, pending] = useActionState(reserveOrderAction, IDLE);
  const fieldError = useFieldError(state);
  const [country, setCountry] = useState(defaultCountry);
  const selected = dialOptions.find((option) => option.country === country);

  return (
    <div className="mx-auto w-full max-w-[30rem] rounded-xl border border-border bg-surface p-s6 shadow-lg sm:p-s8">
      <h2 className="app-display text-center text-heading-md uppercase text-text">{t("title")}</h2>
      {total === null ? null : (
        <p className="mt-s2 text-center font-display text-heading-md font-bold uppercase text-accent-text">
          {t("total", { total })}
        </p>
      )}

      <form action={formAction} className="mt-s6 flex flex-col gap-s4">
        <input type="hidden" name="locale" value={locale} />

        <FormError result={state} />

        <FormField label={t("whatsappLabel")} required error={fieldError("whatsapp")}>
          <WhatsAppInput
            country={country}
            onCountryChange={setCountry}
            dialOptions={dialOptions}
            selectedLabel={
              selected === undefined ? country : `${selected.country} +${selected.dial}`
            }
            dialLabel={t("dialLabel")}
            placeholder={t("whatsappPlaceholder")}
            invalid={fieldError("whatsapp") !== undefined}
          />
        </FormField>

        <FormField label={t("firstNameLabel")} required error={fieldError("first_name")}>
          <Input name="first_name" type="text" autoComplete="given-name" maxLength={60} />
        </FormField>

        <FormField label={t("lastNameLabel")} error={fieldError("last_name")}>
          <Input name="last_name" type="text" autoComplete="family-name" maxLength={60} />
        </FormField>

        <Button type="submit" variant="buy" size="lg" fullWidth loading={pending}>
          {t("submit")}
        </Button>

        <p className="text-center text-body-sm font-semibold text-success">{t("note")}</p>
      </form>
    </div>
  );
}

/**
 * La lada y el numero, en una fila. El `<input>` es el control del
 * `FormField` (etiqueta y error); la lada lleva su propia etiqueta accesible.
 */
function WhatsAppInput({
  country,
  onCountryChange,
  dialOptions,
  selectedLabel,
  dialLabel,
  placeholder,
  invalid,
}: {
  readonly country: string;
  readonly onCountryChange: (country: string) => void;
  readonly dialOptions: readonly DialOption[];
  readonly selectedLabel: string;
  readonly dialLabel: string;
  readonly placeholder: string;
  readonly invalid: boolean;
}) {
  return (
    <div className="flex gap-s2">
      <div className="relative shrink-0">
        <select
          name="dial_country"
          aria-label={dialLabel}
          value={country}
          onChange={(event) => {
            onCountryChange(event.currentTarget.value);
          }}
          // Invisible pero encima: el toque y el teclado van al `<select>`
          // nativo, y la etiqueta corta de abajo es solo lo que se ve.
          className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        >
          {dialOptions.map((option) => (
            <option key={option.country} value={option.country}>
              {`${option.name} (+${option.dial})`}
            </option>
          ))}
        </select>
        <span
          aria-hidden="true"
          className={cn(
            "flex h-control-md items-center gap-1.5 rounded-md border bg-surface px-3 text-body-md font-semibold text-text",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-focus peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg",
            invalid ? "border-danger" : "border-border-strong",
          )}
        >
          {selectedLabel}
          <svg viewBox="0 0 20 20" className="h-4 w-4 text-text-subtle" fill="currentColor">
            <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
          </svg>
        </span>
      </div>
      <Input
        name="whatsapp"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder={placeholder}
        maxLength={20}
        className="min-w-0 flex-1"
      />
    </div>
  );
}
