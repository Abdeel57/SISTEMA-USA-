/**
 * Formas de pago que ofrece la tienda (0041, 0042).
 *
 * TRANSFERENCIA = ZELLE O VENMO
 *
 *   Las dos funcionan igual: quien compra transfiere desde su app, sube la
 *   captura y el organizador confirma el cobro en el panel. Solo cambia a quien
 *   se paga.
 *
 * COMPRA SIN CUENTA
 *
 *   Si la tienda SOLO cobra por transferencia -sin tarjeta y sin efectivo-,
 *   comprar no pide cuenta: se aparta el pedido con el WhatsApp y el nombre
 *   (`POST /checkout/reserve`). Con tarjeta o efectivo activados el checkout
 *   sigue siendo el de siempre, con cuenta y direccion. Lo decide esta funcion
 *   para que `/config` y la ruta no puedan discrepar.
 */

import type { PaymentSettingsRecord } from "./ports.js";

export type TransferChannel = "ZELLE" | "VENMO";

/** Los canales de transferencia activados y completos, en el orden en que se ofrecen. */
export function transferChannelsOf(settings: PaymentSettingsRecord): readonly TransferChannel[] {
  const channels: TransferChannel[] = [];
  if (
    settings.zelleEnabled &&
    settings.zelleRecipientName !== null &&
    settings.zelleRecipient !== null
  ) {
    channels.push("ZELLE");
  }
  if (
    settings.venmoEnabled &&
    settings.venmoRecipientName !== null &&
    settings.venmoHandle !== null
  ) {
    channels.push("VENMO");
  }
  return channels;
}

/** Si comprar se hace sin cuenta: solo transferencia, sin tarjeta ni efectivo. */
export function guestCheckoutEnabled(
  settings: PaymentSettingsRecord,
  cardEnabled: boolean,
): boolean {
  return !cardEnabled && !settings.cashEnabled && transferChannelsOf(settings).length > 0;
}
