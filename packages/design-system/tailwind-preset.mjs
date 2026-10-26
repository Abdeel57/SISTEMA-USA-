// ---------------------------------------------------------------------------
// Plantilla Sorteos - preset de Tailwind (@app/design-system/tailwind-preset)
//
// El preset NO define valores de TEMA: los toma de las custom properties
// declaradas en `src/styles/tokens.css`. Consecuencia deliberada: cambiar el
// tema (claro, oscuro, o un tema de marca futuro) no recompila Tailwind, porque
// las clases generadas apuntan a variables, no a colores literales.
//
// La unica excepcion es el PATRON TOPOGRAFICO del final del archivo, y no es
// una grieta en esa regla: no es un valor de tema sino un asset decorativo
// derivado -tres tintas del mismo mosaico- que CSS no sabe componer a partir de
// fragmentos. Ver el bloque `--- Patron topografico ---`.
//
// Este archivo es JavaScript plano a proposito. La configuracion de Tailwind la
// carga el propio Tailwind con su resolvedor, fuera del pipeline de TypeScript
// del monorepo; mantenerlo en `.mjs` evita depender de como jiti resuelva un
// `.ts` a traves del campo `exports` de un paquete del workspace.
// ---------------------------------------------------------------------------

import plugin from "tailwindcss/plugin";

/**
 * Envuelve un token de color declarado como canales RGB para que Tailwind pueda
 * aplicarle modificadores de opacidad (`bg-brand/10`).
 *
 * @param {string} variable nombre de la custom property (sin `var(...)`)
 * @returns {string}
 */
const color = (variable) => `rgb(var(${variable}) / <alpha-value>)`;

/**
 * @param {string} variable
 * @returns {string}
 */
const raw = (variable) => `var(${variable})`;

// --- Patron topografico ------------------------------------------------------
//
// UNA sola definicion de la geometria, tres tintas derivadas de ella.
//
// La geometria son curvas de nivel de verdad -anillos cerrados alrededor de
// "islas" y bandas paralelas a distancia constante, como un mapa de terreno-
// y vive en `topo-paths.mjs`, que GENERA `scripts/generate-topo.mjs` a partir
// de una semilla. No se dibuja a mano: para cambiar el dibujo se cambia la
// semilla y se vuelve a generar. El mosaico encaja consigo mismo por los cuatro
// lados.
//
// El dibujo lo produce `topo-svg.mjs` -la misma funcion que usa `apps/web`
// para servirlo con el color que el administrador elija- y aqui solo se
// convierte en `data:` URI para los tokens. Se hace en este archivo, y no en
// `src/index.ts`, porque los valores tienen que existir cuando Tailwind
// construye la capa `base`, antes de que corra ningun TypeScript. Los tokens
// se consumen como siempre: `var(--app-pattern-topo)` desde `globals.css`.

import { TOPO_INKS, TOPO_TILE, topoDataUri } from "./topo-svg.mjs";

/**
 * Los cuatro tokens del patron, emitidos en `:root` por el plugin de mas abajo.
 *
 * Las tres tintas (`TOPO_INKS`): la de marca para las superficies oscuras, la
 * negra para la banda del premio y la negra tenue para las superficies claras.
 *
 * Los colores son literales y no tokens: un `data:` URI se carga como documento
 * independiente y no ve las custom properties del documento que lo usa. Por
 * eso el color de marca de la paleta INICIAL se repite aqui, en `BRAND_HEX`.
 * Es solo el valor de arranque: en tiempo de ejecucion `apps/web` sustituye
 * `--app-pattern-topo` por el patron con el color guardado en el panel.
 */
const BRAND_HEX = "#38bdf8";

const TOPO_TOKENS = {
  "--app-pattern-topo-size": `${String(TOPO_TILE.width)}px ${String(TOPO_TILE.height)}px`,
  "--app-pattern-topo": topoDataUri({ stroke: BRAND_HEX, ...TOPO_INKS.brand }),
  "--app-pattern-topo-ink": topoDataUri({ stroke: "#000000", ...TOPO_INKS.ink }),
  "--app-pattern-topo-ink-soft": topoDataUri({ stroke: "#000000", ...TOPO_INKS.soft }),
};

/** Exportado SOLO para el test que verifica que las tres tintas comparten
 *  geometria y que ninguna vuelve a escribirse a mano. No lo consume la app. */
export const topoTokens = () => ({ ...TOPO_TOKENS });

