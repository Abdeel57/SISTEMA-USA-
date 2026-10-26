import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AdSharingChoice } from "@/components/ad-sharing-choice";
import { SectionHeading } from "@/components/section-heading";
import { routing } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { LEGAL_ROUTES } from "@/legal/links";
import { PRIVACY_REQUEST_TYPES } from "@/legal/privacy-request-types";
import { loadBrand } from "@/lib/brand-server";

/**
 * Tus opciones de privacidad (DEC-063).
 *
 * La URL es literal: la Politica de Privacidad y el Aviso de California publican
 * `/privacychoices` como una de las vias para ejercer derechos.
 *
 * PLANTILLA: LA SOLICITUD VA POR CORREO
 * -------------------------------------
 * `POST /privacy-requests` ya no existe en la API. Esta pagina explica que
 * escribir y a donde, con un enlace `mailto:` al correo del negocio, y conserva
 * la exclusion del pixel de publicidad, que es de este navegador y no necesita
 * ninguna solicitud.
 *
 * El asunto del correo va ya escrito en el idioma de la pagina para que la
 * solicitud se reconozca en el buzon; lo demas lo redacta la persona.
 */
export default async function PrivacyChoicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "legal.privacyChoices" });

  // El correo del negocio: el de la marca guardada desde el panel.
  const contactEmail = (await loadBrand()).profile.contact.email;
  const mailto = `mailto:${contactEmail}?subject=${encodeURIComponent(t("emailSubject"))}`;

  return (
    <div className="pb-s16">
      <div className="app-atmosphere app-grain relative isolate py-s12 lg:py-s16">
        <div className="app-container max-w-narrow">
          <SectionHeading title={t("title")} lead={t("lead")} level="h1" size="lg" />
        </div>
      </div>

      <div className="app-container max-w-narrow pt-s10">
        <div className="flex flex-col gap-s4 text-body-md text-text-muted">
          <p>{t("intro")}</p>
          <p>
            <Link
              href={LEGAL_ROUTES.privacy}
              className="text-brand underline underline-offset-4 hover:text-text"
            >
              {t("readPolicy")}
            </Link>
          </p>
        </div>

        {/* DEC-086: la exclusion del pixel de publicidad, en este navegador. */}
        <div className="mt-s8 rounded-lg border border-border bg-surface p-s6 sm:p-s8">
          <AdSharingChoice />
        </div>

        <section
          aria-labelledby="privacy-request-email"
          className="mt-s8 rounded-lg border border-border bg-surface p-s6 sm:p-s8"
        >
          <h2 id="privacy-request-email" className="app-display text-heading-md text-text">
            {t("emailHeading")}
          </h2>

          <p className="mt-s3 text-body-md text-text-muted">
            {t("emailLead")}{" "}
            <a
              href={mailto}
              className="break-all text-brand underline underline-offset-4 hover:text-text"
            >
              {contactEmail}
            </a>
          </p>

          <p className="mt-s5 text-body-md font-medium text-text">{t("includeHeading")}</p>

          <ul className="mt-s3 flex list-disc flex-col gap-s2 pl-s5 text-body-md text-text-muted">
            <li>
              {t("includeType")}
              {/* Los tipos son los mismos que nombra la Politica de Privacidad. */}
              <ul className="mt-s2 flex list-[circle] flex-col gap-s1 pl-s5">
                {PRIVACY_REQUEST_TYPES.map((type) => (
                  <li key={type}>{t(`types.${type}`)}</li>
                ))}
              </ul>
            </li>
            <li>{t("includeName")}</li>
            <li>{t("includeAccountEmail")}</li>
            <li>{t("includeState")}</li>
            <li>{t("includeAgent")}</li>
          </ul>

          <p className="mt-s5 text-body-sm text-text-muted">{t("emailVerification")}</p>
        </section>
      </div>
    </div>
  );
}
