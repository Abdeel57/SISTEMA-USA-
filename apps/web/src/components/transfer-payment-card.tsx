import { Alert, Card, CardTitle } from "@app/ui";
import { useTranslations } from "next-intl";

import { formatMoney, formatZonedDateTime } from "@/i18n/formatters";
import type { Locale } from "@/i18n/locales";
import type {
  OrderDetail,
  TransferMethod,
  VenmoPaymentDetails,
  ZellePaymentDetails,
} from "@/lib/api";

import { ReceiptUploadForm } from "./receipt-upload-form";
import { TransferPaymentSteps } from "./transfer-payment-steps";

/**
 * Pago por transferencia de un pedido: Zelle (0041) o Venmo (0042). A quien
 * pagar, que poner en la nota y donde subir la captura. Lo pintan la
 * confirmacion del pedido y su ficha, que es a donde vuelve quien paga mas
 * tarde.
 *
 * CUATRO MOMENTOS
 * ---------------
 * - Pendiente y sin captura: los pasos para pagar, con la app elegida.
 * - Pendiente con captura: el mensaje con el que termina la compra -"el
 *   organizador te confirmara tu pago por WhatsApp"- y, mas discreto, subir
 *   otra por si se equivoco de imagen.
 * - Pagado o cancelado: solo el desenlace.
 *
 * LAS CUENTAS SALEN DE LA CONFIGURACION VIGENTE, no del pedido: si la tienda
 * las cambia, un pedido viejo ensena las nuevas, que son a las que hay que
 * pagar hoy. Sin ninguna publicada no se inventa nada: se pide que escriban.
 */
export function TransferPaymentCard({
  order,
  zelle,
  venmo,
  locale,
  timeZone,
}: {
  readonly order: OrderDetail;
  readonly zelle: ZellePaymentDetails | null;
  readonly venmo: VenmoPaymentDetails | null;
  readonly locale: Locale;
  readonly timeZone: string;
}) {
  const t = useTranslations("orderConfirmation.transfer");
  const total = formatMoney(order.total, locale) ?? "";
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

  if (order.status !== "PENDING_PAYMENT") {
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

  const methods: TransferMethod[] = [];
  if (zelle !== null) methods.push("ZELLE");
  if (venmo !== null) methods.push("VENMO");
  const initial: TransferMethod | null =
    (order.payment_method === "ZELLE" || order.payment_method === "VENMO") &&
    methods.includes(order.payment_method)
      ? order.payment_method
      : (methods[0] ?? null);

  const steps =
    initial === null ? (
      <p className="mt-s4 text-body-md text-text-muted">{t("noRecipient")}</p>
    ) : (
      <TransferPaymentSteps
        orderId={order.id}
        orderNumber={order.order_number}
        total={total}
        amount={order.total}
        zelle={zelle}
        venmo={venmo}
        methods={methods}
        initial={initial}
        locale={locale}
        hasReceipt={latest !== undefined}
      />
    );

  if (latest === undefined) {
    return (
      <Card elevation="raised" padding="lg" className="border-brand/40">
        <CardTitle as="h2" size="sm">
          {t("pendingTitle")}
        </CardTitle>
        {steps}
        <p className="mt-s5 text-caption text-text-subtle">{t("entriesNote")}</p>
      </Card>
    );
  }

  const uploadedAt = formatZonedDateTime(latest.uploaded_at, locale, {
    timeZone,
    showTimeZoneName: true,
  });
  const phone = order.contact_phone ?? null;

  return (
    <Card elevation="raised" padding="lg" className="border-success/50">
      <div className="flex flex-col items-center text-center">
        <span
          aria-hidden="true"
          className="flex h-14 w-14 items-center justify-center rounded-pill bg-success text-on-success"
        >
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor">
            <path d="m5 12.5 4.5 4.5L19 7.5" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </span>
        <CardTitle as="h2" size="sm" className="mt-s4">
          {t("reviewTitle")}
        </CardTitle>
        <p className="mt-s3 max-w-[32rem] text-body-md text-text">
          {phone === null ? t("reviewBodyNoPhone") : t("reviewBody", { phone })}
        </p>
        {uploadedAt === null ? null : (
          <p className="mt-s2 text-caption text-text-subtle">
            {t("uploadedOn", { date: uploadedAt })}
          </p>
        )}
      </div>

      <details className="mt-s6 border-t border-border pt-s4">
        <summary className="cursor-pointer text-body-sm font-semibold text-text-muted">
          {t("wrongReceipt")}
        </summary>
        <div className="mt-s4">
          {initial === null ? (
            <ReceiptUploadForm orderId={order.id} locale={locale} hasReceipt />
          ) : (
            steps
          )}
        </div>
      </details>
    </Card>
  );
}
