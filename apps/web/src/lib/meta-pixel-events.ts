import type { MoneyMinor } from "./api/contract";
import { hasAdSharingOptOut } from "./meta-pixel";

/**
 * Eventos del pixel de Meta (DEC-087): el UNICO sitio de la tienda que llama a
 * `fbq`.
 *
 * Todo lo de aqui es seguro de llamar siempre: si el sitio no tiene pixel, si
 * el navegador se excluyo (GPC, `/privacychoices`), si se esta en otro dominio
 * o en una ruta excluida, no hace nada y devuelve `false`. Nunca lanza: un
 * fallo de Meta no puede romper un carrito ni una compra.
 *
 * Quien decide si hay pixel es el codigo base del `<head>`
 * (`metaPixelBaseScript`), que publica `window.__appMetaPixel`. Corre antes de
 * hidratar, asi que cuando un componente llama aqui la decision ya esta tomada.
 */

/** Los eventos estandar que usa la tienda. */
export type MetaStandardEvent =
  | "PageView"
  | "ViewContent"
  | "AddToCart"
  | "InitiateCheckout"
  | "Purchase"
  | "CompleteRegistration";

/** Una linea de lo que se ve, se anade o se compra. `id` es el SKU de la variante. */
export interface MetaContent {
  readonly id: string;
  readonly quantity: number;
  readonly item_price?: number;
}

/** Parametros estandar de Meta. Sin ningun dato de la persona. */
export interface MetaEventParams {
  readonly value?: number;
  readonly currency?: string;
  readonly content_ids?: readonly string[];
  readonly content_name?: string;
  readonly content_type?: "product";
  readonly contents?: readonly MetaContent[];
  readonly num_items?: number;
}

/** Lo que publica el codigo base del `<head>`. */
interface AppMetaPixelState {
  readonly id: string;
  status: "idle" | "ready" | "blocked" | "excluded";
  /** `location.pathname` del ultimo `PageView`, para no repetirlo. */
  pageKey: string | null;
  path: () => string;
  excluded: (path: string) => boolean;
  load: () => boolean;
}

type Fbq = (...args: unknown[]) => void;

declare global {
  interface Window {
    __appMetaPixel?: AppMetaPixelState;
    fbq?: Fbq;
  }
  interface Navigator {
    readonly globalPrivacyControl?: boolean;
  }
}

/**
 * El pixel listo para ESTA pagina, o `null`.
 *
 * Si se entro por una ruta excluida (la cuenta) y ahora se esta en una pagina
 * de la tienda, lo carga aqui: navegar sin recargar no puede dejar la tienda
 * sin medir.
 */
function readyPixel(): { state: AppMetaPixelState; fbq: Fbq } | null {
  if (typeof window === "undefined") return null;
  const state = window.__appMetaPixel;
  if (state === undefined) return null;

  try {
    if (state.excluded(state.path())) return null;
    // La exclusion puede llegar DESPUES de cargar (`/privacychoices` sin
    // recargar, o GPC activado): desde ese momento no sale nada mas.
    if (
      window.navigator.globalPrivacyControl === true ||
      hasAdSharingOptOut(window.document.cookie)
    ) {
      state.status = "blocked";
      return null;
    }
    if (state.status === "excluded") state.load();
    if (state.status !== "ready" || typeof window.fbq !== "function") return null;
    return { state, fbq: window.fbq };
  } catch {
    return null;
  }
}

/**
 * `PageView` de la pagina actual si todavia no se mando.
 *
 * El primero lo manda el `<head>` al cargar; este cubre cada navegacion sin
 * recarga (la tienda es una SPA) y la primera pagina de la tienda despues de
 * entrar por una excluida.
 */
export function syncMetaPageView(): boolean {
  const pixel = readyPixel();
  if (pixel === null) return false;

  const key = window.location.pathname;
  if (pixel.state.pageKey === key) return false;

  try {
    pixel.fbq("track", "PageView");
    pixel.state.pageKey = key;
    return true;
  } catch {
    return false;
  }
}

/**
 * Manda un evento estandar. `eventID` es para que Meta deduplique (la compra
 * lleva el id del pedido).
 */
export function trackMetaEvent(
  event: MetaStandardEvent,
  params?: MetaEventParams,
  options?: { readonly eventID?: string },
): boolean {
  const pixel = readyPixel();
  if (pixel === null) return false;

  // Si se llega aqui por una navegacion sin recarga, el `PageView` de esta
  // pagina va primero (los efectos de la pagina corren antes que los del
  // layout, que es quien lo manda normalmente).
  syncMetaPageView();

  try {
    if (options?.eventID === undefined) pixel.fbq("track", event, params ?? {});
    else pixel.fbq("track", event, params ?? {}, { eventID: options.eventID });
    return true;
  } catch {
    return false;
  }
}

/** Prefijo de la marca "compra ya enviada" de cada pedido en este navegador. */
export const META_PURCHASE_SENT_PREFIX = "app_meta_purchase:";

/** Respaldo en memoria para navegadores sin `localStorage` (modo privado estricto). */
const sentInMemory = new Set<string>();

function purchaseAlreadySent(key: string): boolean {
  if (sentInMemory.has(key)) return true;
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function markPurchaseSent(key: string): void {
  sentInMemory.add(key);
  try {
    window.localStorage.setItem(key, new Date().toISOString());
  } catch {
    // Sin almacenamiento: queda la marca en memoria y el `eventID` en Meta.
  }
}

/**
 * `Purchase` UNA sola vez por pedido.
 *
 * Tres cerrojos: la marca en `localStorage` (recargar la confirmacion no lo
 * repite), la de memoria (el doble montaje de React en desarrollo) y el
 * `eventID` = id del pedido, con el que Meta descarta un duplicado que se
 * escape (otro navegador del mismo comprador). La marca se pone ANTES de
 * enviar: ante un fallo a medias es mejor perder una compra en Meta que
 * contarla dos veces.
 */
export function trackMetaPurchaseOnce(orderId: string, params: MetaEventParams): boolean {
  if (readyPixel() === null) return false;

  const key = `${META_PURCHASE_SENT_PREFIX}${orderId}`;
  if (purchaseAlreadySent(key)) return false;
  markPurchaseSent(key);

  return trackMetaEvent("Purchase", params, { eventID: orderId });
}

/** Decimales de una moneda (USD -> 2). */
function fractionDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/**
 * Un importe del contrato (`amount_minor` en centimos, como cadena) como el
 * numero que espera Meta en `value` (`25.5`), o `null` si no es un importe.
 */
export function metaValueOf(money: MoneyMinor | null | undefined): number | null {
  if (money === null || money === undefined) return null;
  if (!/^-?\d+$/u.test(money.amount_minor)) return null;
  const value = Number(money.amount_minor) / 10 ** fractionDigits(money.currency);
  return Number.isFinite(value) ? value : null;
}

/** `value` y `currency` de un importe, o nada si no hay importe valido. */
export function metaMoneyParams(
  money: MoneyMinor | null | undefined,
): Pick<MetaEventParams, "value" | "currency"> {
  const value = metaValueOf(money);
  return value === null || money === null || money === undefined
    ? {}
    : { value, currency: money.currency.toUpperCase() };
}
