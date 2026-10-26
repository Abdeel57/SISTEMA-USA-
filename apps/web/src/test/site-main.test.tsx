import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * EL `<main>` DE LA TIENDA (2026-10-13): oscuro en la portada y blanco en todas
 * las demas paginas. Lo que se protege es la frontera: que la portada NO se
 * vuelva blanca y que ninguna otra pagina se quede oscura.
 */

const current = vi.hoisted((): { pathname: string } => ({ pathname: "/" }));

vi.mock("@/i18n/navigation", () => ({ usePathname: () => current.pathname }));

import { SiteMain } from "@/components/site-main";

function renderAt(pathname: string) {
  current.pathname = pathname;
  return render(
    <SiteMain label="Contenido principal">
      <p>contenido</p>
    </SiteMain>,
  );
}

describe("SiteMain", () => {
  it("la portada se queda oscura", () => {
    renderAt("/");
    expect(screen.getByRole("main", { name: "Contenido principal" })).not.toHaveClass(
      "app-theme-light",
    );
  });

  it.each(["/cart", "/shop", "/account/orders", "/products/gorra", "/no-existe"])(
    "%s es blanca",
    (pathname) => {
      renderAt(pathname);
      expect(screen.getByRole("main")).toHaveClass("app-theme-light", "bg-bg", "text-text");
    },
  );

  it("conserva el destino del enlace de salto", () => {
    renderAt("/cart");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
  });
});
