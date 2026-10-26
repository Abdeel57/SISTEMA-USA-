import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { withBrand } from "@app/brand";

import { LegalPage } from "@/components/legal-page";
import { routing } from "@/i18n/routing";
import { PRIVACY_POLICY_TEMPLATE } from "@/legal/privacy-policy";
import { loadBrand } from "@/lib/brand-server";

/**
 * Politica de Privacidad, tal como la entrego el abogado del cliente, con los
 * datos de la empresa de la marca guardada desde el panel.
 */
export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "legal.privacy" });
  const brand = await loadBrand();

  return (
    <LegalPage
      locale={locale}
      document={withBrand(PRIVACY_POLICY_TEMPLATE, brand.profile)}
      title={t("title")}
      lead={t("lead")}
    />
  );
}
