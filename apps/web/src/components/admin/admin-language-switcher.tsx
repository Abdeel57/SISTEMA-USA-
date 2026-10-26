"use client";

import { cn } from "@app/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { ADMIN_BASE } from "@/i18n/admin-routing";
import { isLocale, LOCALES, type Locale } from "@/i18n/locales";

/**
 * Conmutador de idioma del PANEL.
 *
 * POR QUE NO SE REUTILIZA EL DEL ESCAPARATE
 * -----------------------------------------
 * Aquel usa `Link` y `usePathname` de `@/i18n/navigation`, que son los del
 * router de next-intl y trabajan con rutas SIN prefijo de idioma. El panel no
 * esta en ese router: su prefijo es `/admin/<locale>` y lo resuelve el
 * middleware por su cuenta (DEC-048). Usar alli el `Link` de next-intl
 * produciria `/es/admin/...`, que es exactamente la ruta en la que la cookie de
 * personal deja de viajar.
 *
 * Es la unica excepcion documentada a la regla de no importar `next/link`
 * directamente, y esta acotada al subarbol `/admin`.
 *
 * CONSERVA LA RUTA. Cambiar de idioma en `/admin/es/amoe` lleva a
 * `/admin/en/amoe`, no a la portada del panel: se sustituye UNICAMENTE el
 * segundo segmento.
 *
 * Es un control segmentado -los dos idiomas lado a lado, el actual en blanco
 * y con sombra- porque asi se ve a la vez cual esta puesto y cual es el otro.
 * `size="lg"` es el del menu del telefono: ocupa todo el ancho y cada mitad
 * mide 44px de alto.
 */
export function AdminLanguageSwitcher({
  locale,
  size = "md",
  className,
}: {
  readonly locale: Locale;
  readonly size?: "md" | "lg";
  readonly className?: string;
}) {
  const pathname = usePathname();
  const t = useTranslations();

  return (
    <nav aria-label={t("a11y.languageSwitcher")} className={cn("flex items-center", className)}>
      <ul
        className={cn(
          "flex list-none items-center gap-0.5 rounded-lg border border-border bg-surface-sunken p-0.5",
          size === "lg" && "w-full",
        )}
      >
        {LOCALES.map((candidate) => {
          const isCurrent = candidate === locale;

          return (
            <li key={candidate} className={cn(size === "lg" && "flex-1")}>
              <Link
                href={swapAdminLocale(pathname, candidate)}
                hrefLang={candidate}
                {...(isCurrent ? { "aria-current": "true" as const } : {})}
                className={cn(
                  "inline-flex w-full items-center justify-center rounded-md px-3 text-body-sm font-medium",
                  size === "lg" ? "min-h-touch" : "min-h-9",
                  "transition-colors duration-fast ease-standard",
                  "outline-none focus-visible:ring-2 focus-visible:ring-focus",
                  isCurrent
                    ? "bg-surface font-semibold text-text shadow-sm"
                    : "text-text-muted hover:text-text",
                )}
              >
                {candidate === "en" ? t("localeName.en") : t("localeName.es")}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Sustituye el segmento de idioma de una ruta del panel.
 *
 * Si la ruta no tiene la forma esperada -algo que solo pasaria si este
 * componente se montara fuera de `/admin`- devuelve la portada del panel en el
 * idioma pedido, en vez de componer una ruta inventada.
 */
function swapAdminLocale(pathname: string, target: Locale): string {
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] !== "admin" || segments[1] === undefined || !isLocale(segments[1])) {
    return `${ADMIN_BASE}/${target}`;
  }

  const rest = segments.slice(2);
  return `${ADMIN_BASE}/${target}${rest.length === 0 ? "" : `/${rest.join("/")}`}`;
}
