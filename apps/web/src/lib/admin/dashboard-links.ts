import type { AdminCapability } from "@/lib/api";

import { canAny, type AdminActor } from "./capabilities";

/**
 * A donde lleva cada cifra de la portada del panel.
 *
 * POR QUE LAS CIFRAS SON ENLACES
 * ------------------------------
 * "3 participaciones gratuitas por revisar" es una tarea, no un dato: quien lo
 * lee quiere ir a revisarlas. Antes habia que leer la cifra, abrir el menu y
 * buscar la seccion; ahora la tarjeta entera lleva alli.
 *
 * LAS MISMAS CAPACIDADES QUE EL MENU
 * ----------------------------------
 * Cada destino declara las capacidades de su entrada en `ADMIN_NAV`
 * (`navigation.ts`), con la misma regla de "al menos una". Una tarjeta que
 * enlazara a una seccion que el menu no ensena mandaria a alguien a una puerta
 * cerrada, que es justo lo que el menu evita. `admin-dashboard-links.test.tsx`
 * compara las dos listas para que no se separen.
 *
 * OCULTAR NO ES AUTORIZAR, igual que en el menu: sin la capacidad la cifra se
 * sigue viendo, solo deja de ser un enlace. Quien autoriza es el backend.
 */
export const DASHBOARD_STAT_KEYS = [
  "activeEntries",
  "participants",
  "orders24h",
  "amoePending",
  "adjustmentsPending",
] as const;

export type DashboardStatKey = (typeof DASHBOARD_STAT_KEYS)[number];

export interface DashboardStatTarget {
  /** Ruta INTERNA del panel, sin `/admin` ni prefijo de idioma. */
  readonly path: string;
  /** Basta UNA de ellas, como en `ADMIN_NAV`. */
  readonly capabilities: readonly AdminCapability[];
}

/**
 * Destino de cada cifra. `switch` exhaustivo: una cifra nueva en
 * `DASHBOARD_STAT_KEYS` deja de compilar aqui hasta que se decida a donde
 * lleva, en vez de quedarse sin enlace por descuido.
 */
export function dashboardStatTarget(key: DashboardStatKey): DashboardStatTarget {
  switch (key) {
    // Las participaciones activas son de los participantes: su listado es
    // donde se mira de quien son.
    case "activeEntries":
    case "participants":
      return { path: "/participants", capabilities: ["participant.list"] };
    case "orders24h":
      return { path: "/orders", capabilities: ["order.read"] };
    case "amoePending":
      return { path: "/amoe", capabilities: ["amoe.review.read"] };
    case "adjustmentsPending":
      return {
        path: "/adjustments",
        capabilities: ["entry.adjust.create", "entry.adjust.approve"],
      };
  }
}

/**
 * Ruta interna a la que lleva una cifra, o `null` si este actor no puede abrir
 * esa seccion. El prefijo de idioma lo pone quien pinta, con `adminHref`.
 */
export function dashboardStatPath(actor: AdminActor, key: DashboardStatKey): string | null {
  const target = dashboardStatTarget(key);
  return canAny(actor, target.capabilities) ? target.path : null;
}
