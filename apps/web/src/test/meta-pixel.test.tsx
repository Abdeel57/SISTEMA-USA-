import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({ pathname: "/es" }));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("next-intl", () => ({ useLocale: () => "es" }));

import { BRAND } from "@app/brand";

import { MetaEventOnMount, MetaPurchaseOnMount, useMetaAddToCart } from "@/components/meta-events";
import { MetaPixelBase, MetaPixelNoscript } from "@/components/meta-pixel";
import { MetaPixelTracker } from "@/components/meta-pixel-tracker";
import type { CartActionResult } from "@/lib/cart-actions";
import {
  hasAdSharingOptOut,
  isMetaPixelExcludedPath,
  metaPixelAllowed,
  metaPixelBaseScript,
  metaPixelHosts,
  normalizeMetaPixelId,
} from "@/lib/meta-pixel";
import {
  META_PURCHASE_SENT_PREFIX,
  metaMoneyParams,
  metaValueOf,
  syncMetaPageView,
  trackMetaEvent,
  trackMetaPurchaseOnce,
} from "@/lib/meta-pixel-events";

/**
 * Pixel de Meta (DEC-086, DEC-087).
 *
 * El identificador sale del panel (Marca), por sitio. Lo que importa aqui:
 *   1. sin identificador valido no se carga nada, y no se puede inyectar nada;
 *   2. NO se carga en otro dominio, con GPC ni con la exclusion de
 *      `/privacychoices` (lo que prometen la Politica y la CCPA);
 *   3. se inicializa una sola vez y cada pagina manda un `PageView`;
 *   4. los eventos de compra llevan sus importes y `Purchase` sale UNA vez por
 *      pedido, con el id del pedido como `eventID`.
 */

const PIXEL = "123456789012345";
const HOSTS = [BRAND.domain.toLowerCase(), `www.${BRAND.domain.toLowerCase()}`];

/** Las llamadas encoladas en `fbq` antes de que llegue `fbevents.js`, como arrays. */
function fbqCalls(): unknown[][] {
  const fbq = window.fbq as unknown as { queue?: ArrayLike<unknown>[] } | undefined;
  return (fbq?.queue ?? []).map((call) => Array.from(call));
}

function goTo(pathname: string, hostname: string = BRAND.domain): void {
  vi.stubGlobal("location", { ...window.location, hostname, pathname });
  route.pathname = pathname;
}

/** Ejecuta el codigo base como lo haria el `<script>` del `<head>`. */
function runBaseScript(pixelId = PIXEL): void {
  // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- como el navegador con el <script> en linea
  new Function(metaPixelBaseScript({ pixelId, hosts: HOSTS, locales: ["es", "en"] }))();
}

function resetPixel(): void {
  delete window.fbq;
  delete (window as { _fbq?: unknown })._fbq;
  delete window.__appMetaPixel;
  document.head.querySelectorAll('script[src*="facebook"]').forEach((script) => script.remove());
  // El fragmento de Meta inserta `fbevents.js` junto al primer `<script>`; en la
  // pagina real siempre existe (es el propio codigo base).
  if (document.getElementsByTagName("script").length === 0) {
    document.head.appendChild(document.createElement("script"));
  }
  document.cookie = "app_ad_sharing_opt_out=; max-age=0; path=/";
  window.localStorage.clear();
}

