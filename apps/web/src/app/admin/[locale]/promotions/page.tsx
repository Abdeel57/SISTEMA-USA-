import { Badge, buttonVariants, EmptyState } from "@app/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AdminChrome } from "@/components/admin/admin-chrome";
import { AdminPager } from "@/components/admin/admin-pager";
import { openAdminScreen } from "@/components/admin/admin-screen";
import { AdminSectionError } from "@/components/admin/admin-section-error";
import { ResponsiveRecords } from "@/components/admin/responsive-records";
import { WRAPPING_BADGE_CLASS } from "@/components/admin/wrapping-badge";
import { PromotionStatusBadge } from "@/components/promotion-status-badge";
import { adminHref } from "@/i18n/admin-routing";
import { formatZonedDate } from "@/i18n/formatters";
import { isLocale } from "@/i18n/locales";
import { can } from "@/lib/admin/capabilities";
import { fetchAdminPromotions, pickLocalized, type AdminPromotionRow } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Listado de promociones (seccion 12 del contrato).
 *
 * LA COLUMNA QUE IMPORTA ES LA DE REGLAS. Una promocion sin version de reglas
 * ACTIVE no puede activarse (DEC-012), y verlo en el listado evita el recorrido
 * tipico: entrar, intentar activar, leer un 409 y buscar el motivo en tres
 * pantallas. El listado lo dice antes.
 *
 * Las fechas se formatean contra la ZONA LEGAL de cada promocion, no contra la
 * del navegador ni la del servidor (DEC-011). Dos promociones de la misma tabla
 * pueden tener zonas distintas, y por eso la zona se lee fila a fila. Una
 * promocion recien creada no tiene ventana, y eso se dice: es una de las dos
 * cosas que faltan para poder activarla.
 *
 * En el telefono cada promocion es una tarjeta que se abre entera
 * (`rowHref`), y su estado se parte en lineas en vez de cortarse: "Preparando
 * la exportacion" cortado en "PREPARANDO LA EXP..." no dice en que punto esta.
 */
export default async function AdminPromotionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const { cursor } = await searchParams;
  const t = await getTranslations({ locale, namespace: "admin.promotions" });

  const screen = await openAdminScreen({
    locale,
    current: "promotions",
    path: "/promotions",
    title: t("title"),
    capability: "promotion.read",
  });

  if (!screen.ok) return screen.node;

  const result = await fetchAdminPromotions(
    cursor === undefined ? {} : { cursor },
    locale,
    screen.session,
  );

  const canCreate = can(screen.actor, "promotion.create");

  // La ficha de la promocion: mismo destino para el nombre y para la tarjeta.
  const promotionHref = (id: string): string =>
    adminHref(locale, `/promotions/${encodeURIComponent(id)}`);

  const window = (row: AdminPromotionRow): string => {
    // Mes corto ("10 sept 2026"): dos fechas largas ocupaban tres lineas de la
    // celda. Sigue siendo la fecha completa, en la zona legal de la fila.
    const zoned = (iso: string | null): string | null =>
      iso === null
        ? null
        : formatZonedDate(iso, locale, { timeZone: row.legal_timezone, dateStyle: "medium" });
    const opens = zoned(row.starts_at);
    const closes = zoned(row.ends_at);
    if (opens === null && closes === null) return t("windowNotSet");
    return `${opens ?? t("windowNotSet")} – ${closes ?? t("windowNotSet")}`;
  };

  return (
    <AdminChrome
      locale={locale}
      actor={screen.actor}
      current="promotions"
      title={t("title")}
      description={t("description")}
      {...(canCreate
        ? {
            actions: (
              <Link
                href={adminHref(locale, "/promotions/new")}
                className={buttonVariants({ variant: "primary", size: "md" })}
              >
                {t("newCta")}
              </Link>
            ),
          }
        : {})}
    >
      {!result.ok ? (
        <AdminSectionError failure={result.error} headingLevel="h2" />
      ) : (
        <div className="flex flex-col gap-s6">
          <ResponsiveRecords<AdminPromotionRow>
            caption={t("tableCaption")}
            scrollRegionLabel={t("tableCaption")}
            rows={result.data.items}
            rowKey={(row) => row.id}
            rowHref={(row) => promotionHref(row.id)}
            emptyState={
              <EmptyState
                headingLevel="h2"
                title={t("emptyTitle")}
                description={canCreate ? t("emptyBody") : t("emptyBodyReadOnly")}
              />
            }
            columns={[
              {
                id: "title",
                header: t("columnTitle"),
                isRowHeader: true,
                cell: (row) => (
                  <Link href={promotionHref(row.id)} className="underline underline-offset-4">
                    {pickLocalized(row.public_name, locale)}
                  </Link>
                ),
              },
              {
                id: "status",
                header: t("columnStatus"),
                cell: (row) => (
                  <PromotionStatusBadge
                    status={row.status}
                    size="sm"
                    className={WRAPPING_BADGE_CLASS}
                  />
                ),
              },
              {
                id: "window",
                header: t("columnWindow"),
                cell: (row) => window(row),
              },
              {
                id: "rules",
                header: t("columnRules"),
                cell: (row) =>
                  row.active_rules_version_id === null ? (
                    <Badge tone="warning" size="sm" wrap>
                      {t("noRulesVersion")}
                    </Badge>
                  ) : (
                    <Badge tone="brand" size="sm" wrap>
                      {t("rulesVersionActive")}
                    </Badge>
                  ),
              },
            ]}
          />

          <AdminPager
            locale={locale}
            path="/promotions"
            nextCursor={result.data.next_cursor}
            hasItems={result.data.items.length > 0}
          />

          <p>
            <Link href={adminHref(locale)} className={buttonVariants({ variant: "ghost" })}>
              {t("backToDashboard")}
            </Link>
          </p>
        </div>
      )}
    </AdminChrome>
  );
}
