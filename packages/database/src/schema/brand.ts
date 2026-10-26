/**
 * La marca del sitio, editable desde el panel. Espejo de
 * `drizzle/0040_brand_profile.sql`.
 *
 * Fila UNICA (`id = 1`). El rol `app` la lee y la actualiza; nunca inserta ni
 * borra. `updatedByAdminUserId` a null significa que siguen siendo los valores
 * iniciales de `packages/brand`, y `db:bootstrap` puede sobrescribirlos desde
 * el archivo; en cuanto alguien guarda desde el panel, manda el panel.
 */

import { integer, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { adminUsers } from "./identity.js";
import { mediaAssets } from "./media.js";

export const brandProfile = pgTable("brand_profile", {
  id: smallint("id").primaryKey().default(1),

  name: text("name").notNull(),
  wordmarkLead: text("wordmark_lead").notNull(),
  wordmarkTail: text("wordmark_tail").notNull().default(""),

  legalName: text("legal_name").notNull(),
  legalEntity: text("legal_entity").notNull(),
  governingLawState: text("governing_law_state").notNull(),
  venue: text("venue").notNull(),
  street: text("street").notNull(),
  cityStateZip: text("city_state_zip").notNull(),

  contactEmail: text("contact_email").notNull(),
  domain: text("domain").notNull(),
  timeZone: text("time_zone").notNull(),

  orderNumberPrefix: text("order_number_prefix").notNull(),
  entryNumberPrefix: text("entry_number_prefix").notNull(),

  /** Hex en minusculas con almohadilla. El resto de la paleta se deriva en la web. */
  colorBrand: text("color_brand").notNull(),
  colorAccent: text("color_accent").notNull(),
  patternOpacityPercent: integer("pattern_opacity_percent").notNull().default(16),

  /** Fila de `media_assets` con el logotipo, o null para el simbolo de la plantilla. */
  logoMediaId: uuid("logo_media_id").references(() => mediaAssets.id, { onDelete: "set null" }),

  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedByAdminUserId: uuid("updated_by_admin_user_id").references(() => adminUsers.id, {
    onDelete: "set null",
  }),
});
