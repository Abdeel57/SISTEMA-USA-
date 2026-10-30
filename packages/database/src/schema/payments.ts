/**
 * Pago por Zelle (0041) y Venmo (0042): comprobantes subidos por el comprador
 * y ajustes de pago del panel. Espejo de `drizzle/0041_zelle_payments.sql` y
 * `drizzle/0042_reserve_checkout.sql`.
 *
 * `payment_receipts` es INMUTABLE (el rol `app` solo tiene SELECT e INSERT y un
 * trigger rechaza cualquier cambio) y PRIVADA: a diferencia de `media_assets`,
 * nada la sirve sin sesion. `payment_settings` es una fila unica que el rol
 * `app` lee y actualiza; nunca inserta ni borra.
 */

import {
  boolean,
  customType,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { adminUsers, participants } from "./identity.js";
import { mediaAssets } from "./media.js";
import { orders } from "./orders.js";

/** `bytea`. El driver entrega `Buffer`. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export const paymentReceipts = pgTable(
  "payment_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "restrict" }),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    content: bytea("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("payment_receipts_order_idx").on(table.orderId, sql`created_at DESC`)],
);

export const paymentSettings = pgTable("payment_settings", {
  id: smallint("id").primaryKey().default(1),
  cashEnabled: boolean("cash_enabled").notNull().default(true),
  zelleEnabled: boolean("zelle_enabled").notNull().default(false),
  zelleRecipientName: text("zelle_recipient_name"),
  zelleRecipient: text("zelle_recipient"),
  /** 0042: Venmo, con la imagen de su codigo QR (publica). */
  venmoEnabled: boolean("venmo_enabled").notNull().default(false),
  venmoRecipientName: text("venmo_recipient_name"),
  /** Sin la arroba. */
  venmoHandle: text("venmo_handle"),
  venmoQrMediaId: uuid("venmo_qr_media_id").references(() => mediaAssets.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedByAdminUserId: uuid("updated_by_admin_user_id").references(() => adminUsers.id, {
    onDelete: "set null",
  }),
});
