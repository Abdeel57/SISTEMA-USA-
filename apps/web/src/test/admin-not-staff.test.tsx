import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

/*
 * Traductor de servidor sobre los MISMOS diccionarios de la aplicacion, y el
 * marco del panel reducido a su contenido: lo que se prueba es el aviso.
 */
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const es = (await import("../../messages/es-US.json")).default;
  return {
    // El aviso solo pide `admin.access`.
    getTranslations: () =>
      Promise.resolve(createTranslator({ locale: "es", messages: es, namespace: "admin.access" })),
  };
});

vi.mock("@/components/admin/admin-chrome", () => ({
  AdminAccessFrame: ({ children }: { readonly children: ReactNode }) => children,
  AdminChrome: ({ children }: { readonly children: ReactNode }) => children,
}));

import { NotStaffNotice } from "@/components/admin/admin-screen";

/**
 * SESION DE CLIENTE EN EL PANEL (2026-10-31).
 *
 * El dueno probo una compra ("Apartar") en su navegador, le caduco la sesion
 * de personal y el panel le dijo "esta cuenta no tiene acceso" sin ninguna
 * salida hacia el login: no podia entrar a su propio panel. El aviso tiene
 * que llevar a iniciar sesion como administrador, y volver despues a la
 * pantalla que se pidio.
 */
describe("NotStaffNotice", () => {
  it("ofrece entrar como administrador y volver a la pantalla pedida", async () => {
    render(await NotStaffNotice({ locale: "es", returnPath: "/orders" }));

    const signIn = screen.getByRole("link", { name: "Entrar como administrador" });
    expect(signIn.getAttribute("href")).toBe(
      `/admin/es/login?next=${encodeURIComponent("/admin/es/orders")}`,
    );
    // Y sigue la salida hacia la tienda.
    expect(screen.getByRole("link", { name: "Volver a la tienda" }).getAttribute("href")).toBe(
      "/es",
    );
  });
});
