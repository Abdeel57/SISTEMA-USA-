/**
 * Ajustes de pago desde el panel (0041, 0042).
 *
 *   GET /admin/payment-settings .... `product.read`
 *   PUT /admin/payment-settings .... `product.write`
 *
 * QUE FORMAS DE PAGO MANUAL OFRECE LA TIENDA
 *
 *   Efectivo en caja (DEC-078), Zelle y Venmo (0042), cada una con su
 *   interruptor, y las cuentas a las que se paga: el nombre del titular y el
 *   correo o telefono de Zelle; el usuario de Venmo y la imagen de su codigo
 *   QR. La tarjeta no esta aqui: depende de las llaves de Stripe, que son
 *   variables de entorno del despliegue y no un dato del panel.
 *
 *   Con solo Zelle o Venmo activados, comprar no pide cuenta
 *   (`guestCheckoutEnabled`); `guest_checkout` lo dice para que el panel lo
 *   explique.
 *
 * POR QUE `product.write` Y NO UNA CAPACIDAD NUEVA
 *
 *   Por la misma razon que la tarifa de envio (`admin-shipping.ts`): son
 *   condiciones de venta de la tienda y las pone quien pone los precios. Una
 *   capacidad propia solo tendria sentido si alguien debiera poder cambiar una
 *   cosa y no la otra, y nadie lo ha pedido.
 *
 * NADA DE ESTO TOCA PARTICIPACIONES
 *
 *   Cambiar la forma de pago no cambia lo que se otorga: un pedido por Zelle
 *   genera las participaciones con el mismo codigo que la tarjeta y el
 *   efectivo, cuando una persona confirma el cobro.
 */

import { z } from "zod";

import type { AppDependencies } from "../app.js";
import { ApiErrors, errorEnvelopeSchema } from "../http/errors.js";
import { requireStaffContext } from "../http/require-staff.js";
import type { RouteDefinition } from "../http/route-registry.js";
import { guestCheckoutEnabled } from "../services/payment-methods.js";
import type { PaymentSettingsRecord } from "../services/ports.js";

const paymentSettingsSchema = z.object({
  cash_enabled: z.boolean(),
  zelle_enabled: z.boolean(),
  zelle_recipient_name: z.string().nullable(),
  zelle_recipient: z.string().nullable(),
  venmo_enabled: z.boolean(),
  venmo_recipient_name: z.string().nullable(),
  /** Sin la arroba. */
  venmo_handle: z.string().nullable(),
  venmo_qr_media_id: z.uuid().nullable(),
  venmo_qr_url: z.string().nullable(),
  /** `false` si las llaves de Stripe no estan configuradas: se informa, no se edita aqui. */
  card_enabled: z.boolean(),
  /** 0042: si comprar se hace sin cuenta con lo que hay activado. Solo se informa. */
  guest_checkout: z.boolean(),
  updated_at: z.string(),
  updated_by_admin_user_id: z.uuid().nullable(),
});

/** Texto opcional: vacio o solo espacios es `null`, igual que no escribir nada. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === undefined || value === null || value === "" ? null : value));

const putPaymentSettingsBodySchema = z.object({
  cash_enabled: z.boolean(),
  zelle_enabled: z.boolean(),
  zelle_recipient_name: optionalText(80),
  zelle_recipient: optionalText(120),
  // 0042. Opcionales para que un panel anterior siga pudiendo guardar.
  venmo_enabled: z.boolean().optional().default(false),
  venmo_recipient_name: optionalText(80),
  venmo_handle: optionalText(41),
  venmo_qr_media_id: z.uuid().nullable().optional().default(null),
});

/** El usuario de Venmo como lo guarda la CHECK de 0042: sin arroba. */
const VENMO_HANDLE = /^[A-Za-z0-9_-]{2,40}$/u;

