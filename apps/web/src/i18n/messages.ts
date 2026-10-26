import { BRAND, withBrand, type BrandProfile } from "@app/brand";

import type { Locale } from "./locales";

/**
 * Carga del diccionario correspondiente a un locale.
 *
 * Los `import()` son estaticos y estan escritos uno a uno a proposito: un
 * import dinamico construido con una plantilla impediria a TypeScript
 * comprobar que ambos archivos existen y tienen la misma forma, que es
 * justamente lo que DEC-021 pide garantizar.
 *
 * `withBrand` sustituye los marcadores `[[brand.*]]` de los textos (nombre de
 * la marca, correo de contacto, dominio) por los de `brand`: en produccion, la
 * marca guardada desde el panel (`loadBrand()` de `lib/brand-server`); por
 * defecto, los valores iniciales de `packages/brand`. Asi los diccionarios no
 * llevan escrito el nombre de ningun cliente.
 */
export async function loadMessages(locale: Locale, brand: BrandProfile = BRAND) {
  switch (locale) {
    case "en":
      return withBrand((await import("../../messages/en-US.json")).default, brand);
    case "es":
      return withBrand((await import("../../messages/es-US.json")).default, brand);
  }
}
