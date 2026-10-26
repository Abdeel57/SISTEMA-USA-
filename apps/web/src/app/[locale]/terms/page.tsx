import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { withBrand } from "@app/brand";

import { LegalPage } from "@/components/legal-page";
import { routing } from "@/i18n/routing";
import { TERMS_AND_CONDITIONS_TEMPLATE } from "@/legal/terms-and-conditions";
import { loadBrand } from "@/lib/brand-server";

/**
 * Terminos y condiciones del sitio, tal como los entrego el abogado del
 * cliente, con los datos de la empresa (razon social, direccion, correo,
 * dominio, estado y tribunales) de la marca guardada desde el panel.
 */
export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "legal.terms" });
  const brand = await loadBrand();

  return (
    <LegalPage
      locale={locale}
      document={withBrand(TERMS_AND_CONDITIONS_TEMPLATE, brand.profile)}
      title={t("title")}
      lead={t("lead")}
    />
  );
}
