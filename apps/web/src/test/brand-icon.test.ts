// @vitest-environment node
//
// El manejador de ruta y `sharp` corren en Node. Ver la misma nota en
// `media-route.test.ts`.

import { http, HttpResponse } from "msw";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { GET } from "@/app/brand-icon.png/route";
import { API_PATHS, apiBaseUrl } from "@/lib/api";
import {
  brandIconsMetadata,
  brandIconUrl,
  brandIconVersion,
  parseBrandIconSize,
  uploadedLogoFile,
} from "@/lib/brand-icon";
import { renderBrandIcon } from "@/lib/brand-icon-render";
import { DEFAULT_BRAND_COLORS } from "@/lib/brand-palette";
import { DEFAULT_RUNTIME_BRAND } from "@/lib/brand-runtime";
import { defaultBrand, defaultConfig } from "@/mocks/fixtures/config";
import { mockApiServer } from "@/mocks/node";

/**
 * El icono del sitio con la marca guardada desde el panel.
 *
 * LO QUE SE VIGILA
 *   1. El icono sale del logotipo subido y, sin el, del simbolo de la plantilla.
 *   2. Siempre es CUADRADO y del lado pedido, aunque el logotipo no lo sea.
 *   3. La URL cambia con el logotipo o el color, y solo la vigente se cachea.
 *   4. Solo se sirven los lados de la lista: nada de iconos a medida.
 */

const BASE = apiBaseUrl().replace(/\/+$/, "");
const LOGO_FILE = "5d5d5d5d-5d5d-4d5d-8d5d-5d5d5d5d5d5d.png";

/** Un logotipo apaisado de color plano: lo que se encaja, no se estira. */
async function wideLogo(): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({
      create: {
        width: 300,
        height: 100,
        channels: 4,
        background: { r: 220, g: 20, b: 60, alpha: 1 },
      },
    })
      .png()
      .toBuffer(),
  );
}

async function sizeOf(
  response: Response,
): Promise<{ width?: number; height?: number; format?: string }> {
  const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
  return { width: meta.width, height: meta.height, format: meta.format };
}

/** El color del pixel central: dentro de la placa, es el del logotipo. */
async function centerPixel(png: Uint8Array): Promise<readonly number[]> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const middle =
    (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
  return [...data.subarray(middle, middle + 3)];
}

function get(query: string): Promise<Response> {
  return GET(new Request(`http://localhost:3000/brand-icon.png${query}`));
}

function serveBrandWithLogo(logo: Uint8Array): void {
  mockApiServer.use(
    http.get(`${BASE}${API_PATHS.siteConfig}`, () =>
      HttpResponse.json({
        ...defaultConfig,
        brand: { ...defaultBrand, logo_url: `/media/${LOGO_FILE}` },
      }),
    ),
    http.get(`${BASE}/media/${LOGO_FILE}`, () =>
      HttpResponse.arrayBuffer(logo.slice().buffer, { headers: { "content-type": "image/png" } }),
    ),
  );
}

describe("lib/brand-icon", () => {
  it("reconoce solo el logotipo subido desde el panel", () => {
    expect(uploadedLogoFile(`/media/${LOGO_FILE}`)).toBe(LOGO_FILE);
    expect(uploadedLogoFile(null)).toBeNull();
    expect(uploadedLogoFile("/brand/brand-mark.png")).toBeNull();
    expect(uploadedLogoFile("https://example.com/logo.png")).toBeNull();
    expect(uploadedLogoFile(`/media/../${LOGO_FILE}`)).toBeNull();
  });

  it("solo admite los lados de la lista", () => {
    expect(parseBrandIconSize("48")).toBe(48);
    expect(parseBrandIconSize("512")).toBe(512);
    expect(parseBrandIconSize("10000")).toBeNull();
    expect(parseBrandIconSize("48.0")).toBeNull();
    expect(parseBrandIconSize(null)).toBeNull();
  });

  it("la version cambia con el logotipo y con el color", () => {
    const base = { logoUrl: null, colors: DEFAULT_BRAND_COLORS };
    const withLogo = { ...base, logoUrl: `/media/${LOGO_FILE}` };
    const otherColor = { ...base, colors: { ...DEFAULT_BRAND_COLORS, brand: "#dc143c" } };

    expect(brandIconVersion(withLogo)).not.toBe(brandIconVersion(base));
    expect(brandIconVersion(otherColor)).not.toBe(brandIconVersion(base));
    expect(brandIconVersion(base)).toBe(brandIconVersion({ ...base }));
  });

  it("declara el icono de pestana y el de la pantalla de inicio", () => {
    const icons = brandIconsMetadata(DEFAULT_RUNTIME_BRAND);
    const version = brandIconVersion(DEFAULT_RUNTIME_BRAND);

    expect(icons).toEqual({
      icon: [
        { url: `/brand-icon.png?s=32&v=${version}`, sizes: "32x32", type: "image/png" },
        { url: `/brand-icon.png?s=48&v=${version}`, sizes: "48x48", type: "image/png" },
        { url: `/brand-icon.png?s=192&v=${version}`, sizes: "192x192", type: "image/png" },
      ],
      apple: [{ url: `/brand-icon.png?s=180&v=${version}`, sizes: "180x180", type: "image/png" }],
    });
  });
});

describe("renderBrandIcon", () => {
  it("encaja un logotipo apaisado en un cuadrado del lado pedido", async () => {
    const png = await renderBrandIcon({ logo: await wideLogo(), borderHex: "#38bdf8", size: 180 });
    const meta = await sharp(png).metadata();

    expect(meta.format).toBe("png");
    expect(meta.width).toBe(180);
    expect(meta.height).toBe(180);
  });
});

describe("GET /brand-icon.png", () => {
  it("sin logotipo subido, dibuja el simbolo de la plantilla", async () => {
    const response = await get("?s=48");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(await sizeOf(response)).toEqual({ width: 48, height: 48, format: "png" });
  });

  it("con logotipo subido, lo usa y cachea solo la version vigente", async () => {
    serveBrandWithLogo(await wideLogo());
    const brand = {
      logoUrl: `/media/${LOGO_FILE}`,
      colors: { brand: defaultBrand.colors.brand, accent: defaultBrand.colors.accent },
    };
    const current = brandIconUrl(brand, 512);

    const fresh = await get(current.slice("/brand-icon.png".length));
    expect(fresh.status).toBe(200);
    expect(fresh.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    const png = new Uint8Array(await fresh.arrayBuffer());
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height]).toEqual([512, 512]);
    // El centro es el carmesi del logotipo, no el simbolo de la plantilla.
    expect(await centerPixel(png)).toEqual([220, 20, 60]);

    serveBrandWithLogo(await wideLogo());
    const stale = await get("?s=512&v=00000000");
    expect(stale.headers.get("cache-control")).toBe("no-store");
  });

  it("si el logotipo no se puede leer, cae al simbolo de la plantilla", async () => {
    serveBrandWithLogo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]));

    const response = await get("?s=32");

    expect(response.status).toBe(200);
    expect(await sizeOf(response)).toEqual({ width: 32, height: 32, format: "png" });
  });

  it("un lado fuera de la lista se sirve con el lado por defecto", async () => {
    const response = await get("?s=10000");

    expect(await sizeOf(response)).toEqual({ width: 48, height: 48, format: "png" });
  });
});
