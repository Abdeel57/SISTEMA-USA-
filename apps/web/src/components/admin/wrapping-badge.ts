/**
 * Clases que hacen PARTIRSE en lineas a una insignia que no expone `wrap`.
 *
 * `Badge` de `@app/ui` ya acepta `wrap`, y en el panel se usa siempre que el
 * estado es el dato que se busca. Pero `PromotionStatusBadge` es compartida con
 * el escaparate -donde cortar con "..." es lo correcto: una insignia de dos
 * lineas descuadra la rejilla del hero- y no reenvia esa prop. En el panel, en
 * cambio, "PREPARANDO LA EXP..." no dice en que estado esta la promocion.
 *
 * Se resuelve desde FUERA, sin tocar el componente compartido: la insignia
 * pinta su texto en un `span` hijo con `truncate`, y estas clases le devuelven
 * el salto de linea solo donde se pasan. `whitespace-normal` gana a la
 * `white-space: nowrap` de `truncate` por especificidad (selector de hijo), y
 * con el texto partido `text-overflow` deja de tener nada que cortar.
 */
export const WRAPPING_BADGE_CLASS =
  "[&>span]:min-w-0 [&>span]:whitespace-normal [&>span]:break-words";
