-- 0042_reserve_checkout
--
-- COMPRA SIN CUENTA ("APARTAR") Y VENMO
--
--   Cuando la tienda solo cobra por Zelle o Venmo, comprar ya no pide cuenta:
--   quien compra deja su WhatsApp y su nombre, aparta el pedido, ve a quien
--   pagar y sube ahi mismo la captura del pago. El organizador lo confirma en el
--   panel y le avisa por WhatsApp.
--
-- IDENTIDAD DE INVITADO
--
--   El pedido sigue perteneciendo a un participante, y el participante a una
--   identidad: asi las participaciones, el corte y el panel no cambian. Lo que
--   cambia es que esa identidad no tiene correo, ni celular verificado, ni
--   contrasena: no se puede iniciar sesion con ella. `guest_checkout_at` dice
--   cuando nacio y por que esta permitida sin datos de acceso. El WhatsApp que
--   deja quien compra es un dato de CONTACTO sin verificar: va a
--   `participants.phone_e164` y a `orders.contact_phone`, nunca a
--   `identities.phone_e164`, que es el celular verificado con el que se entra.
--
-- EL CANAL SE ELIGE AL PAGAR
--
--   El pedido se aparta antes de elegir Zelle o Venmo. Nace con el primero que
--   la tienda tenga activado y la API lo cambia al que diga quien sube la
--   captura, solo mientras siga pendiente de pago.

-- ---------------------------------------------------------------------------
-- 1. Identidad de invitado
-- ---------------------------------------------------------------------------

ALTER TABLE identities ADD COLUMN guest_checkout_at timestamptz;

ALTER TABLE identities
  DROP CONSTRAINT identities_contact_present_unless_anonymized;

ALTER TABLE identities
  ADD CONSTRAINT identities_contact_present_unless_anonymized
    CHECK (
      email IS NOT NULL
      OR phone_e164 IS NOT NULL
      OR anonymized_at IS NOT NULL
      OR guest_checkout_at IS NOT NULL
    );

COMMENT ON COLUMN identities.guest_checkout_at IS
  '0042: identidad creada al apartar un pedido sin cuenta. Sin correo, sin celular verificado y sin contrasena: no puede iniciar sesion.';

-- ---------------------------------------------------------------------------
-- 2. Pedido: Venmo, nombre de quien compra y canal editable
-- ---------------------------------------------------------------------------

ALTER TABLE orders
  DROP CONSTRAINT orders_manual_payment_channel_known;

ALTER TABLE orders
  ADD CONSTRAINT orders_manual_payment_channel_known
    CHECK (manual_payment_channel IS NULL OR manual_payment_channel IN ('CASH', 'ZELLE', 'VENMO'));

ALTER TABLE orders ADD COLUMN contact_name text;

ALTER TABLE orders
  ADD CONSTRAINT orders_contact_name_length
    CHECK (contact_name IS NULL OR char_length(btrim(contact_name)) BETWEEN 1 AND 120);

COMMENT ON COLUMN orders.manual_payment_channel IS
  'Pago manual (provider = cash): CASH = efectivo en caja; ZELLE o VENMO = transferencia con comprobante. NULL en tarjeta.';

COMMENT ON COLUMN orders.contact_name IS
  '0042: nombre que dejo quien aparto el pedido sin cuenta, para que el organizador sepa a quien escribe.';

-- Solo el canal: el resto del pedido sigue con los permisos de 0020.
GRANT UPDATE (manual_payment_channel) ON orders TO app_runtime;

-- ---------------------------------------------------------------------------
-- 3. Venmo en los ajustes de pago
-- ---------------------------------------------------------------------------

ALTER TABLE payment_settings
  ADD COLUMN venmo_enabled boolean NOT NULL DEFAULT false,
  -- Tal como sale en Venmo, para que quien paga reconozca la cuenta.
  ADD COLUMN venmo_recipient_name text,
  -- El usuario de Venmo, sin la arroba.
  ADD COLUMN venmo_handle text,
  -- La imagen del codigo QR de "Venmo me". Es publica: la ve quien compra.
  ADD COLUMN venmo_qr_media_id uuid REFERENCES media_assets (id) ON DELETE SET NULL;

ALTER TABLE payment_settings
  ADD CONSTRAINT payment_settings_venmo_complete
    CHECK (NOT venmo_enabled OR (venmo_recipient_name IS NOT NULL AND venmo_handle IS NOT NULL)),
  ADD CONSTRAINT payment_settings_venmo_recipient_name_length
    CHECK (venmo_recipient_name IS NULL OR char_length(btrim(venmo_recipient_name)) BETWEEN 1 AND 80),
  ADD CONSTRAINT payment_settings_venmo_handle_shape
    CHECK (venmo_handle IS NULL OR venmo_handle ~ '^[A-Za-z0-9_-]{2,40}$');

COMMENT ON TABLE payment_settings IS
  'Que formas de pago manual ofrece la tienda y a que cuentas Zelle y Venmo se paga. Fila unica, editable desde el panel.';
