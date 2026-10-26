import { BRAND } from "@app/brand";
import { describe, expect, it } from "vitest";

import {
  adminCssVariables,
  adminThemeCss,
  brandCssVariables,
  brandThemeCss,
  contrastRatio,
  DEFAULT_BRAND_COLORS,
  effectiveBrandHex,
  ensureContrast,
  parseHex,
  patternVersion,
  storeLightCssVariables,
  storeLightThemeCss,
  SURFACES,
  toHex,
  type Rgb,
} from "@/lib/brand-palette";
import { DEFAULT_RUNTIME_BRAND, runtimeBrandFrom, siteHostsOf } from "@/lib/brand-runtime";
import { defaultBrand } from "@/mocks/fixtures/config";

/**
 * La marca en tiempo de ejecucion (migracion 0040): la paleta que se deriva de
 * los dos colores del panel y la traduccion de `GET /config` -> `brand`.
 *
 * LO QUE SE VIGILA
 *   1. Los tokens derivados cumplen AA (4,5:1) donde llevan texto, elija el
 *      color que elija el administrador: titulares sobre negro, tinta sobre la
 *      banda clara, texto sobre los rellenos.
 *   2. Un color de marca demasiado oscuro para el fondo se aclara; uno que ya
 *      se lee no se toca.
 *   3. La hoja en linea es CSS valido con la forma que consumen los tokens.
 *   4. Sin `brand` en la respuesta, todo son los valores iniciales de
 *      `packages/brand`, y con el, lo guardado.
 */

const channelsOf = (value: string): Rgb => {
  const [r = 0, g = 0, b = 0] = value.split(" ").map(Number);
  return { r, g, b };
};

/** `parseHex` que falla ruidosamente: en un test, un hex mal escrito es un error del test. */
const rgb = (hex: string): Rgb => {
  const parsed = parseHex(hex);
  if (parsed === null) throw new Error(`hex invalido en el test: ${hex}`);
  return parsed;
};

