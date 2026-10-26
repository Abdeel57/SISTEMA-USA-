import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", async () => {
  const { createElement } = await import("react");

  return {
    usePathname: () => "/",
    Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) =>
      createElement("a", { href, ...rest }, children),
  };
});

import { PromotionHero, splitLeadingVerb } from "@/components/promotion-hero";
import type { Locale } from "@/i18n/locales";
import { activePromotion, activePromotionDetail } from "@/mocks/fixtures/promotions";

import enMessages from "../../messages/en-US.json";
import esMessages from "../../messages/es-US.json";

/**
 * Titular del hero, segunda pasada (2026-10-13).
 *
 * LO QUE SE VIGILA
 *   1. El verbo solo se separa cuando el titulo EMPIEZA por el (palabra entera).
 *   2. Separado, a la vista son dos piezas -verbo en rojo, resto en cromo- y
 *      al oido el titulo sigue siendo uno, entero.
 *   3. El boton de compra del hero es el rojo fijo de compra.
 */

const NOW = "2026-08-25T12:00:00.000Z";

function renderIn(locale: Locale, ui: ReactNode) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? enMessages : esMessages}
      timeZone="UTC"
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("splitLeadingVerb", () => {
  it("separa el verbo del principio, sin distinguir mayusculas", () => {
    expect(splitLeadingVerb("Gana esta GMC Sierra Denali", "Gana")).toEqual({
      verb: "Gana",
      rest: "esta GMC Sierra Denali",
    });
    expect(splitLeadingVerb("WIN this truck", "Win")).toEqual({ verb: "WIN", rest: "this truck" });
  });

  it("no separa nada si el titulo no empieza por el verbo como palabra entera (invariante 1)", () => {
    expect(splitLeadingVerb("Ganadores de verano", "Gana")).toBeNull();
    expect(splitLeadingVerb("Sorteo de la camioneta", "Gana")).toBeNull();
    expect(splitLeadingVerb("Gana", "Gana")).toBeNull();
    expect(splitLeadingVerb("Gana   ", "Gana")).toBeNull();
    expect(splitLeadingVerb("Gana esto", "")).toBeNull();
  });
});

describe("titular del hero", () => {
  const promotion = {
    ...activePromotion,
    title: { "en-US": "Win this GMC Sierra Denali", "es-US": "Gana esta GMC Sierra Denali" },
  };
  // Sin premio declarado: el titulo de la promocion ocupa el titular.
  const detail = { ...activePromotionDetail, title: promotion.title, prize: null };

  it("pinta el verbo en rojo y el resto en cromo, y se lee entero (invariante 2)", () => {
    const { container } = renderIn(
      "es",
      <PromotionHero
        promotion={promotion}
        detail={detail}
        locale="es"
        nowIso={NOW}
        amoeEnabled={false}
        multipliersEnabled={false}
      />,
    );

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Gana esta GMC Sierra Denali");

    const verb = container.querySelector(".app-hero-verb");
    expect(verb).toHaveTextContent("Gana");
    expect(verb).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".app-chrome")).toHaveTextContent("esta GMC Sierra Denali");
    expect(container.querySelector(".app-hero-rule")).not.toBeNull();
  });

  it("el boton de compra del hero es el rojo fijo (invariante 3)", () => {
    renderIn(
      "en",
      <PromotionHero
        promotion={promotion}
        detail={detail}
        locale="en"
        nowIso={NOW}
        amoeEnabled={false}
        multipliersEnabled={false}
      />,
    );

    const cta = screen.getByRole("link", { name: enMessages.home.hero.shopNow });
    expect(cta.className).toContain("bg-buy");
  });
});
