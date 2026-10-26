import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DashboardStatGrid, type DashboardStat } from "@/components/admin/dashboard-stat-grid";
import type { AdminActor } from "@/lib/admin/capabilities";
import {
  DASHBOARD_STAT_KEYS,
  dashboardStatPath,
  dashboardStatTarget,
} from "@/lib/admin/dashboard-links";
import { ADMIN_NAV } from "@/lib/admin/navigation";
import type { AdminCapability } from "@/lib/api";

import esMessages from "../../messages/es-US.json";

/**
 * LAS CIFRAS DE LA PORTADA LLEVAN A SU SECCION.
 *
 * LO QUE ESTE FICHERO PROTEGE
 * ---------------------------
 * 1. Que cada cifra enlace a la seccion que le corresponde -participaciones y
 *    participantes al listado de participantes, pedidos a pedidos, gratuitas a
 *    su cola, ajustes a los suyos- y que la tarjeta ENTERA sea el enlace.
 * 2. Que el enlace exista solo si quien mira puede abrir esa seccion, con LAS
 *    MISMAS capacidades que su entrada del menu (`ADMIN_NAV`). Si las dos
 *    listas se separaran, la portada mandaria a alguien a una puerta que el
 *    menu le esconde.
 * 3. Que sin la capacidad la cifra se siga viendo: ocultar el enlace no puede
 *    ocultar el dato.
 */

function actorWith(...capabilities: AdminCapability[]): AdminActor {
  return {
    email: "admin@example.com",
    roles: ["ADMIN"],
    capabilities: new Set(capabilities),
    capabilitiesPublished: true,
  };
}

const ALL = actorWith(
  "participant.list",
  "order.read",
  "amoe.review.read",
  "entry.adjust.create",
  "entry.adjust.approve",
);

const STATS: readonly DashboardStat[] = [
  { key: "activeEntries", label: "Participaciones activas", value: "11,450", tone: "brand" },
  { key: "participants", label: "Participantes", value: "320" },
  { key: "orders24h", label: "Pedidos, últimas 24 horas", value: "12" },
  { key: "amoePending", label: "Gratuitas por revisar", value: "3", tone: "warning" },
  { key: "adjustmentsPending", label: "Ajustes por aprobar", value: "0" },
];

describe("a donde lleva cada cifra", () => {
  it("cada cifra va a su seccion", () => {
    expect(dashboardStatPath(ALL, "activeEntries")).toBe("/participants");
    expect(dashboardStatPath(ALL, "participants")).toBe("/participants");
    expect(dashboardStatPath(ALL, "orders24h")).toBe("/orders");
    expect(dashboardStatPath(ALL, "amoePending")).toBe("/amoe");
    expect(dashboardStatPath(ALL, "adjustmentsPending")).toBe("/adjustments");
  });

  it("sin la capacidad de la seccion no hay enlace", () => {
    const none = actorWith();

    for (const key of DASHBOARD_STAT_KEYS) {
      expect(dashboardStatPath(none, key), key).toBeNull();
    }
  });

  it("ajustes se abre con CUALQUIERA de sus dos capacidades, como en el menu", () => {
    expect(dashboardStatPath(actorWith("entry.adjust.approve"), "adjustmentsPending")).toBe(
      "/adjustments",
    );
    expect(dashboardStatPath(actorWith("entry.adjust.create"), "adjustmentsPending")).toBe(
      "/adjustments",
    );
  });

  it("cada destino exige las MISMAS capacidades que su entrada del menu", () => {
    for (const key of DASHBOARD_STAT_KEYS) {
      const target = dashboardStatTarget(key);
      const entry = ADMIN_NAV.find((item) => item.path === target.path);

      expect(entry, `sin entrada de menu para ${target.path}`).toBeDefined();
      expect([...target.capabilities].sort(), key).toEqual([...(entry?.capabilities ?? [])].sort());
    }
  });
});

describe("DashboardStatGrid", () => {
  it("con todas las capacidades, cada tarjeta entera es un enlace a su seccion", () => {
    render(<DashboardStatGrid locale="es" actor={ALL} stats={STATS} />);

    const expected: Readonly<Record<string, string>> = {
      "Participaciones activas": "/admin/es/participants",
      Participantes: "/admin/es/participants",
      "Pedidos, últimas 24 horas": "/admin/es/orders",
      "Gratuitas por revisar": "/admin/es/amoe",
      "Ajustes por aprobar": "/admin/es/adjustments",
    };

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(STATS.length);

    for (const [label, href] of Object.entries(expected)) {
      // El nombre accesible del enlace es la tarjeta entera: etiqueta y cifra.
      const link = links.find((candidate) => within(candidate).queryByText(label) !== null);
      expect(link, label).toBeDefined();
      expect(link).toHaveAttribute("href", href);
    }

    const orders = links.find((link) => within(link).queryByText("12") !== null);
    expect(orders).toHaveAccessibleName(/Pedidos, últimas 24 horas\s*12/u);
  });

  it("sin una capacidad, ESA cifra se sigue viendo pero deja de ser enlace", () => {
    render(<DashboardStatGrid locale="en" actor={actorWith("order.read")} stats={STATS} />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/admin/en/orders");

    // El dato no desaparece con el enlace.
    expect(screen.getByText("Gratuitas por revisar")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Gratuitas por revisar").closest("a")).toBeNull();
  });

  it("las claves de la portada existen en el diccionario", () => {
    // Las etiquetas de verdad salen de `admin.dashboard`; si una clave de cifra
    // desapareciera, la portada pintaria su ruta en vez del texto.
    expect(Object.keys(esMessages.admin.dashboard)).toEqual(
      expect.arrayContaining([...DASHBOARD_STAT_KEYS]),
    );
  });
});
