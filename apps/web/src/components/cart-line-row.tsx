import { Alert, Button, Card, Input, MediaFrame, VisuallyHidden } from "@app/ui";
import { useTranslations } from "next-intl";

import { formatMoney } from "@/i18n/formatters";
import type { Locale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { useIneligibilityReason } from "@/i18n/storefront-labels";
import { pickLocalized, type CartLine } from "@/lib/api";
import { removeCartItemFormAction, updateCartItemFormAction } from "@/lib/cart-actions";
import { safeImageUrl } from "@/lib/media-url";

import { AvailabilityBadge } from "./availability-badge";

/**
 * Una linea del carrito.
 *
 * PINTA EXACTAMENTE LO QUE EL CONTRATO PUBLICA, NI UN CAMPO MAS
 * ------------------------------------------------------------
 * `docs/API_CONTRACT.md` seccion 5 publica por linea: `id`, `variant_id`,
 * `product_slug`, `sku`, `name`, `quantity`, `unit_price`, `line_subtotal`,
 * `image_url` y `availability`. Los dos ultimos los publico HO-017 y esta fila
 * los llevaba degradados a proposito desde que HO-034 encontro que no existian.
 *
 * LA DISPONIBILIDAD YA SE DICE, Y DICE LO QUE DICE EL CONTRATO
 * -----------------------------------------------------------
 * `availability.status` compara el stock de la variante con LA CANTIDAD DE ESTA
 * LINEA, no con el articulo. De ahi tres decisiones de esta fila:
 *
 *   - `OUT_OF_STOCK` NO se traduce como "agotado". Significa "esta cantidad no
 *     se puede servir hoy", que puede querer decir "quedan tres y pediste
 *     cinco", y por eso ademas de la insignia hay una frase que lo dice.
 *   - Ningun texto promete unidades. La cantidad exacta de existencias no
 *     viaja (HO-017 pidio expresamente que no se publicara), asi que "quedan
 *     pocas" se puede decir y "quedan tres" no.
 *   - `OUT_OF_STOCK` NO bloquea nada aqui: ni la linea, ni los formularios, ni
 *     la cotizacion. La elegibilidad de la mercancia que no se puede entregar
 *     es una pregunta legal ABIERTA (`docs/LEGAL_PENDING.md`), y una interfaz
 *     que descontara esa linea estaria respondiendola por su cuenta. Lo que si
 *     bloquea es un `PATCH` que pida esa cantidad, y eso lo dice el backend con
 *     `409 INSUFFICIENT_STOCK`, que la pagina traduce arriba del todo.
 *
 * LA FOTO DEL ARTICULO (2026-10-13)
 * ---------------------------------
 * `image_url` es la foto de la variante o, si no tiene, la del producto. Va en
 * una miniatura cuadrada a la izquierda, que es lo que permite reconocer el
 * articulo sin leer: el usuario lo pidio expresamente. Se filtra con
 * `safeImageUrl` como en la tienda, y sin foto el hueco se queda con su
 * etiqueta para que todas las lineas sigan alineadas.
 *
 * COMPOSICION
 * -----------
 * Arriba, foto + nombre, SKU, disponibilidad y precio por unidad. Abajo, en una
 * franja separada por un filete, lo que se HACE con la linea -cantidad,
 * actualizar, quitar- y a la derecha el subtotal, que es la cifra que se mira.
 *
 * TODAS LAS CIFRAS VIENEN DEL SERVIDOR
 * ------------------------------------
 * `unit_price`, `quantity` y `line_subtotal` se PINTAN. El subtotal de linea no
 * se calcula aqui multiplicando los dos primeros: si el backend aplicara un
 * descuento, un redondeo o un precio distinto al de catalogo, una multiplicacion
 * hecha en el navegador mostraria una cifra que no coincide con la que se va a
 * cobrar. Y en un producto donde el subtotal elegible determina participaciones,
 * esa discrepancia no es cosmetica.
 *
 * EL SKU NO ES DECORACION
 * -----------------------
 * `name` es el nombre del PRODUCTO; el contrato no publica el de la variante.
 * Dos lineas del mismo producto en tallas distintas se leerian identicas sin el
 * SKU, que es lo unico que hoy las distingue. Es tambien lo que soporte necesita
 * para casar una linea con un pedido.
 *
 * DOS FORMULARIOS, NO UNO
 * -----------------------
 * Cambiar cantidad y quitar son acciones distintas con consecuencias distintas.
 * Un solo formulario con dos botones de envio obligaria a distinguirlos por el
 * `name` del boton, que es justo lo que deja de funcionar cuando el envio lo
 * dispara el teclado y no el raton.
 *
 * LA NO ELEGIBILIDAD SE DICE EN LA LINEA
 * --------------------------------------
 * `id` es la misma identidad en el carrito y en la cotizacion, y eso permite
 * decir QUE articulo no cuenta en vez de dar el aviso a nivel de carrito entero.
 * El motivo llega como `reason_key` y el texto es del frontend.
 */
export function CartLineRow({
  line,
  locale,
  ineligibleReasonKey,
}: {
  readonly line: CartLine;
  readonly locale: Locale;
  /**
   * Motivo por el que la cotizacion excluyo esta linea, o `null` si cuenta (o
   * si no hay cotizacion). No lo decide este componente: llega de la cotizacion
   * del backend.
   */
  readonly ineligibleReasonKey: string | null;
}) {
  const t = useTranslations("cart");
  const tProduct = useTranslations("product");
  const ineligibilityReason = useIneligibilityReason();

  const productName = pickLocalized(line.name, locale);
  const unitPrice = formatMoney(line.unit_price, locale);
  const lineSubtotal = formatMoney(line.line_subtotal, locale);
  const imageUrl = safeImageUrl(line.image_url);

  return (
    <Card as="li" elevation="flat" padding="none" className="overflow-hidden">
      <div className="flex gap-s4 p-s4 sm:p-s5">
        {/* La foto es decorativa (`alt=""`): el nombre del articulo esta justo
            al lado y repetirlo solo haria que un lector de pantalla lo dijera
            dos veces. */}
        <MediaFrame
          tone="light"
          emptyLabel={tProduct("noImage")}
          className="app-studio-light w-20 shrink-0 rounded-md sm:w-28"
        >
          {imageUrl === null ? null : (
            // Misma decision que `ProductCard`: `<img>` hasta que haya dominios
            // de imagen configurados en `next.config`.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" loading="lazy" />
          )}
        </MediaFrame>

        <div className="flex min-w-0 flex-1 flex-col gap-s2">
          <h3 className="app-display text-body-lg leading-tight text-text sm:text-heading-sm">
            <Link
              href={`/products/${line.product_slug}`}
              className="rounded-md transition-colors duration-fast ease-standard hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              {productName}
            </Link>
          </h3>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="font-mono text-caption text-text-muted">{line.sku}</p>
            <AvailabilityBadge status={line.availability.status} />
          </div>

          {unitPrice === null ? null : (
            <p className="text-body-sm text-text-muted">
              <span className="font-semibold text-text">{unitPrice}</span>{" "}
              {t("perUnit")}
            </p>
          )}

          {/* La insignia sola diria "existencias insuficientes" y quien la lea
              entenderia "se acabo". Esta frase es lo que separa las dos cosas, y
              es literalmente lo que dice el contrato: la cantidad no se puede
              servir HOY. No se ofrece un numero porque no viaja ninguno. */}
          {line.availability.status === "OUT_OF_STOCK" ? (
            <p className="text-caption text-text-subtle">{t("outOfStockNote")}</p>
          ) : null}
        </div>
      </div>

      {ineligibleReasonKey === null ? null : (
        <div className="px-s4 pb-s4 sm:px-s5">
          <Alert tone="info">{ineligibilityReason(ineligibleReasonKey)}</Alert>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-x-s4 gap-y-s3 border-t border-border bg-surface-sunken px-s4 py-s3 sm:px-s5">
        <div className="flex flex-wrap items-end gap-2">
          <form action={updateCartItemFormAction} className="flex items-end gap-2">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="line_id" value={line.id} />

            <div className="flex flex-col gap-1">
              <label htmlFor={`quantity-${line.id}`} className="text-caption font-medium text-text-muted">
                {t("quantityLabel")}
                <VisuallyHidden> {productName}</VisuallyHidden>
              </label>
              <Input
                id={`quantity-${line.id}`}
                name="quantity"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                defaultValue={line.quantity}
                className="w-20 bg-surface"
              />
            </div>

            <Button type="submit" variant="secondary">
              {t("update")}
            </Button>
          </form>

          <form action={removeCartItemFormAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="line_id" value={line.id} />

            <Button type="submit" variant="ghost">
              {t("remove")}
              <VisuallyHidden> {productName}</VisuallyHidden>
            </Button>
          </form>
        </div>

        {lineSubtotal === null ? null : (
          <dl className="ml-auto text-right">
            <dt className="text-caption text-text-muted">{t("lineSubtotal")}</dt>
            <dd className="text-heading-sm font-semibold text-text">{lineSubtotal}</dd>
          </dl>
        )}
      </div>
    </Card>
  );
}
