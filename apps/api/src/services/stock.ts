/**
 * Inventario que se acaba (0043).
 *
 * Cada linea de pedido descuenta su cantidad en el motor
 * (`order_items_take_stock`); si no queda bastante, la CHECK
 * `product_variants_stock_non_negative` rechaza la fila y con ella el pedido.
 * Es la garantia: dos compras simultaneas de la ultima unidad no pasan las
 * dos. Esta funcion reconoce ese rechazo para contestar 409
 * `INSUFFICIENT_STOCK` en vez de un 500.
 */

import { ApiErrors, type ApiError } from "../http/errors.js";

const STOCK_CHECK = "product_variants_stock_non_negative";

/** Si el error es el rechazo de la CHECK de inventario, en cualquier nivel de `cause`. */
export function isOutOfStock(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (candidate.code === "23514" && candidate.constraint === STOCK_CHECK) return true;
    current = candidate.cause;
  }

  return false;
}

/**
 * Ejecuta la creacion de un pedido y traduce el rechazo por inventario a
 * 409. Otro error cualquiera sigue su camino.
 */
export async function withStockCheck<T>(create: () => Promise<T>): Promise<T> {
  try {
    return await create();
  } catch (error) {
    if (isOutOfStock(error)) throw outOfStock();
    throw error;
  }
}

/** Lo que quedaba ya no alcanza: alguien compro antes. */
function outOfStock(): ApiError {
  return ApiErrors.insufficientStock(0);
}
