-- ===========================================================================
-- 0039_plantilla_admin_simple
--
-- Ajustes de la PLANTILLA para que una sola persona pueda operar el panel.
--
-- QUE CAMBIA
--
--   1. Una capacidad nueva, `participant.password.reset`: sin correo no hay
--      "olvide mi contrasena", y quien la olvida pide al administrador que le
--      fije una nueva desde el panel.
--   2. Sin segundo factor: ningun rol de personal exige MFA y una cuenta
--      administrativa puede estar ACTIVE sin factor inscrito.
--   3. Sin separacion de funciones entre roles: el administrador de la
--      plantilla tiene todos los roles de personal a la vez.
--   4. Sin "otra persona" en los ajustes manuales ni en los cambios de
--      configuracion: quien los pide puede aplicarlos.
--   5. `dual_approval_for_sensitive_actions_enabled` arranca APAGADO.
--   6. Prefijo configurable de los numeros de pedido y de participacion
--      (`brand_settings`), que `db:bootstrap` rellena desde la configuracion
--      de marca en cada despliegue.
--
-- LO QUE NO CAMBIA
--
--   El ledger sigue siendo de solo insercion, la auditoria sigue encadenada y
--   el sorteo interno sigue cerrado como estaba (DEC-017).
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Capacidad para fijar la contrasena de un participante
--
--    `packages/security` la declara en esta misma ronda y `test/parity.test.ts`
--    compara las dos listas.
-- ---------------------------------------------------------------------------

INSERT INTO admin_permissions
  (key, domain, sensitivity, description, requires_step_up, requires_reason,
   requires_second_approval, emits_audit_event, touches_pii,
   legal_dependency) VALUES
  ('participant.password.reset', 'participant', 'SENSITIVE', 'Fijar una contrasena nueva a un participante que olvido la suya. Cierra sus sesiones abiertas.', false, false, false, true, false, NULL);

INSERT INTO admin_role_permissions (role_key, permission_key) VALUES
  ('SUPPORT', 'participant.password.reset');


-- ---------------------------------------------------------------------------
-- 2. Sin segundo factor
-- ---------------------------------------------------------------------------

ALTER TABLE admin_roles DROP CONSTRAINT admin_roles_staff_requires_mfa;

UPDATE admin_roles SET requires_mfa = false WHERE requires_mfa;

ALTER TABLE admin_users DROP CONSTRAINT admin_users_active_requires_mfa;


-- ---------------------------------------------------------------------------
-- 3. Sin separacion de funciones entre roles
--
--    El trigger `admin_user_roles_enforce_separation_of_duties` se conserva:
--    sin filas en `admin_role_conflicts` no encuentra nada que impedir.
-- ---------------------------------------------------------------------------

DELETE FROM admin_role_conflicts;


-- ---------------------------------------------------------------------------
-- 4. Quien pide puede aplicar
-- ---------------------------------------------------------------------------

ALTER TABLE adjustments DROP CONSTRAINT adjustments_approver_differs;

ALTER TABLE setting_change_requests DROP CONSTRAINT setting_change_requests_approver_differs;


-- ---------------------------------------------------------------------------
-- 5. Doble aprobacion apagada
--
--    Los triggers de `feature_flags` exigen un administrador que firme el
--    cambio, y en una migracion no lo hay: se suspenden solo para esta fila.
-- ---------------------------------------------------------------------------

ALTER TABLE feature_flags DISABLE TRIGGER USER;

UPDATE feature_flags
   SET enabled = false,
       update_reason = 'plantilla: una sola persona opera el panel'
 WHERE key = 'dual_approval_for_sensitive_actions_enabled';

ALTER TABLE feature_flags ENABLE TRIGGER USER;


-- ---------------------------------------------------------------------------
-- 6. Prefijos de marca
--
--    Los rellena `db:bootstrap` desde `packages/brand` en cada despliegue. Los
--    valores de aqui son solo los de arranque.
-- ---------------------------------------------------------------------------

CREATE TABLE brand_settings (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT brand_settings_known_key
    CHECK (key IN ('order_number_prefix', 'entry_number_prefix')),
  -- Cabe en las CHECK de `orders.order_number` y de
  -- `promotion_entry_number_sequences.format_prefix`.
  CONSTRAINT brand_settings_value_shape
    CHECK (value ~ '^[A-Z0-9]{2,8}$')
);

INSERT INTO brand_settings (key, value) VALUES
  ('order_number_prefix', 'ORD'),
  ('entry_number_prefix', 'NUM');

GRANT SELECT ON brand_settings TO app_runtime, app_readonly_report;

CREATE FUNCTION app_brand_setting(p_key text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT value FROM brand_settings WHERE key = p_key
$$;

ALTER TABLE orders
  ALTER COLUMN order_number
  SET DEFAULT (
    coalesce(app_brand_setting('order_number_prefix'), 'ORD')
    || '-' || lpad(nextval('order_number_seq')::text, 8, '0')
  );

-- Igual que en 0037, salvo el prefijo, que ahora sale de `brand_settings`.
-- Solo afecta a las promociones cuya secuencia se crea a partir de ahora: el
-- prefijo de una promocion que ya repartio numeros no cambia.
CREATE OR REPLACE FUNCTION app_allocate_entry_range(p_promotion_id uuid, p_quantity integer)
RETURNS int8range
LANGUAGE plpgsql
AS $$
DECLARE
  start_number bigint;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Un rango de entries exige una cantidad positiva; se pidio %.', p_quantity
      USING ERRCODE = '22023';
  END IF;

  -- Serializa a los asignadores concurrentes de la MISMA promocion. Se libera
  -- al terminar la transaccion: si esta hace rollback, el rango se libera con
  -- ella y la secuencia no avanza.
  PERFORM pg_advisory_xact_lock(hashtext('app_entry_range'), hashtext(p_promotion_id::text));

  INSERT INTO promotion_entry_number_sequences (promotion_id, format_prefix)
  VALUES (p_promotion_id, coalesce(app_brand_setting('entry_number_prefix'), 'NUM'))
  ON CONFLICT (promotion_id) DO NOTHING;

  UPDATE promotion_entry_number_sequences
     SET next_number = next_number + p_quantity
   WHERE promotion_id = p_promotion_id
  RETURNING next_number - p_quantity INTO start_number;

  IF start_number IS NULL THEN
    RAISE EXCEPTION
      'La promocion % no tiene secuencia de numeros inicializada.', p_promotion_id
      USING ERRCODE = '23503';
  END IF;

  RETURN int8range(start_number, start_number + p_quantity, '[)');
END
$$;
