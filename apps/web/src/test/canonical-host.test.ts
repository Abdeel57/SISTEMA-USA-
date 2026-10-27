import { describe, expect, it } from "vitest";

import { canonicalRedirectUrl, canonicalWwwHost } from "@/lib/canonical-host";

/**
 * Redireccion del dominio raiz al `www` (ver `lib/canonical-host.ts`).
 *
 * LO QUE SE VIGILA
 *   1. Solo el dominio raiz del propio sitio redirige, y conserva ruta y consulta.
 *   2. El `www`, la sonda local y cualquier otro host pasan de largo.
 *   3. Un sitio publicado sin `www`, o sin `SITE_URL`, no redirige nada.
 */

const WWW = { SITE_URL: "https://www.cliente.com" };
const url = (path: string) => new URL(`https://cliente.com${path}`);

describe("canonicalWwwHost", () => {
  it("devuelve el host de SITE_URL solo si lleva www", () => {
    expect(canonicalWwwHost(WWW)).toBe("www.cliente.com");
    expect(canonicalWwwHost({ SITE_URL: "https://sorteos.srv2084783.hstgr.cloud" })).toBeNull();
    expect(canonicalWwwHost({ NEXT_PUBLIC_SITE_URL: "https://WWW.Cliente.com/" })).toBe(
      "www.cliente.com",
    );
    expect(canonicalWwwHost({})).toBeNull();
    expect(canonicalWwwHost({ SITE_URL: "no es una url" })).toBeNull();
  });
});

describe("canonicalRedirectUrl", () => {
  it("manda el dominio raiz al www conservando ruta y consulta", () => {
    const destination = canonicalRedirectUrl(WWW, "cliente.com", url("/es/shop?cursor=abc"));
    expect(destination?.toString()).toBe("https://www.cliente.com/es/shop?cursor=abc");
  });

  it("ignora el puerto y las mayusculas de la cabecera Host", () => {
    expect(canonicalRedirectUrl(WWW, "Cliente.COM:443", url("/"))?.toString()).toBe(
      "https://www.cliente.com/",
    );
  });

  it("no arrastra el puerto interno del contenedor ni el http del proxy", () => {
    // Detras de Traefik, la URL que ve el middleware es la interna.
    const internal = new URL("http://cliente.com:8080/es/cart?x=1");
    expect(canonicalRedirectUrl(WWW, "cliente.com", internal)?.toString()).toBe(
      "https://www.cliente.com/es/cart?x=1",
    );
  });

  it("no toca el www, la sonda local ni otros hosts", () => {
    expect(canonicalRedirectUrl(WWW, "www.cliente.com", url("/es"))).toBeNull();
    expect(canonicalRedirectUrl(WWW, "127.0.0.1:8080", url("/healthz"))).toBeNull();
    expect(canonicalRedirectUrl(WWW, "sorteos.srv2084783.hstgr.cloud", url("/es"))).toBeNull();
    expect(canonicalRedirectUrl(WWW, "api.cliente.com", url("/es"))).toBeNull();
    expect(canonicalRedirectUrl(WWW, null, url("/es"))).toBeNull();
  });

  it("sin www en SITE_URL no redirige nada", () => {
    expect(
      canonicalRedirectUrl({ SITE_URL: "https://cliente.com" }, "cliente.com", url("/es")),
    ).toBeNull();
    expect(canonicalRedirectUrl({}, "cliente.com", url("/es"))).toBeNull();
  });
});
