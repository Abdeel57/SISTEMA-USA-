"use client";

import { cn } from "@app/ui";
import type { ReactNode } from "react";

import { usePathname } from "@/i18n/navigation";

/**
 * El `<main>` de la tienda: oscuro en la portada y BLANCO en todas las demas
 * paginas (2026-10-13).
 *
 * El usuario pidio que fuera de la portada el fondo sea blanco, para que se
 * note de un vistazo que se ha salido de ella. La clase `app-theme-light`
 * redeclara los tokens de color en este elemento (`storeLightThemeCss`), asi
 * que todo lo que hay dentro -tarjetas, botones, campos, avisos- pasa a claro
 * sin que ninguna pagina tenga que saberlo. La cabecera y el pie quedan fuera
 * de `<main>` y siguen oscuros.
 *
 * Es un componente de cliente solo para leer la ruta: `usePathname` de
 * next-intl devuelve la ruta SIN el prefijo de idioma, de modo que la portada
 * es `/` en los dos idiomas. En el servidor tambien la conoce, asi que el HTML
 * llega ya con la clase buena y no hay parpadeo de oscuro a blanco.
 */
export function SiteMain({
  label,
  children,
}: {
  /** Nombre del punto de referencia, ya traducido. */
  readonly label: string;
  readonly children: ReactNode;
}) {
  const isHome = usePathname() === "/";

  return (
    <main
      id="main"
      aria-label={label}
      className={cn("flex-1", !isHome && "app-theme-light bg-bg text-text")}
    >
      {children}
    </main>
  );
}
