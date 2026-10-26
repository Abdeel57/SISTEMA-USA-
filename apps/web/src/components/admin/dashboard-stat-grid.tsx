import { FOCUS_VISIBLE_CLASSES, StatCard, cn, type StatCardTone } from "@app/ui";
import Link from "next/link";

import { adminHref } from "@/i18n/admin-routing";
import type { Locale } from "@/i18n/locales";
import type { AdminActor } from "@/lib/admin/capabilities";
import { dashboardStatPath, type DashboardStatKey } from "@/lib/admin/dashboard-links";

/** Una cifra de la portada, YA traducida y formateada por la pantalla. */
export interface DashboardStat {
  readonly key: DashboardStatKey;
  readonly label: string;
  /** La cifra ya formateada, o el texto de "sin datos". Aqui no se calcula nada. */
  readonly value: string;
  readonly hint?: string;
  readonly tone?: StatCardTone;
}

/**
 * Las cifras de la portada del panel, cada una como ENLACE a su seccion.
 *
 * LA TARJETA ENTERA ES EL ENLACE
 * ------------------------------
 * No un "ver mas" pequeno debajo de la cifra: en el telefono la tarjeta mide
 * mas de 100px de alto y se acierta con el pulgar sin apuntar. El nombre
 * accesible del enlace es lo que dice la tarjeta -"Pedidos, ultimas 24 horas,
 * 12"-, que es exactamente a donde lleva.
 *
 * El estado de foco es el anillo del sistema (`FOCUS_VISIBLE_CLASSES`) sobre
 * la tarjeta, y el de hover/pulsado cambia borde y fondo con tokens
 * semanticos, de modo que se ve igual en el tema claro del panel que en el
 * oscuro. La flecha de la esquina dice "esto se abre" sin depender del hover,
 * que en un telefono no existe.
 *
 * Sin la capacidad de la seccion, la cifra se pinta igual pero SIN enlace
 * (`dashboardStatPath` devuelve `null`): no se manda a nadie a un 403.
 */
export function DashboardStatGrid({
  locale,
  actor,
  stats,
}: {
  readonly locale: Locale;
  readonly actor: AdminActor;
  readonly stats: readonly DashboardStat[];
}) {
  return (
    <ul className="grid list-none grid-cols-1 gap-s4 sm:grid-cols-2 xl:grid-cols-3">
      {stats.map((stat) => {
        const path = dashboardStatPath(actor, stat.key);

        const card = (linked: boolean) => (
          <StatCard
            label={stat.label}
            value={stat.value}
            hint={stat.hint}
            {...(stat.tone === undefined ? {} : { tone: stat.tone })}
            className={cn(
              "h-full",
              linked && [
                "pr-s10 transition-colors duration-fast",
                "group-hover:border-border-strong group-hover:bg-surface-raised",
                "group-active:bg-surface-sunken",
              ],
            )}
          />
        );

        return (
          <li key={stat.key}>
            {path === null ? (
              card(false)
            ) : (
              <Link
                href={adminHref(locale, path)}
                className={cn("group relative block h-full rounded-lg", FOCUS_VISIBLE_CLASSES)}
              >
                {card(true)}
                <OpenArrow />
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Flecha decorativa de "se abre". El destino ya lo nombra el enlace. */
function OpenArrow() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 20 20"
      fill="none"
      className="absolute right-s4 top-s4 h-5 w-5 text-text-subtle transition-colors duration-fast group-hover:text-text"
    >
      <path
        d="M7.5 4.5 13 10l-5.5 5.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
