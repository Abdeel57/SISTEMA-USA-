import { Alert, Badge, Card, CardTitle } from "@app/ui";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AdminChrome } from "@/components/admin/admin-chrome";
import { openAdminScreen } from "@/components/admin/admin-screen";
import { AdminSectionError } from "@/components/admin/admin-section-error";
import { PaymentSettingsForm } from "@/components/admin/payment-settings-form";
import { isLocale } from "@/i18n/locales";
import { can } from "@/lib/admin/capabilities";
import { fetchAdminPaymentSettings } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Formas de pago de la tienda (0041).
 *
 * Arriba, lo que ve hoy el comprador en el checkout -una insignia por forma de
 * pago, encendida o apagada-; debajo, el formulario. Asi quien entra a
 * "Pagos" sabe en un vistazo si Zelle esta funcionando sin leer el formulario.
 */
export default async function AdminPaymentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "admin.payments" });

  const screen = await openAdminScreen({
    locale,
    current: "payments",
    path: "/payments",
    title: t("title"),
    capability: "product.read",
  });
  if (!screen.ok) return screen.node;

  const result = await fetchAdminPaymentSettings(locale, screen.session);
  const canWrite = can(screen.actor, "product.write");

  return (
    <AdminChrome
      locale={locale}
      actor={screen.actor}
      current="payments"
      title={t("title")}
      description={t("description")}
    >
      {!result.ok ? (
        <AdminSectionError failure={result.error} headingLevel="h2" />
      ) : (
        <div className="flex flex-col gap-s6">
          <Card elevation="raised" padding="md">
            <CardTitle as="h2" size="sm">
              {t("currentHeading")}
            </CardTitle>
            <ul className="mt-s3 flex list-none flex-wrap gap-s2 p-0">
              {(
                [
                  ["zelle", result.data.zelle_enabled],
                  ["card", result.data.card_enabled],
                  ["cash", result.data.cash_enabled],
                ] as const
              ).map(([key, enabled]) => (
                <li key={key}>
                  <Badge tone={enabled ? "success" : "neutral"} size="sm" wrap>
                    {t(`methods.${key}`)}: {enabled ? t("on") : t("off")}
                  </Badge>
                </li>
              ))}
            </ul>
            {result.data.card_enabled ? null : (
              <p className="mt-s3 text-caption text-text-subtle">{t("cardNote")}</p>
            )}
          </Card>

          {canWrite ? (
            <section aria-labelledby="payments-form">
              <h2 id="payments-form" className="app-display text-heading-lg text-text">
                {t("formHeading")}
              </h2>
              <div className="mt-s4">
                <PaymentSettingsForm locale={locale} settings={result.data} />
              </div>
            </section>
          ) : (
            <Alert tone="info">{t("readOnly")}</Alert>
          )}
        </div>
      )}
    </AdminChrome>
  );
}