/** @type {import("tailwindcss").Config} */
const preset = {
  // Marcador obligatorio para un preset: el consumidor define su propio
  // `content`, porque solo el sabe que archivos suyos hay que escanear.
  content: [],
  // DEC-038: hay UN SOLO TEMA, oscuro. No queda ninguna variante `dark:` que
  // generar, y por eso el selector deja de apuntar a `[data-theme="dark"]`: ese
  // atributo ya no existe en ninguna parte, y dejarlo declarado sugeriria que la
  // dualidad claro/oscuro sigue viva. La clave se conserva en su forma mas
  // inerte porque Tailwind la espera; si algun dia hubiera un segundo tema,
  // vuelve aqui.
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: color("--app-color-bg"),
        surface: {
          DEFAULT: color("--app-color-surface"),
          raised: color("--app-color-surface-raised"),
          sunken: color("--app-color-surface-sunken"),
        },
        border: {
          DEFAULT: color("--app-color-border"),
          strong: color("--app-color-border-strong"),
        },
        text: {
          DEFAULT: color("--app-color-text"),
          muted: color("--app-color-text-muted"),
          subtle: color("--app-color-text-subtle"),
          inverse: color("--app-color-text-inverse"),
        },
        brand: {
          DEFAULT: color("--app-color-brand"),
          hover: color("--app-color-brand-hover"),
          active: color("--app-color-brand-active"),
          subtle: color("--app-color-brand-subtle"),
        },
        "on-brand": color("--app-color-on-brand"),
        // DEC-042: `accent` es el ROJO de accion, no un tercer oro. `text` es
        // el escalon que se lee COMO TEXTO sobre las superficies oscuras; los
        // demas son rellenos y llevan `on-accent` encima. Su contrapartida
        // sobre superficies claras es `light-accent`, mas abajo.
        accent: {
          DEFAULT: color("--app-color-accent"),
          hover: color("--app-color-accent-hover"),
          active: color("--app-color-accent-active"),
          subtle: color("--app-color-accent-subtle"),
          text: color("--app-color-accent-text"),
        },
        "on-accent": color("--app-color-on-accent"),
        // Rojo de COMPRA fijo: botones de compra y franja de anuncio. No lo
        // sobreescribe la marca del panel (ver `tokens.css`).
        buy: {
          DEFAULT: color("--app-color-buy"),
          hover: color("--app-color-buy-hover"),
          active: color("--app-color-buy-active"),
        },
        "on-buy": color("--app-color-on-buy"),
        // Oro FIJO: bandas de participaciones y premio, rombos de la cinta.
        // Tampoco lo sobreescribe la marca del panel (ver `tokens.css`).
        gold: {
          DEFAULT: color("--app-color-gold"),
          light: color("--app-color-gold-light"),
          deep: color("--app-color-gold-deep"),
        },
        "on-gold": color("--app-color-on-gold"),
        success: {
          DEFAULT: color("--app-color-success"),
          subtle: color("--app-color-success-subtle"),
        },
        "on-success": color("--app-color-on-success"),
        warning: {
          DEFAULT: color("--app-color-warning"),
          subtle: color("--app-color-warning-subtle"),
        },
        "on-warning": color("--app-color-on-warning"),
        danger: {
          DEFAULT: color("--app-color-danger"),
          subtle: color("--app-color-danger-subtle"),
        },
        "on-danger": color("--app-color-on-danger"),
        info: {
          DEFAULT: color("--app-color-info"),
          subtle: color("--app-color-info-subtle"),
        },
        "on-info": color("--app-color-on-info"),
        // DEC-039: paleta de la BANDA CLARA. Solo la consumen las secciones de
        // mercancia (`.app-band-light`). Va agrupada bajo `light` para que en el
        // marcado se vea de un vistazo que una clase pertenece a la banda clara
        // (`text-light-text`) y no al sistema oscuro (`text-text`): son dos
        // paletas que conviven en la misma pagina y confundirlas es el unico
        // fallo de contraste que este diseno puede producir.
        light: {
          bg: color("--app-color-light-bg"),
          surface: color("--app-color-light-surface"),
          "surface-sunken": color("--app-color-light-surface-sunken"),
          border: color("--app-color-light-border"),
          "border-strong": color("--app-color-light-border-strong"),
          text: color("--app-color-light-text"),
          "text-muted": color("--app-color-light-text-muted"),
          // Oro de tinta: el acento de marca llevado a la sombra para que
          // pueda llevar texto sobre blanco (5,6:1). Ver `tokens.css`.
          gold: color("--app-color-light-gold"),
          // Rojo de tinta (DEC-042). Misma operacion que `gold` sobre el rojo
          // de accion: `accent-text` (#ff4d47) da 2,5:1 sobre la banda clara y
          // este mide 5,91:1. Que rojo se usa lo decide la superficie.
          accent: color("--app-color-light-accent"),
        },
        focus: color("--app-color-focus"),
        overlay: color("--app-color-overlay"),
        skeleton: color("--app-color-skeleton"),
      },

      fontFamily: {
        sans: raw("--app-font-sans"),
        display: raw("--app-font-display"),
        // DEC-068: titulares de impacto, botones y cifras del marcador.
        headline: raw("--app-font-headline"),
        mono: raw("--app-font-mono"),
      },

      fontSize: {
        // Titular del hero (DEC-038). No existia antes de la reescritura de
        // marca: la portada anterior no tenia ningun tamano por encima de
        // `display-lg` porque no tenia hero a pantalla completa.
        "display-xl": [
          raw("--app-text-display-xl-size"),
          {
            lineHeight: raw("--app-text-display-xl-line"),
            letterSpacing: raw("--app-text-display-xl-tracking"),
          },
        ],
        "display-lg": [
          raw("--app-text-display-lg-size"),
          {
            lineHeight: raw("--app-text-display-lg-line"),
            letterSpacing: raw("--app-text-display-lg-tracking"),
          },
        ],
        "display-md": [
          raw("--app-text-display-md-size"),
          {
            lineHeight: raw("--app-text-display-md-line"),
            letterSpacing: raw("--app-text-display-md-tracking"),
          },
        ],
        "heading-lg": [
          raw("--app-text-heading-lg-size"),
          {
            lineHeight: raw("--app-text-heading-lg-line"),
            letterSpacing: raw("--app-text-heading-lg-tracking"),
          },
        ],
        "heading-md": [
          raw("--app-text-heading-md-size"),
          {
            lineHeight: raw("--app-text-heading-md-line"),
            letterSpacing: raw("--app-text-heading-md-tracking"),
          },
        ],
        "heading-sm": [
          raw("--app-text-heading-sm-size"),
          {
            lineHeight: raw("--app-text-heading-sm-line"),
            letterSpacing: raw("--app-text-heading-sm-tracking"),
          },
        ],
        "body-lg": [
          raw("--app-text-body-lg-size"),
          {
            lineHeight: raw("--app-text-body-lg-line"),
            letterSpacing: raw("--app-text-body-lg-tracking"),
          },
        ],
        "body-md": [
          raw("--app-text-body-md-size"),
          {
            lineHeight: raw("--app-text-body-md-line"),
            letterSpacing: raw("--app-text-body-md-tracking"),
          },
        ],
        "body-sm": [
          raw("--app-text-body-sm-size"),
          {
            lineHeight: raw("--app-text-body-sm-line"),
            letterSpacing: raw("--app-text-body-sm-tracking"),
          },
        ],
        label: [
          raw("--app-text-label-size"),
          {
            lineHeight: raw("--app-text-label-line"),
            letterSpacing: raw("--app-text-label-tracking"),
          },
        ],
        caption: [
          raw("--app-text-caption-size"),
          {
            lineHeight: raw("--app-text-caption-line"),
            letterSpacing: raw("--app-text-caption-tracking"),
          },
        ],
        overline: [
          raw("--app-text-overline-size"),
          {
            lineHeight: raw("--app-text-overline-line"),
            letterSpacing: raw("--app-text-overline-tracking"),
          },
        ],
      },

      // Tracking de los titulares en caja alta. `tracking-display` es lo que
      // impide que una condensada en mayusculas se lea como una mancha; los
      // pasos de la escala ya traen el suyo, esto es para composiciones que
      // mezclan tamanos (el marcador de la cuenta atras, el bloque de marca).
      letterSpacing: {
        display: raw("--app-tracking-display"),
        wide: raw("--app-tracking-wide"),
      },

      fontWeight: {
        regular: raw("--app-font-weight-regular"),
        medium: raw("--app-font-weight-medium"),
        semibold: raw("--app-font-weight-semibold"),
        bold: raw("--app-font-weight-bold"),
      },

      // Se ANADEN a la escala de Tailwind con prefijo `s-` para que sea evidente
      // en el marcado cuando se usa un token del sistema (`p-s4`) y cuando se
      // usa la escala por defecto (`p-4`). Ambas coinciden en valor.
      spacing: {
        s0: raw("--app-space-0"),
        s1: raw("--app-space-1"),
        s2: raw("--app-space-2"),
        s3: raw("--app-space-3"),
        s4: raw("--app-space-4"),
        s5: raw("--app-space-5"),
        s6: raw("--app-space-6"),
        s8: raw("--app-space-8"),
        s10: raw("--app-space-10"),
        s12: raw("--app-space-12"),
        s16: raw("--app-space-16"),
        s20: raw("--app-space-20"),
        s24: raw("--app-space-24"),
        gutter: raw("--app-gutter"),
      },

      borderRadius: {
        none: raw("--app-radius-none"),
        sm: raw("--app-radius-sm"),
        md: raw("--app-radius-md"),
        lg: raw("--app-radius-lg"),
        xl: raw("--app-radius-xl"),
        "2xl": raw("--app-radius-2xl"),
        pill: raw("--app-radius-pill"),
      },

      boxShadow: {
        none: raw("--app-shadow-none"),
        sm: raw("--app-shadow-sm"),
        md: raw("--app-shadow-md"),
        lg: raw("--app-shadow-lg"),
        xl: raw("--app-shadow-xl"),
        // DEC-039: sobre blanco la sombra SI eleva, asi que la banda clara
        // tiene sus propios escalones en vez de reutilizar unos calibrados
        // para no verse sobre negro.
        "light-sm": raw("--app-shadow-light-sm"),
        "light-md": raw("--app-shadow-light-md"),
      },

      maxWidth: {
        container: raw("--app-container-max"),
        narrow: raw("--app-container-narrow"),
      },

      height: {
        "control-sm": raw("--app-control-height-sm"),
        "control-md": raw("--app-control-height-md"),
        "control-lg": raw("--app-control-height-lg"),
        "control-xl": raw("--app-control-height-xl"),
      },

      minHeight: {
        "control-sm": raw("--app-control-height-sm"),
        "control-md": raw("--app-control-height-md"),
        "control-lg": raw("--app-control-height-lg"),
        "control-xl": raw("--app-control-height-xl"),
        // Area tactil minima recomendada; se usa como suelo, no como altura.
        touch: "44px",
      },

      minWidth: {
        touch: "44px",
      },

      transitionDuration: {
        instant: raw("--app-duration-instant"),
        fast: raw("--app-duration-fast"),
        base: raw("--app-duration-base"),
        slow: raw("--app-duration-slow"),
      },

      transitionTimingFunction: {
        standard: raw("--app-ease-standard"),
        emphasized: raw("--app-ease-emphasized"),
      },

      zIndex: {
        base: raw("--app-z-base"),
        sticky: raw("--app-z-sticky"),
        dropdown: raw("--app-z-dropdown"),
        overlay: raw("--app-z-overlay"),
        modal: raw("--app-z-modal"),
        toast: raw("--app-z-toast"),
      },

      // OJO: no se anaden claves a `ringWidth` ni a `ringOffsetWidth`. Tailwind
      // resuelve `ring-*` primero como grosor y despues como color, asi que una
      // clave `focus` en `ringWidth` convertiria `ring-focus` en un grosor y
      // dejaria el anillo de foco sin color. El grosor se expresa con las
      // utilidades estandar (`ring-2`, `ring-offset-2`), cuyos valores coinciden
      // con `--app-focus-ring-width` y `--app-focus-ring-offset`.

      keyframes: {
        "app-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        "app-spin": {
          to: { transform: "rotate(360deg)" },
        },
        // Entradas de superficies temporales (modal, drawer, toast). Son
        // desplazamientos cortos y opacidad: nada de rebotes ni escalados
        // llamativos, que es estetica de casino y esta prohibida.
        "app-fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "app-slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "app-slide-in-left": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        "app-slide-in-bottom": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        // DEC-075: la cifra del marcador entra desde arriba cuando cambia,
        // como en un panel de salidas. Desplazamiento corto y opacidad.
        "app-tick": {
          from: { transform: "translateY(-28%)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
      },

      animation: {
        "app-pulse": "app-pulse 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "app-spin": "app-spin 0.7s linear infinite",
        // La duracion sale de los tokens: con `prefers-reduced-motion` valen
        // 0ms en el origen, asi que la animacion desaparece sin que ningun
        // componente tenga que acordarse (ademas de `motion-reduce`).
        "app-fade-in": "app-fade-in var(--app-duration-fast) var(--app-ease-standard)",
        "app-slide-in-right":
          "app-slide-in-right var(--app-duration-base) var(--app-ease-emphasized)",
        "app-slide-in-left":
          "app-slide-in-left var(--app-duration-base) var(--app-ease-emphasized)",
        "app-slide-in-bottom":
          "app-slide-in-bottom var(--app-duration-base) var(--app-ease-emphasized)",
        "app-tick": "app-tick var(--app-duration-base) var(--app-ease-emphasized)",
      },
    },
  },
  plugins: [
    // Emite los tokens del patron topografico en `:root`, dentro de la capa
    // `base`. Van aqui y no en `tokens.css` porque las tres tintas se DERIVAN de
    // una sola geometria; ver el bloque `--- Patron topografico ---`.
    plugin(({ addBase }) => {
      addBase({ ":root": TOPO_TOKENS });
    }),
  ],
};

export default preset;
