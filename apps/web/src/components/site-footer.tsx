import { cn } from "@app/ui";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { LEGAL_DOCUMENTS, LEGAL_ROUTES } from "@/legal/links";
import { loadBrand } from "@/lib/brand-server";

import { BrandLockup } from "./brand-lockup";
import { LanguageSwitcher } from "./language-switcher";

/**
 * Pie del sitio.
 *
 * Lleva el enlace a las Reglas Oficiales porque en un producto de sweepstakes
 * ese documento tiene que estar a un clic desde cualquier pantalla, no solo
 * desde la promocion. Los documentos legales (Terminos, Privacidad, Aviso de
 * California) y "Tus opciones de privacidad" van en su propia fila, y el
 * contacto del negocio en la linea final: la Politica de Privacidad remite a
 * los dos.
 *
 * El aviso de datos simulados solo aparece fuera de produccion, y esta ahi para
 * que nadie confunda un fixture con una cifra real de participaciones.
 *
 * ---------------------------------------------------------------------------
 * COMPOSICION (pie compacto, 2026-10-13)
 * ---------------------------------------------------------------------------
 * El usuario pidio un pie mas corto y facil de leer. Tres franjas, de lo que
 * mas se busca a lo que menos:
 *
 * 1. **Marca y cuatro enlaces del sitio**, siempre visibles: en telefono, una
 *    rejilla de dos por dos. Sustituye a los grupos plegables, que escondian
 *    cada enlace detras de un toque, y al recuadro de Reglas Oficiales, que
 *    repetia un enlace del grupo de promociones con media pantalla de alto. Las
 *    Reglas siguen destacadas: son el unico enlace en el color de marca.
 * 2. **Legal e idioma**: los documentos en letra pequena, en una fila que se
 *    parte sola en telefono.
 * 3. **Datos del negocio y copyright**, en letra de pie.
 *
 * El carrito no se repite aqui: esta siempre en la cabecera.
 */
export async function SiteFooter({ showMockNotice }: { readonly showMockNotice: boolean }) {
  const t = await getTranslations();
  const year = new Date().getFullYear();
  // Razon social, direccion y correo: los de la marca guardada desde el panel.
  const brand = await loadBrand();
  const contact = {
    legalName: brand.profile.legal.name,
    email: brand.profile.contact.email,
    street: brand.profile.legal.address.street,
    cityStateZip: brand.profile.legal.address.cityStateZip,
  };

  return (
    <footer className="app-topo mt-s10 bg-surface-sunken">
      <div aria-hidden="true" className="app-gold-rule" />

      <div className="app-container py-s8 lg:py-s10">
        <div className="flex flex-col gap-s6 lg:flex-row lg:items-center lg:justify-between lg:gap-s12">
          <div className="max-w-narrow">
            <BrandLockup size="md" logoUrl={brand.logoUrl} />
            <p className="mt-s3 text-body-sm text-text-muted">{t("brand.tagline")}</p>
          </div>

          <nav aria-label={t("a11y.footerNavigation")}>
            <ul className="grid grid-cols-2 gap-x-s6 sm:flex sm:flex-wrap sm:gap-x-s8">
              {SITE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={cn(
                      LINK_BASE,
                      "inline-flex min-h-touch items-center text-body-md font-medium",
                      link.highlight ? "text-brand hover:text-text" : "text-text hover:text-brand",
                    )}
                  >
                    {t(link.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-s6 flex flex-col gap-s4 border-t border-border pt-s5 lg:flex-row lg:items-center lg:justify-between lg:gap-s10">
          <nav aria-label={t("a11y.legalNavigation")}>
            <ul className="flex flex-wrap gap-x-s5">
              {LEGAL_DOCUMENTS.map((entry) => (
                <li key={entry.route}>
                  <Link href={entry.route} className={LEGAL_LINK}>
                    {t(`legal.links.${entry.labelKey}`)}
                  </Link>
                </li>
              ))}
              <li>
                <Link href={LEGAL_ROUTES.privacyChoices} className={LEGAL_LINK}>
                  {t("legal.links.privacyChoices")}
                </Link>
              </li>
            </ul>
          </nav>

          <LanguageSwitcher className="shrink-0" />
        </div>

        <div className="mt-s4 flex flex-col gap-1 text-caption text-text-subtle">
          {/* El correo va dentro de la frase y por eso no lleva el area tactil
              de 44px de los enlaces sueltos: WCAG 2.5.8 exime a los enlaces en
              linea con el texto. */}
          <address className="not-italic">
            {contact.legalName} · {contact.street}, {contact.cityStateZip} ·{" "}
            <a
              href={`mailto:${contact.email}`}
              className={cn(LINK_BASE, "underline underline-offset-2 hover:text-brand")}
            >
              {contact.email}
            </a>
          </address>

          {/* El ano va como cadena a proposito: un numero en ICU se formatea
              con separador de miles y saldria "2,026". */}
          <p>{t("footer.copyright", { year: String(year) })}</p>

          {showMockNotice ? <p>{t("footer.mockDataNotice")}</p> : null}
        </div>
      </div>
    </footer>
  );
}

/** Los enlaces del sitio, en el orden en que se leen. */
const SITE_LINKS = [
  { href: "/shop", labelKey: "nav.shop", highlight: false },
  { href: "/promotions", labelKey: "nav.promotions", highlight: false },
  { href: "/official-rules", labelKey: "nav.officialRules", highlight: true },
  { href: "/faq", labelKey: "nav.faq", highlight: false },
] as const;

/** Foco y transicion comunes; tamano y color los pone cada uso. */
const LINK_BASE = cn(
  "rounded-md transition-colors duration-fast ease-standard",
  "outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-sunken",
);

/**
 * Enlace legal: secundario, en letra pequena. 32px de alto y no 44: son cuatro
 * enlaces que en telefono ocupan tres lineas, y WCAG 2.5.8 pide 24px.
 */
const LEGAL_LINK = cn(
  LINK_BASE,
  "inline-flex min-h-8 items-center text-body-sm text-text-muted hover:text-brand",
);
