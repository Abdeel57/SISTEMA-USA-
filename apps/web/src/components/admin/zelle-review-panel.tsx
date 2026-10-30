import { Alert, Badge, buttonVariants, Card, CardTitle } from "@app/ui";
import { getTranslations } from "next-intl/server";

import { adminHref } from "@/i18n/admin-routing";
import { formatEntryCount, formatMoney, formatZonedDateTime } from "@/i18n/formatters";
import type { Locale } from "@/i18n/locales";
import type { OrderDetail } from "@/lib/api";

/**
 * Revision de un pago por Zelle en el panel (0041).
 *
 * LO QUE NECESITA QUIEN CONFIRMA, EN EL ORDEN EN QUE LO USA:
 *
 *   1. El COMPROBANTE en grande, para leer importe, fecha y nota sin
 *      descargarlo. Los anteriores quedan enlazados debajo: se conservan todos.
 *   2. El RECORDATORIO de mirar el banco. Una captura se falsifica en un
 *      minuto; lo que confirma el pago es el dinero en la cuenta, con el numero
 *      de pedido en la nota. Por eso la confirmacion sigue siendo una persona.
 *   3. El WHATSAPP del cliente, con el mensaje YA ESCRITO: al pulsar se abre
 *      WhatsApp con su numero y el texto, y basta con enviar. Antes de
 *      confirmar, el mensaje pide el comprobante o lo que falte; despues, avisa
 *      de que el pago se confirmo y de cuantas participaciones lleva.
 *
 * El mensaje sale del WhatsApp de quien lo pulsa, no de un servidor: no hay
 * API de WhatsApp de por medio, ni costo, ni plantillas que aprobar.
 *
 * LA IMAGEN NO ES PUBLICA. La sirve `/admin/<locale>/orders/<id>/receipts/<rid>`,
 * que reenvia la sesion de personal a la API, y la API exige `order.read`.
 */
