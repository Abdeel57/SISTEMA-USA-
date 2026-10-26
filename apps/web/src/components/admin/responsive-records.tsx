import { Card, DataTable, cn, type DataTableColumn } from "@app/ui";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Columna de `ResponsiveRecords`: la de `DataTable` y un dato mas, solo para
 * la tarjeta del telefono.
 *
 * `cardSpan: "full"` hace que el par etiqueta/valor ocupe el ancho entero de la
 * tarjeta en vez de media columna. Es para lo que no cabe en 150px sin partirse
 * en cinco lineas: una direccion, una huella, un formulario plegado. La tabla
 * del escritorio no lo lee: alli cada columna ya tiene su ancho.
 */
export type ResponsiveColumn<TRow> = DataTableColumn<TRow> & {
  readonly cardSpan?: "half" | "full";
};

/**
 * Para codigos y cifras dentro de una celda: SKU, numero de pedido, fecha,
 * importe. En la TABLA no se parten -"HW-" / "TEE-" / "001" en tres lineas no
 * se lee como un codigo-; en la tarjeta del telefono si pueden, porque alli la
 * columna mide la mitad de 390px y un codigo largo desbordaria la tarjeta. Al
 * imprimir sale la tabla, y tampoco se parten.
 */
export const TABLE_NOWRAP_CLASS = "md:whitespace-nowrap print:whitespace-nowrap";

/**
 * Listado del panel que es TABLA en pantalla ancha y TARJETAS en el telefono.
 *
 * POR QUE NO BASTA CON LA TABLA
 * -----------------------------
 * `DataTable` ya evita el desbordamiento -va en una region con scroll propio-,
 * y para una cola de revision con dos columnas eso es suficiente. Pero un
 * catalogo con nombre, SKU, estado, precio, existencias y fecha son seis
 * columnas, y en 360px una tabla de seis columnas es una franja de 90px que
 * hay que arrastrar para leer cada fila. Quien da de alta mercancia desde el
 * telefono -que es el caso que pidio el cliente- necesita ver cada producto
 * entero de un vistazo, y eso es una tarjeta.
 *
 * UNA SOLA DESCRIPCION DE COLUMNAS
 * --------------------------------
 * Las dos formas se pintan a partir de las MISMAS columnas: la primera es el
 * titulo de la tarjeta y las demas son pares etiqueta/valor. Mantener dos
 * listas -una para la tabla y otra para las tarjetas- garantiza que un dia
 * una columna nueva aparezca en el escritorio y no en el telefono.
 *
 * El corte esta en `md`, que es donde seis columnas caben sin arrastrar. Las
 * dos formas van en el HTML y se muestra una u otra con CSS: es lo unico que
 * funciona en el render del servidor, que no sabe cuanto mide la pantalla.
 *
 * AL IMPRIMIR SIEMPRE ES LA TABLA. El ancho de una hoja carta con margenes
 * queda por debajo de `md`, y sin esta regla el corte de caja saldria impreso
 * como una pila de tarjetas. En papel la tabla es lo que se lee de un vistazo.
 *
 * LA TARJETA ENTERA SE PULSA (`rowHref`)
 * --------------------------------------
 * En el telefono, acertar con el dedo en el numero de pedido -una palabra
 * subrayada- era la unica forma de abrir la ficha. Con `rowHref`, toda la
 * tarjeta lleva al mismo sitio que el titulo:
 *
 *   - Debajo del contenido va un enlace que cubre la tarjeta (`absolute
 *     inset-0`) con `aria-hidden` y `tabIndex={-1}`. No existe para el lector
 *     de pantalla ni para el tabulador: para ellos el UNICO enlace sigue siendo
 *     el del titulo, con su nombre de verdad ("APP-00001234"), y no aparece un
 *     segundo enlace mudo repetido en cada fila.
 *   - El anillo de foco lo pinta la tarjeta con `has-[a:focus-visible]`, igual
 *     que la tarjeta de producto del escaparate: cuando lo pulsable es la
 *     tarjeta, un anillo alrededor de una palabra no dice donde esta el foco.
 *   - Cualquier control que una columna meta en la tarjeta (un enlace, un
 *     boton, un `<details>`) sube por encima de la capa con `relative`, para
 *     que siga recibiendo su propio toque.
 *
 * La TABLA del escritorio no cambia: alli el raton apunta bien y una fila
 * entera pulsable estorbaria para seleccionar y copiar un correo.
 */
