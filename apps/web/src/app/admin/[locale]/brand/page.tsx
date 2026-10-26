import { Alert, Card, CardTitle } from "@app/ui";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { AdminChrome } from "@/components/admin/admin-chrome";
import { openAdminScreen } from "@/components/admin/admin-screen";
import { AdminSectionError } from "@/components/admin/admin-section-error";
import { BrandForm } from "@/components/admin/brand-form";
import { formatZonedDateTime } from "@/i18n/formatters";
import { isLocale, type Locale } from "@/i18n/locales";
import { can } from "@/lib/admin/capabilities";
import { isIanaTimeZone } from "@/lib/admin/catalog-input";
import { fetchAdminBrand, type AdminBrandResponse } from "@/lib/api";
import { safeImageUrl } from "@/lib/media-url";

export const dynamic = "force-dynamic";

/**
 * Marca del sitio (§17, migracion 0040).
 *
 * TODO LO QUE DISTINGUE A UN CLIENTE DE OTRO SIN TOCAR CODIGO
 * -----------------------------------------------------------
 * Nombre y logotipo de texto, logotipo grafico, los dos colores de la paleta,
 * la intensidad del patron de fondo, los datos legales que llevan Terminos,
 * Privacidad y el aviso de California, el correo de contacto, el dominio, los
 * prefijos de numeracion y la zona horaria del corte de caja. Se guarda desde
 * aqui y se aplica en el siguiente render del sitio publico: sin redesplegar.
 *
 * Leer basta con `brand.read`; guardar exige `brand.update`. Quien solo lee ve
 * la marca actual y un aviso, no un formulario que le va a rechazar.
 *
 * `packages/brand` queda como VALORES INICIALES: mientras nadie haya guardado
 * desde aqui (`updated_by_admin_user_id` en `null`), la tarjeta lo dice.
 */
export default async function AdminBrandPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "admin.brand" });

  const screen = await openAdminScreen({
    locale,
    current: "brand",
    path: "/brand",
    title: t("title"),
    capability: "brand.read",
  });
  if (!screen.ok) return screen.node;

  const result = await fetchAdminBrand(locale, screen.session);
  const canWrite = can(screen.actor, "brand.update");

  return (
    <AdminChrome
      locale={locale}
      actor={screen.actor}
      current="brand"
      title={t("title")}
      description={t("description")}
    >
      {!result.ok ? (
        <AdminSectionError failure={result.error} headingLevel="h2" />
      ) : (
        <div className="flex flex-col gap-s6">
          <p className="max-w-[48rem] text-body-sm text-text-muted">{t("intro")}</p>

          <BrandSummary brand={result.data} locale={locale} />

          {canWrite ? (
            <section aria-labelledby="brand-form">
              <h2 id="brand-form" className="app-display text-heading-lg text-text">
                {t("formHeading")}
              </h2>
              <div className="mt-s4">
                <BrandForm locale={locale} brand={result.data} />
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

/**
 * La marca TAL COMO ESTA GUARDADA, de un vistazo: lo que el sitio publico
 * ensena ahora mismo, antes de tocar nada.
 *
 * Las muestras de color van con `style` en linea: el color es un DATO que
 * llega de la API, no un token de la hoja de estilos, y la CSP admite estilos
 * en linea precisamente para esto. El logotipo guardado se pinta con `<img>` y
 * no con `next/image`: sale de `/media/...`, que ya se sirve reducido e
 * inmutable, y pasa por `safeImageUrl` como cualquier otra ruta de imagen.
 */
async function BrandSummary({
  brand,
  locale,
}: {
  readonly brand: AdminBrandResponse;
  readonly locale: Locale;
}) {
  const t = await getTranslations({ locale, namespace: "admin.brand" });
  const logo = safeImageUrl(brand.logo_url);

  // La zona la valido la API al guardar; si una fila anterior trajera una que
  // `Intl` no conoce, mejor la fecha en UTC que una pagina caida.
  const savedAt = formatZonedDateTime(brand.updated_at, locale, {
    timeZone: isIanaTimeZone(brand.time_zone) ? brand.time_zone : "UTC",
  });

  return (
    <Card elevation="raised" padding="md">
      <CardTitle as="h2" size="sm">
        {t("currentHeading")}
      </CardTitle>

      <dl className="mt-s4 grid grid-cols-1 gap-s4 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label={t("summaryName")}>{brand.name}</Fact>
        <Fact label={t("summaryWordmark")}>
          {brand.wordmark.lead}
          {brand.wordmark.tail.length === 0 ? null : ` ${brand.wordmark.tail}`}
        </Fact>
        <Fact label={t("summaryDomain")}>{brand.domain}</Fact>
        <Fact label={t("summaryTimeZone")}>{brand.time_zone}</Fact>
        <Fact label={t("summaryColors")}>
          <span className="flex flex-wrap items-center gap-s3">
            <Swatch color={brand.colors.brand} />
            <Swatch color={brand.colors.accent} />
          </span>
        </Fact>
        <Fact label={t("summaryPattern")}>
          {t("patternValue", { value: String(brand.pattern_opacity_percent) })}
        </Fact>
        <Fact label={t("summaryLogo")}>
          {logo === null ? (
            t("logoDefault")
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt={t("logoAlt")}
              className="h-12 w-auto max-w-[10rem] rounded-md border border-border bg-surface-sunken object-contain p-1"
            />
          )}
        </Fact>
      </dl>

      <p className="mt-s4 text-caption text-text-subtle">
        {brand.updated_by_admin_user_id === null
          ? t("initialValues")
          : t("updatedAt", { when: savedAt ?? brand.updated_at })}
      </p>
    </Card>
  );
}

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-caption text-text-subtle">{label}</dt>
      <dd className="break-words text-body-sm text-text">{children}</dd>
    </div>
  );
}

/** Muestra de color con su hex. El cuadro es decorativo; el hex es el dato. */
function Swatch({ color }: { readonly color: string }) {
  return (
    <span className="inline-flex items-center gap-s2">
      <span
        aria-hidden="true"
        className="inline-block h-5 w-5 rounded-sm border border-border-strong"
        style={{ backgroundColor: color }}
      />
      <span className="font-mono tabular-nums">{color}</span>
    </span>
  );
}
