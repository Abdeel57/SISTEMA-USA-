"use client";

import { useEffect, useRef } from "react";

import type { MoneyMinor } from "@/lib/api/contract";
import type { CartActionResult } from "@/lib/cart-actions";
import {
  metaMoneyParams,
  metaValueOf,
  trackMetaEvent,
  trackMetaPurchaseOnce,
  type MetaEventParams,
  type MetaStandardEvent,
} from "@/lib/meta-pixel-events";

/**
 * Eventos de compra del pixel de Meta (DEC-087), como piezas que una pagina
 * de servidor puede poner en su arbol sin volverse componente de cliente.
 *
 * No pintan nada. Mandan su evento UNA vez por montaje (la referencia evita el
 * doble efecto de React en desarrollo) y, sin pixel en el sitio, no hacen nada.
 */

/** Un evento al mostrarse la pagina: `ViewContent`, `InitiateCheckout`. */
export function MetaEventOnMount({
  event,
  params,
}: {
  readonly event: Extract<MetaStandardEvent, "ViewContent" | "InitiateCheckout">;
  readonly params: MetaEventParams;
}) {
  const sent = useRef(false);
  // Los parametros llegan del servidor ya fijados para esta pagina: un valor
  // estable para el efecto aunque el objeto sea nuevo en cada render.
  const key = JSON.stringify(params);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    trackMetaEvent(event, JSON.parse(key) as MetaEventParams);
  }, [event, key]);

  return null;
}

/**
 * `Purchase` en la confirmacion del pedido, UNA vez por pedido: recargar la
 * pagina no lo repite (`trackMetaPurchaseOnce`), y el id del pedido viaja como
 * `eventID` para que Meta lo deduplique.
 */
export function MetaPurchaseOnMount({
  orderId,
  params,
}: {
  readonly orderId: string;
  readonly params: MetaEventParams;
}) {
  const key = JSON.stringify(params);

  useEffect(() => {
    trackMetaPurchaseOnce(orderId, JSON.parse(key) as MetaEventParams);
  }, [orderId, key]);

  return null;
}

/** Una variante que se puede anadir, para describir el `AddToCart`. */
export interface MetaCartItem {
  readonly variantId: string;
  /** SKU de la variante: el mismo `id` que llevan el checkout y la compra. */
  readonly sku: string;
  readonly name: string;
  readonly unitPrice: MoneyMinor;
}

/** Precio por cantidad, en centimos y sin pasar por coma flotante. */
function timesQuantity(price: MoneyMinor, quantity: number): MoneyMinor | null {
  if (!/^-?\d+$/u.test(price.amount_minor) || !Number.isSafeInteger(quantity)) return null;
  return {
    amount_minor: (BigInt(price.amount_minor) * BigInt(quantity)).toString(),
    currency: price.currency,
  };
}

/**
 * `AddToCart` cuando el carrito CONFIRMA el alta (la accion devolvio `ok`), no
 * al pulsar: un clic sobre una talla agotada no es un articulo en el carrito.
 *
 * Cada envio con exito devuelve un objeto nuevo de `useActionState`, asi que se
 * manda uno por alta; el mismo objeto no se cuenta dos veces.
 *
 * `items` son las variantes que el formulario puede anadir: la accion devuelve
 * cual se anadio y cuantas (la ficha deja elegir variante y cantidad).
 */
export function useMetaAddToCart(state: CartActionResult, items: readonly MetaCartItem[]): void {
  const tracked = useRef<CartActionResult | null>(null);

  useEffect(() => {
    if (!state.ok || state.added === undefined || tracked.current === state) return;
    tracked.current = state;

    const { variantId, quantity } = state.added;
    const item = items.find((candidate) => candidate.variantId === variantId);
    if (item === undefined) return;

    const unit = metaValueOf(item.unitPrice);
    trackMetaEvent("AddToCart", {
      content_ids: [item.sku],
      content_name: item.name,
      content_type: "product",
      contents: [{ id: item.sku, quantity, ...(unit === null ? {} : { item_price: unit }) }],
      num_items: quantity,
      // El valor de LO ANADIDO: precio por cantidad.
      ...metaMoneyParams(timesQuantity(item.unitPrice, quantity)),
    });
  }, [state, items]);
}
