import { cache } from "react";

import { fetchSiteConfig } from "./api";
import { runtimeBrandFrom, type RuntimeBrand } from "./brand-runtime";

/**
 * La marca guardada desde el panel, leida EN EL SERVIDOR y una vez por
 * peticion.
 *
 * Sale de `GET /config` (`brand`, §17), que ya se pide sin cache en cada
 * render (DEC-013): un cambio en el panel se ve en la siguiente peticion, sin
 * redesplegar. `cache` de React la comparte entre todo lo que la pide dentro
 * del mismo render -la configuracion de next-intl, el layout, el pie, las
 * paginas legales-, de modo que sigue siendo UNA lectura.
 *
 * SI LA API NO RESPONDE, la web no se queda sin marca: cae a los valores
 * iniciales de `packages/brand`, que son los mismos con los que se sembro la
 * base de datos. Es la postura segura: una pagina con el nombre de la
 * plantilla es mejor que una pagina con `[[brand.name]]` sin sustituir o sin
 * colores.
 *
 * El idioma que se manda es irrelevante para la marca -es la misma en los dos-
 * y se fija para que la clave de la cache sea una.
 */
export const loadBrand = cache(async (): Promise<RuntimeBrand> => {
  const result = await fetchSiteConfig("en");
  return runtimeBrandFrom(result.ok ? (result.data.brand ?? null) : null);
});

/**
 * 0042: si la tienda vende SIN cuentas -solo cobra por Zelle o Venmo-. Con
 * ella, la cabecera no ofrece entrar ni "mi cuenta": se compra apartando con
 * el WhatsApp. La misma lectura de `/config` que la marca. Si la API no
 * responde, se sigue como siempre (con cuentas).
 */
export const loadGuestCheckout = cache(async (): Promise<boolean> => {
  const result = await fetchSiteConfig("en");
  return result.ok && result.data.payment_methods?.guest_checkout === true;
});
