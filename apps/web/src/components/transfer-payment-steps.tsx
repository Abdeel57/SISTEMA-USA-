"use client";

import { buttonVariants, cn } from "@app/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { Locale } from "@/i18n/locales";
import type {
  MoneyMinor,
  TransferMethod,
  VenmoPaymentDetails,
  ZellePaymentDetails,
} from "@/lib/api/contract";

import { ReceiptUploadForm } from "./receipt-upload-form";

/**
 * Los tres pasos para pagar por transferencia (0042), con la app elegida.
 *
 * Con Zelle y Venmo activados, dos pestanas arriba deciden que cuenta se ve y
 * con que canal viaja la captura (`payment_channel`): si alguien aparto con
 * Zelle y paga por Venmo, el pedido pasa a Venmo y el organizador lo busca en
 * la app correcta.
 *
 * EL IMPORTE Y EL NUMERO DE PEDIDO SALEN GRANDES Y SELECCIONABLES porque se
 * copian a la app del banco. El numero va en la nota: es como el organizador
 * casa el dinero con el pedido.
 */
export function TransferPaymentSteps({
  orderId,
  orderNumber,
  total,
  amount,
  zelle,
  venmo,
  methods,
  initial,
  locale,
  hasReceipt,
}: {
  readonly orderId: string;
  readonly orderNumber: string;
  /** El total ya formateado. */
  readonly total: string;
  /** El total tal como llega de la API, para el enlace de Venmo. */
  readonly amount: MoneyMinor;
  readonly zelle: ZellePaymentDetails | null;
  readonly venmo: VenmoPaymentDetails | null;
  readonly methods: readonly TransferMethod[];
  readonly initial: TransferMethod;
  readonly locale: Locale;
  readonly hasReceipt: boolean;
}) {
  const t = useTranslations("orderConfirmation.transfer");
  const [method, setMethod] = useState<TransferMethod>(initial);

  return (
    <div className="mt-s4">
      {methods.length > 1 ? (
        <div role="tablist" aria-label={t("methodsLabel")} className="grid grid-cols-2 gap-s2">
          {methods.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={method === option}
              onClick={() => {
                setMethod(option);
              }}
              className={cn(
                buttonVariants({
                  variant: method === option ? "primary" : "secondary",
                  size: "lg",
                }),
                "w-full",
              )}
            >
              {option === "ZELLE" ? t("zelleTab") : t("venmoTab")}
            </button>
          ))}
        </div>
      ) : null}

      <ol className="mt-s5 flex list-none flex-col gap-s5 p-0">
        <Step number={1} title={t("step1Title", { total })}>
          {method === "ZELLE" && zelle !== null ? (
            <ZelleDetails zelle={zelle} total={total} />
          ) : null}
          {method === "VENMO" && venmo !== null ? (
            <VenmoDetails venmo={venmo} total={total} amount={amount} orderNumber={orderNumber} />
          ) : null}
        </Step>

        <Step number={2} title={t("step2Title")}>
          <p className="select-all font-display text-heading-lg font-bold tabular-nums text-text">
            {orderNumber}
          </p>
          <p className="mt-s1 text-body-sm text-text-muted">{t("step2Body")}</p>
        </Step>

        <Step number={3} title={hasReceipt ? t("step3AgainTitle") : t("step3Title")}>
          <div className="mt-s2">
            <ReceiptUploadForm
              orderId={orderId}
              locale={locale}
              hasReceipt={hasReceipt}
              channel={method}
            />
          </div>
        </Step>
      </ol>
    </div>
  );
}

function ZelleDetails({
  zelle,
  total,
}: {
  readonly zelle: ZellePaymentDetails;
  readonly total: string;
}) {
  const t = useTranslations("orderConfirmation.transfer");
  return (
    <dl className="mt-s2 grid gap-s2 rounded-lg border border-border bg-surface-sunken p-s4">
      <Detail label={t("recipientNameLabel")}>{zelle.recipient_name}</Detail>
      <Detail label={t("zelleRecipientLabel")} selectable>
        {zelle.recipient}
      </Detail>
      <Detail label={t("amountLabel")}>{total}</Detail>
    </dl>
  );
}

function VenmoDetails({
  venmo,
  total,
  amount,
  orderNumber,
}: {
  readonly venmo: VenmoPaymentDetails;
  readonly total: string;
  readonly amount: MoneyMinor;
  readonly orderNumber: string;
}) {
  const t = useTranslations("orderConfirmation.transfer");

  return (
    <div className="mt-s2 rounded-lg border border-border bg-surface-sunken p-s4">
      {venmo.qr_url === null ? null : (
        <div className="flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen de /media, ya optimizada al subirla */}
          <img
            src={venmo.qr_url}
            alt={t("venmoQrAlt", { name: venmo.recipient_name })}
            width={240}
            height={240}
            className="h-60 w-60 rounded-md bg-white object-contain p-2"
          />
          <p className="mt-s2 text-center text-caption text-text-subtle">{t("venmoQrHint")}</p>
        </div>
      )}

      <dl className="mt-s4 grid gap-s2">
        <Detail label={t("recipientNameLabel")}>{venmo.recipient_name}</Detail>
        <Detail label={t("venmoHandleLabel")} selectable>
          @{venmo.handle}
        </Detail>
        <Detail label={t("amountLabel")}>{total}</Detail>
      </dl>

      <a
        href={venmoPayLink(venmo.handle, amount, orderNumber)}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonVariants({ variant: "secondary", size: "md" }), "mt-s4 w-full")}
      >
        {t("openVenmo")}
      </a>
    </div>
  );
}

/**
 * El enlace de pago de Venmo: en un telefono con la app instalada la abre con
 * el destinatario, el importe y la nota ya puestos. Sin la app, abre el perfil
 * en la web. El importe va en dolares con dos decimales.
 */
function venmoPayLink(handle: string, amount: MoneyMinor, note: string): string {
  const minor = BigInt(amount.amount_minor);
  const dollars = `${(minor / 100n).toString()}.${(minor % 100n).toString().padStart(2, "0")}`;
  const query = new URLSearchParams({ txn: "pay", amount: dollars, note });
  return `https://venmo.com/${encodeURIComponent(handle)}?${query.toString()}`;
}

function Detail({
  label,
  selectable = false,
  children,
}: {
  readonly label: string;
  readonly selectable?: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-caption uppercase tracking-wide text-text-subtle">{label}</dt>
      <dd
        className={cn(
          "break-all font-display text-heading-sm font-bold tabular-nums text-text",
          selectable && "select-all",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

function Step({
  number,
  title,
  children,
}: {
  readonly number: number;
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <li className="flex gap-s3">
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-brand font-display text-body-md font-bold text-on-brand"
      >
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-heading-sm font-bold text-text">{title}</p>
        {children}
      </div>
    </li>
  );
}
