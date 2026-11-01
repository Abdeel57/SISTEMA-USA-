import { cookies, headers } from "next/headers";

import { AD_SHARING_OPT_OUT_COOKIE } from "./meta-pixel";

/**
 * Lo que el layout de la tienda necesita saber EN EL SERVIDOR para pintar el
 * pixel de Meta (DEC-087). Solo se usa desde Server Components.
 */

/**
 * El nonce de la CSP de ESTA peticion, el mismo que usa Next para sus scripts.
 *
 * El middleware lo genera y lo deja en la cabecera `content-security-policy`
 * de la peticion que reenvia al render (ver `middleware.ts`); de ahi lo saca
 * Next, y de ahi se saca aqui. Sin el, un `<script>` en linea no corre.
 */
export async function requestNonce(): Promise<string | null> {
  const policy = (await headers()).get("content-security-policy");
  if (policy === null) return null;
  const match = /'nonce-([A-Za-z0-9+/_-]+={0,2})'/u.exec(policy);
  return match?.[1] ?? null;
}

/**
 * Si el `<noscript>` del pixel puede pintarse en esta peticion: el host es el
 * del sitio, el navegador no envia Global Privacy Control (`Sec-GPC: 1`) y no
 * hay cookie de exclusion. Las mismas reglas que el codigo base aplica en el
 * navegador, con lo que el servidor puede ver.
 */
export async function metaNoscriptAllowed(siteHosts: readonly string[]): Promise<boolean> {
  const requestHeaders = await headers();
  const host = (requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "")
    .split(",")[0]
    ?.trim()
    .toLowerCase()
    .replace(/:\d+$/u, "");

  if (host === undefined || !siteHosts.includes(host)) return false;
  if (requestHeaders.get("sec-gpc") === "1") return false;
  return (await cookies()).get(AD_SHARING_OPT_OUT_COOKIE)?.value !== "1";
}
