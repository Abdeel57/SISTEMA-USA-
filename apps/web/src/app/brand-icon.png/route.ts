import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ADMIN_MEDIA_CONTENT_TYPES, apiBaseUrl, mediaPath } from "@/lib/api";
import {
  brandIconVersion,
  DEFAULT_BRAND_ICON_SIZE,
  parseBrandIconSize,
  uploadedLogoFile,
} from "@/lib/brand-icon";
import { renderBrandIcon } from "@/lib/brand-icon-render";
import { effectiveBrandHex } from "@/lib/brand-palette";
import { loadBrand } from "@/lib/brand-server";

/**
 * El icono del sitio con la marca vigente (ver `lib/brand-icon.ts`).
 *
 * Mismo esquema de cache que `/brand-pattern.svg`: los layouts lo enlazan como
 * `/brand-icon.png?s=<lado>&v=<version>`, y la version cambia con el logotipo o
 * el color. Con la `v` vigente se sirve `immutable` un ano; con otra -o sin
 * ninguna- sin cache, para que un cambio en el panel se vea en la siguiente
 * carga y no dentro de un ano.
 *
 * Queda fuera del middleware por llevar punto en la ruta, como `/media/...`.
 */
export const dynamic = "force-dynamic";

/** El simbolo de la plantilla, cuando el panel no ha subido ningun logotipo. */
const DEFAULT_MARK = join(process.cwd(), "public", "brand", "brand-mark.png");

/**
 * Los bytes del logotipo subido, pedidos a la API por la red interna igual que
 * los sirve `/media/[file]`. `null` si no hay logotipo o no se puede leer: el
 * icono cae al simbolo de la plantilla en vez de quedarse sin icono.
 */
async function uploadedLogo(logoUrl: string | null): Promise<Uint8Array | null> {
  const file = uploadedLogoFile(logoUrl);
  if (file === null) return null;

  try {
    const upstream = await fetch(`${apiBaseUrl().replace(/\/+$/, "")}${mediaPath(file)}`, {
      cache: "no-store",
    });
    const contentType = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || !(ADMIN_MEDIA_CONTENT_TYPES as readonly string[]).includes(contentType)) {
      return null;
    }
    return new Uint8Array(await upstream.arrayBuffer());
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const size = parseBrandIconSize(params.get("s")) ?? DEFAULT_BRAND_ICON_SIZE;
  const brand = await loadBrand();
  const borderHex = effectiveBrandHex(brand.colors);

  let png: Buffer;
  try {
    const logo = (await uploadedLogo(brand.logoUrl)) ?? (await readFile(DEFAULT_MARK));
    png = await renderBrandIcon({ logo, borderHex, size });
  } catch {
    // Un logotipo que `sharp` no sabe leer no deja la pestana sin icono.
    try {
      png = await renderBrandIcon({ logo: await readFile(DEFAULT_MARK), borderHex, size });
    } catch {
      return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
    }
  }

  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control":
        params.get("v") === brandIconVersion(brand)
          ? "public, max-age=31536000, immutable"
          : "no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
