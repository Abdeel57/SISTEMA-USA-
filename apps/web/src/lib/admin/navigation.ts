import type { AdminCapability } from "@/lib/api";

import { canAny, type AdminActor } from "./capabilities";

/**
 * Navegacion del panel, DECLARADA POR CAPACIDAD.
 *
 * No hay ninguna lista de "secciones de administrador" ni ningun `if
 * (esAdmin)`. Cada entrada declara que capacidades bastan para que tenga
 * sentido pintarla, y quien no las tiene sencillamente no la ve. Es la misma
 * regla que aplica `packages/security`: deny-by-default, sin comodines y sin un
 * rol que pueda todo.
 *
 * OCULTAR NO ES AUTORIZAR. Quien escriba la URL a mano llega igual, y la
 * pantalla le respondera con el 403 que devuelva el backend, pintado como
 * estado deliberado. Esta lista existe para no mandar a nadie a una puerta
 * cerrada, no para cerrarla.
 *
 * `capabilities` es "al menos una", no "todas". Ajustes lo necesita: quien
 * PROPONE (`entry.adjust.create`) y quien APRUEBA (`entry.adjust.approve`) son
 * personas distintas a proposito, y las dos tienen que poder entrar a la misma
 * pantalla para hacer cosas distintas dentro de ella.
 */
/**
 * Los grupos del menu, en el orden en que se pintan. Clave de copy bajo
 * `admin.navGroups`.
 *
 * Catorce entradas en una sola lista eran un muro: el menu se agrupa por lo
 * que la persona viene a hacer -el dia a dia de la tienda, el catalogo, la
 * promocion y su sorteo, y la configuracion que se toca una vez-.
 */
export const ADMIN_NAV_GROUPS = ["daily", "store", "draw", "settings"] as const;

export type AdminNavGroup = (typeof ADMIN_NAV_GROUPS)[number];

export interface AdminNavItem {
  /** Clave de copy bajo `admin.nav`. */
  readonly key: string;
  /** Ruta INTERNA del panel, sin `/admin` ni prefijo de idioma. */
  readonly path: string;
  readonly capabilities: readonly AdminCapability[];
  readonly group: AdminNavGroup;
}

export const ADMIN_NAV = [
  { key: "dashboard", path: "", capabilities: ["dashboard.read"], group: "daily" },
  { key: "orders", path: "/orders", capabilities: ["order.read"], group: "daily" },
  // DEC-085: el corte de caja diario. Lee pedidos cobrados, con la misma lectura.
  { key: "dailyCut", path: "/daily-cut", capabilities: ["order.read"], group: "daily" },
  { key: "catalog", path: "/catalog", capabilities: ["product.read"], group: "store" },
  // DEC-079: la tarifa de envio es un precio de la tienda, con la misma lectura.
  { key: "shipping", path: "/shipping", capabilities: ["product.read"], group: "store" },
  { key: "promotions", path: "/promotions", capabilities: ["promotion.read"], group: "draw" },
  {
    key: "participants",
    path: "/participants",
    capabilities: ["participant.list"],
    group: "draw",
  },
  { key: "amoe", path: "/amoe", capabilities: ["amoe.review.read"], group: "draw" },
  {
    key: "adjustments",
    path: "/adjustments",
    capabilities: ["entry.adjust.create", "entry.adjust.approve"],
    group: "draw",
  },
  {
    key: "draw",
    path: "/draw",
    capabilities: ["draw.result.read", "draw.authorization.create", "draw.initiate"],
    group: "draw",
  },
  { key: "exports", path: "/exports", capabilities: ["export.snapshot.read"], group: "draw" },
  /*
   * MARCA DEL SITIO (§17, migracion 0040): nombre, logotipo, colores, datos
   * legales, contacto, dominio, prefijos y zona horaria, editables sin
   * redesplegar. Basta `brand.read` para VERLA; guardar exige `brand.update`,
   * y eso lo decide la pantalla al pintar o no el formulario.
   */
  { key: "brand", path: "/brand", capabilities: ["brand.read"], group: "settings" },
  /*
   * INTERRUPTORES (§13.9, DEC-054 punto 3).
   *
   * SU ROTULO NO PUEDE SER "AJUSTES", que es como nacio: la entrada de al lado
   * -`/adjustments`- se llama asi en espanol, y el menu quedaba con dos
   * "Ajustes" seguidos llevando a dos pantallas que no tienen nada que ver. En
   * ingles el par era "Settings" y "Adjustments" y no chocaba, que es por lo
   * que el problema solo se ve mirando el menu en espanol. Ver
   * `admin.nav.flags`.
   *
   * Basta `flag.read` para VERLA: quien puede leer el estado de los flags puede
   * entrar. Cambiar algo exige otra capacidad -y los legalmente materiales,
   * ademas, segunda aprobacion-, y eso lo decide cada bloque dentro de la
   * pantalla. Exigir aqui la de escritura dejaria sin poder consultar el estado
   * a quien solo tiene lectura, que es la mitad de los motivos para entrar.
   */
  { key: "flags", path: "/flags", capabilities: ["flag.read"], group: "settings" },
  { key: "audit", path: "/audit", capabilities: ["audit.read"], group: "settings" },
] as const satisfies readonly AdminNavItem[];

export type AdminNavKey = (typeof ADMIN_NAV)[number]["key"];

/**
 * Las pantallas del panel: las del menu y las que no estan en el -Mi cuenta,
 * que se abre desde la sesion-. En una de estas ultimas no se marca ninguna
 * entrada del menu.
 */
export type AdminScreenKey = AdminNavKey | "account";

/**
 * Las entradas de la barra inferior del telefono, en orden: lo que se abre
 * todos los dias. El resto vive detras de "Mas". Clave de copy corta bajo
 * `admin.navShort` (en la barra caben cuatro palabras, no cuatro frases).
 */
export const ADMIN_QUICK_NAV = ["dashboard", "orders", "dailyCut", "catalog"] as const;

export type AdminQuickNavKey = (typeof ADMIN_QUICK_NAV)[number];

/** Entradas que este actor puede ver. */
export function visibleNavFor(actor: AdminActor): readonly (typeof ADMIN_NAV)[number][] {
  return ADMIN_NAV.filter((item) => canAny(actor, item.capabilities));
}

/** Las entradas visibles, repartidas por grupo; un grupo vacio no aparece. */
export function groupedNavFor(actor: AdminActor): readonly {
  readonly group: AdminNavGroup;
  readonly items: readonly (typeof ADMIN_NAV)[number][];
}[] {
  const visible = visibleNavFor(actor);
  return ADMIN_NAV_GROUPS.map((group) => ({
    group,
    items: visible.filter((item) => item.group === group),
  })).filter((entry) => entry.items.length > 0);
}

/** Las entradas de la barra inferior que este actor puede ver. */
export function quickNavFor(actor: AdminActor): readonly (typeof ADMIN_NAV)[number][] {
  const visible = visibleNavFor(actor);
  return ADMIN_QUICK_NAV.flatMap((key) => visible.filter((item) => item.key === key));
}
