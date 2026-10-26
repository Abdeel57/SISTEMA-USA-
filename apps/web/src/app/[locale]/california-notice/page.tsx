import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { withBrand } from "@app/brand";

import { LegalPage } from "@/components/legal-page";
import { routing } from "@/i18n/routing";
import { CALIFORNIA_NOTICE_TEMPLATE } from "@/legal/california-notice";
import { loadBrand } from "@/lib/brand-server";

/**
 * Aviso de recopilacion para residentes de California (CCPA), con los datos
 * de la empresa de la marca guardada desde el panel.
 *
 * Se enlaza en los puntos donde se piden datos -alta, direccion de envio y
 * solicitudes de privacidad-, que es donde ese aviso tiene que estar a mano.
 */
export default async function CaliforniaNoticePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "legal.californiaNotice" });
  const brand = await loadBrand();

  return (
    <LegalPage
      locale={locale}
      document={withBrand(CALIFORNIA_NOTICE_TEMPLATE, brand.profile)}
      title={t("title")}
      lead={t("lead")}
    />
  );
}
