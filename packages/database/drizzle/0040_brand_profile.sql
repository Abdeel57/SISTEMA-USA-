-- ===========================================================================
-- 0040_brand_profile
--
-- La MARCA se edita desde el panel: nombre, logotipo, colores, datos legales,
-- contacto, dominio, prefijos de numeracion y zona horaria.
--
-- Hasta aqui la marca vivia en `packages/brand/src/brand.config.ts` (se
-- compilaba con la web) y los prefijos en `brand_settings`. A partir de esta
-- migracion vive en `brand_profile`, una fila unica que la API publica en
-- `GET /config` y que `apps/web` aplica en cada peticion. El archivo de
-- configuracion queda como VALORES INICIALES: `db:bootstrap` los copia aqui
-- mientras nadie haya guardado nada desde el panel
-- (`updated_by_admin_user_id IS NULL`).
--
-- EL LOGOTIPO es una fila de `media_assets`, subida con el mismo flujo que las
-- fotos del catalogo. `ON DELETE SET NULL`: sin logotipo, la web pinta el
-- simbolo de la plantilla.
--
-- Referencias: DEC-005 (forward-only), DEC-027, DEC-056, 0039.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. La fila de marca
-- ---------------------------------------------------------------------------

CREATE TABLE brand_profile (
  -- Fila unica: la clave solo admite el 1.
  id                        smallint PRIMARY KEY DEFAULT 1,

  name                      text NOT NULL,
  wordmark_lead             text NOT NULL,
  wordmark_tail             text NOT NULL DEFAULT '',

  legal_name                text NOT NULL,
  legal_entity              text NOT NULL,
  governing_law_state       text NOT NULL,
  venue                     text NOT NULL,
  street                    text NOT NULL,
  city_state_zip            text NOT NULL,

  contact_email             text NOT NULL,
  -- Solo el host, sin protocolo ni barras.
  domain                    text NOT NULL,
  -- Zona IANA del negocio (corte de caja). La API la valida contra Intl.
  time_zone                 text NOT NULL,

  order_number_prefix       text NOT NULL,
  entry_number_prefix       text NOT NULL,

  -- Hex en minusculas, con almohadilla. El resto de la paleta se deriva.
  color_brand               text NOT NULL,
  color_accent              text NOT NULL,
  -- Intensidad del patron topografico sobre las superficies oscuras.
  pattern_opacity_percent   integer NOT NULL DEFAULT 16,

  logo_media_id             uuid REFERENCES media_assets (id) ON DELETE SET NULL,

  updated_at                timestamptz NOT NULL DEFAULT now(),
  updated_by_admin_user_id  uuid REFERENCES admin_users (id) ON DELETE SET NULL,

  CONSTRAINT brand_profile_singleton CHECK (id = 1),
  CONSTRAINT brand_profile_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  CONSTRAINT brand_profile_wordmark_lead_length CHECK (char_length(btrim(wordmark_lead)) BETWEEN 1 AND 30),
  CONSTRAINT brand_profile_wordmark_tail_length CHECK (char_length(wordmark_tail) <= 30),
  CONSTRAINT brand_profile_legal_name_length CHECK (char_length(btrim(legal_name)) BETWEEN 1 AND 120),
  CONSTRAINT brand_profile_legal_entity_length CHECK (char_length(btrim(legal_entity)) BETWEEN 1 AND 120),
  CONSTRAINT brand_profile_governing_law_state_length CHECK (char_length(btrim(governing_law_state)) BETWEEN 1 AND 60),
  CONSTRAINT brand_profile_venue_length CHECK (char_length(btrim(venue)) BETWEEN 1 AND 120),
  CONSTRAINT brand_profile_street_length CHECK (char_length(btrim(street)) BETWEEN 1 AND 160),
  CONSTRAINT brand_profile_city_state_zip_length CHECK (char_length(btrim(city_state_zip)) BETWEEN 1 AND 120),
  CONSTRAINT brand_profile_contact_email_shape CHECK (contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT brand_profile_domain_shape CHECK (domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  CONSTRAINT brand_profile_time_zone_length CHECK (char_length(time_zone) BETWEEN 1 AND 64),
  -- Caben en las CHECK de `orders.order_number` y de
  -- `promotion_entry_number_sequences.format_prefix`.
  CONSTRAINT brand_profile_order_prefix_shape CHECK (order_number_prefix ~ '^[A-Z0-9]{2,8}$'),
  CONSTRAINT brand_profile_entry_prefix_shape CHECK (entry_number_prefix ~ '^[A-Z0-9]{2,8}$'),
  CONSTRAINT brand_profile_color_brand_shape CHECK (color_brand ~ '^#[0-9a-f]{6}$'),
  CONSTRAINT brand_profile_color_accent_shape CHECK (color_accent ~ '^#[0-9a-f]{6}$'),
  CONSTRAINT brand_profile_pattern_opacity_range CHECK (pattern_opacity_percent BETWEEN 0 AND 40)
);

COMMENT ON TABLE brand_profile IS
  'Marca del sitio, editable desde el panel. Fila unica. `updated_by_admin_user_id IS NULL` = todavia son los valores iniciales de packages/brand.';

CREATE TRIGGER brand_profile_set_updated_at
  BEFORE UPDATE ON brand_profile
  FOR EACH ROW EXECUTE FUNCTION app_set_updated_at();

-- Valores iniciales: los de la plantilla generica. Los prefijos se heredan de
-- `brand_settings`, que ya podia traer los del cliente.
INSERT INTO brand_profile (
  name, wordmark_lead, wordmark_tail,
  legal_name, legal_entity, governing_law_state, venue, street, city_state_zip,
  contact_email, domain, time_zone,
  order_number_prefix, entry_number_prefix,
  color_brand, color_accent, pattern_opacity_percent
) VALUES (
  'Mi Marca', 'Mi', 'Marca',
  'Mi Marca LLC', 'a Texas limited liability company', 'Texas', 'Travis County, Texas',
  '123 Main St, Suite 100', 'Austin, TX 78701',
  'contacto@mimarca.com', 'mimarca.com', 'America/Chicago',
  coalesce((SELECT value FROM brand_settings WHERE key = 'order_number_prefix'), 'ORD'),
  coalesce((SELECT value FROM brand_settings WHERE key = 'entry_number_prefix'), 'NUM'),
  '#38bdf8', '#2563eb', 16
);

-- La aplicacion lee y actualiza; no inserta ni borra: la fila es unica.
GRANT SELECT ON brand_profile TO app_runtime, app_readonly_report;
GRANT UPDATE (
  name, wordmark_lead, wordmark_tail,
  legal_name, legal_entity, governing_law_state, venue, street, city_state_zip,
  contact_email, domain, time_zone,
  order_number_prefix, entry_number_prefix,
  color_brand, color_accent, pattern_opacity_percent,
  logo_media_id, updated_at, updated_by_admin_user_id
) ON brand_profile TO app_runtime;


-- ---------------------------------------------------------------------------
-- 2. Los prefijos salen ahora de `brand_profile`
--
--    `app_brand_setting` conserva su nombre y su firma: `orders.order_number`
--    (DEFAULT) y `app_allocate_entry_range` (0039) la llaman y no cambian.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_brand_setting(p_key text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE p_key
    WHEN 'order_number_prefix' THEN order_number_prefix
    WHEN 'entry_number_prefix' THEN entry_number_prefix
    ELSE NULL
  END
  FROM brand_profile
  WHERE id = 1
$$;

DROP TABLE brand_settings;


-- ---------------------------------------------------------------------------
-- 3. Capacidades (DEC-027)
--
--    `packages/security` las declara en esta misma ronda y `test/parity.test.ts`
--    compara las dos listas.
-- ---------------------------------------------------------------------------

INSERT INTO admin_permissions
  (key, domain, sensitivity, description, requires_step_up, requires_reason,
   requires_second_approval, emits_audit_event, touches_pii,
   legal_dependency) VALUES
  ('brand.read', 'brand', 'ROUTINE', 'Ver la marca del sitio tal como esta guardada: nombre, logotipo, colores, datos legales, contacto, prefijos y zona horaria.', false, false, false, false, false, NULL),
  ('brand.update', 'brand', 'SENSITIVE', 'Cambiar la marca del sitio. Se aplica en el acto en la web publica y queda en la auditoria.', false, false, false, true, false, NULL);

INSERT INTO admin_role_permissions (role_key, permission_key) VALUES
  ('SUPPORT', 'brand.read'),
  ('PROMOTION_MANAGER', 'brand.read'),
  ('PROMOTION_MANAGER', 'brand.update'),
  ('COMPLIANCE_OFFICER', 'brand.read'),
  ('COMPLIANCE_OFFICER', 'brand.update');
