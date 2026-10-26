import { Alert } from "@app/ui";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AdminChrome } from "@/components/admin/admin-chrome";
import { openAdminScreen } from "@/components/admin/admin-screen";
import { AdminSectionError } from "@/components/admin/admin-section-error";
import { DashboardStatGrid } from "@/components/admin/dashboard-stat-grid";
import { WRAPPING_BADGE_CLASS } from "@/components/admin/wrapping-badge";
import { PromotionStatusBadge } from "@/components/promotion-status-badge";
import { formatEntryCount, formatInteger, formatZonedDateTime } from "@/i18n/formatters";
import { isLocale } from "@/i18n/locales";
import { fetchAdminDashboard } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Portada del panel.
 *
 * SON LECTURAS, NO UN CUADRO DE MANDO. Cada cifra llega calculada del backend
 * y aqui no se suma, no se compara y no se deriva ninguna otra: que el saldo
 * activo y las participaciones AMOE guarden alguna relacion es asunto del
 * motor, no de esta pantalla (DEC-023, requisito R13).
 *
 * `null` EN UNA CIFRA NO ES CERO. Significa que el backend no la publica -no
 * hay promocion, o el actor no tiene la capacidad de leerla-, y se pinta como
 * ausencia. Convertirlo en `0` diria que hay cero participantes, que es una
 * afirmacion distinta y falsa.
 *
 * CADA CIFRA LLEVA A SU SECCION (`DashboardStatGrid`) cuando quien mira puede
 * abrirla: las participaciones y los participantes al listado de
 * participantes, los pedidos al listado de pedidos, las gratuitas a su cola y
 * los ajustes a la suya. Es lo primero que se hace despues de leer "3 por
 * revisar", y antes obligaba a buscarlo en el menu.
 */
export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "admin.dashboard" });

  const screen = await openAdminScreen({
    locale,
    current: "dashboard",
    path: "",
    title: t("title"),
    capability: "dashboard.read",
  });

  if (!screen.ok) return screen.node;

  const result = await fetchAdminDashboard(locale, screen.session);

  /** Una cifra publicada, o el texto de ausencia. Nunca un cero inventado. */
  const integer = (value: number | null): string =>
    value === null ? t("notPublished") : formatInteger(value, locale);

  /** Con algo pendiente, la cifra se destaca: es trabajo esperando. */
  const pendingTone = (value: number | null) =>
    value !== null && value > 0 ? ("warning" as const) : ("neutral" as const);

  return (
    <AdminChrome
      locale={locale}
      actor={screen.actor}
      current="dashboard"
      title={t("title")}
      description={t("description")}
    >
      {!result.ok ? (
        <AdminSectionError failure={result.error} headingLevel="h2" />
      ) : (
        <div className="flex flex-col gap-s6">
          <div className="flex flex-wrap items-center gap-s3">
            {result.data.promotion_status === null ? (
              <Alert tone="info">{t("noPromotion")}</Alert>
            ) : (
              <PromotionStatusBadge
                status={result.data.promotion_status}
                className={WRAPPING_BADGE_CLASS}
              />
            )}
          </div>

          <DashboardStatGrid
            locale={locale}
            actor={screen.actor}
            stats={[
              {
                key: "activeEntries",
                label: t("activeEntries"),
                value:
                  result.data.active_entries === null
                    ? t("notPublished")
                    : formatEntryCount(result.data.active_entries, locale),
                hint: t("activeEntriesHint"),
                tone: "brand",
              },
              {
                key: "participants",
                label: t("participants"),
                value: integer(result.data.participants),
              },
              {
                key: "orders24h",
                label: t("orders24h"),
                value: integer(result.data.orders_last_24h),
              },
              {
                key: "amoePending",
                label: t("amoePending"),
                value: integer(result.data.amoe_pending_review),
                hint: t("amoePendingHint"),
                tone: pendingTone(result.data.amoe_pending_review),
              },
              {
                key: "adjustmentsPending",
                label: t("adjustmentsPending"),
                value: integer(result.data.adjustments_pending_approval),
                hint: t("adjustmentsPendingHint"),
                tone: pendingTone(result.data.adjustments_pending_approval),
              },
            ]}
          />

          {/*
           * El instante al que corresponden las cifras, formateado en UTC
           * EXPLICITO. No es la zona legal de ninguna promocion -esto no es un
           * plazo, es una marca de lectura- y caer en la del navegador es lo
           * que DEC-011 prohibe.
           */}
          <p className="text-caption text-text-subtle">
            {t("asOf", {
              instant: formatZonedDateTime(result.data.as_of, locale, { timeZone: "UTC" }) ?? "",
            })}
          </p>
        </div>
      )}
    </AdminChrome>
  );
}
