import { describe, expect, it } from "vitest";

import { toAdminActor } from "@/lib/admin/capabilities";
import {
  ADMIN_NAV,
  ADMIN_NAV_GROUPS,
  ADMIN_QUICK_NAV,
  groupedNavFor,
  quickNavFor,
  visibleNavFor,
} from "@/lib/admin/navigation";
import {
  promotionManagerSession,
  staffSessionWithoutCapabilities,
  templateAdminSession,
} from "@/mocks/fixtures/admin";

import enMessages from "../../messages/en-US.json";
import esMessages from "../../messages/es-US.json";

/**
 * EL MENU AGRUPADO Y LA BARRA DEL TELEFONO.
 *
 * El menu del panel se pinta en tres sitios -la columna de la computadora, la
 * barra inferior del telefono y el panel "Mas"- y los tres salen de la misma
 * lista filtrada por capacidad. Lo que se vigila aqui es que agrupar y
 * recortar no pierda ni invente secciones.
 */

describe("menu agrupado", () => {
  it("cada seccion pertenece a un grupo que existe", () => {
    for (const item of ADMIN_NAV) {
      expect(ADMIN_NAV_GROUPS, `entrada ${item.key}`).toContain(item.group);
    }
  });

  it("agrupar no pierde ni repite secciones: es exactamente lo visible", () => {
    for (const session of [templateAdminSession, promotionManagerSession]) {
      const actor = toAdminActor(session);
      const grouped = groupedNavFor(actor).flatMap((entry) => entry.items.map((item) => item.key));
      const visible = visibleNavFor(actor).map((item) => item.key);
      expect([...grouped].sort()).toEqual([...visible].sort());
      expect(new Set(grouped).size).toBe(grouped.length);
    }
  });

  it("un grupo sin secciones visibles no se pinta", () => {
    expect(groupedNavFor(toAdminActor(staffSessionWithoutCapabilities))).toEqual([]);
    for (const entry of groupedNavFor(toAdminActor(promotionManagerSession))) {
      expect(entry.items.length, `grupo ${entry.group}`).toBeGreaterThan(0);
    }
  });

  it("la barra del telefono solo lleva secciones que el actor puede abrir", () => {
    const admin = quickNavFor(toAdminActor(templateAdminSession)).map((item) => item.key);
    expect(admin).toEqual([...ADMIN_QUICK_NAV]);
    expect(quickNavFor(toAdminActor(staffSessionWithoutCapabilities))).toEqual([]);
  });

  it.each([
    ["en", enMessages],
    ["es", esMessages],
  ] as const)("los grupos y las etiquetas cortas tienen texto (%s)", (_locale, messages) => {
    for (const group of ADMIN_NAV_GROUPS) {
      expect(messages.admin.navGroups[group], `grupo ${group}`).toBeTruthy();
    }
    for (const key of ADMIN_QUICK_NAV) {
      expect(messages.admin.navShort[key], `corta ${key}`).toBeTruthy();
    }
  });
});
