import { Badge, buttonVariants, EmptyState, Input } from "@app/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AdminChrome } from "@/components/admin/admin-chrome";
import { AdminPager } from "@/components/admin/admin-pager";
import { openAdminScreen } from "@/components/admin/admin-screen";
import { AdminSectionError } from "@/components/admin/admin-section-error";
import { ResponsiveRecords, TABLE_NOWRAP_CLASS } from "@/components/admin/responsive-records";
import { adminHref } from "@/i18n/admin-routing";
import { formatMoney, formatZonedDate } from "@/i18n/formatters";
import { isLocale } from "@/i18n/locales";
import { fetchAdminOrders, type AdminOrderRow } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Las tres vistas del listado (DEC-078).
 *
 * `cash-pending` es la cola de la caja: pedidos en efectivo que siguen
 * esperando el cobro. Se elige con un enlace y no con un desplegable porque son
 * tres opciones fijas que tienen que verse a la vez en un telefono.
 */
const VIEWS = ["all", "cash-pending", "cash"] as const;
type OrdersView = (typeof VIEWS)[number];

function viewFrom(raw: string | undefined): OrdersView {
  return VIEWS.find((view) => view === raw) ?? "all";
}

/** Lo que cada vista pide al backend. La interfaz no filtra nada por su cuenta. */
function filtersOf(view: OrdersView): {
  readonly payment_method?: "CASH";
  readonly awaiting_payment?: boolean;
} {
  switch (view) {
    case "cash-pending":
      return { payment_method: "CASH", awaiting_payment: true };
    case "cash":
      return { payment_method: "CASH" };
    case "all":
      return {};
  }
}

/**
 * Listado de pedidos.
 *
 * EL CORREO LLEGA COMO EL BACKEND LO MANDE. Si el actor solo tiene
 * `pii.view.masked`, llega enmascarado desde el servidor. Esta pantalla no
 * enmascara nada: si el correo completo viajara siempre y la interfaz lo tapara
 * al pintarlo, el dato estaria en el HTML y en la pestana de red de todos modos,
 * y el enmascarado seria decorativo.
 *
 * Los estados -de pedido y de participaciones- se traducen con los MISMOS
 * ayudantes que el portal del participante. Que quien atiende y quien pregunta
 * lean exactamente la misma palabra para el mismo estado no es cosmetica: es lo
 * que hace que una conversacion de soporte funcione.
 *
 * BUSCAR POR NUMERO DE ORDEN O POR CLIENTE (DEC-078)
 * -------------------------------------------------
 * Es lo primero que hace quien atiende la caja: el cliente dice su numero de
 * orden -o su correo, o su nombre- y hay que encontrar el pedido. El buscador
 * es un formulario GET normal: funciona sin JavaScript, la busqueda queda en la
 * URL y el boton de atras del navegador la deshace. La busqueda la hace el
 * BACKEND; aqui no se compara ni un caracter.
 *
 * EN EL TELEFONO, UNA TARJETA POR PEDIDO (`ResponsiveRecords`). La tabla de
 * siete columnas ensenaba tres en 390px -pedido, comprador y pago- y el
 * estado, la fecha y el total quedaban detras de un scroll lateral dentro de
 * la tabla, justo los datos que se miran en la caja. La tarjeta los ensena
 * todos y se abre entera con el dedo, no solo por el numero subrayado.
 */
