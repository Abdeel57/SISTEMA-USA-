-- 0043_stock_reservation
--
-- EL INVENTARIO BAJA CON CADA PEDIDO
--
--   Hasta ahora `product_variants.stock_quantity` solo se comparaba al anadir
--   al carrito: nunca bajaba, asi que una promocion con un tope de
--   participaciones repartido en el inventario de sus productos (9,999 en la
--   primera tienda) podia venderse por encima de el.
--
--   Desde esta migracion la columna es lo que QUEDA:
--
--   - cada linea de pedido que se escribe descuenta su cantidad. Si no hay
--     bastante, la CHECK `product_variants_stock_non_negative` rechaza la fila
--     y con ella el pedido entero: dos compras simultaneas de la ultima unidad
--     no pueden pasar las dos, porque el UPDATE bloquea la fila de la variante;
--   - un pedido que pasa a CANCELLED devuelve lo que habia tomado. Lo cancele
--     el panel, la pasarela al caducar el cobro o cualquier camino futuro.
--
--   Un pedido apartado y sin pagar SI ocupa inventario: es lo que evita vender
--   dos veces lo mismo mientras alguien transfiere. Si nunca paga, cancelarlo
--   lo devuelve.
--
--   Lo hace el motor y no la API para que ningun camino de creacion o
--   cancelacion pueda olvidarse. Una variante sin inventario (`NULL`) no se
--   toca: es ilimitada.
--
--   Devoluciones y contracargos no reponen: el producto ya se entrego y las
--   participaciones se revierten aparte. El tope queda, como mucho, sin
--   alcanzar; nunca rebasado.

-- ---------------------------------------------------------------------------
-- 1. Al escribir una linea de pedido, se descuenta
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_order_items_take_stock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE product_variants
     SET stock_quantity = stock_quantity - NEW.quantity
   WHERE id = NEW.product_variant_id
     AND stock_quantity IS NOT NULL;
  RETURN NEW;
END
$$;

CREATE TRIGGER order_items_take_stock
  AFTER INSERT ON order_items
  FOR EACH ROW EXECUTE FUNCTION app_order_items_take_stock();

COMMENT ON FUNCTION app_order_items_take_stock() IS
  '0043: cada linea de pedido descuenta su cantidad del inventario. Sin existencias, la CHECK product_variants_stock_non_negative rechaza el pedido entero.';

-- ---------------------------------------------------------------------------
-- 2. Al cancelar un pedido, se devuelve
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_orders_return_stock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Agrupado por variante: un UPDATE ... FROM con dos filas para la misma
  -- variante solo aplicaria una.
  UPDATE product_variants AS pv
     SET stock_quantity = pv.stock_quantity + taken.quantity
    FROM (
      SELECT product_variant_id, sum(quantity)::integer AS quantity
        FROM order_items
       WHERE order_id = NEW.id
       GROUP BY product_variant_id
    ) AS taken
   WHERE pv.id = taken.product_variant_id
     AND pv.stock_quantity IS NOT NULL;
  RETURN NEW;
END
$$;

CREATE TRIGGER orders_return_stock_on_cancel
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  WHEN (NEW.status = 'CANCELLED' AND OLD.status IS DISTINCT FROM 'CANCELLED')
  EXECUTE FUNCTION app_orders_return_stock();

COMMENT ON FUNCTION app_orders_return_stock() IS
  '0043: un pedido que pasa a CANCELLED devuelve al inventario lo que habia tomado.';

-- ---------------------------------------------------------------------------
-- 3. Los pedidos que ya existian
-- ---------------------------------------------------------------------------

-- Lo vendido o apartado antes de esta migracion tambien cuenta. Nunca por
-- debajo de cero: si ya se habia vendido de mas, la variante queda agotada.
UPDATE product_variants AS pv
   SET stock_quantity = greatest(0, pv.stock_quantity - sold.quantity)
  FROM (
    SELECT oi.product_variant_id, sum(oi.quantity)::integer AS quantity
      FROM order_items AS oi
      JOIN orders AS o ON o.id = oi.order_id
     WHERE o.status <> 'CANCELLED'
     GROUP BY oi.product_variant_id
  ) AS sold
 WHERE pv.id = sold.product_variant_id
   AND pv.stock_quantity IS NOT NULL;

COMMENT ON COLUMN product_variants.stock_quantity IS
  '0043: existencias que QUEDAN. Las descuenta cada pedido y las devuelve su cancelacion. NULL = ilimitado.';