describe("paleta derivada", () => {
  it("parsea y serializa hex", () => {
    expect(parseHex("#38bdf8")).toEqual({ r: 56, g: 189, b: 248 });
    expect(parseHex("#38BDF8")).toEqual({ r: 56, g: 189, b: 248 });
    expect(parseHex("38bdf8")).toBeNull();
    expect(parseHex("#fff")).toBeNull();
    expect(toHex({ r: 56, g: 189, b: 248 })).toBe("#38bdf8");
  });

  it("mide el contraste como WCAG", () => {
    expect(contrastRatio({ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 })).toBeCloseTo(21, 1);
    expect(contrastRatio({ r: 56, g: 189, b: 248 }, SURFACES.bg)).toBeGreaterThan(9);
  });

  it("no toca un color que ya contrasta y aclara uno que no (invariante 2)", () => {
    const readable = rgb("#38bdf8");
    expect(ensureContrast(readable, SURFACES.bg, 4.5, "lighter")).toEqual(readable);

    const navy = rgb("#0b1a3a");
    const lifted = ensureContrast(navy, SURFACES.bg, 4.5, "lighter");
    expect(contrastRatio(lifted, SURFACES.bg)).toBeGreaterThanOrEqual(4.5);
    expect(effectiveBrandHex({ brand: "#0b1a3a", accent: "#2563eb" })).not.toBe("#0b1a3a");
  });

  it.each([
    ["azul de la plantilla", DEFAULT_BRAND_COLORS],
    ["rojo y amarillo", { brand: "#e10012", accent: "#ffd400" }],
    ["marino oscuro y verde", { brand: "#0b1a3a", accent: "#15803d" }],
    ["blanco y negro", { brand: "#ffffff", accent: "#000000" }],
    ["oro y rojo", { brand: "#c9a227", accent: "#cf1a22" }],
  ])("cumple AA donde lleva texto: %s (invariante 1)", (_label, colors) => {
    const tokens = brandCssVariables(colors);

    // Marca como texto sobre el fondo oscuro.
    expect(
      contrastRatio(channelsOf(tokens["--app-color-brand"] ?? ""), SURFACES.bg),
    ).toBeGreaterThanOrEqual(4.5);
    // Tinta de marca sobre la banda clara.
    expect(
      contrastRatio(channelsOf(tokens["--app-color-light-gold"] ?? ""), SURFACES.lightBg),
    ).toBeGreaterThanOrEqual(4.5);
    // Texto de acento sobre el fondo oscuro y tinta de acento sobre la banda clara.
    expect(
      contrastRatio(channelsOf(tokens["--app-color-accent-text"] ?? ""), SURFACES.bg),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(channelsOf(tokens["--app-color-light-accent"] ?? ""), SURFACES.lightBg),
    ).toBeGreaterThanOrEqual(4.5);
    // Texto sobre los rellenos: el mejor de blanco o casi negro.
    const accent = channelsOf(tokens["--app-color-accent"] ?? "");
    const onAccent = channelsOf(tokens["--app-color-on-accent"] ?? "");
    expect(contrastRatio(accent, onAccent)).toBeGreaterThanOrEqual(3);
    const brand = channelsOf(tokens["--app-color-brand"] ?? "");
    const onBrand = channelsOf(tokens["--app-color-on-brand"] ?? "");
    expect(contrastRatio(brand, onBrand)).toBeGreaterThanOrEqual(4.5);
  });

  it("con los colores de la plantilla reproduce los tokens de tokens.css", () => {
    const tokens = brandCssVariables(DEFAULT_BRAND_COLORS);
    expect(tokens["--app-color-brand"]).toBe("56 189 248");
    expect(tokens["--app-color-accent"]).toBe("37 99 235");
    expect(tokens["--app-color-on-accent"]).toBe("255 255 255");
    expect(tokens["--app-color-on-brand"]).toBe("8 10 14");
  });

  it("cae al color inicial si llega un hex invalido", () => {
    expect(brandCssVariables({ brand: "rojo", accent: "#2563eb" })["--app-color-brand"]).toBe(
      "56 189 248",
    );
  });

  it("nunca toca el ROJO DE COMPRA: los botones de compra y la franja son rojos con cualquier marca", () => {
    for (const colors of [DEFAULT_BRAND_COLORS, { brand: "#ffd400", accent: "#e8e000" }]) {
      const tokens = brandCssVariables(colors);
      expect(Object.keys(tokens).filter((name) => name.startsWith("--app-color-buy"))).toEqual([]);
      expect(tokens).not.toHaveProperty("--app-color-on-buy");
      expect(brandThemeCss(colors, 16)).not.toContain("--app-color-buy");
    }
  });

  it("compone una hoja :root:root con todos los tokens y el patron versionado (invariante 3)", () => {
    const css = brandThemeCss(DEFAULT_BRAND_COLORS, 16);
    expect(css.startsWith(":root:root{")).toBe(true);
    expect(css.endsWith("}")).toBe(true);
    expect(css).toContain("--app-color-brand:56 189 248");
    expect(css).toContain(
      `--app-pattern-topo:url("/brand-pattern.svg?v=${patternVersion(DEFAULT_BRAND_COLORS, 16)}")`,
    );
    // Nada que un `<style>` no pueda llevar.
    expect(css).not.toMatch(/[<>]/u);
  });

  it("la version del patron cambia con el color o la intensidad, y no con nada mas", () => {
    const base = patternVersion(DEFAULT_BRAND_COLORS, 16);
    expect(patternVersion(DEFAULT_BRAND_COLORS, 16)).toBe(base);
    expect(patternVersion({ ...DEFAULT_BRAND_COLORS, accent: "#000000" }, 16)).toBe(base);
    expect(patternVersion(DEFAULT_BRAND_COLORS, 17)).not.toBe(base);
    expect(patternVersion({ ...DEFAULT_BRAND_COLORS, brand: "#e10012" }, 16)).not.toBe(base);
    expect(base).toMatch(/^[0-9a-f]{8}$/u);
  });
});

