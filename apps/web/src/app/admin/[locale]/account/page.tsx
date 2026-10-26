import { Card, CardTitle } from "@app/ui";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AdminChrome } from "@/components/admin/admin-chrome";
import { openAdminScreen } from "@/components/admin/admin-screen";
import { OwnPasswordForm } from "@/components/admin/own-password-form";
import { isLocale } from "@/i18n/locales";
import { fetchSiteConfig } from "@/lib/api";
import { passwordMinimumFrom } from "@/lib/password-policy";

export const dynamic = "force-dynamic";

/**
 * Mi cuenta: el correo con el que se entra y el cambio de contrasena.
 *
 * Existe para que quien recibe una cuenta con una contrasena inicial -la que le
 * dio quien instalo el sitio- la cambie por una suya sin depender de nadie. No
 * esta en el menu de secciones: se abre desde la sesion (el correo de la
 * cabecera en la computadora, "Mas" en el telefono).
 *
 * No exige ninguna capacidad: toda cuenta de personal puede cambiar SU
 * contrasena. La API solo actua sobre la cuenta de la sesion y pide la actual.
 */
export default async function AdminAccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "admin.account" });

  const screen = await openAdminScreen({
    locale,
    current: "account",
    path: "/account",
    title: t("title"),
    capability: null,
  });
  if (!screen.ok) return screen.node;

  const config = await fetchSiteConfig(locale);
  const minimumLength = passwordMinimumFrom(config);

  return (
    <AdminChrome
      locale={locale}
      actor={screen.actor}
      current="account"
      title={t("title")}
      description={t("description")}
    >
      <div className="flex max-w-xl flex-col gap-s6">
        <Card elevation="raised" padding="md">
          <CardTitle as="h2" size="sm">
            {t("emailHeading")}
          </CardTitle>
          <p className="mt-s2 break-all text-body-lg font-semibold text-text">
            {screen.actor.email}
          </p>
          <p className="mt-s1 text-body-sm text-text-muted">{t("emailHint")}</p>
        </Card>

        <Card elevation="raised" padding="md">
          <CardTitle as="h2" size="sm">
            {t("passwordHeading")}
          </CardTitle>
          <p className="mt-s2 text-body-sm text-text-muted">{t("passwordIntro")}</p>
          <div className="mt-s5">
            <OwnPasswordForm locale={locale} minimumLength={minimumLength} />
          </div>
        </Card>
      </div>
    </AdminChrome>
  );
}
