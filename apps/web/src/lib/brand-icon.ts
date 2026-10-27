import type { Metadata } from "next";

import { effectiveBrandHex, shortHash } from "./brand-palette";
import type { RuntimeBrand } from "./brand-runtime";

/**
 * Icono del sitio -pestana, favoritos, pantalla de inicio del telefono y vista
 * previa al compartir- a partir de la marca guardada desde el panel.
 *
 * Antes era un PNG fijo (`src/app/icon.png`) con el simbolo de la plantilla:
 * cada cliente veia el icono de otro hasta que alguien lo regenerara y
 * redesplegara. Ahora lo dibuja `/brand-icon.png` en cada peticion con el
 * logotipo subido y el color de marca, igual que `/brand-pattern.svg`.
 *
 * ESTE MODULO ES PURO: dice QUE URL lleva cada tamano. El dibujo, que necesita
 * `sharp`, esta en `brand-icon-render.ts`.
 */

export const BRAND_ICON_PATH = "/brand-icon.png";

/**
 * Los unicos lados que se sirven. Una lista cerrada y no un numero libre: con
 * `?s=` libre, cualquiera podria pedir iconos de 10.000 px en bucle.
 *
 *   32 / 48   pestana del navegador (pantallas normales y de alta densidad)
 *   180       `apple-touch-icon`: lo que iOS pone en la pantalla de inicio
 *   192       Android y la lista de favoritos
 *   512       la imagen de la vista previa al compartir el enlace
 */
export const BRAND_ICON_SIZES = [32, 48, 180, 192, 512] as const;
export type BrandIconSize = (typeof BRAND_ICON_SIZES)[number];

/** El tamano que se sirve si la peticion no dice uno valido. */
export const DEFAULT_BRAND_ICON_SIZE: BrandIconSize = 48;

/** `/media/<uuid>.<ext>`: lo que guarda el panel al subir el logotipo. */
const UPLOADED_LOGO =
  /^\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp))$/u;

/** El fichero del logotipo subido (`<uuid>.<ext>`), o `null` si no hay ninguno. */
export function uploadedLogoFile(logoUrl: string | null): string | null {
  if (logoUrl === null) return null;
  return UPLOADED_LOGO.exec(logoUrl)?.[1] ?? null;
}

export function parseBrandIconSize(value: string | null): BrandIconSize | null {
  return BRAND_ICON_SIZES.find((size) => String(size) === value) ?? null;
}

/**
 * Version de lo que dibuja el icono: el logotipo y el color del filete. Cambia
 * en cuanto cambia cualquiera de los dos, asi que la URL se puede cachear un ano.
 */
export function brandIconVersion(brand: Pick<RuntimeBrand, "logoUrl" | "colors">): string {
  return shortHash(
    `${uploadedLogoFile(brand.logoUrl) ?? "default"}|${effectiveBrandHex(brand.colors)}`,
  );
}

export function brandIconUrl(
  brand: Pick<RuntimeBrand, "logoUrl" | "colors">,
  size: BrandIconSize,
): string {
  return `${BRAND_ICON_PATH}?s=${String(size)}&v=${brandIconVersion(brand)}`;
}

/** Los `<link rel="icon">` y `apple-touch-icon` de la tienda y del panel. */
export function brandIconsMetadata(
  brand: Pick<RuntimeBrand, "logoUrl" | "colors">,
): NonNullable<Metadata["icons"]> {
  const entry = (size: BrandIconSize) => ({
    url: brandIconUrl(brand, size),
    sizes: `${String(size)}x${String(size)}`,
    type: "image/png",
  });
  return { icon: [entry(32), entry(48), entry(192)], apple: [entry(180)] };
}
