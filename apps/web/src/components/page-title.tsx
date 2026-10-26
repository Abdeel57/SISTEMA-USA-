import type { ReactNode } from "react";

/**
 * Titulo de una pagina interior: carrito, pago, cuenta, acceso, confirmacion,
 * metodo gratuito (2026-10-13).
 *
 * Antes cada pagina escribia su `h1` a mano, y seis de ellas pedian
 * `text-display-sm`, un tamano que la escala tipografica no tiene: Tailwind no
 * generaba la clase y el titulo caia al tamano del cuerpo de texto, mas pequeno
 * que los subtitulos de la misma pagina. Una sola pieza deja los titulos
 * iguales en todas las pantallas: el titular de impacto de la marca y su
 * filete debajo.
 */
export function PageTitle({ children }: { readonly children: ReactNode }) {
  return (
    <>
      <h1 className="app-headline text-display-md text-text sm:text-display-lg">{children}</h1>
      <div aria-hidden="true" className="app-gold-rule mt-s4 max-w-[7rem]" />
    </>
  );
}