beforeEach(() => {
  resetPixel();
  goTo("/es");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("el identificador del pixel (Panel -> Marca)", () => {
  it("sin identificador o con otra forma, no hay pixel", () => {
    expect(normalizeMetaPixelId(null)).toBeNull();
    expect(normalizeMetaPixelId(undefined)).toBeNull();
    expect(normalizeMetaPixelId("")).toBeNull();
    expect(normalizeMetaPixelId("1234567")).toBeNull();
    expect(normalizeMetaPixelId("12345abc6789")).toBeNull();
    expect(normalizeMetaPixelId("123');alert(1);//")).toBeNull();
    expect(normalizeMetaPixelId(` ${PIXEL} `)).toBe(PIXEL);
  });

  it("con otra forma el codigo base queda vacio: nada que inyectar", () => {
    expect(
      metaPixelBaseScript({ pixelId: "</script><script>alert(1)", hosts: HOSTS, locales: ["es"] }),
    ).toBe("");
  });

  it("ningun valor puede cerrar la etiqueta <script>, aunque un host lo trajera", () => {
    const script = metaPixelBaseScript({
      pixelId: PIXEL,
      hosts: ["</script>.com"],
      locales: ["es"],
    });
    expect(script).not.toMatch(/<\/script/iu);
    // El `<` del host viaja escapado como `\u003c`, que JavaScript lee igual.
    expect(script).toContain(String.raw`\u003c/script>.com`);
  });

  it("dispara en el dominio de Marca y en el del despliegue, nunca en local", () => {
    expect(metaPixelHosts(HOSTS, {})).toEqual(HOSTS);
    expect(metaPixelHosts(["mimarca.com"], { SITE_URL: "https://www.cliente.com" })).toEqual([
      "mimarca.com",
      "cliente.com",
      "www.cliente.com",
    ]);
    for (const local of [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://sorteos.test:3200",
      "no es una url",
    ]) {
      expect(metaPixelHosts(["mimarca.com"], { SITE_URL: local })).toEqual(["mimarca.com"]);
    }
  });
});

describe("donde y para quien dispara", () => {
  const base = { hostname: BRAND.domain, globalPrivacyControl: false, cookieHeader: "" };

  it("en el dominio real, sin exclusion, si", () => {
    expect(metaPixelAllowed(base)).toBe(true);
    expect(metaPixelAllowed({ ...base, hostname: `www.${BRAND.domain}` })).toBe(true);
  });

  it("en local o en otro dominio, no", () => {
    expect(metaPixelAllowed({ ...base, hostname: "localhost" })).toBe(false);
    expect(metaPixelAllowed({ ...base, hostname: "otro.com" })).toBe(false);
  });

  it("con Global Privacy Control o con la exclusion de /privacychoices, no", () => {
    expect(metaPixelAllowed({ ...base, globalPrivacyControl: true })).toBe(false);
    expect(hasAdSharingOptOut("a=1; app_ad_sharing_opt_out=1")).toBe(true);
    expect(metaPixelAllowed({ ...base, cookieHeader: "app_ad_sharing_opt_out=1" })).toBe(false);
  });

  it("nunca en la cuenta ni en la vuelta de la pasarela; si en checkout y confirmacion", () => {
    expect(isMetaPixelExcludedPath("/account")).toBe(true);
    expect(isMetaPixelExcludedPath("/account/orders/abc")).toBe(true);
    expect(isMetaPixelExcludedPath("/checkout/return")).toBe(true);
    expect(isMetaPixelExcludedPath("/checkout")).toBe(false);
    expect(isMetaPixelExcludedPath("/orders/abc/confirmation")).toBe(false);
    expect(isMetaPixelExcludedPath("/accounting")).toBe(false);
  });
});

describe("el codigo base del <head>", () => {
  it("en el dominio real carga fbevents.js, inicializa y manda el primer PageView", () => {
    runBaseScript();

    const script = document.head.querySelector<HTMLScriptElement>('script[src*="facebook"]');
    expect(script?.src).toBe("https://connect.facebook.net/en_US/fbevents.js");
    expect(script?.async).toBe(true);
    expect(fbqCalls()).toEqual([
      ["set", "autoConfig", false, PIXEL],
      ["init", PIXEL],
      ["track", "PageView"],
    ]);
    const fbq = window.fbq as unknown as Record<string, unknown>;
    expect(fbq.disablePushState).toBe(true);
    expect(fbq.allowDuplicatePageViews).toBe(true);
    expect(window.__appMetaPixel?.status).toBe("ready");
  });

  it("se inicializa UNA vez aunque el codigo corra dos veces", () => {
    runBaseScript();
    runBaseScript();
    expect(fbqCalls().filter((call) => call[0] === "init")).toHaveLength(1);
  });

  it.each([
    ["otro dominio", () => goTo("/es", "localhost")],
    ["Global Privacy Control", () => vi.stubGlobal("navigator", { globalPrivacyControl: true })],
    [
      "la exclusion de /privacychoices",
      () => (document.cookie = "app_ad_sharing_opt_out=1; path=/"),
    ],
  ])("con %s no carga nada", (_label, setUp) => {
    setUp();
    runBaseScript();
    expect(window.fbq).toBeUndefined();
    expect(document.head.querySelector('script[src*="facebook"]')).toBeNull();
    expect(window.__appMetaPixel?.status).toBe("blocked");
    expect(trackMetaEvent("ViewContent", { value: 1, currency: "USD" })).toBe(false);
  });

  it("entrando por la cuenta no carga; al pasar a la tienda sin recargar, si", () => {
    goTo("/es/account/orders/abc");
    runBaseScript();
    expect(window.fbq).toBeUndefined();
    expect(window.__appMetaPixel?.status).toBe("excluded");

    goTo("/es/shop");
    expect(syncMetaPageView()).toBe(true);
    expect(fbqCalls().at(-1)).toEqual(["track", "PageView"]);
  });
});

describe("PageView al navegar y eventos al pulsar (MetaPixelTracker)", () => {
  it("un PageView por pagina nueva, y ninguno repetido", () => {
    runBaseScript();
    const { rerender } = render(<MetaPixelTracker />);
    // El de la primera pagina ya lo mando el <head>.
    expect(fbqCalls().filter((call) => call[1] === "PageView")).toHaveLength(1);

    goTo("/es/shop");
    rerender(<MetaPixelTracker />);
    goTo("/es/products/gorra");
    rerender(<MetaPixelTracker />);

    expect(fbqCalls().filter((call) => call[1] === "PageView")).toHaveLength(3);
  });

  it("al pulsar un boton marcado envia su evento, y solo los de la lista", () => {
    runBaseScript();
    render(
      <>
        <MetaPixelTracker />
        <a href="#packages" data-meta-event="CompleteRegistration">
          Comprar ahora
        </a>
        <a href="#otro" data-meta-event="Purchase">
          Otro
        </a>
      </>,
    );

    fireEvent.click(screen.getByText("Comprar ahora"));
    fireEvent.click(screen.getByText("Otro"));

    expect(fbqCalls().at(-1)).toEqual(["track", "CompleteRegistration", {}]);
    expect(fbqCalls().filter((call) => call[1] === "Purchase")).toEqual([]);
  });

  it("si la persona se excluye despues de cargar, no sale nada mas", () => {
    runBaseScript();
    document.cookie = "app_ad_sharing_opt_out=1; path=/";
    expect(trackMetaEvent("AddToCart", { value: 5, currency: "USD" })).toBe(false);
    expect(fbqCalls().filter((call) => call[1] === "AddToCart")).toEqual([]);
  });
});

describe("eventos de compra", () => {
  it("convierte los importes del contrato al `value` de Meta", () => {
    expect(metaValueOf({ amount_minor: "2500", currency: "USD" })).toBe(25);
    expect(metaValueOf({ amount_minor: "499", currency: "USD" })).toBe(4.99);
    expect(metaValueOf({ amount_minor: "abc", currency: "USD" })).toBeNull();
    expect(metaMoneyParams({ amount_minor: "10000", currency: "usd" })).toEqual({
      value: 100,
      currency: "USD",
    });
    expect(metaMoneyParams(null)).toEqual({});
  });

  it("sin pixel en el sitio nada falla: simplemente no se envia", () => {
    expect(trackMetaEvent("ViewContent", { value: 10, currency: "USD" })).toBe(false);
    expect(trackMetaPurchaseOnce("pedido-1", { value: 10, currency: "USD" })).toBe(false);
  });

  it("ViewContent e InitiateCheckout salen al montar, una vez (tambien en StrictMode)", () => {
    runBaseScript();
    render(
      <StrictMode>
        <MetaEventOnMount
          event="ViewContent"
          params={{
            content_ids: ["PAQ-ORO"],
            content_name: "Paquete Oro",
            value: 100,
            currency: "USD",
          }}
        />
      </StrictMode>,
    );

    expect(fbqCalls().filter((call) => call[1] === "ViewContent")).toEqual([
      [
        "track",
        "ViewContent",
        { content_ids: ["PAQ-ORO"], content_name: "Paquete Oro", value: 100, currency: "USD" },
      ],
    ]);
  });

  it("Purchase sale UNA vez por pedido, con el id como eventID, aunque se recargue", () => {
    runBaseScript();
    const params = { value: 104.99, currency: "USD", content_ids: ["GORRA-01"], num_items: 1 };

    const { unmount } = render(<MetaPurchaseOnMount orderId="pedido-77" params={params} />);
    unmount();
    // "Recargar": otro montaje de la misma confirmacion.
    render(
      <StrictMode>
        <MetaPurchaseOnMount orderId="pedido-77" params={params} />
      </StrictMode>,
    );

    expect(fbqCalls().filter((call) => call[1] === "Purchase")).toEqual([
      ["track", "Purchase", params, { eventID: "pedido-77" }],
    ]);
    expect(window.localStorage.getItem(`${META_PURCHASE_SENT_PREFIX}pedido-77`)).not.toBeNull();

    // Otro pedido si cuenta.
    expect(trackMetaPurchaseOnce("pedido-78", params)).toBe(true);
  });

  it("AddToCart solo cuando el carrito confirma el alta, con precio por cantidad", () => {
    runBaseScript();
    const items = [
      {
        variantId: "var-1",
        sku: "GORRA-01",
        name: "Gorra",
        unitPrice: { amount_minor: "2500", currency: "USD" },
      },
    ];

    let dispatch: ((result: CartActionResult) => void) | undefined;
    function Harness() {
      const [state, setState] = useState<CartActionResult>({
        ok: false,
        code: null,
        requestId: null,
      });
      dispatch = setState;
      useMetaAddToCart(state, items);
      return null;
    }
    render(<Harness />);

    act(() => dispatch?.({ ok: false, code: "INSUFFICIENT_STOCK", requestId: null }));
    expect(fbqCalls().filter((call) => call[1] === "AddToCart")).toEqual([]);

    act(() =>
      dispatch?.({
        ok: true,
        code: null,
        requestId: null,
        added: { variantId: "var-1", quantity: 3 },
      }),
    );
    expect(fbqCalls().filter((call) => call[1] === "AddToCart")).toEqual([
      [
        "track",
        "AddToCart",
        {
          content_ids: ["GORRA-01"],
          content_name: "Gorra",
          content_type: "product",
          contents: [{ id: "GORRA-01", quantity: 3, item_price: 25 }],
          num_items: 3,
          value: 75,
          currency: "USD",
        },
      ],
    ]);
  });
});

describe("lo que pinta el layout", () => {
  it("el <script> del <head> lleva el nonce y el codigo base; sin pixel, nada", () => {
    const html = renderToStaticMarkup(
      <MetaPixelBase pixelId={PIXEL} hosts={HOSTS} locales={["es", "en"]} nonce="abc123" />,
    );
    expect(html).toContain('id="meta-pixel-base"');
    expect(html).toContain('nonce="abc123"');
    expect(html).toContain(`"${PIXEL}"`);

    expect(
      renderToStaticMarkup(
        <MetaPixelBase pixelId={null} hosts={HOSTS} locales={["es"]} nonce="abc123" />,
      ),
    ).toBe("");
  });

  it("el <noscript> lleva el PageView de Meta, y no se pinta si no se permite", () => {
    const html = renderToStaticMarkup(<MetaPixelNoscript pixelId={PIXEL} allowed />);
    expect(html).toContain(
      `https://www.facebook.com/tr?id=${PIXEL}&amp;ev=PageView&amp;noscript=1`,
    );
    expect(renderToStaticMarkup(<MetaPixelNoscript pixelId={PIXEL} allowed={false} />)).toBe("");
    expect(renderToStaticMarkup(<MetaPixelNoscript pixelId={null} allowed />)).toBe("");
  });
});
