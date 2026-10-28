/**
 * Ajustes de pago desde el panel (0041).
 *
 *   GET /admin/payment-settings .... `product.read`
 *   PUT /admin/payment-settings .... `product.write`
 *
 * QUE FORMAS DE PAGO MANUAL OFRECE LA TIENDA
 *
 *   Efectivo en caja (DEC-078) y Zelle, cada una con su interruptor, y la
 *   cuenta Zelle a la que se paga: el nombre del titular y el correo o telefono
 *   registrado. La tarjeta no esta aqui: depende de las llaves de Stripe, que
 *   son variables de entorno del despliegue y no un dato del panel.
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
import type { PaymentSettingsRecord } from "../services/ports.js";

const paymentSettingsSchema = z.object({
  cash_enabled: z.boolean(),
  zelle_enabled: z.boolean(),
  zelle_recipient_name: z.string().nullable(),
  zelle_recipient: z.string().nullable(),
  /** `false` si las llaves de Stripe no estan configuradas: se informa, no se edita aqui. */
  card_enabled: z.boolean(),
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
});

export function buildAdminPaymentRoutes(dependencies: AppDependencies): RouteDefinition[] {
  const cardEnabled = dependencies.config.commerce.payment.provider === "stripe";

  function present(record: PaymentSettingsRecord): z.infer<typeof paymentSettingsSchema> {
    return {
      cash_enabled: record.cashEnabled,
      zelle_enabled: record.zelleEnabled,
      zelle_recipient_name: record.zelleRecipientName,
      zelle_recipient: record.zelleRecipient,
      card_enabled: cardEnabled,
      updated_at: record.updatedAt.toISOString(),
      updated_by_admin_user_id: record.updatedByAdminUserId,
    };
  }

  return [
    {
      method: "GET",
      url: "/api/v1/admin/payment-settings",
      operationId: "getAdminPaymentSettings",
      summary: "Formas de pago manual de la tienda y cuenta Zelle.",
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
      summary: "Activar o desactivar efectivo y Zelle, y poner la cuenta Zelle.",
      description:
        "0041. Reemplaza la fila entera. Activar Zelle exige el nombre del titular y el correo o telefono registrado en Zelle (422 si faltan): es lo que el comprador ve para transferir. Los pedidos ya creados no cambian: el canal se fija al crear el pedido.",
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

        const saved = await dependencies.repositories.paymentSettings.update(
          {
            cashEnabled: body.cash_enabled,
            zelleEnabled: body.zelle_enabled,
            zelleRecipientName: body.zelle_recipient_name,
            zelleRecipient: body.zelle_recipient,
          },
          staff.adminUserId,
        );

        request.log.info(
          {
            event: "payment.settings.updated",
            cash_enabled: saved.cashEnabled,
            zelle_enabled: saved.zelleEnabled,
          },
          "ajustes de pago cambiados",
        );

        return present(saved);
      },
    },
  ];
}