describe("tema claro del panel", () => {
  const ADMIN_BG = channelsOf("242 244 248");
  const WHITE = channelsOf("255 255 255");

  it.each([
    ["azul de la plantilla", DEFAULT_BRAND_COLORS],
    ["rojo y amarillo", { brand: "#e10012", accent: "#ffd400" }],
    ["marino oscuro y verde", { brand: "#0b1a3a", accent: "#15803d" }],
    ["blanco y negro", { brand: "#ffffff", accent: "#000000" }],
    ["oro y rojo", { brand: "#c9a227", accent: "#cf1a22" }],
  ])("la marca se lee sobre el gris y el blanco del panel: %s", (_label, colors) => {
    const tokens = adminCssVariables(colors);
    const brand = channelsOf(tokens["--app-color-brand"] ?? "");

    // La marca es texto (menu activo, enlaces, botones de contorno).
    expect(contrastRatio(brand, ADMIN_BG)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(brand, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(channelsOf(tokens["--app-color-accent-text"] ?? ""), ADMIN_BG),
    ).toBeGreaterThanOrEqual(4.5);
    // El texto de los rellenos.
    expect(
      contrastRatio(brand, channelsOf(tokens["--app-color-on-brand"] ?? "")),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(
        channelsOf(tokens["--app-color-accent"] ?? ""),
        channelsOf(tokens["--app-color-on-accent"] ?? ""),
      ),
    ).toBeGreaterThanOrEqual(3);
  });

  it("los textos fijos y los estados cumplen AA sobre el fondo gris", () => {
    const tokens = adminCssVariables(DEFAULT_BRAND_COLORS);
    for (const name of [
      "--app-color-text",
      "--app-color-text-muted",
      "--app-color-text-subtle",
      "--app-color-success",
      "--app-color-warning",
      "--app-color-danger",
      "--app-color-info",
    ]) {
      expect(contrastRatio(channelsOf(tokens[name] ?? ""), ADMIN_BG), name).toBeGreaterThanOrEqual(
        4.5,
      );
    }
    // El contorno de los campos: 3:1 sobre el blanco (WCAG 1.4.11).
    expect(
      contrastRatio(channelsOf(tokens["--app-color-border-strong"] ?? ""), WHITE),
    ).toBeGreaterThanOrEqual(3);
  });

  it("es una hoja clara, sin patron y sin el rojo de compra", () => {
    const css = adminThemeCss(DEFAULT_BRAND_COLORS);
    expect(css.startsWith(":root:root{")).toBe(true);
    expect(css).toContain("--app-color-bg:242 244 248");
    expect(css).toContain("color-scheme:light");
    expect(css).toContain("--app-pattern-topo:none");
    expect(css).not.toContain("--app-color-buy");
    expect(css).not.toMatch(/[<>]/u);
  });
});

describe("paginas interiores de la tienda en claro (2026-10-13)", () => {
  const WHITE = channelsOf("255 255 255");

  it.each([
    ["azul de la plantilla", DEFAULT_BRAND_COLORS],
    ["rojo y amarillo", { brand: "#e10012", accent: "#ffd400" }],
    ["blanco y negro", { brand: "#ffffff", accent: "#000000" }],
    ["oro y rojo", { brand: "#c9a227", accent: "#cf1a22" }],
  ])("la pagina es blanca y la marca se lee sobre ella: %s", (_label, colors) => {
    const tokens = storeLightCssVariables(colors);
    expect(tokens["--app-color-bg"]).toBe("255 255 255");

    const brand = channelsOf(tokens["--app-color-brand"] ?? "");
    expect(contrastRatio(brand, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(brand, channelsOf(tokens["--app-color-on-brand"] ?? "")),
    ).toBeGreaterThanOrEqual(4.5);
    for (const name of ["--app-color-text", "--app-color-text-muted", "--app-color-text-subtle"]) {
      expect(contrastRatio(channelsOf(tokens[name] ?? ""), WHITE), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("es una hoja acotada a `.app-theme-light`: no toca la portada, ni el rojo de compra ni el oro", () => {
    const css = storeLightThemeCss(DEFAULT_BRAND_COLORS);
    expect(css.startsWith(".app-theme-light{")).toBe(true);
    expect(css.endsWith("}")).toBe(true);
    expect(css).toContain("color-scheme:light");
    expect(css).not.toContain(":root");
    expect(css).not.toContain("--app-color-buy");
    expect(css).not.toContain("--app-color-gold");
    // Las letras de marca se quedan: eso es lo unico del panel que no se copia.
    expect(css).not.toContain("--app-font-");
    expect(css).not.toMatch(/[<>]/u);
  });
});

describe("runtimeBrandFrom", () => {
  it("sin `brand` en la respuesta usa los valores iniciales (invariante 4)", () => {
    const brand = runtimeBrandFrom(null);
    expect(brand.fromApi).toBe(false);
    expect(brand.profile).toBe(BRAND);
    expect(brand.colors).toEqual(DEFAULT_BRAND_COLORS);
    expect(brand.patternOpacityPercent).toBe(16);
    expect(brand.logoUrl).toBeNull();
    expect(brand.siteHosts).toEqual([BRAND.domain, `www.${BRAND.domain}`]);
    expect(DEFAULT_RUNTIME_BRAND).toEqual(brand);
  });

  it("con `brand` traduce cada campo a la forma de packages/brand (invariante 4)", () => {
    const brand = runtimeBrandFrom({
      ...defaultBrand,
      name: "Ruta Norte",
      wordmark: { lead: "Ruta", tail: "Norte" },
      domain: "RutaNorte.com",
      colors: { brand: "#E10012", accent: "#FFD400" },
      pattern_opacity_percent: 22,
      logo_url: "/media/5d5d5d5d-5d5d-4d5d-8d5d-5d5d5d5d5d5d.png",
      legal: { ...defaultBrand.legal, venue: "Harris County, Texas" },
      time_zone: "America/Denver",
    });

    expect(brand.fromApi).toBe(true);
    expect(brand.profile.name).toBe("Ruta Norte");
    expect(brand.profile.wordmark).toEqual({ lead: "Ruta", tail: "Norte" });
    expect(brand.profile.legal.venue).toBe("Harris County, Texas");
    expect(brand.profile.legal.entityDescription).toBe(defaultBrand.legal.entity_description);
    expect(brand.profile.timeZone).toBe("America/Denver");
    expect(brand.colors).toEqual({ brand: "#e10012", accent: "#ffd400" });
    expect(brand.patternOpacityPercent).toBe(22);
    expect(brand.logoUrl).toBe("/media/5d5d5d5d-5d5d-4d5d-8d5d-5d5d5d5d5d5d.png");
    expect(brand.siteHosts).toEqual(["rutanorte.com", "www.rutanorte.com"]);
    expect(brand.themeCss).toContain("--app-color-brand:");
  });

  it("acota la intensidad del patron a 0..40", () => {
    expect(
      runtimeBrandFrom({ ...defaultBrand, pattern_opacity_percent: 99 }).patternOpacityPercent,
    ).toBe(40);
    expect(
      runtimeBrandFrom({ ...defaultBrand, pattern_opacity_percent: -3 }).patternOpacityPercent,
    ).toBe(0);
  });

  it("siteHostsOf no duplica el www", () => {
    expect(siteHostsOf("www.Example.com")).toEqual(["example.com", "www.example.com"]);
    expect(siteHostsOf("example.com")).toEqual(["example.com", "www.example.com"]);
  });
});
