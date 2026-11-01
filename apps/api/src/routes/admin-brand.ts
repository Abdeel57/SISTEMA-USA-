/**
 * Marca del sitio desde el panel (tabla `brand_profile`, migracion 0040).
 *
 *   GET /admin/brand .... `brand.read`
 *   PUT /admin/brand .... `brand.update`
 *
 * QUE ES "LA MARCA"
 *   Todo lo que distingue a un cliente de otro sin tocar codigo: nombre y
 *   logotipo tipografico, logotipo grafico, los dos colores de la paleta, la
 *   intensidad del patron de fondo, los datos legales que llevan los Terminos y
 *   la Politica de Privacidad, el correo de contacto, el dominio, los prefijos
 *   de numeracion, la zona horaria del corte de caja y el pixel de Meta del
 *   sitio (0044). Se guarda aqui y
 *   `GET /config` lo publica: la web lo aplica en el siguiente render, sin
 *   redesplegar.
 *
 * ES UN `PUT` Y NO UN `PATCH`
 *   Se manda la fila ENTERA. Es un formulario de una pantalla y los campos son
 *   pocos; un parche parcial obligaria al panel a saber que mandar y que no,
 *   y dos guardados cruzados dejarian una marca a medias.
 *
 * EL LOGOTIPO SE SUBE APARTE
 *   Con `POST /admin/media`, igual que una foto del catalogo; aqui solo viaja
 *   su id. Si el id no existe se responde 422, no un error de clave ajena del
 *   motor.
 *
 * LOS PREFIJOS CAMBIAN HACIA DELANTE
 *   `orders.order_number` lee el prefijo al crear cada pedido, y la secuencia
 *   de numeros de participacion de una promocion se fija en su primera
 *   asignacion (0039). Cambiarlos no renumera nada que ya exista.
 */

import { brandProfileProblems, isValidTimeZone } from "@app/brand";
import { z } from "zod";

import type { AppDependencies } from "../app.js";
import { ApiErrors, errorEnvelopeSchema } from "../http/errors.js";
import { requireStaffContext } from "../http/require-staff.js";
import type { RouteDefinition } from "../http/route-registry.js";
import { publicBrandSchema } from "../http/schemas.js";
import { brandProfileOf, changedBrandFields, presentAdminBrand } from "../services/brand.js";
import { domainServicesFor } from "../services/domain-registry.js";
import type { BrandProfileInput } from "../services/ports.js";

/*
 * Las mismas formas que las CHECK de la migracion 0040, para responder 422 con
 * el campo exacto en vez de un error del motor. `trim()` por delante: lo que
 * se teclea en un formulario llega con espacios.
 */
const HEX_COLOR = /^#[0-9a-f]{6}$/u;
const PREFIX = /^[A-Z0-9]{2,8}$/u;
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/u;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;
/** Pixel de Meta (0044): solo cifras, de 8 a 20. Vacio = sin pixel. */
const META_PIXEL_ID = /^(\d{8,20})?$/u;

const required = (max: number) => z.string().trim().min(1).max(max);

/** `#RRGGBB` o `#rrggbb`: se guarda en minusculas. */
const hexColor = z.string().trim().toLowerCase().regex(HEX_COLOR, { error: "must_be_hex_color" });

const numberingPrefix = z.string().trim().toUpperCase().regex(PREFIX, { error: "must_be_prefix" });

export const brandUpdateBodySchema = z.object({
  name: required(60),
  wordmark: z.object({ lead: required(30), tail: z.string().trim().max(30) }),
  legal: z.object({
    name: required(120),
    entity_description: required(120),
    governing_law_state: required(60),
    venue: required(120),
    street: required(160),
    city_state_zip: required(120),
  }),
  contact_email: z.string().trim().max(160).regex(EMAIL, { error: "must_be_email" }),
  domain: z.string().trim().toLowerCase().max(120).regex(HOST, { error: "must_be_host" }),
  time_zone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine(isValidTimeZone, { error: "must_be_iana_time_zone" }),
  numbering: z.object({ order_prefix: numberingPrefix, entry_prefix: numberingPrefix }),
  colors: z.object({ brand: hexColor, accent: hexColor }),
  pattern_opacity_percent: z.number().int().min(0).max(40),
  /** Id devuelto por `POST /admin/media`, o `null` para el simbolo de la plantilla. */
  logo_media_id: z.uuid().nullable(),
  /**
   * Pixel de Meta del sitio (0044). Cifras, o `""`/`null` para quitarlo.
   *
   * OPCIONAL, a diferencia del resto: un panel que aun no conoce el campo
   * (o un script que guarda la marca) no lo manda, y eso NO puede apagar el
   * pixel de un sitio que ya lo tenia. Ausente = se conserva el guardado.
   */
  meta_pixel_id: z
    .string()
    .trim()
    .max(20)
    .regex(META_PIXEL_ID, { error: "must_be_meta_pixel_id" })
    .nullable()
    .optional(),
});

const adminBrandSchema = publicBrandSchema.extend({
  logo_media_id: z.uuid().nullable(),
  /** `null` mientras sigan los valores iniciales de la plantilla. */
  updated_by_admin_user_id: z.uuid().nullable(),
});