export default async function AdminOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ cursor?: string; q?: string; view?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const { cursor, q: rawQuery, view: rawView } = await searchParams;
  const query = (rawQuery ?? "").trim().slice(0, 120);
  const view = viewFrom(rawView);

  const t = await getTranslations({ locale, namespace: "admin.orders" });
  const statusT = await getTranslations({ locale, namespace: "orderStatus" });
  const entryStateT = await getTranslations({ locale, namespace: "orderEntryState" });

  const screen = await openAdminScreen({
    locale,
    current: "orders",
    path: "/orders",
    title: t("title"),
    capability: "order.read",
  });

  if (!screen.ok) return screen.node;

  const result = await fetchAdminOrders(
    {
      ...(cursor === undefined ? {} : { cursor }),
      ...(query === "" ? {} : { q: query }),
      ...filtersOf(view),
    },
    locale,
    screen.session,
  );

  // Lo que hay que conservar al cambiar de pagina o de vista.
  const keep: Record<string, string> = {
    ...(query === "" ? {} : { q: query }),
    ...(view === "all" ? {} : { view }),
  };

  // La ficha de un pedido: el MISMO destino para el numero y para la tarjeta.
  const orderHref = (id: string): string => adminHref(locale, `/orders/${encodeURIComponent(id)}`);

  // Funcion flecha y no declaracion: asi conserva el `locale` ya comprobado.
  const viewHref = (target: OrdersView): string => {
    const search = new URLSearchParams({
      ...(query === "" ? {} : { q: query }),
      ...(target === "all" ? {} : { view: target }),
    });
    const suffix = search.toString();
    return `${adminHref(locale, "/orders")}${suffix === "" ? "" : `?${suffix}`}`;
  };

  return (
    <AdminChrome
      locale={locale}
      actor={screen.actor}
      current="orders"
      title={t("title")}
      description={t("description")}
    >
      <div className="flex flex-col gap-s6">
        <form
          method="get"
          action={adminHref(locale, "/orders")}
          role="search"
          className="flex flex-col gap-s3 sm:flex-row sm:items-end"
        >
          {view === "all" ? null : <input type="hidden" name="view" value={view} />}

          <label className="flex min-w-0 flex-1 flex-col gap-s1">
            <span className="text-label font-medium text-text">{t("searchLabel")}</span>
            <Input
              name="q"
              type="search"
              defaultValue={query}
              maxLength={120}
              placeholder={t("searchPlaceholder")}
              autoComplete="off"
            />
          </label>

          <button type="submit" className={buttonVariants({ variant: "accent" })}>
            {t("searchSubmit")}
          </button>

          {query === "" ? null : (
            <Link href={viewHref(view)} className={buttonVariants({ variant: "ghost" })}>
              {t("searchClear")}
            </Link>
          )}
        </form>

        {/* Tres pestanas de 44px: se tocan con el pulgar sin apuntar. */}
        <nav aria-label={t("viewsLabel")} className="flex flex-wrap gap-2">
          {VIEWS.map((target) => (
            <Link
              key={target}
              href={viewHref(target)}
              aria-current={target === view ? "page" : undefined}
              className={buttonVariants({
                variant: target === view ? "secondary" : "ghost",
              })}
            >
              {t(`views.${target}`)}
            </Link>
          ))}
        </nav>

        {!result.ok ? (
          <AdminSectionError failure={result.error} headingLevel="h2" />
        ) : (
          <>
            <ResponsiveRecords<AdminOrderRow>
              caption={t("tableCaption")}
              scrollRegionLabel={t("tableCaption")}
              rows={result.data.items}
              rowKey={(row) => row.id}
              rowHref={(row) => orderHref(row.id)}
              emptyState={
                <EmptyState
                  headingLevel="h2"
                  title={query === "" ? t("emptyTitle") : t("searchEmptyTitle")}
                  description={query === "" ? t("emptyBody") : t("searchEmptyBody")}
                />
              }
              columns={[
                {
                  id: "order",
                  header: t("columnOrder"),
                  isRowHeader: true,
                  cell: (row) => (
                    <Link
                      href={orderHref(row.id)}
                      className="whitespace-nowrap font-mono underline underline-offset-4"
                    >
                      {row.order_number}
                    </Link>
                  ),
                },
                {
                  id: "participant",
                  header: t("columnParticipant"),
                  /*
                   * SIEMPRE enmascarado (`order.read` no es una capacidad de
                   * PII), y CADENA VACIA cuando la cuenta esta anonimizada. Las
                   * dos cosas se dicen distinto: un hueco se lee como un fallo.
                   */
                  cell: (row) =>
                    row.participant_email === "" ? (
                      <span className="text-text-muted">{t("anonymizedParticipant")}</span>
                    ) : (
                      row.participant_email
                    ),
                },
                {
                  id: "payment",
                  header: t("columnPayment"),
                  cell: (row) =>
                    row.payment_method === "CASH" ? (
                      <Badge tone="info" size="sm" wrap>
                        {t("paymentCash")}
                      </Badge>
                    ) : (
                      t("paymentCard")
                    ),
                },
                {
                  id: "status",
                  header: t("columnStatus"),
                  cell: (row) => statusT(row.status),
                },
                {
                  id: "entryState",
                  header: t("columnEntryState"),
                  cell: (row) => entryStateT(row.entry_state),
                },
                {
                  id: "placed",
                  header: t("columnPlaced"),
                  // Mes corto ("10 sept 2026") y sin partir: con el largo, la
                  // fecha ocupaba tres lineas de la tabla.
                  cell: (row) => (
                    <span className={TABLE_NOWRAP_CLASS}>
                      {formatZonedDate(row.placed_at, locale, {
                        timeZone: "UTC",
                        dateStyle: "medium",
                      }) ?? ""}
                    </span>
                  ),
                },
                {
                  id: "total",
                  header: t("columnTotal"),
                  align: "end",
                  cell: (row) => (
                    <span className={TABLE_NOWRAP_CLASS}>
                      {formatMoney(row.total, locale) ?? ""}
                    </span>
                  ),
                },
              ]}
            />

            <AdminPager
              locale={locale}
              path="/orders"
              nextCursor={result.data.next_cursor}
              hasItems={result.data.items.length > 0}
              extraQuery={keep}
            />
          </>
        )}
      </div>
    </AdminChrome>
  );
}
