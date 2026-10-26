import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      toString: () => "app_dev_session_staff=Bd4kM9tXr6ZaP1wQ7nJc2sF5hL8gV3eY-uRiO_pCz0T",
      set: () => undefined,
    }),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  },
}));

import { BrandForm } from "@/components/admin/brand-form";
import { LOCALES, type Locale } from "@/i18n/locales";
import { IDLE } from "@/lib/action-result";
import { updateBrandAction } from "@/lib/admin/brand-actions";
import { toAdminActor } from "@/lib/admin/capabilities";
import { ADMIN_NAV, visibleNavFor } from "@/lib/admin/navigation";
import { API_PATHS, apiBaseUrl } from "@/lib/api";
import { adminBrand, promotionManagerSession } from "@/mocks/fixtures/admin";
import { mockApiServer } from "@/mocks/node";

import enMessages from "../../messages/en-US.json";
import esMessages from "../../messages/es-US.json";

/**
 * LA MARCA DEL SITIO DESDE EL PANEL (§17, migracion 0040).
 *
 * LO QUE ESTE FICHERO PROTEGE
 * ---------------------------
 * 1. Que la accion rechaza, JUNTO AL CAMPO y sin llamar a la API, lo que la API
 *    rechazaria igual: un color que no es `#rrggbb`, un prefijo fuera de
 *    `^[A-Z0-9]{2,8}$`, una zona horaria que `Intl` no conoce, un dominio que
 *    no es un host, un texto mas largo que su tope.
 * 2. Que lo que SALE POR EL CABLE va NORMALIZADO -colores y dominio en
 *    minusculas, prefijos en mayusculas, patron como entero- y que el logotipo
 *    actual (campo oculto) viaja como `logo_media_id`, porque el `PUT`
 *    reemplaza la fila entera y sin el se perderia.
 * 3. Que "quitar el logotipo" manda `null`.
 * 4. Que la entrada del menu sale SOLO con `brand.read`, y no con cualquier
 *    otra capacidad.
 * 5. Que el formulario se pinta entero en los dos idiomas con los valores
 *    guardados ya puestos.
 */

const BASE = apiBaseUrl().replace(/\/+$/, "");

const LOGO_ID = "5d5d5d5d-5d5d-4d5d-8d5d-5d5d5d5d5d5d";

/**
 * Un formulario VALIDO, tecleado como lo teclearia alguien: color en
 * mayusculas, dominio pegado del navegador, prefijos en minusculas.
 */
const VALID = {
  name: "Mi Marca",
  wordmark_lead: "Mi",
  wordmark_tail: "Marca",
  color_brand: "#38BDF8",
  color_accent: "#2563EB",
  pattern_opacity_percent: "16",
  legal_name: "Mi Marca LLC",
  legal_entity_description: "a Texas limited liability company",
  legal_governing_law_state: "Texas",
  legal_venue: "Travis County, Texas",
  legal_street: "123 Main St, Suite 100",
  legal_city_state_zip: "Austin, TX 78701",
  contact_email: "contacto@mimarca.com",
  domain: "https://MiMarca.com/",
  order_prefix: "ord",
  entry_prefix: "num",
  time_zone: "America/Chicago",
  logo_media_id: LOGO_ID,
} as const;

function formWith(overrides: Readonly<Record<string, string>> = {}): FormData {
  const formData = new FormData();
  formData.set("locale", "es");
  for (const [name, value] of Object.entries({ ...VALID, ...overrides })) {
    formData.set(name, value);
  }
  return formData;
}

function capturePut(): { readonly bodies: unknown[] } {
  const bodies: unknown[] = [];
  mockApiServer.use(
    http.put(`${BASE}${API_PATHS.adminBrand}`, async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json(adminBrand);
    }),
  );
  return { bodies };
}

