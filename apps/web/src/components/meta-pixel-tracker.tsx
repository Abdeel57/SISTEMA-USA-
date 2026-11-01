"use client";

import { useLocale } from "next-intl";
import { useEffect } from "react";

import { usePathname } from "@/i18n/navigation";
import { META_CLICK_EVENTS, META_EVENT_ATTRIBUTE } from "@/lib/meta-pixel";
import { syncMetaPageView, trackMetaEvent, type MetaStandardEvent } from "@/lib/meta-pixel-events";

/**
 * El pixel de Meta mientras se navega por la tienda (DEC-086, DEC-087).
 *
 * El codigo base del `<head>` ya inicializo el pixel y mando el primer
 * `PageView`. La tienda navega SIN recargar, asi que aqui se manda uno en cada
 * cambio de ruta (`syncMetaPageView` no repite el de la pagina en la que ya se
 * mando, ni lo manda en una ruta excluida).
 *
 * Tambien escucha los clics en elementos marcados con `data-meta-event`
 * (DEC-086): asi un boton no necesita ser componente de cliente para medir su
 * conversion.
 *
 * No pinta nada. Sin pixel en el sitio no hace nada: las funciones de
 * `lib/meta-pixel-events` devuelven `false` sin tocar Meta.
 */
export function MetaPixelTracker() {
  // La ruta de next-intl llega SIN el idioma: cambiar de idioma tambien es
  // otra pagina, asi que el efecto depende de los dos.
  const pathname = usePathname();
  const locale = useLocale();

  useEffect(() => {
    syncMetaPageView();
  }, [pathname, locale]);

  useEffect(() => {
    function onClick(event: MouseEvent): void {
      const marked =
        event.target instanceof Element ? event.target.closest(`[${META_EVENT_ATTRIBUTE}]`) : null;
      const name = marked?.getAttribute(META_EVENT_ATTRIBUTE) ?? null;
      if (name === null || !META_CLICK_EVENTS.includes(name)) return;
      trackMetaEvent(name as MetaStandardEvent);
    }

    // En captura: sale antes de que el enlace navegue.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