export function ResponsiveRecords<TRow>({
  caption,
  scrollRegionLabel,
  rows,
  rowKey,
  columns,
  emptyState,
  rowHref,
}: {
  readonly caption: string;
  readonly scrollRegionLabel: string;
  readonly rows: readonly TRow[];
  readonly rowKey: (row: TRow) => string;
  /** La PRIMERA columna es la que identifica la fila y titula la tarjeta. */
  readonly columns: readonly ResponsiveColumn<TRow>[];
  readonly emptyState: ReactNode;
  /**
   * Destino de la tarjeta en el telefono, ya con `adminHref`. `null` para una
   * fila sin ficha. Tiene que ser el MISMO destino que el enlace del titulo:
   * la tarjeta no puede llevar a un sitio y su titulo a otro.
   */
  readonly rowHref?: (row: TRow) => string | null;
}) {
  if (rows.length === 0) return <>{emptyState}</>;

  const [primary, ...secondary] = columns;
  if (primary === undefined) return null;

  return (
    <>
      <ul className="flex list-none flex-col gap-s3 md:hidden print:hidden" aria-label={caption}>
        {rows.map((row) => {
          const href = rowHref === undefined ? null : rowHref(row);
          const linked = href !== null;

          return (
            <li key={rowKey(row)}>
              <Card
                elevation="flat"
                padding="md"
                className={cn(
                  linked && [
                    "relative transition-colors duration-fast",
                    "hover:border-border-strong hover:bg-surface-raised active:bg-surface-sunken",
                    "has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-focus",
                    "has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-bg",
                  ],
                )}
              >
                {linked ? (
                  <Link
                    href={href}
                    aria-hidden="true"
                    tabIndex={-1}
                    className="absolute inset-0 rounded-lg"
                  />
                ) : null}

                <div
                  className={cn(
                    linked && "[&_:is(a,button,input,select,textarea,summary,label)]:relative",
                  )}
                >
                  <div className="flex items-start justify-between gap-s3">
                    <div className="min-w-0 break-words text-body-md font-medium text-text">
                      {primary.cell(row)}
                    </div>

                    {linked ? <Chevron /> : null}
                  </div>

                  {secondary.length === 0 ? null : (
                    <dl className="mt-s3 grid grid-cols-2 gap-x-s4 gap-y-s3 text-body-sm">
                      {secondary.map((column) => (
                        <div
                          key={column.id}
                          className={cn("min-w-0", column.cardSpan === "full" && "col-span-2")}
                        >
                          <dt className="text-caption uppercase tracking-wide text-text-subtle">
                            {column.header}
                          </dt>
                          <dd className="mt-s1 break-words text-text">{column.cell(row)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      {/*
       * LA CELDA QUE TITULA LA FILA, A LA ALTURA DE LAS DEMAS. `DataTable` la
       * pinta como `th scope="row"` -bien para el lector de pantalla- pero un
       * `th` se centra en vertical y con letra de etiqueta, mientras que las
       * `td` van arriba y con letra de cuerpo. En cuanto otra celda de la fila
       * ocupaba dos lineas, el nombre del producto o el numero de pedido
       * quedaba visiblemente mas abajo que el resto. Se alinea desde aqui, para
       * todas las tablas del panel a la vez y sin tocar la primitiva.
       */}
      <div className="hidden md:block print:block [&_tbody_th]:align-top [&_tbody_th]:text-body-sm">
        <DataTable<TRow>
          caption={caption}
          scrollRegionLabel={scrollRegionLabel}
          rows={rows}
          rowKey={rowKey}
          columns={columns}
        />
      </div>
    </>
  );
}

/**
 * Flecha de "se abre". Decorativa: el nombre del destino ya lo dice el enlace
 * del titulo, y repetirlo para el lector de pantalla seria ruido.
 */
function Chevron() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 20 20"
      className="mt-0.5 h-5 w-5 shrink-0 text-text-subtle"
      fill="none"
    >
      <path
        d="M7.5 4.5 13 10l-5.5 5.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