describe("updateBrandAction: lo que se rechaza antes de llamar a la API", () => {
  it("un color que no es #rrggbb es COLOR_INVALID, junto a su campo", async () => {
    const puts = capturePut();

    const result = await updateBrandAction(IDLE, formWith({ color_brand: "azul" }));

    expect(result).toMatchObject({ status: "error", code: "COLOR_INVALID", field: "color_brand" });
    expect(puts.bodies).toHaveLength(0);
  });

  it("un prefijo de nueve letras es PREFIX_INVALID", async () => {
    const puts = capturePut();

    const result = await updateBrandAction(IDLE, formWith({ order_prefix: "PEDIDOSXX" }));

    expect(result).toMatchObject({
      status: "error",
      code: "PREFIX_INVALID",
      field: "order_prefix",
    });
    expect(puts.bodies).toHaveLength(0);
  });

  it("un prefijo con guion es PREFIX_INVALID aunque este en mayusculas", async () => {
    const result = await updateBrandAction(IDLE, formWith({ entry_prefix: "NU-M" }));
    expect(result).toMatchObject({ code: "PREFIX_INVALID", field: "entry_prefix" });
  });

  it("una zona horaria que Intl no conoce es TIMEZONE_INVALID", async () => {
    const puts = capturePut();

    const result = await updateBrandAction(IDLE, formWith({ time_zone: "America/Springfield" }));

    expect(result).toMatchObject({ status: "error", code: "TIMEZONE_INVALID", field: "time_zone" });
    expect(puts.bodies).toHaveLength(0);
  });

  it("un dominio que no es un host es DOMAIN_INVALID", async () => {
    const puts = capturePut();

    const result = await updateBrandAction(IDLE, formWith({ domain: "mi marca" }));

    expect(result).toMatchObject({ status: "error", code: "DOMAIN_INVALID", field: "domain" });
    expect(puts.bodies).toHaveLength(0);
  });

  it("un dominio sin punto (sin TLD) es DOMAIN_INVALID", async () => {
    const result = await updateBrandAction(IDLE, formWith({ domain: "mimarca" }));
    expect(result).toMatchObject({ code: "DOMAIN_INVALID", field: "domain" });
  });

  it("un correo sin arroba es EMAIL_INVALID", async () => {
    const result = await updateBrandAction(
      IDLE,
      formWith({ contact_email: "contacto.mimarca.com" }),
    );
    expect(result).toMatchObject({ code: "EMAIL_INVALID", field: "contact_email" });
  });

  it("un nombre de 61 caracteres es TEXT_TOO_LONG", async () => {
    const result = await updateBrandAction(IDLE, formWith({ name: "x".repeat(61) }));
    expect(result).toMatchObject({ code: "TEXT_TOO_LONG", field: "name" });
  });

  it("un campo legal vacio es FIELD_REQUIRED", async () => {
    const result = await updateBrandAction(IDLE, formWith({ legal_venue: "   " }));
    expect(result).toMatchObject({ code: "FIELD_REQUIRED", field: "legal_venue" });
  });

  it("la intensidad del patron por encima de 40 es PATTERN_OPACITY_INVALID", async () => {
    const result = await updateBrandAction(IDLE, formWith({ pattern_opacity_percent: "41" }));
    expect(result).toMatchObject({
      code: "PATTERN_OPACITY_INVALID",
      field: "pattern_opacity_percent",
    });
  });

  it("un logo_media_id oculto que no es un UUID no viaja", async () => {
    const puts = capturePut();

    const result = await updateBrandAction(IDLE, formWith({ logo_media_id: "../otro" }));

    expect(result).toMatchObject({ status: "error", field: "logo_media_id" });
    expect(puts.bodies).toHaveLength(0);
  });
});

describe("updateBrandAction: lo que sale por el cable", () => {
  it("manda la fila entera NORMALIZADA a PUT /admin/brand y contesta ok", async () => {
    const puts = capturePut();

    const result = await updateBrandAction(IDLE, formWith());

    expect(result).toEqual({
      status: "ok",
      code: null,
      requestId: null,
      field: null,
      retryAfterSeconds: null,
      detail: null,
    });
    expect(puts.bodies).toEqual([
      {
        name: "Mi Marca",
        wordmark: { lead: "Mi", tail: "Marca" },
        legal: {
          name: "Mi Marca LLC",
          entity_description: "a Texas limited liability company",
          governing_law_state: "Texas",
          venue: "Travis County, Texas",
          street: "123 Main St, Suite 100",
          city_state_zip: "Austin, TX 78701",
        },
        contact_email: "contacto@mimarca.com",
        // Sin protocolo, sin barra final y en minusculas.
        domain: "mimarca.com",
        time_zone: "America/Chicago",
        // En mayusculas, como los guarda la API.
        numbering: { order_prefix: "ORD", entry_prefix: "NUM" },
        // En minusculas, como los guarda la API.
        colors: { brand: "#38bdf8", accent: "#2563eb" },
        // Entero, no "16".
        pattern_opacity_percent: 16,
        // El logotipo actual, repetido por el campo oculto: el PUT reemplaza la fila.
        logo_media_id: LOGO_ID,
      },
    ]);
  });

  it("sin logotipo actual ni nuevo, logo_media_id viaja como null", async () => {
    const puts = capturePut();

    await updateBrandAction(IDLE, formWith({ logo_media_id: "" }));

    expect(puts.bodies[0]).toMatchObject({ logo_media_id: null });
  });

  it('"quitar el logotipo" manda null aunque hubiera uno guardado', async () => {
    const puts = capturePut();

    await updateBrandAction(IDLE, formWith({ logo_remove: "on" }));

    expect(puts.bodies[0]).toMatchObject({ logo_media_id: null });
  });

  it("la segunda linea del logotipo de texto puede ir vacia", async () => {
    const puts = capturePut();

    const result = await updateBrandAction(IDLE, formWith({ wordmark_tail: "" }));

    expect(result.status).toBe("ok");
    expect(puts.bodies[0]).toMatchObject({ wordmark: { lead: "Mi", tail: "" } });
  });

  it("un 422 de la API llega como error del formulario con su request_id", async () => {
    mockApiServer.use(
      http.put(`${BASE}${API_PATHS.adminBrand}`, () =>
        HttpResponse.json(
          { error: { code: "VALIDATION_FAILED", request_id: "req_brand_1" } },
          { status: 422 },
        ),
      ),
    );

    const result = await updateBrandAction(IDLE, formWith());

    expect(result).toMatchObject({
      status: "error",
      code: "VALIDATION_FAILED",
      requestId: "req_brand_1",
    });
  });
});

