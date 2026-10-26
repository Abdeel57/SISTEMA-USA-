"use client";

import { cn, Drawer } from "@app/ui";
import { useState, type MouseEvent, type ReactNode } from "react";

/**
 * El boton "Mas" de la barra inferior del panel y el panel que abre.
 *
 * Es lo unico del menu que necesita JavaScript: abrir y cerrar. El CONTENIDO
 * -todas las secciones agrupadas, el idioma, la sesion y el boton de salir- se
 * pinta en el servidor y llega como `children`, asi que la lista de secciones
 * sigue saliendo de `visibleNavFor(actor)` y no hay una segunda copia del menu
 * en el cliente.
 *
 * Al pulsar un enlace del panel, el panel se cierra: la pagina nueva no puede
 * aparecer tapada por el menu que la abrio.
 */
export function AdminMoreMenu({
  label,
  title,
  closeLabel,
  icon,
  active,
  children,
}: {
  /** Texto del boton de la barra ("Mas"). */
  readonly label: string;
  /** Titulo del panel ("Todas las secciones"). Es su nombre accesible. */
  readonly title: string;
  readonly closeLabel: string;
  readonly icon: ReactNode;
  /** La pantalla actual NO esta en la barra: el boton "Mas" se marca. */
  readonly active: boolean;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  function closeOnLink(event: MouseEvent<HTMLDivElement>) {
    if (event.target instanceof Element && event.target.closest("a") !== null) setOpen(false);
  }

  return (
    <Drawer
      open={open}
      onOpenChange={setOpen}
      side="bottom"
      title={title}
      closeLabel={closeLabel}
      // El borde inferior del iPhone: el ultimo boton no queda bajo el indicador.
      className="pb-[env(safe-area-inset-bottom)]"
      trigger={
        <button
          type="button"
          aria-haspopup="dialog"
          className={cn(
            "flex h-full w-full flex-col items-center justify-center gap-0.5 px-1",
            "text-[0.6875rem] font-semibold leading-tight",
            "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus",
            active || open ? "text-brand" : "text-text-muted",
          )}
        >
          {icon}
          <span>{label}</span>
        </button>
      }
    >
      <div onClickCapture={closeOnLink}>{children}</div>
    </Drawer>
  );
}
