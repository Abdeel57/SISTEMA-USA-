import { cn } from "@app/ui";
import Image from "next/image";

/**
 * La foto del premio en el hero, ENTERA.
 *
 * POR QUE DOS CAPAS
 * -----------------
 * El hueco del hero tiene una proporcion fija -apaisado 3:2 en telefono, casi
 * cuadrado en escritorio- y la foto la sube cada cliente desde el panel con la
 * proporcion que tenga. Con `object-cover` (hasta 2026-10-27) la foto se
 * recortaba a ese hueco: una foto cuadrada perdia arriba y abajo, una
 * panoramica perdia los lados, y lo que se perdia era el premio. El encuadre
 * se media para UNA foto concreta y dejaba de valer con la siguiente.
 *
 * Ahora la foto se ENCAJA entera (`object-contain`) y lo que no cubre lo
 * rellena la misma foto a sangre y desenfocada, detras. El premio se ve
 * completo con cualquier proporcion y el hueco no ensena franjas de color
 * plano: el fondo es la propia foto, asi que el borde entre las dos capas no
 * se nota.
 *
 * LA CAPA DE FONDO ES DECORATIVA Y BARATA. Lleva `alt=""` y `aria-hidden`: un
 * lector de pantalla ve UNA foto, no dos. Y pide la variante mas pequena del
 * optimizador (`sizes` de un cuarto de pantalla): desenfocada a ese nivel, mas
 * resolucion no se ve.
 */
export function HeroPhoto({
  src,
  alt,
  sizes,
  priority = false,
  loading,
  className,
}: {
  readonly src: string;
  /** `""` si es decorativa. */
  readonly alt: string;
  /** `sizes` de la foto principal (`next/image`). */
  readonly sizes: string;
  readonly priority?: boolean;
  readonly loading?: "eager" | "lazy";
  /** Encuadre de la foto principal (`object-*`). */
  readonly className?: string | undefined;
}) {
  const loadingProp = loading === undefined ? {} : { loading };

  return (
    <>
      <Image
        src={src}
        alt=""
        aria-hidden="true"
        fill
        priority={priority}
        {...loadingProp}
        sizes="25vw"
        draggable={false}
        // `scale-110`: el desenfoque aclara los bordes; agrandada, esos bordes
        // quedan fuera del hueco.
        className="pointer-events-none select-none scale-110 object-cover object-center opacity-80 blur-2xl saturate-[1.15]"
      />
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        {...loadingProp}
        sizes={sizes}
        draggable={false}
        className={cn("select-none object-contain", className)}
      />
    </>
  );
}
