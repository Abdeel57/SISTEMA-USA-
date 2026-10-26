import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Locale } from "@/i18n/locales";

/**
 * EL PIE COMPACTO (2026-10-13).
 *
 * El pie perdio el recuadro de Reglas Oficiales y los grupos plegables. Lo que
 * se protege aqui es lo que esa poda podria llevarse por delante sin que nada
 * falle: que desde cualquier pantalla sigan a un clic las Reglas Oficiales, los
 * tres documentos legales, "Tus opciones de privacidad" (la Politica de
 * Privacidad publica esa ruta) y el correo del negocio.
 */

/** Locale del render en curso, para el traductor de servidor simulado. */
const current = vi.hoisted((): { locale: Locale } => ({ locale: "en" }));

vi.mock("@/i18n/navigation", async () => {
  const { createElement } = await import("react");

  return {
    usePathname: () => "/",
    Link: ({
      href,
      locale,
      children,
      ...rest
    }: {
      href: string;
      locale?: string;
      children: ReactNode;
    }) =>
      createElement(
        "a",
        { href: locale === undefined ? href : `/${locale}${href}`, ...rest },
        children,
      ),
  };
});

/**
 * Traductor de servidor sobre los MISMOS diccionarios que sirve la aplicacion:
 * lo que se simula es de donde sale el locale, nunca el texto.
 */
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const en = (await import("../../messages/en-US.json")).default;
  const es = (await import("../../messages/es-US.json")).default;

  return {
    getTranslations: () =>
      Promise.resolve(
        current.locale === "en"
          ? createTranslator({ locale: "en", messages: en })
          : createTranslator({ locale: "es", messages: es }),
      ),
  };
});

/** La marca de la plantilla: la misma a la que cae la web si la API no responde. */
vi.mock("@/lib/brand-server", async () => {
  const { runtimeBrandFrom } = await import("@/lib/brand-runtime");
  return { loadBrand: () => Promise.resolve(runtimeBrandFrom(null)) };
});

import { SiteFooter } from "@/components/site-footer";
import { runtimeBrandFrom } from "@/lib/brand-runtime";

import enMessages from "../../messages/en-US.json";
import esMessages from "../../messages/es-US.json";

async function renderFooter(locale: Locale) {
  current.locale = locale;
  const footer = await SiteFooter({ showMockNotice: false });

  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? enMessages : esMessages}
      timeZone="UTC"
    >
      {footer}
    </NextIntlClientProvider>,
  );
}

describe("SiteFooter", () => {
  it.each(["en", "es"] as const)(
    "deja a un clic las Reglas Oficiales, los documentos legales y el contacto (%s)",
    async (locale) => {
      await renderFooter(locale);
      const messages = locale === "en" ? enMessages : esMessages;

      const site = screen.getByRole("navigation", { name: messages.a11y.footerNavigation });
      expect(within(site).getByRole("link", { name: messages.nav.officialRules })).toHaveAttribute(
        "href",
        "/official-rules",
      );

      const legal = screen.getByRole("navigation", { name: messages.a11y.legalNavigation });
      const documents = [
        [messages.legal.links.terms, "/terms"],
        [messages.legal.links.privacy, "/privacy"],
        [messages.legal.links.californiaNotice, "/california-notice"],
        [messages.legal.links.privacyChoices, "/privacychoices"],
      ] as const;
      for (const [name, href] of documents) {
        expect(within(legal).getByRole("link", { name })).toHaveAttribute("href", href);
      }

      const { email } = runtimeBrandFrom(null).profile.contact;
      expect(screen.getByRole("link", { name: email })).toHaveAttribute("href", `mailto:${email}`);
    },
  );
});