export function buildAdminPaymentRoutes(dependencies: AppDependencies): RouteDefinition[] {
  const cardEnabled = dependencies.config.commerce.payment.provider === "stripe";

  function present(record: PaymentSettingsRecord): z.infer<typeof paymentSettingsSchema> {
    return {
      cash_enabled: record.cashEnabled,
      zelle_enabled: record.zelleEnabled,
      zelle_recipient_name: record.zelleRecipientName,
      zelle_recipient: record.zelleRecipient,
      venmo_enabled: record.venmoEnabled,
      venmo_recipient_name: record.venmoRecipientName,
      venmo_handle: record.venmoHandle,
      venmo_qr_media_id: record.venmoQrMediaId,
      venmo_qr_url: record.venmoQrUrl,
      card_enabled: cardEnabled,
      guest_checkout: guestCheckoutEnabled(record, cardEnabled),
      updated_at: record.updatedAt.toISOString(),
      updated_by_admin_user_id: record.updatedByAdminUserId,
    };
  }

  return [
    {
      method: "GET",
      url: "/api/v1/admin/payment-settings",
      operationId: "getAdminPaymentSettings",
      summary: "Formas de pago manual de la tienda y cuentas Zelle y Venmo.",
      tags: ["admin"],
      authorization: { kind: "PERMISSION", permission: "product.read" },
      schema: {
        response: {
          200: paymentSettingsSchema,
          401: errorEnvelopeSchema,
          403: errorEnvelopeSchema,
        },
      },
      handler: async (request) => {
        await requireStaffContext(dependencies, request);
        return present(await dependencies.repositories.paymentSettings.read());
      },
    },

    {
      method: "PUT",
      url: "/api/v1/admin/payment-settings",
      operationId: "setAdminPaymentSettings",
      summary: "Activar o desactivar efectivo, Zelle y Venmo, y poner sus cuentas.",
      description:
        "0041, 0042. Reemplaza la fila entera. Activar Zelle exige el nombre del titular y el correo o telefono registrado en Zelle; activar Venmo, el nombre y el usuario (422 si faltan): es lo que el comprador ve para transferir. El usuario de Venmo se guarda sin arroba. `venmo_qr_media_id` es una imagen ya subida a la biblioteca (422 `unknown_media` si no existe). Los pedidos ya creados no cambian.",
      tags: ["admin"],
      authorization: { kind: "PERMISSION", permission: "product.write" },
      schema: {
        body: putPaymentSettingsBodySchema,
        response: {
          200: paymentSettingsSchema,
          401: errorEnvelopeSchema,
          403: errorEnvelopeSchema,
          422: errorEnvelopeSchema,
        },
      },
      handler: async (request) => {
        const staff = await requireStaffContext(dependencies, request);
        const body = request.body as z.output<typeof putPaymentSettingsBodySchema>;

        // La misma regla que la CHECK `payment_settings_zelle_complete`, aqui
        // para que el panel reciba un 422 que diga QUE campo falta.
        if (body.zelle_enabled) {
          const missing = [
            ...(body.zelle_recipient_name === null ? ["zelle_recipient_name"] : []),
            ...(body.zelle_recipient === null ? ["zelle_recipient"] : []),
          ];
          if (missing.length > 0) {
            throw ApiErrors.validationFailed(missing.map((path) => ({ path, code: "required" })));
          }
        }

        // 0042: lo mismo con Venmo. El usuario se escribe a menudo con la
        // arroba delante; se quita antes de comprobar su forma.
        const venmoHandle =
          body.venmo_handle === null ? null : body.venmo_handle.replace(/^@/u, "");
        if (venmoHandle !== null && !VENMO_HANDLE.test(venmoHandle)) {
          throw ApiErrors.validationFailed([{ path: "venmo_handle", code: "invalid" }]);
        }
        if (body.venmo_enabled) {
          const missing = [
            ...(body.venmo_recipient_name === null ? ["venmo_recipient_name"] : []),
            ...(venmoHandle === null ? ["venmo_handle"] : []),
          ];
          if (missing.length > 0) {
            throw ApiErrors.validationFailed(missing.map((path) => ({ path, code: "required" })));
          }
        }
        if (
          body.venmo_qr_media_id !== null &&
          !(await dependencies.repositories.paymentSettings.mediaExists(body.venmo_qr_media_id))
        ) {
          throw ApiErrors.validationFailed([{ path: "venmo_qr_media_id", code: "unknown_media" }]);
        }

        const saved = await dependencies.repositories.paymentSettings.update(
          {
            cashEnabled: body.cash_enabled,
            zelleEnabled: body.zelle_enabled,
            zelleRecipientName: body.zelle_recipient_name,
            zelleRecipient: body.zelle_recipient,
            venmoEnabled: body.venmo_enabled,
            venmoRecipientName: body.venmo_recipient_name,
            venmoHandle,
            venmoQrMediaId: body.venmo_qr_media_id,
          },
          staff.adminUserId,
        );

        request.log.info(
          {
            event: "payment.settings.updated",
            cash_enabled: saved.cashEnabled,
            zelle_enabled: saved.zelleEnabled,
            venmo_enabled: saved.venmoEnabled,
          },
          "ajustes de pago cambiados",
        );

        return present(saved);
      },
    },
  ];
}
