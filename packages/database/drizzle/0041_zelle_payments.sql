-- ===========================================================================
-- 0041_zelle_payments
--
-- PAGO POR ZELLE: un segundo CANAL del pago manual de DEC-078.
--
-- El efectivo ya resolvia la parte delicada: el pedido nace pendiente, una
-- persona confirma el cobro desde el panel y SOLO entonces se generan las
-- participaciones, con el mismo codigo que la tarjeta. Zelle es exactamente
-- eso con otra forma de entregar el dinero: el comprador transfiere a la
-- cuenta Zelle del negocio, sube la captura del comprobante y el negocio,
-- despues de ver el dinero en su banco, confirma. Zelle no tiene API para
-- comprobar pagos, asi que la confirmacion es humana por necesidad.
--
-- Por eso Zelle NO es otro `provider`: un pedido por Zelle es `provider =
-- 'cash'` (pago manual confirmado por una persona) con
-- `manual_payment_channel = 'ZELLE'`. La confirmacion, la generacion de
-- participaciones, la cancelacion y el corte de caja siguen siendo UNO.
--
-- LOS COMPROBANTES NO SON PUBLICOS. Una captura de Zelle lleva nombre, banco
-- y a veces parte de la cuenta. No van a `media_assets` -que se sirve sin
-- sesion en `/media/:file`- sino a su propia tabla, que solo leen el
-- comprador del pedido y el personal con `order.cash.confirm`.
--
-- Referencias: DEC-005 (forward-only), DEC-056, DEC-078, DEC-079.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. El canal del pago manual y el WhatsApp del comprador
-- ---------------------------------------------------------------------------

ALTER TABLE orders ADD COLUMN manual_payment_channel text;

-- `+` y de 8 a 15 digitos (E.164). Es a donde el negocio manda la
-- confirmacion del pago por WhatsApp.
ALTER TABLE orders ADD COLUMN contact_phone text;

-- Los pedidos en efectivo anteriores a esta migracion eran todos de caja.
UPDATE orders SET manual_payment_channel = 'CASH' WHERE provider = 'cash';

ALTER TABLE orders
  ADD CONSTRAINT orders_manual_payment_channel_known
    CHECK (manual_payment_channel IS NULL OR manual_payment_channel IN ('CASH', 'ZELLE')),
  -- El canal solo existe en el pago manual. Al reves no se exige: un pedido
  -- manual SIN canal es de caja, que es lo que eran todos antes de esta
  -- migracion, y asi lo leen la API y el corte de caja (`coalesce(..., 'CASH')`).
  -- La API siempre lo escribe en los pedidos nuevos.
  ADD CONSTRAINT orders_manual_payment_channel_only_manual
    CHECK (manual_payment_channel IS NULL OR provider = 'cash'),
  ADD CONSTRAINT orders_contact_phone_shape
    CHECK (contact_phone IS NULL OR contact_phone ~ '^\+[1-9][0-9]{7,14}$');

COMMENT ON COLUMN orders.manual_payment_channel IS
  'Pago manual (provider = cash): CASH = efectivo en caja; ZELLE = transferencia Zelle con comprobante. NULL en tarjeta.';
COMMENT ON COLUMN orders.contact_phone IS
  'WhatsApp del comprador en E.164, para avisarle del pago. Obligatorio en Zelle (lo exige la API).';


-- ---------------------------------------------------------------------------
-- 2. Comprobantes de pago
-- ---------------------------------------------------------------------------

CREATE TABLE payment_receipts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  -- Quien lo subio: el comprador del pedido. RESTRICT por la misma razon que
  -- el pedido: es evidencia de un cobro.
  participant_id    uuid NOT NULL REFERENCES participants (id) ON DELETE RESTRICT,
  -- La misma lista cerrada que `media_assets`: sin SVG ni PDF, nada que pueda
  -- llevar script.
  content_type      text NOT NULL,
  byte_size         integer NOT NULL,
  sha256            text NOT NULL,
  content           bytea NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT payment_receipts_content_type_allowed
    CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT payment_receipts_byte_size_range
    CHECK (byte_size BETWEEN 1 AND 5242880),
  CONSTRAINT payment_receipts_byte_size_matches_content
    CHECK (octet_length(content) = byte_size),
  CONSTRAINT payment_receipts_sha256_shape
    CHECK (sha256 ~ '^[0-9a-f]{64}$')
);

CREATE INDEX payment_receipts_order_idx ON payment_receipts (order_id, created_at DESC);

-- Evidencia: no se edita ni se borra. Un comprobante equivocado se corrige
-- subiendo otro; el panel muestra el mas reciente y conserva los anteriores.
CREATE TRIGGER payment_receipts_reject_mutation
  BEFORE UPDATE OR DELETE ON payment_receipts
  FOR EACH ROW EXECUTE FUNCTION app_reject_mutation();

COMMENT ON TABLE payment_receipts IS
  'Comprobantes de pago (capturas de Zelle) subidos por el comprador. Privados: no se sirven por /media. Filas inmutables.';

GRANT SELECT, INSERT ON payment_receipts TO app_runtime;


-- ---------------------------------------------------------------------------
-- 3. Ajustes de pago, editables desde el panel
-- ---------------------------------------------------------------------------

CREATE TABLE payment_settings (
  -- Fila unica, como `brand_profile`.
  id                          smallint PRIMARY KEY DEFAULT 1,
  -- Efectivo en caja: activado por defecto, que es como estaba la plantilla.
  cash_enabled                boolean NOT NULL DEFAULT true,
  zelle_enabled               boolean NOT NULL DEFAULT false,
  -- A nombre de quien esta la cuenta Zelle, tal como lo vera el comprador en
  -- su banco al transferir.
  zelle_recipient_name        text,
  -- El correo o telefono registrado en Zelle.
  zelle_recipient             text,
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by_admin_user_id    uuid REFERENCES admin_users (id) ON DELETE SET NULL,

  CONSTRAINT payment_settings_singleton CHECK (id = 1),
  -- No se puede ofrecer Zelle sin decir a quien pagar.
  CONSTRAINT payment_settings_zelle_complete
    CHECK (NOT zelle_enabled OR (zelle_recipient_name IS NOT NULL AND zelle_recipient IS NOT NULL)),
  CONSTRAINT payment_settings_zelle_recipient_name_length
    CHECK (zelle_recipient_name IS NULL OR char_length(btrim(zelle_recipient_name)) BETWEEN 1 AND 80),
  CONSTRAINT payment_settings_zelle_recipient_length
    CHECK (zelle_recipient IS NULL OR char_length(btrim(zelle_recipient)) BETWEEN 3 AND 120)
);

COMMENT ON TABLE payment_settings IS
  'Que formas de pago manual ofrece la tienda y a que cuenta Zelle se paga. Fila unica, editable desde el panel.';

CREATE TRIGGER payment_settings_set_updated_at
  BEFORE UPDATE ON payment_settings
  FOR EACH ROW EXECUTE FUNCTION app_set_updated_at();

INSERT INTO payment_settings (id) VALUES (1);

GRANT SELECT, UPDATE ON payment_settings TO app_runtime;
GRANT SELECT ON payment_settings, payment_receipts TO app_readonly_report;
