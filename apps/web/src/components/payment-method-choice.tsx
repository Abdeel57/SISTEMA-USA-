"use client";

import { cn, FOCUS_VISIBLE_CLASSES } from "@app/ui";
import { useTranslations } from "next-intl";
import { useId } from "react";

import type { PaymentMethod } from "@/lib/api";

/**
 * Las formas de pagar del checkout: tarjeta, efectivo en un punto de venta
 * fisico (DEC-078) o Zelle (0041). Cuales salen lo decide la tienda: la
 * tarjeta, si hay llaves de Stripe; efectivo y Zelle, desde el panel.
 *
 * TARJETAS GRANDES Y NO UN DESPLEGABLE
 * ------------------------------------
 * Las opciones tienen que verse a la vez y entenderse sin abrir nada: lo que
 * cambia entre una y otra no es un detalle, es CUANDO se paga y CUANDO llegan
 * las participaciones. Cada tarjeta lo dice en una frase.
 *
 * RADIOS NATIVOS DENTRO DE UN `fieldset`
 * --------------------------------------
 * El navegador ya da el patron completo -una parada de tabulacion, flechas,
 * leyenda del grupo- y funciona sin JavaScript. La tarjeta entera es la
 * etiqueta, asi que se pulsa en cualquier punto, que en un telefono importa.
 *
 * AQUI NO SE DECIDE NADA. El valor viaja en el formulario y el servidor lo
 * compara contra la lista; el pago manual tiene su propia ruta en el backend.
 */

/** `switch` exhaustivo: una forma de pago nueva deja de compilar aqui. */
function iconOf(method: PaymentMethod): string {
  switch (method) {
    case "CARD":
      return "💳";
    case "CASH":
      return "💵";
    case "ZELLE":
      return "🏦";
  }
}

function copyKeyOf(method: PaymentMethod): "card" | "cash" | "zelle" {
  switch (method) {
    case "CARD":
      return "card";
    case "CASH":
      return "cash";
    case "ZELLE":
      return "zelle";
  }
}

export function PaymentMethodChoice({
  methods,
  value,
  onChange,
}: {
  /** Las que ofrece la tienda, en el orden en que se pintan. */
  readonly methods: readonly PaymentMethod[];
  readonly value: PaymentMethod;
  readonly onChange: (method: PaymentMethod) => void;
}) {
  const t = useTranslations("checkout.payment");
  const legendId = useId();

  return (
    <fieldset aria-labelledby={legendId} className="flex flex-col gap-s3 border-0 p-0">
      <legend id={legendId} className="app-display text-heading-md text-text">
        {t("heading")}
      </legend>

      <div className={cn("grid gap-s3", methods.length > 1 && "sm:grid-cols-2")}>
        {methods.map((method) => {
          const key = copyKeyOf(method);
          return (
            <label
              key={method}
              className={cn(
                "relative flex cursor-pointer flex-col gap-s2 rounded-lg border bg-surface p-s4",
                "transition-colors duration-fast ease-standard",
                "has-[:checked]:border-brand has-[:checked]:bg-brand/10",
                "border-border hover:border-border-strong",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand",
              )}
            >
              <span className="flex items-center gap-s3">
                <input
                  type="radio"
                  name="payment_method"
                  value={method}
                  checked={value === method}
                  onChange={() => onChange(method)}
                  className={cn("h-5 w-5 shrink-0 accent-brand", FOCUS_VISIBLE_CLASSES)}
                />
                <span aria-hidden="true" className="text-heading-md leading-none">
                  {iconOf(method)}
                </span>
                <span className="font-display text-heading-sm font-bold text-text">
                  {t(`${key}.title`)}
                </span>
              </span>

              <span className="pl-8 text-body-sm text-text-muted">{t(`${key}.body`)}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
