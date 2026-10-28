import { Alert, Card, CardTitle } from "@app/ui";
import { useTranslations } from "next-intl";

import { formatMoney, formatZonedDateTime } from "@/i18n/formatters";
import type { Locale } from "@/i18n/locales";
import type { OrderDetail, PublicPaymentMethods } from "@/lib/api";

import { ReceiptUploadForm } from "./receipt-upload-form";

/**
 * Pago por Zelle de un pedido (0041): a quien transferir, que poner en la nota
 * y donde subir el comprobante. Lo pintan la confirmacion del pedido y su
 * ficha en "Mis pedidos", que es a donde vuelve quien transfiere mas tarde.
 *
 * TRES PASOS, NUMERADOS Y EN ESE ORDEN. Es lo que hace la persona con el banco
 * abierto en el otro telefono: enviar el importe exacto, poner el numero de
 * pedido en la nota -es como la tienda casa el dinero con el pedido- y subir
 * la captura. El importe y el numero salen grandes porque se copian.
 *
 * LA CUENTA SALE DE LA CONFIGURACION VIGENTE, no del pedido. Si la tienda la
 * cambia, un pedido viejo enseña la nueva, que es a la que hay que pagar hoy.
 * Sin cuenta publicada (Zelle apagado despues de pedir) no se inventa ninguna:
 * se pide que escriban a la tienda.
 */
export function ZellePaymentCard({
  order,
  zelle,
  locale,
  timeZone,
}: {
  readonly order: OrderDetail;
  readonly zelle: PublicPaymentMethods["zelle"];
  readonly locale: Locale;
  readonly timeZone: string;
}) {
  const t = useTranslations("orderConfirmation.zelle");
  const total = formatMoney(order.total, locale) ?? "";
  const pending = order.status === "PENDING_PAYMENT";
  const receipts = order.payment_receipts ?? [];
  const latest = receipts[0];

  if (order.status === "CANCELLED") {
    return (
      <Card elevation="raised" padding="lg">
        <CardTitle as="h2" size="sm">
          {t("cancelledTitle")}
        </CardTitle>
        <p className="mt-s3 text-body-md text-text-muted">{t("cancelledBody")}</p>
      </Card>
    );
  }

  if (!pending) {
    return (
      <Card elevation="raised" padding="lg" className="border-brand/40">
        <CardTitle as="h2" size="sm">
          {t("paidTitle")}
        </CardTitle>
        <div className="mt-s4">
          <Alert tone="success">
            <p>{t("paidBody")}</p>
          </Alert>
        </div>
      </Card>
    );
  }

  const uploadedAt =
    latest === undefined
      ? null
      : formatZonedDateTime(latest.uploaded_at, locale, { timeZone, showTimeZoneName: true });

  return (
    <Card elevation="raised" padding="lg" className="border-brand/40">
      <CardTitle as="h2" size="sm">
        {latest === undefined ? t("pendingTitle") : t("reviewTitle")}
      </CardTitle>

      {latest === undefined ? null : (
        <div className="mt-s4">
          <Alert tone="success">
            <p>
              {uploadedAt === null
                ? t("receivedBody", { phone: order.contact_phone ?? "" })
                : t("receivedBodyWithDate", {
                    date: uploadedAt,
                    phone: order.contact_phone ?? "",
                  })}
            </p>
          </Alert>
        </div>
      )}

      <ol className="mt-s5 flex list-none flex-col gap-s5 p-0">
        <Step number={1} title={t("step1Title", { total })}>
          {zelle === null ? (
            <p className="text-body-md text-text-muted">{t("noRecipient")}</p>
          ) : (
            <dl className="mt-s2 grid gap-s2 rounded-lg border border-border bg-surface-sunken p-s4">
              <div>
                <dt className="text-caption uppercase tracking-wide text-text-subtle">
                  {t("recipientNameLabel")}
                </dt>
                <dd className="font-display text-heading-sm font-bold text-text">
                  {zelle.recipient_name}
                </dd>
              </div>
              <div>
                <dt className="text-caption uppercase tracking-wide text-text-subtle">
                  {t("recipientLabel")}
                </dt>
                <dd className="select-all break-all font-display text-heading-sm font-bold text-text">
                  {zelle.recipient}
                </dd>
              </div>
              <div>
                <dt className="text-caption uppercase tracking-wide text-text-subtle">
                  {t("amountLabel")}
                </dt>
                <dd className="font-display text-heading-sm font-bold tabular-nums text-text">
                  {total}
                </dd>
              </div>
            </dl>
          )}
        </Step>

        <Step number={2} title={t("step2Title")}>
          <p className="select-all font-display text-heading-lg font-bold tabular-nums text-text">
            {order.order_number}
          </p>
          <p className="mt-s1 text-body-sm text-text-muted">{t("step2Body")}</p>
        </Step>

        <Step number={3} title={latest === undefined ? t("step3Title") : t("step3AgainTitle")}>
          <div className="mt-s2">
            <ReceiptUploadForm
              orderId={order.id}
              locale={locale}
              hasReceipt={latest !== undefined}
            />
          </div>
        </Step>
      </ol>

      <p className="mt-s5 text-caption text-text-subtle">{t("entriesNote")}</p>
    </Card>
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