export async function ZelleReviewPanel({
  order,
  locale,
  brandName,
  timeZone,
}: {
  readonly order: OrderDetail;
  readonly locale: Locale;
  /** Nombre de la tienda, para firmar el mensaje de WhatsApp. */
  readonly brandName: string;
  /** Zona del negocio, para la hora de cada comprobante. */
  readonly timeZone: string;
}) {
  const t = await getTranslations({ locale, namespace: "admin.zellePayment" });
  const total = formatMoney(order.total, locale) ?? "";
  const receipts = order.payment_receipts ?? [];
  const [latest, ...older] = receipts;
  const phone = order.contact_phone ?? null;
  const pending = order.status === "PENDING_PAYMENT";
  const cancelled = order.status === "CANCELLED";
  // 0042: Zelle o Venmo. Se nombra la app para que se busque el pago donde es.
  const app = order.payment_method === "VENMO" ? "Venmo" : "Zelle";
  // 0042: quien aparto sin cuenta dejo su nombre en el pedido; si no, el de la
  // direccion de envio.
  const buyerName = (order.contact_name ?? order.shipping_address?.full_name ?? "").trim();
  const numbers = numbersText(order.entry_numbers ?? null, t("numbersJoin"));

  const firstName = buyerName.split(/\s+/u)[0] ?? "";
  const greeting =
    firstName === "" ? t("whatsappGreetingNoName") : t("whatsappGreeting", { name: firstName });
  const entries =
    order.entries_granted === null ? null : formatEntryCount(order.entries_granted, locale);

  const message = pending
    ? latest === undefined
      ? t("whatsappAskReceipt", {
          greeting,
          total,
          number: order.order_number,
          brand: brandName,
          app,
        })
      : t("whatsappReviewing", { greeting, number: order.order_number, brand: brandName })
    : numbers !== null
      ? t("whatsappPaidWithNumbers", {
          greeting,
          total,
          number: order.order_number,
          numbers,
          brand: brandName,
        })
      : entries === null
        ? t("whatsappPaid", { greeting, total, number: order.order_number, brand: brandName })
        : t("whatsappPaidWithEntries", {
            greeting,
            total,
            number: order.order_number,
            entries,
            brand: brandName,
          });

  const whatsappHref =
    phone === null || cancelled
      ? null
      : `https://wa.me/${phone.replace(/\D/gu, "")}?text=${encodeURIComponent(message)}`;

  const receiptHref = (receiptId: string) =>
    adminHref(
      locale,
      `/orders/${encodeURIComponent(order.id)}/receipts/${encodeURIComponent(receiptId)}`,
    );
  const uploadedAt = (iso: string) =>
    formatZonedDateTime(iso, locale, { timeZone, showTimeZoneName: true }) ?? iso;

  return (
    <Card elevation="raised" padding="lg" className="border-brand/40">
      <div className="flex flex-wrap items-center justify-between gap-s3">
        <CardTitle as="h2" size="sm">
          {t("reviewTitle")}
        </CardTitle>
        <Badge tone={latest === undefined ? "warning" : "info"} size="sm" wrap>
          {latest === undefined
            ? t("noReceiptBadge")
            : t("receiptBadge", { count: receipts.length })}
        </Badge>
      </div>

      <dl className="mt-s5 grid grid-cols-1 gap-s4 sm:grid-cols-2">
        <div>
          <dt className="text-caption uppercase tracking-wide text-text-subtle">
            {t("buyerNameLabel")}
          </dt>
          <dd className="text-body-md text-text">{buyerName === "" ? t("noName") : buyerName}</dd>
        </div>
        <div>
          <dt className="text-caption uppercase tracking-wide text-text-subtle">
            {t("paidWithLabel")}
          </dt>
          <dd className="text-body-md font-semibold text-text">{app}</dd>
        </div>
        <div>
          <dt className="text-caption uppercase tracking-wide text-text-subtle">
            {t("whatsappLabel")}
          </dt>
          <dd className="font-mono text-body-md text-text">
            {phone === null ? t("noPhone") : displayPhone(phone)}
          </dd>
        </div>
        <div>
          <dt className="text-caption uppercase tracking-wide text-text-subtle">
            {t("expectedLabel")}
          </dt>
          <dd className="text-body-md text-text">
            {t("expectedValue", { total, number: order.order_number })}
          </dd>
        </div>
      </dl>

      {pending ? (
        <div className="mt-s5">
          <Alert tone="warning" title={t("verifyTitle")}>
            <p>{t("verifyBody", { total, number: order.order_number, app })}</p>
          </Alert>
        </div>
      ) : null}

      <div className="mt-s5">
        {latest === undefined ? (
          <p className="text-body-sm text-text-muted">{t("noReceiptBody")}</p>
        ) : (
          <figure className="flex flex-col gap-s2">
            <a
              href={receiptHref(latest.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-lg border border-border bg-surface-sunken"
            >
              {/* La imagen la sirve la propia web con la sesion de personal; no
                  hay dominio externo que declarar para `next/image`. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={receiptHref(latest.id)}
                alt={t("receiptAlt", { number: order.order_number, app })}
                className="mx-auto max-h-[36rem] w-auto object-contain"
              />
            </a>
            <figcaption className="text-caption text-text-subtle">
              {t("receiptCaption", { date: uploadedAt(latest.uploaded_at) })}
            </figcaption>
          </figure>
        )}

        {older.length === 0 ? null : (
          <div className="mt-s4">
            <p className="text-label font-medium text-text">{t("olderHeading")}</p>
            <ul className="mt-s2 flex list-none flex-col gap-s1 p-0">
              {older.map((receipt) => (
                <li key={receipt.id}>
                  <a
                    href={receiptHref(receipt.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-body-sm text-text underline underline-offset-4"
                  >
                    {t("olderLink", { date: uploadedAt(receipt.uploaded_at) })}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {whatsappHref === null ? null : (
        <div className="mt-s6 border-t border-border pt-s5">
          <p className="text-body-sm text-text-muted">
            {pending ? t("whatsappPendingHint") : t("whatsappPaidHint")}
          </p>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className={`${buttonVariants({ variant: pending ? "secondary" : "primary", size: "lg" })} mt-s3`}
          >
            {pending ? t("whatsappPendingCta") : t("whatsappPaidCta")}
          </a>
        </div>
      )}
    </Card>
  );
}

/**
 * 0042: los numeros del pedido para el mensaje: "APP-000101" si el bloque es de
 * uno, "APP-000101 a APP-000105" si son varios. `null` sin numeros que mandar.
 */
function numbersText(batches: OrderDetail["entry_numbers"], join: string): string | null {
  if (batches === null || batches === undefined || batches.length === 0) return null;
  return batches
    .map((batch) =>
      batch.quantity === 1
        ? batch.first_number
        : `${batch.first_number} ${join} ${batch.last_number}`,
    )
    .join(", ");
}

/** `+15125550134` -> `+1 (512) 555-0134`. Otros paises, tal cual. */
function displayPhone(e164: string): string {
  const us = /^\+1(\d{3})(\d{3})(\d{4})$/u.exec(e164);
  return us === null ? e164 : `+1 (${us[1] ?? ""}) ${us[2] ?? ""}-${us[3] ?? ""}`;
}