/**
 * El cuerpo, como fila. `current` es el pixel ya guardado: se conserva si el
 * cuerpo no trae el campo, y `""` o `null` lo quitan.
 */
function toInput(
  body: z.infer<typeof brandUpdateBodySchema>,
  current: { readonly metaPixelId: string | null },
): BrandProfileInput {
  const metaPixelId =
    body.meta_pixel_id === undefined
      ? current.metaPixelId
      : body.meta_pixel_id === null || body.meta_pixel_id === ""
        ? null
        : body.meta_pixel_id;

  return {
    metaPixelId,
    name: body.name,
    wordmarkLead: body.wordmark.lead,
    wordmarkTail: body.wordmark.tail,
    legalName: body.legal.name,
    legalEntity: body.legal.entity_description,
    governingLawState: body.legal.governing_law_state,
    venue: body.legal.venue,
    street: body.legal.street,
    cityStateZip: body.legal.city_state_zip,
    contactEmail: body.contact_email,
    domain: body.domain,
    timeZone: body.time_zone,
    orderNumberPrefix: body.numbering.order_prefix,
    entryNumberPrefix: body.numbering.entry_prefix,
    colorBrand: body.colors.brand,
    colorAccent: body.colors.accent,
    patternOpacityPercent: body.pattern_opacity_percent,
    logoMediaId: body.logo_media_id,
  };
}

export function buildAdminBrandRoutes(dependencies: AppDependencies): RouteDefinition[] {
  const { repositories } = dependencies;

  return [
    {
      method: "GET",
      url: "/api/v1/admin/brand",
      operationId: "getAdminBrand",
      summary: "La marca del sitio tal como esta guardada.",
      description:
        "Lo mismo que publica `GET /config` en `brand`, mas el id del logotipo y quien guardo por ultima vez. `updated_by_admin_user_id` es `null` mientras sigan los valores iniciales de la plantilla.",
      tags: ["admin"],
      authorization: { kind: "PERMISSION", permission: "brand.read" },
      schema: {
        response: {
          200: adminBrandSchema,
          401: errorEnvelopeSchema,
          403: errorEnvelopeSchema,
        },
      },
      handler: async (request) => {
        await requireStaffContext(dependencies, request);
        return presentAdminBrand(await repositories.brand.read());
      },
    },

    {
      method: "PUT",
      url: "/api/v1/admin/brand",
      operationId: "updateAdminBrand",
      summary: "Guardar la marca del sitio. Se aplica en el acto en la web publica.",
      description:
        "Reemplaza la fila entera: nombre, logotipo tipografico, logotipo (id de `POST /admin/media` o `null`), colores `#rrggbb`, intensidad del patron (0-40), datos legales, correo de contacto, dominio (solo el host), prefijos de numeracion (2-8 mayusculas o cifras), zona horaria IANA y, opcional, el pixel de Meta (`meta_pixel_id`: solo cifras; vacio o null lo quita, ausente lo conserva). Los prefijos valen para los pedidos y promociones NUEVOS; nada ya numerado cambia. Queda en la auditoria como `brand.updated`.",
      tags: ["admin"],
      authorization: { kind: "PERMISSION", permission: "brand.update" },
      schema: {
        body: brandUpdateBodySchema,
        response: {
          200: adminBrandSchema,
          401: errorEnvelopeSchema,
          403: errorEnvelopeSchema,
          422: errorEnvelopeSchema,
        },
      },
      handler: async (request) => {
        const staff = await requireStaffContext(dependencies, request);
        const body = request.body as z.infer<typeof brandUpdateBodySchema>;
        const before = await repositories.brand.read();
        const input = toInput(body, before);

        // La MISMA comprobacion que `db:bootstrap` hace con el archivo inicial:
        // lo que no valdria para arrancar tampoco vale para guardar.
        const problems = brandProfileProblems(brandProfileOf(input));
        if (problems.length > 0) {
          throw ApiErrors.validationFailed(
            problems.map((message) => ({ path: "brand", code: "invalid_brand", message })),
          );
        }

        if (
          input.logoMediaId !== null &&
          !(await repositories.brand.mediaExists(input.logoMediaId))
        ) {
          throw ApiErrors.validationFailed([{ path: "logo_media_id", code: "unknown_media" }]);
        }

        const after = await repositories.brand.update(input, staff.adminUserId);
        const changed = changedBrandFields(before, after);

        const domain = domainServicesFor(dependencies);
        await domain.audit.emit({
          action: "brand.updated",
          actor: { type: "ADMIN", adminUserId: staff.adminUserId },
          promotionId: null,
          targetEntityType: "BrandProfile",
          // La fila unica de `brand_profile` tiene id 1 (CHECK de la 0040).
          targetEntityId: "1",
          reasonKey: null,
          reasonDetail: null,
          occurredAt: domain.clock.now(),
          // Solo QUE cambio. Los valores ya estan en la fila y en la pagina
          // publica; repetirlos aqui no anade nada que un auditor no pueda ver.
          metadata: { changed_fields: changed },
        });

        request.log.info(
          { event: "brand.updated", changed_fields: changed },
          "marca del sitio guardada desde el panel",
        );

        return presentAdminBrand(after);
      },
    },
  ];
}
