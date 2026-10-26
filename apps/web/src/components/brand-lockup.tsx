import { cn } from "@app/ui";
import Image from "next/image";
import { useTranslations } from "next-intl";

import { safeImageUrl } from "@/lib/media-url";

/**
 * Bloque de marca: simbolo + logotipo tipografico de dos lineas.
 *
 * DE DONDE SALE CADA PIEZA
 * ------------------------
 *   - El SIMBOLO es el logotipo que el administrador subio desde el panel
 *     (`logoUrl`, una ruta `/media/...`), y si no hay ninguno,
 *     `public/brand/brand-mark.png` (cuadrado, fondo transparente).
 *   - El LOGOTIPO se compone con la tipografia de marca a partir de
 *     `wordmark.lead` y `wordmark.tail` -los de la marca guardada, que ya
 *     vienen sustituidos en el diccionario-: la primera linea en el color de
 *     texto y la segunda en el color de marca.
 *
 * Asi escala a cualquier tamano sin halos de compresion y cambia de cliente sin
 * cambiar de imagen ni redesplegar.
 *
 * LAS DOS LINEAS FORMAN UN BLOQUE (DEC-073)
 * -----------------------------------------
 * El bloque es una rejilla de una columna: su ancho es el de la linea mas
 * larga y las dos se estiran a ese ancho. La segunda linea reparte sus letras
 * con `justify-between`, de modo que si es la mas corta ocupa el mismo ancho
 * que la primera, y si es la mas larga simplemente marca el ancho. Funciona
 * con cualquier par de palabras y con la fuente de respaldo.
 *
 * ACCESIBILIDAD
 * -------------
 * La imagen es DECORATIVA (`alt=""`) y el logotipo visual va `aria-hidden`:
 * partido en letras, un lector de pantalla podria deletrearlo. El nombre se
 * dice una vez, entero, con el texto oculto `brand.name`.
 */

export type BrandLockupSize = "sm" | "md" | "lg";

/**
 * Lado de la marca en pixeles CSS por tamano.
 *
 * `switch` exhaustivo: anadir un tamano al tipo deja de compilar aqui en vez de
 * renderizar una imagen sin dimensiones, que es la causa habitual de que la
 * cabecera de un sitio de un salto al cargar.
 */
function markPixels(size: BrandLockupSize): number {
  switch (size) {
    case "sm":
      return 28;
    case "md":
      return 40;
    case "lg":
      return 76;
  }
}

/**
 * Cuerpo del logotipo. `leading-none` despues del tamano: el alto de linea del
 * token separaria las dos lineas y el bloque dejaria de leerse como una pieza.
 * En `md` cabe en la cabecera de un telefono de 360px junto a la hamburguesa,
 * la cuenta y el carrito sin descentrar la marca (DEC-073).
 */
function wordmarkClass(size: BrandLockupSize): string {
  switch (size) {
    case "sm":
      return "text-body-sm leading-none";
    case "md":
      return "text-heading-sm leading-none sm:text-heading-md sm:leading-none";
    case "lg":
      return "text-heading-lg leading-none sm:text-display-md sm:leading-none";
  }
}

/** El simbolo de la plantilla, cuando el panel no ha subido ninguno. */
const DEFAULT_MARK = "/brand/brand-mark.png";

export function BrandLockup({
  size = "md",
  className,
  logoUrl,
}: {
  readonly size?: BrandLockupSize;
  readonly className?: string;
  /** Logotipo subido desde el panel (`/media/...`), o `null`/ausente para el de la plantilla. */
  readonly logoUrl?: string | null | undefined;
}) {
  const t = useTranslations("brand");
  const pixels = markPixels(size);
  const mark = safeImageUrl(logoUrl) ?? DEFAULT_MARK;

  return (
    <span className={cn("inline-flex items-center gap-2.5 sm:gap-3", className)}>
      {/* `priority`: el bloque de marca esta siempre por encima del pliegue en
          la cabecera, asi que no debe cargarse con retraso. Las dimensiones van
          explicitas para reservar el hueco antes de que llegue el archivo.
          El logotipo subido se sirve tal cual (`unoptimized`): ya es pequeno,
          es inmutable y asi conserva su transparencia sin pasar por el
          optimizador. */}
      <Image
        src={mark}
        alt=""
        width={pixels}
        height={pixels}
        priority
        unoptimized={mark !== DEFAULT_MARK}
        className="h-auto w-auto shrink-0 object-contain"
        style={{ width: pixels, height: pixels }}
      />

      <span className="sr-only">{t("name")}</span>

      <span
        aria-hidden="true"
        className={cn("app-display inline-grid gap-[0.14em]", wordmarkClass(size))}
      >
        <span className="whitespace-nowrap text-text">{t("wordmarkLead")}</span>
        <span className="flex justify-between whitespace-nowrap text-brand">
          {Array.from(t("wordmarkTail")).map((letter, index) => (
            <span key={`${letter}-${String(index)}`}>{letter}</span>
          ))}
        </span>
      </span>
    </span>
  );
}
