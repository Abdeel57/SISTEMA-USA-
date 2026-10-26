import { Badge, Card, cn } from "@app/ui";
import { useTranslations } from "next-intl";

import { useOrderEntryStateLabel, useOrderStatusLabel } from "@/i18n/account-labels";
import { formatEntryCount, formatInteger, formatMoney, formatZonedDate } from "@/i18n/formatters";
import type { Locale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import type { OrderEntryState, OrderSummary } from "@/lib/api";

/**
 * Tono de la insignia del estado de participaciones.
 *
 * Es una FUNCION DE PRESENTACION sobre un enum del backend, no una decision de
 * negocio: no cambia lo que ha pasado, solo con que color se dice. El `switch`
 * es exhaustivo, asi que un estado nuevo en el contrato deja de compilar aqui
 * en vez de aparecer sin tono.
 *
 * `PENDING_QUALIFICATION` es `info` y no `warning`: no hay nada que corregir ni
 * de que preocuparse, solo un paso que aun no ha ocurrido. Un tono de aviso
 * sugeriria que algo va mal con un pedido que esta perfectamente.
 */
function entryStateTone(state: OrderEntryState): "neutral" | "brand" | "info" | "warning" {
  switch (state) {
    case "GRANTED":
      return "brand";
    case "PENDING_QUALIFICATION":
      return "info";
    case "REVERSED":
    case "PARTIALLY_REVERSED":
      return "warning";
    case "NOT_APPLICABLE":
      return "neutral";
  }
}

/**
 * Un pedido en el listado del participante.
 *
 * DOS ESTADOS, Y NO SE DEDUCE UNO DEL OTRO. El del pedido -pagado, enviado,
 * reembolsado- y el de sus participaciones. Que un pedido este pagado no
 * significa que las participaciones esten otorgadas: se generan cuando la orden
 * alcanza el estado que las Official Rules definan como cualificante, a partir
 * de la confirmacion del proveedor de pago. Pintar un solo estado obligaria a
 * elegir cual de las dos verdades se cuenta.
 *
 * `entries_granted` puede ser `null`, y eso NO se pinta como `0`: "todavia no se
 * sabe" y "ninguna" son afirmaciones distintas delante de alguien que acaba de
 * comprar.
 */
export function OrderCard({
  order,
  locale,
  timeZone,
}: {
  readonly order: OrderSummary;
  readonly locale: Locale;
  /** Zona legal contra la que se formatea la fecha (DEC-011). */
  readonly timeZone: string;
}) {
  const t = useTranslations("account");
  const statusLabel = useOrderStatusLabel();
  const entryStateLabel = useOrderEntryStateLabel();

  const placedAt = formatZonedDate(order.placed_at, locale, { timeZone });
  const total = formatMoney(order.total, locale);
  const itemCount = t("orders.itemCount", { count: formatInteger(order.item_count, locale) });

  /*
   * COMPOSICION COMPACTA (2026-10-13). Antes cada pedido ocupaba media pantalla
   * de telefono: cantidad y total en dos bloques con su etiqueta, y las
   * participaciones en un tercero. Ahora son tres lineas:
   *
   *   1. numero de pedido + fecha y articulos | total a la derecha;
   *   2. el estado del pedido (y "pago en efectivo" si aplica);
   *   3. las participaciones con su estado | "Ver este pedido".
   */
  return (
    <Card
      elevation="flat"
      padding="md"
      className="relative transition-shadow duration-fast ease-standard hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-s3">
        <div className="min-w-0">
          <p className="app-display text-heading-sm text-text">{order.order_number}</p>
          <p className="mt-s1 text-caption text-text-subtle">
            {placedAt === null ? itemCount : `${t("orders.placedOn", { date: placedAt })} · ${itemCount}`}
          </p>
        </div>

        {total === null ? null : (
          <dl className="shrink-0 text-right">
            <dt className="text-caption text-text-subtle">{t("order.total")}</dt>
            <dd className="font-display text-heading-sm font-bold tabular-nums text-text">{total}</dd>
          </dl>
        )}
      </div>

      <div className="mt-s3 flex flex-wrap items-center gap-2">
        <Badge tone="neutral" size="sm">
          {statusLabel(order.status)}
        </Badge>
        {/* DEC-078: un pedido en efectivo pendiente se paga en caja, no aqui. */}
        {order.payment_method === "CASH" ? (
          <Badge tone="info" size="sm">
            {t("orders.paymentCash")}
          </Badge>
        ) : null}
      </div>

      <div className="mt-s3 flex flex-wrap items-center justify-between gap-x-s4 gap-y-s2 border-t border-border pt-s3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-text-subtle">{t("orders.entriesLabel")}</span>
          <Badge tone={entryStateTone(order.entry_state)} size="sm">
            {entryStateLabel(order.entry_state)}
          </Badge>

          {order.entries_granted === null ? null : (
            <span className="font-display text-body-sm font-bold tabular-nums text-brand">
              {formatEntryCount(order.entries_granted, locale)}
            </span>
          )}
        </div>

        {/*
         * `app-stretched-link` hace que toda la tarjeta sea el area de clic sin
         * meter el resto del contenido dentro del enlace: el nombre accesible
         * sigue siendo el del enlace y no un parrafo de tres lineas.
         */}
        <Link href={`/account/orders/${order.id}`} className={cn("app-stretched-link", LINK)}>
          {t("orders.view")}
          <span aria-hidden="true"> →</span>
        </Link>
      </div>
    </Card>
  );
}

const LINK = "text-body-sm font-semibold text-brand";
