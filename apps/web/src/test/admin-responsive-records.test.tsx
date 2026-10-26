import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ResponsiveRecords, type ResponsiveColumn } from "@/components/admin/responsive-records";

/**
 * LISTADOS DEL PANEL: TABLA EN EL ESCRITORIO, TARJETAS EN EL TELEFONO.
 *
 * LO QUE ESTE FICHERO PROTEGE
 * ---------------------------
 * 1. Que con `rowHref` la tarjeta ENTERA sea pulsable sin anadir un segundo
 *    enlace accesible por fila: la capa que cubre la tarjeta va con
 *    `aria-hidden` y fuera del orden de tabulacion, y el unico enlace que
 *    anuncia el lector de pantalla sigue siendo el del titulo, con su nombre.
 * 2. Que la capa lleve EXACTAMENTE al mismo sitio que el titulo.
 * 3. Que una fila sin destino (`null`) no reciba capa: seria un enlace a
 *    ninguna parte.
 * 4. Que las columnas marcadas `cardSpan: "full"` ocupen la tarjeta a lo ancho.
 *
 * jsdom no aplica Tailwind, asi que la tabla y las tarjetas estan las dos en el
 * DOM a la vez; por eso las comprobaciones se hacen dentro de la lista de
 * tarjetas (`list` con el nombre del listado).
 */

interface Row {
  readonly id: string;
  readonly number: string;
  readonly total: string;
  readonly address: string;
}

const ROWS: readonly Row[] = [
  { id: "ord_1", number: "APP-00000001", total: "$10.00", address: "1 Main St, Austin, TX" },
  { id: "ord_2", number: "APP-00000002", total: "$20.00", address: "2 Main St, Austin, TX" },
];

const hrefOf = (id: string): string => `/admin/es/orders/${id}`;

const COLUMNS: readonly ResponsiveColumn<Row>[] = [
  {
    id: "order",
    header: "Pedido",
    isRowHeader: true,
    cell: (row) => <a href={hrefOf(row.id)}>{row.number}</a>,
  },
  { id: "total", header: "Total", cell: (row) => row.total },
  { id: "address", header: "Direccion", cardSpan: "full", cell: (row) => row.address },
];

function renderRecords(rowHref?: (row: Row) => string | null) {
  return render(
    <ResponsiveRecords<Row>
      caption="Pedidos"
      scrollRegionLabel="Pedidos"
      rows={ROWS}
      rowKey={(row) => row.id}
      columns={COLUMNS}
      emptyState={<p>vacio</p>}
      {...(rowHref === undefined ? {} : { rowHref })}
    />,
  );
}

describe("ResponsiveRecords: la tarjeta entera abre la ficha", () => {
  it("con rowHref, cada tarjeta lleva una capa enlazada al mismo destino que su titulo", () => {
    renderRecords((row) => hrefOf(row.id));

    const cards = within(screen.getByRole("list", { name: "Pedidos" })).getAllByRole("listitem");
    expect(cards).toHaveLength(ROWS.length);

    ROWS.forEach((row, index) => {
      const card = cards.at(index);
      if (card === undefined) throw new Error("tarjeta inexistente");

      const overlays = card.querySelectorAll('a[aria-hidden="true"]');
      expect(overlays).toHaveLength(1);

      const overlay = overlays[0];
      expect(overlay).toHaveAttribute("href", hrefOf(row.id));
      // Fuera del tabulador: el teclado llega por el titulo, no dos veces.
      expect(overlay).toHaveAttribute("tabindex", "-1");
      expect(overlay).toHaveClass("absolute", "inset-0");

      // UN solo enlace accesible por tarjeta: el del titulo, con su nombre.
      const links = within(card).getAllByRole("link");
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAccessibleName(row.number);
      expect(links[0]).toHaveAttribute("href", hrefOf(row.id));
    });
  });

  it("sin rowHref no hay capa, y la tarjeta solo se abre por el titulo", () => {
    const { container } = renderRecords();

    expect(container.querySelectorAll('a[aria-hidden="true"]')).toHaveLength(0);
  });

  it("una fila sin ficha (null) no recibe capa; las demas si", () => {
    renderRecords((row) => (row.id === "ord_1" ? null : hrefOf(row.id)));

    const [first, second] = within(screen.getByRole("list", { name: "Pedidos" })).getAllByRole(
      "listitem",
    );

    expect(first?.querySelectorAll('a[aria-hidden="true"]')).toHaveLength(0);
    expect(second?.querySelectorAll('a[aria-hidden="true"]')).toHaveLength(1);
  });

  it("la tabla del escritorio no cambia: sin capas y con todas las columnas", () => {
    renderRecords((row) => hrefOf(row.id));

    const table = screen.getByRole("table");
    expect(table.querySelectorAll('a[aria-hidden="true"]')).toHaveLength(0);
    expect(within(table).getAllByRole("columnheader")).toHaveLength(COLUMNS.length);
  });

  it('una columna con cardSpan "full" ocupa la tarjeta a lo ancho', () => {
    renderRecords();

    const card = within(screen.getByRole("list", { name: "Pedidos" })).getAllByRole("listitem")[0];
    if (card === undefined) throw new Error("sin tarjetas");

    const address = within(card).getByText("Direccion").parentElement;
    expect(address).toHaveClass("col-span-2");

    const total = within(card).getByText("Total").parentElement;
    expect(total).not.toHaveClass("col-span-2");
  });

  it("sin filas pinta el estado vacio y nada mas", () => {
    render(
      <ResponsiveRecords<Row>
        caption="Pedidos"
        scrollRegionLabel="Pedidos"
        rows={[]}
        rowKey={(row) => row.id}
        columns={COLUMNS}
        emptyState={<p>vacio</p>}
        rowHref={(row) => hrefOf(row.id)}
      />,
    );

    expect(screen.getByText("vacio")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
