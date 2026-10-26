import { buttonVariants, cn } from "@app/ui";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";

import { formatEntryCount, formatMoney } from "@/i18n/formatters";
import type { Locale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { pickLocalized, type ProductSummary } from "@/lib/api";
import { offerHasBonus, packageOfferOf } from "@/lib/entry-offer";
import { isProductSoldOut } from "@/lib/product-availability";
import { priceFrom } from "@/lib/product-price";

import { fractionText } from "./entry-rate-lines";
import { PackageQuickAdd } from "./package-quick-add";
import type { CardBonus } from "./product-card";

/**
 * Banda de PAQUETES DE PARTICIPACIONES (DEC-065).
 *
 * El cliente pidio sacar los paquetes de la rejilla de mercancia y presentarlos
 * aparte, por niveles: un titular centrado, una tarjeta por nivel, la cifra y el
 * precio en ella, y el boton de compra debajo. En telefono las tarjetas se
 * deslizan en horizontal; desde tableta son rejilla centrada.
 *
 * CADA TARJETA ES SU MATERIAL
 * ---------------------------
 * El cliente lo pidio asi (2026-10-13): nada de logotipo de la tienda dentro;
 * la tarjeta ES una placa de bronce, de plata, de oro o de diamante. Los tres
 * metales son placas de metal CEPILLADO con brillo especular, la cifra y el
 * nombre GRABADOS en tinta oscura y una MEDALLA acunada en el centro; el
 * diamante es una placa facetada, helada, con una GEMA de talla brillante y
 * destellos. Las placas viven en `globals.css` (`.app-plate-*`): son varias
 * capas de fondo y no caben con claridad en una clase de Tailwind.
 *
 * LO QUE NO SE COPIA DE LA REFERENCIA
 * -----------------------------------
 * El vocabulario: la referencia lo llama "entry" con codigo de barras y numero
 * de serie, que es la imagen de un boleto. Aqui la palabra es la que aprobo el
 * abogado -"paquete de participaciones" / "entry package"- y nunca "boleto",
 * "ticket" ni "oportunidad de ganar" (`docs/LEGAL_PENDING.md`, segundo
 * borrador). Donde la referencia pone el codigo de barras, esta pone la cifra.
 *
 * LA CIFRA NO SE CALCULA AQUI
 * ---------------------------
 * Las participaciones de la tarjeta son las que el backend ya evaluo para la
 * variante (`entry_offer`, §13.4). Sin promocion activa ese objeto llega `null`
 * y la tarjeta enseña lo que dice el NOMBRE del paquete -que lo escribe quien
 * administra el catalogo y es lo que las Reglas exigen declarar donde se
 * ofrece-, sin operar con el.
 *
 * EL NIVEL SALE DEL ORDEN, NO DEL NOMBRE
 * --------------------------------------
 * `GET /products?kind=ENTRY_PACKAGE` devuelve los paquetes de menor a mayor
 * precio (DEC-064). El primero es bronce, el segundo plata, el tercero oro y el
 * cuarto diamante; uno quinto repetiria la escala. Leer el metal del nombre
 * ataria el diseño a como se llamen los paquetes en cada idioma.
 */

/** Material de cada nivel. Todas las clases son literales para que Tailwind las vea. */
interface TierStyle {
  /** Clave del material: decide el emblema y los degradados del SVG. */
  readonly material: "bronze" | "silver" | "gold" | "diamond";
  /** Canto biselado de la placa (el marco de 2px). */
  readonly edge: string;
  /** La placa: clase de `globals.css`. */
  readonly plate: string;
  /** Tinta del grabado: titulo, cifra y precio. */
  readonly ink: string;
  /** Tinta secundaria: la palabra "participaciones" y las estrellas. */
  readonly subInk: string;
  /** Relieve del grabado (`text-shadow`), de `globals.css`. */
  readonly engrave: string;
  /** Halo al pasar el raton, del color del material. */
  readonly glow: string;
}

const BRONZE: TierStyle = {
  material: "bronze",
  edge: "bg-[linear-gradient(135deg,#5b2c12_0%,#b8703f_40%,#f6c9a3_52%,#9a5128_70%,#4a240f_100%)]",
  plate: "app-plate-bronze",
  ink: "text-[#1f0c03]",
  subInk: "text-[#3d1c08]",
  engrave: "app-engrave",
  glow: "hover:shadow-[0_26px_50px_-16px_rgba(169,92,46,0.75)]",
};

const TIERS: readonly TierStyle[] = [
  BRONZE,
  {
    material: "silver",
    edge: "bg-[linear-gradient(135deg,#4a4f56_0%,#a7aeb6_40%,#ffffff_52%,#8a9098_70%,#3b3f45_100%)]",
    plate: "app-plate-silver",
    ink: "text-[#14181d]",
    subInk: "text-[#353b43]",
    engrave: "app-engrave",
    glow: "hover:shadow-[0_26px_50px_-16px_rgba(120,128,138,0.75)]",
  },
  {
    material: "gold",
    edge: "bg-[linear-gradient(135deg,#6e4c03_0%,#d6a722_40%,#fff3b5_52%,#c4930f_70%,#5f4103_100%)]",
    plate: "app-plate-gold",
    ink: "text-[#2b1c00]",
    subInk: "text-[#4d3500]",
    engrave: "app-engrave",
    glow: "hover:shadow-[0_26px_50px_-16px_rgba(201,154,29,0.8)]",
  },
  {
    material: "diamond",
    edge: "bg-[linear-gradient(135deg,#0b3550_0%,#4fc3ef_40%,#f2fdff_52%,#2a9ccc_70%,#082638_100%)]",
    plate: "app-plate-diamond",
    ink: "text-[#effcff]",
    subInk: "text-[#bfefff]",
    engrave: "app-engrave-ice",
    glow: "hover:shadow-[0_26px_50px_-16px_rgba(60,180,230,0.8)]",
  },
];

/**
 * Colores de la MEDALLA de cada metal: canto oscuro, cuerpo, brillo y sombra.
 * El diamante no tiene medalla: tiene gema.
 */
const MEDAL_STOPS: Readonly<Record<"bronze" | "silver" | "gold", readonly string[]>> = {
  bronze: ["#4a240f", "#b8703f", "#ffd9b8", "#8f4a22"],
  silver: ["#3b3f45", "#a9b0b8", "#ffffff", "#7d848c"],
  gold: ["#5f4103", "#d6a722", "#fff6c2", "#a87b07"],
};

/**
 * Nivel que lleva la insignia de "recomendado": el tercero, oro.
 *
 * Es una recomendacion de la tienda, no un dato: por eso dice "recomendado" y
 * no "el mas popular", que seria una afirmacion sobre ventas que nadie ha
 * medido. Con menos de tres paquetes no se marca ninguno.
 */
const RECOMMENDED_INDEX = 2;

function tierOf(index: number): TierStyle {
  // `TIERS` no esta vacio; el `??` solo existe para el compilador.
  return TIERS[index % TIERS.length] ?? BRONZE;
}

/**
 * "Paquete Bronce: 30 participaciones" -> titulo y detalle.
 *
 * Es solo PRESENTACION del texto que escribio el panel: se parte por los dos
 * puntos para poner el nivel arriba de la placa y la cifra abajo. Un nombre sin
 * dos puntos va entero arriba y el detalle queda vacio. Nunca se interpreta la
 * cifra.
 */
function splitPackageName(name: string): {
  readonly title: string;
  readonly detail: string | null;
} {
  const colon = name.indexOf(":");
  if (colon <= 0) return { title: name, detail: null };

  const title = name.slice(0, colon).trim();
  const detail = name.slice(colon + 1).trim();
  return { title, detail: detail.length === 0 ? null : detail };
}

/**
 * "30 participaciones" -> `{ figure: "30", label: "participaciones" }`.
 *
 * Tambien PRESENTACION: separa la cifra escrita al principio del detalle para
 * pintarla como la del backend -numero grande, palabra pequena- y que las
 * cuatro placas midan lo mismo. Sin cifra al principio, `null` y el detalle se
 * pinta entero.
 */
function splitFigure(detail: string): { readonly figure: string; readonly label: string } | null {
  const match = /^(\d[\d.,]*)\s+(\S.*)$/u.exec(detail);
  if (match === null) return null;
  const [, figure, label] = match;
  return figure === undefined || label === undefined ? null : { figure, label };
}

export function EntryPackageBand({
  packages,
  locale,
  bonus,
  labelledBy = "entry-packages",
  anchorId,
  className,
}: {
  readonly packages: readonly ProductSummary[];
  readonly locale: Locale;
  /**
   * Bonus vigente, solo para poder NOMBRAR el multiplicador que produjo
   * `entries_now`. Sin el, la cifra se pinta igual y el "5X" se calla.
   */
  readonly bonus?: CardBonus | null;
  readonly labelledBy?: string;
  /**
   * `id` de la seccion, para enlazarla con un ancla (`#packages`). El boton rojo
   * del hero de la portada baja hasta aqui (DEC-069).
   */
  readonly anchorId?: string;
  readonly className?: string;
}) {
  const t = useTranslations("entryPackages");

  if (packages.length === 0) return null;

  return (
    <section
      {...(anchorId === undefined ? {} : { id: anchorId })}
      aria-labelledby={labelledBy}
      // `scroll-mt`: la banda roja y la cabecera son fijas (DEC-082, unos 110px
      // en telefono, algo mas si la banda envuelve), y sin margen el salto
      // dejaria el titular de la banda debajo de ellas.
      className={cn("app-band-light scroll-mt-32 py-s8 lg:py-s12", className)}
    >
      <div className="app-container">
        {/* DEC-077: sin antetitulo y con una entradilla de tres palabras. */}
        <header data-reveal className="mx-auto max-w-narrow text-center">
          <h2
            id={labelledBy}
            className="app-headline text-heading-lg text-light-text sm:text-display-md"
          >
            {t("title")}
          </h2>
          <p className="mt-s1 text-body-md text-light-text-muted">{t("lead")}</p>
        </header>

        {/* En telefono se deslizan; desde tableta, rejilla CENTRADA: con dos o
            tres niveles, una rejilla de cuatro columnas los dejaba pegados a la
            izquierda con media banda vacia. */}
        <ul
          className={cn(
            "mt-s4 flex list-none snap-x snap-mandatory gap-s4 overflow-x-auto pb-s3 pt-s1",
            "-mx-s4 px-s4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            "sm:mx-0 sm:grid sm:snap-none sm:overflow-visible sm:px-0",
            packages.length === 1
              ? "sm:mx-auto sm:max-w-[22rem] sm:grid-cols-1"
              : packages.length === 2
                ? "sm:mx-auto sm:max-w-[46rem] sm:grid-cols-2"
                : packages.length === 3
                  ? "sm:grid-cols-2 lg:mx-auto lg:max-w-[70rem] lg:grid-cols-3"
                  : "sm:grid-cols-2 lg:grid-cols-4",
            "lg:gap-s5",
          )}
        >
          {packages.map((product, index) => (
            <PackagePass
              key={product.id}
              product={product}
              index={index}
              recommended={packages.length > RECOMMENDED_INDEX && index === RECOMMENDED_INDEX}
              locale={locale}
              bonus={bonus ?? null}
            />
          ))}
        </ul>

        {packages.length > 1 ? (
          <p
            aria-hidden="true"
            className="mt-s1 text-center text-caption text-light-text-muted sm:hidden"
          >
            {t("scrollHint")}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/**
 * UNA PLACA POR NIVEL.
 *
 * De arriba abajo: el NOMBRE del nivel grabado entre dos filetes, el EMBLEMA
 * del material (medalla acunada o gema), la CIFRA de participaciones grabada en
 * grande, y tras el troquel, el TALON con el precio y las estrellas del nivel.
 *
 * Toda la placa lleva a la ficha (un enlace que la cubre, fuera del arbol de
 * accesibilidad); el nombre accesible y el enlace de teclado son el titulo.
 * Debajo queda solo el boton de compra.
 */
function PackagePass({
  product,
  index,
  recommended,
  locale,
  bonus,
}: {
  readonly product: ProductSummary;
  readonly index: number;
  readonly recommended: boolean;
  readonly locale: Locale;
  readonly bonus: CardBonus | null;
}) {
  const t = useTranslations("entryPackages");
  const tier = tierOf(index);
  const href = `/products/${product.slug}`;
  // Ids de los degradados del SVG: unicos por producto, sin caracteres que
  // `url(#...)` tuviera que escapar.
  const svgId = `pkg-${product.id.replace(/[^a-zA-Z0-9-]/gu, "")}`;

  const name = pickLocalized(product.name, locale);
  const { title, detail } = splitPackageName(name);
  const detailFigure = detail === null ? null : splitFigure(detail);
  const price = formatMoney(priceFrom(product), locale);
  const soldOut = isProductSoldOut(product.variants);

  /*
   * La oferta evaluada por el backend, si la hay (§13.4). `entries_now` es la
   * cifra con los bonus que el motor aplica AHORA; difiere de `base_entries`
   * solo si hay un bonus vigente para esta variante.
   */
  const offer = packageOfferOf(product);
  const hasBonus = offer !== null && offerHasBonus(offer);
  const entriesShown = offer === null ? null : hasBonus ? offer.entries_now : offer.base_entries;

  /*
   * El multiplicador se NOMBRA solo si el periodo vigente es el que el motor
   * dice que aplico a esta variante (`multiplier_ids`). Ver `PackageBonusLine`
   * en `ProductCard`: la misma regla, por el mismo motivo.
   */
  const appliedBonus =
    hasBonus && bonus !== null && offer.multiplier_ids.includes(bonus.period.id) ? bonus : null;
  const multiplier =
    appliedBonus === null ? null : fractionText(appliedBonus.period.multiplier, locale);

  /* Una sola variante: se puede anadir desde aqui. Con mas, se elige en la ficha. */
  const onlyVariant = product.variants.length === 1 ? product.variants[0] : undefined;

  const figureClass = cn(
    "font-headline text-[2.9rem] font-black italic leading-none tabular-nums sm:text-[3.25rem]",
    tier.ink,
    tier.engrave,
  );
  const figureLabelClass = cn(
    "app-display mt-s1 text-overline tracking-[0.3em]",
    tier.subInk,
    tier.engrave,
  );

  return (
    <li
      // DEC-075: las placas aparecen escalonadas al llegar a la banda.
      data-reveal
      style={{ "--reveal-delay": `${String(index * 110)}ms` } as CSSProperties}
      className="relative flex w-[80%] max-w-[22rem] shrink-0 snap-center flex-col pt-s5 sm:w-auto sm:max-w-none"
    >
      {/* Halo del recomendado: respira detras de la placa (DEC-075). */}
      {recommended ? (
        <span
          aria-hidden="true"
          className="app-glow-breathe pointer-events-none absolute inset-x-s2 bottom-[30%] top-s5 rounded-3xl bg-[#ffcf3f]/60 blur-2xl"
        />
      ) : null}

      {recommended ? (
        <span className="app-display absolute left-1/2 top-0 z-30 -translate-x-1/2 whitespace-nowrap rounded-pill bg-brand px-s5 py-s1 text-label italic text-on-brand shadow-light-md">
          {t("recommended")}
        </span>
      ) : null}

      {/* LA PLACA: canto biselado de 2px alrededor de la cara y del talon. */}
      <div
        className={cn(
          "group relative isolate rounded-2xl p-[2px] shadow-[0_18px_36px_-18px_rgba(10,14,22,0.55)]",
          "transition-[transform,box-shadow] duration-base ease-standard hover:-translate-y-1.5",
          "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
          tier.edge,
          tier.glow,
          recommended && "ring-2 ring-brand ring-offset-2 ring-offset-light-bg",
        )}
      >
        {/* CARA: nivel, emblema y cifra. */}
        <div className={cn("relative isolate overflow-hidden rounded-[14px]", tier.plate)}>
          <div className="flex items-center gap-s3 px-s4 pt-s3">
            <span
              aria-hidden="true"
              className={cn("h-px flex-1 bg-current opacity-40", tier.subInk)}
            />
            <h3 className="min-w-0 max-w-[80%] text-center">
              <Link
                href={href}
                className={cn(
                  // Hasta dos lineas: un nombre largo no se corta con "...".
                  "app-display line-clamp-2 text-label uppercase leading-snug tracking-[0.2em]",
                  "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current",
                  tier.ink,
                  tier.engrave,
                )}
              >
                {/* A la vista, solo el nivel -la cifra esta en la placa-; al
                    oido, el nombre completo. */}
                <span aria-hidden="true">{title}</span>
                <span className="sr-only">{t("viewLabel", { name })}</span>
              </Link>
            </h3>
            <span
              aria-hidden="true"
              className={cn("h-px flex-1 bg-current opacity-40", tier.subInk)}
            />
          </div>

          {/* EL EMBLEMA DEL MATERIAL. Decorativo: el nombre ya esta en el titulo. */}
          <div aria-hidden="true" className="mt-s2 flex h-24 items-center justify-center sm:h-28">
            {tier.material === "diamond" ? (
              <DiamondGem id={svgId} />
            ) : (
              <Medal id={svgId} stops={MEDAL_STOPS[tier.material]} />
            )}
          </div>

          {/* LA CIFRA. La que evaluo el backend; sin oferta, la que dice el
              nombre del paquete, sin operar con ella. */}
          <div className="px-s4 pb-s3 pt-s2 text-center">
            {entriesShown !== null ? (
              <>
                <p className={figureClass}>{formatEntryCount(entriesShown, locale)}</p>
                <p className={figureLabelClass}>{t("entriesLabel")}</p>
              </>
            ) : detailFigure !== null ? (
              <>
                <p className={figureClass}>{detailFigure.figure}</p>
                <p className={figureLabelClass}>{detailFigure.label}</p>
              </>
            ) : (
              <p
                className={cn("app-display text-heading-md leading-tight", tier.ink, tier.engrave)}
              >
                {detail ?? title}
              </p>
            )}
          </div>

          {appliedBonus !== null || hasBonus ? (
            <p className="app-display bg-accent px-s3 py-s1 text-center text-caption italic text-on-accent">
              {multiplier === null ? t("bonusRibbonPlain") : t("bonusRibbon", { multiplier })}
            </p>
          ) : null}
        </div>

        {/* Troquel: linea punteada con dos muescas que muerden el canto. Las
            muescas son del color de la banda, que es lo que las hace hueco. */}
        <div aria-hidden="true" className="relative -mx-[2px] my-[3px] h-[2px]">
          <span className="absolute inset-x-s6 top-0 border-t-2 border-dashed border-black/30" />
          <span className="absolute left-0 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-light-bg" />
          <span className="absolute right-0 top-1/2 h-5 w-5 -translate-y-1/2 translate-x-1/2 rounded-full bg-light-bg" />
        </div>

        {/* TALON: el precio grabado y las estrellas del nivel. */}
        <div
          className={cn(
            "flex items-center justify-between gap-s3 rounded-[14px] px-s4 py-s2",
            tier.plate,
          )}
        >
          {price === null ? (
            <span />
          ) : (
            <p
              className={cn(
                "font-headline text-heading-lg font-black italic leading-none tabular-nums",
                tier.ink,
                tier.engrave,
              )}
            >
              {price}
            </p>
          )}

          {/* Estrellas de nivel: una por escalon. Titilan por turnos (DEC-075). */}
          <div aria-hidden="true" className="flex shrink-0 gap-[3px]">
            {Array.from({ length: (index % TIERS.length) + 1 }, (_, star) => (
              <Star
                key={star}
                className={cn("app-twinkle h-4 w-4", tier.subInk)}
                style={{ "--twinkle-delay": `${String(star * 0.35)}s` } as CSSProperties}
              />
            ))}
          </div>
        </div>

        {/* Reflejo que cruza la placa POR TURNOS entre niveles (DEC-075). */}
        <span
          aria-hidden="true"
          style={{ "--shine-delay": `${String(index * 1.6)}s` } as CSSProperties}
          className={cn(
            "app-pass-shine pointer-events-none absolute inset-y-0 -left-1/2 z-10 w-1/3 -skew-x-12",
            "bg-gradient-to-r from-transparent via-white/45 to-transparent",
            "translate-x-[-120%]",
            "motion-reduce:hidden",
          )}
        />

        {/* Toda la placa lleva a la ficha, para el raton y el dedo. Fuera del
            arbol de accesibilidad y del orden de tabulacion: el enlace real es
            el titulo. */}
        <Link
          href={href}
          aria-hidden="true"
          tabIndex={-1}
          className="absolute inset-0 z-20 rounded-2xl"
        >
          <span className="sr-only">{title}</span>
        </Link>
      </div>

      {/* Bajo la placa: el bonus (si lo hay) y el boton de compra. */}
      <div className="mt-s3 flex flex-1 flex-col">
        {multiplier === null ? null : (
          <span className="app-display mb-s2 self-start rounded-sm bg-accent px-s2 py-[3px] text-caption italic text-on-accent">
            {t("bonusChip", { multiplier })}
          </span>
        )}

        <div className="mt-auto">
          {onlyVariant === undefined ? (
            <Link
              href={href}
              className={buttonVariants({ variant: "buy", size: "lg", fullWidth: true })}
            >
              {t("viewLabel", { name: title })}
            </Link>
          ) : (
            <PackageQuickAdd variantId={onlyVariant.id} locale={locale} soldOut={soldOut} />
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * MEDALLA ACUNADA de los tres metales: canto estriado, campo pulido con brillo,
 * aro interior y estrella en relieve. Todo en el metal del nivel. Decorativa.
 */
function Medal({ id, stops }: { readonly id: string; readonly stops: readonly string[] }) {
  const [dark = "#000", body = "#888", light = "#fff", shade = "#444"] = stops;

  return (
    <svg
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
      className="h-full w-auto drop-shadow-[0_10px_18px_rgba(0,0,0,0.35)]"
    >
      <defs>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={light} />
          <stop offset="35%" stopColor={body} />
          <stop offset="70%" stopColor={dark} />
          <stop offset="100%" stopColor={shade} />
        </linearGradient>
        <radialGradient id={`${id}-face`} cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor={light} />
          <stop offset="45%" stopColor={body} />
          <stop offset="100%" stopColor={shade} />
        </radialGradient>
        <linearGradient id={`${id}-star`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={light} />
          <stop offset="100%" stopColor={body} />
        </linearGradient>
      </defs>

      {/* Canto estriado. */}
      <circle cx="60" cy="60" r="57" fill={`url(#${id}-rim)`} />
      <circle
        cx="60"
        cy="60"
        r="53.5"
        fill="none"
        stroke={dark}
        strokeOpacity="0.45"
        strokeWidth="5"
        strokeDasharray="1.6 2.1"
      />
      {/* Campo pulido. */}
      <circle cx="60" cy="60" r="47" fill={`url(#${id}-face)`} />
      <circle
        cx="60"
        cy="60"
        r="47"
        fill="none"
        stroke={dark}
        strokeOpacity="0.55"
        strokeWidth="1.5"
      />
      <circle
        cx="60"
        cy="60"
        r="40"
        fill="none"
        stroke={dark}
        strokeOpacity="0.3"
        strokeWidth="1"
      />
      {/* Estrella en relieve: sombra abajo, luz arriba. */}
      <path
        transform="translate(60 61) scale(2.15) translate(-10 -10)"
        d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6L10 15l-5.4 3 1.2-6L1.3 7.8l6.1-.7z"
        fill={dark}
        fillOpacity="0.55"
      />
      <path
        transform="translate(60 59) scale(2.15) translate(-10 -10)"
        d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6L10 15l-5.4 3 1.2-6L1.3 7.8l6.1-.7z"
        fill={`url(#${id}-star)`}
        stroke={dark}
        strokeOpacity="0.5"
        strokeWidth="0.4"
      />
      {/* Brillo especular. */}
      <ellipse
        cx="44"
        cy="34"
        rx="20"
        ry="10"
        fill="#ffffff"
        fillOpacity="0.35"
        transform="rotate(-30 44 34)"
      />
    </svg>
  );
}

/**
 * GEMA de talla brillante: corona y pabellon facetados en hielo, con destellos
 * que titilan por turnos. Decorativa.
 */
function DiamondGem({ id }: { readonly id: string }) {
  const crown: readonly (readonly [string, string])[] = [
    ["14,36 36,14 48,36", "#bdf1ff"],
    ["36,14 60,14 48,36", "#f4feff"],
    ["48,36 60,14 72,36", "#8fe2ff"],
    ["60,14 84,14 72,36", "#e2fbff"],
    ["72,36 84,14 106,36", "#63cdf2"],
  ];
  const pavilion: readonly (readonly [string, string])[] = [
    ["14,36 36,36 60,100", "#3fb6e6"],
    ["36,36 48,36 60,100", "#a6eaff"],
    ["48,36 72,36 60,100", "#d9f8ff"],
    ["72,36 84,36 60,100", "#6fd3f5"],
    ["84,36 106,36 60,100", "#1f8fc2"],
  ];

  return (
    <svg
      viewBox="0 0 120 112"
      aria-hidden="true"
      focusable="false"
      className="h-full w-auto drop-shadow-[0_10px_22px_rgba(80,200,255,0.55)]"
    >
      <defs>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.2" />
        </linearGradient>
      </defs>

      {[...crown, ...pavilion].map(([points, fill]) => (
        <polygon
          key={points}
          points={points}
          fill={fill}
          stroke="#ffffff"
          strokeOpacity="0.75"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
      ))}
      {/* Reflejo sobre toda la gema. */}
      <polygon points="14,36 36,14 84,14 106,36 60,100" fill={`url(#${id}-sheen)`} />

      {/* Destellos de cuatro puntas. */}
      <Sparkle x={98} y={16} size={9} delay={0} />
      <Sparkle x={22} y={22} size={6} delay={0.9} />
      <Sparkle x={88} y={62} size={5} delay={1.7} />
    </svg>
  );
}

function Sparkle({
  x,
  y,
  size,
  delay,
}: {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly delay: number;
}) {
  const s = size;
  return (
    <path
      className="app-twinkle"
      style={{ "--twinkle-delay": `${String(delay)}s` } as CSSProperties}
      d={`M${String(x)} ${String(y - s)} L${String(x + s * 0.22)} ${String(y - s * 0.22)} L${String(x + s)} ${String(y)} L${String(x + s * 0.22)} ${String(y + s * 0.22)} L${String(x)} ${String(y + s)} L${String(x - s * 0.22)} ${String(y + s * 0.22)} L${String(x - s)} ${String(y)} L${String(x - s * 0.22)} ${String(y - s * 0.22)} Z`}
      fill="#ffffff"
    />
  );
}

/** Estrella de cinco puntas. Decorativa. */
function Star({
  className,
  style,
}: {
  readonly className?: string;
  readonly style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...(style === undefined ? {} : { style })}
    >
      <path
        fill="currentColor"
        d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6L10 15l-5.4 3 1.2-6L1.3 7.8l6.1-.7z"
      />
    </svg>
  );
}