describe("menu del panel", () => {
  function keysFor(capabilities: readonly string[]): readonly string[] {
    return visibleNavFor(toAdminActor({ ...promotionManagerSession, capabilities })).map(
      (item) => item.key,
    );
  }

  it("la entrada de marca sale con brand.read", () => {
    expect(keysFor(["brand.read"])).toEqual(["brand"]);
  });

  it("y no sale sin brand.read, aunque se tenga brand.update o el resto", () => {
    expect(keysFor(["dashboard.read", "brand.update"])).not.toContain("brand");
    expect(keysFor(promotionManagerSession.capabilities ?? [])).not.toContain("brand");
  });

  /*
   * El menu se AGRUPA por uso (Dia a dia, Tienda, Sorteo, Configuracion) y el
   * orden exacto entre grupos es cosa de `navigation.ts`. Lo que importa aqui
   * es que Marca viva en Configuracion, junto a los interruptores, y no entre
   * las secciones del sorteo: es un ajuste del sitio, no una tarea del dia.
   */
  it("va en el grupo de configuracion, junto a los interruptores", () => {
    const brand = ADMIN_NAV.find((item) => item.key === "brand");
    const flags = ADMIN_NAV.find((item) => item.key === "flags");

    expect(brand?.group).toBe("settings");
    expect(brand?.group).toBe(flags?.group);

    // Y sale con las demas secciones visibles, sin desplazar a ninguna.
    const keys = keysFor(["flag.read", "brand.read", "export.snapshot.read"]);
    expect([...keys].sort()).toEqual(["brand", "exports", "flags"]);
  });
});

describe("BrandForm", () => {
  function messagesFor(locale: Locale) {
    return locale === "en" ? enMessages : esMessages;
  }

  it.each(LOCALES)("se pinta entero en %s con los valores guardados", (locale) => {
    const { container } = render(
      <NextIntlClientProvider locale={locale} messages={messagesFor(locale)} timeZone="UTC">
        <BrandForm locale={locale} brand={{ ...adminBrand, logo_media_id: LOGO_ID }} />
      </NextIntlClientProvider>,
    );

    // Ninguna clave sin traducir: next-intl las pintaria como `admin.brand.x`.
    expect(document.body.textContent).not.toContain("admin.brand.");

    // Los valores guardados ya estan en los campos.
    expect(screen.getByDisplayValue(adminBrand.name)).toBeInTheDocument();
    expect(screen.getByDisplayValue(adminBrand.domain)).toBeInTheDocument();
    expect(screen.getByDisplayValue(adminBrand.time_zone)).toBeInTheDocument();

    // El logotipo actual viaja en el campo oculto, y el locale tambien.
    expect(container.querySelector('input[name="logo_media_id"]')).toHaveAttribute(
      "value",
      LOGO_ID,
    );
    expect(container.querySelector('input[name="locale"]')).toHaveAttribute("value", locale);

    // Los dos colores y el patron, con su valor visible al lado.
    expect(container.querySelector('input[type="color"][name="color_brand"]')).toHaveAttribute(
      "value",
      adminBrand.colors.brand,
    );
    expect(screen.getByText(adminBrand.colors.accent)).toBeInTheDocument();
    expect(container.querySelector('input[type="range"]')).toHaveAttribute("max", "40");
  });

  it("agrupa los campos en cinco bloques con rotulo", () => {
    render(
      <NextIntlClientProvider locale="es" messages={esMessages} timeZone="UTC">
        <BrandForm locale="es" brand={adminBrand} />
      </NextIntlClientProvider>,
    );

    for (const legend of [
      esMessages.admin.brand.identityLegend,
      esMessages.admin.brand.colorsLegend,
      esMessages.admin.brand.legalLegend,
      esMessages.admin.brand.contactLegend,
      esMessages.admin.brand.numberingLegend,
    ]) {
      expect(screen.getByRole("group", { name: legend })).toBeInTheDocument();
    }
  });
});
