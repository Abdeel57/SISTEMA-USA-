import { BRAND } from "@app/brand";

/**
 * Pixel de Meta (DEC-086, DEC-087), uno por sitio.
 *
 * Mide las visitas y las compras de la tienda para los anuncios de Facebook e
 * Instagram del cliente.
 *
 * DE DONDE SALE EL IDENTIFICADOR (DEC-087)
 * ----------------------------------------
 * Del PANEL: Marca -> "ID del Meta Pixel" (`brand_profile.meta_pixel_id`,
 * migracion 0044), publicado en `GET /config` -> `brand.meta_pixel_id`. Cada
 * sitio tiene su base de datos, asi que cada sitio tiene su pixel. Sin
 * identificador, la tienda NO carga nada de Meta. Ya no hay variable de
 * entorno ni ningun identificador escrito en el codigo.
 *
 * LIMITES QUE SE CONSERVAN DE DEC-086
 * -----------------------------------
 *   1. SOLO EN LA TIENDA. El panel tiene su propio layout, no lo carga y su CSP
 *      no abre los origenes de Meta: ahi se ven datos de clientes.
 *   2. SOLO EN EL DOMINIO REAL: el de Marca y el del despliegue (`SITE_URL`),
 *      con y sin `www` (`metaPixelHosts`). En local, en CI o en un dominio
 *      `.test` no dispara: ensuciaria las audiencias.
 *   3. RESPETA LA EXCLUSION. No se carga si el navegador envia Global Privacy
 *      Control, ni si la persona eligio no compartir en `/privacychoices`. La
 *      CCPA trata el pixel como "compartir para publicidad comportamental".
 *   4. SIN DATOS PERSONALES. Ni correo, ni telefono, ni "advanced matching".
 *      Los eventos llevan lo que se compra (SKU, cantidad, importe) y, en la
 *      compra, el identificador del pedido para que Meta no la cuente dos veces.
 *
 * El codigo base de Meta va EN LINEA en el `<head>` (con el nonce de la CSP),
 * compuesto por `metaPixelBaseScript`: corre antes de hidratar, decide si se
 * permite, inicializa el pixel UNA vez y manda el primer `PageView`. Los
 * cambios de ruta y los eventos de compra los manda `lib/meta-pixel-events`.
 */

/** De donde se carga `fbevents.js` y su configuracion. */
export const META_SCRIPT_ORIGIN = "https://connect.facebook.net";

/** A donde envia los eventos (`/tr`). */
export const META_BEACON_ORIGIN = "https://www.facebook.com";

export const META_SCRIPT_URL = `${META_SCRIPT_ORIGIN}/en_US/fbevents.js`;

/**
 * La forma de un identificador de pixel: solo cifras, de 8 a 20. Es la misma
 * que valida la API y la CHECK de la migracion 0044. El valor acaba dentro de
 * un `<script>`, de una URL y de la CSP: con otra forma no se usa.
 */
export const META_PIXEL_ID_PATTERN = /^\d{8,20}$/u;

/** El identificador si tiene la forma valida; si no (o si falta), `null` = sin pixel. */
export function normalizeMetaPixelId(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return META_PIXEL_ID_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * Hosts en los que el pixel dispara: el dominio de la marca, con y sin `www`.
 *
 * Estos son los de los valores INICIALES de `packages/brand`. En la pagina
 * manda el dominio guardado desde el panel (`RuntimeBrand.siteHosts`); esta
 * lista es el respaldo.
 */
export const META_PIXEL_HOSTS: readonly string[] = [
  BRAND.domain.toLowerCase(),
  `www.${BRAND.domain.toLowerCase()}`,
];

/** Sufijos que nunca son el sitio publico de un cliente. */
const NON_PUBLIC_HOST =
  /(^localhost$)|(\.(localhost|local|test|example|invalid|internal)$)|(^\d{1,3}(\.\d{1,3}){3}$)|(^\[)/u;

/** `ejemplo.com` -> `["ejemplo.com", "www.ejemplo.com"]` (y al reves). */
function withAndWithoutWww(host: string): readonly string[] {
  return host.startsWith("www.") ? [host.slice(4), host] : [host, `www.${host}`];
}

/**
 * Los hosts donde dispara el pixel: los del dominio de Marca y, ademas, el del
 * despliegue (`SITE_URL`, lo pone Coolify) si es un dominio publico.
 *
 * El segundo existe porque el dominio de Marca puede seguir siendo el de la
 * plantilla (`mimarca.com`) cuando alguien pega el ID del pixel: sin el, el
 * pixel "estaria puesto" y no mediria nada, sin ningun aviso. `localhost`, una
 * IP o un dominio `.test`/`.local` nunca entran: ahi el pixel no dispara aunque
 * la base de datos de pruebas tenga un ID.
 */
export function metaPixelHosts(
  brandHosts: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): readonly string[] {
  const hosts = new Set(brandHosts.map((host) => host.toLowerCase()));

  const raw = env.SITE_URL ?? env.NEXT_PUBLIC_SITE_URL;
  if (raw !== undefined && raw.trim() !== "") {
    try {
      const url = new URL(raw.trim());
      const host = url.hostname.toLowerCase();
      if ((url.protocol === "https:" || url.protocol === "http:") && !NON_PUBLIC_HOST.test(host)) {
        for (const candidate of withAndWithoutWww(host)) hosts.add(candidate);
      }
    } catch {
      // Un `SITE_URL` mal escrito no anade nada: quedan los de Marca.
    }
  }

  return [...hosts];
}

/**
 * Cookie de "no compartir mi actividad para publicidad" en este navegador.
 * La pone `/privacychoices`. Un ano: es una preferencia, no una sesion.
 */
export const AD_SHARING_OPT_OUT_COOKIE = "app_ad_sharing_opt_out";
export const AD_SHARING_OPT_OUT_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/**
 * Eventos que se envian al PULSAR un elemento marcado con
 * `data-meta-event="<evento>"` (DEC-086). Lista cerrada: un atributo con otro
 * nombre no envia nada.
 *
 * `CompleteRegistration` lo pidio el cliente para el boton "Comprar ahora" de la
 * portada, como conversion de sus anuncios.
 */
export const META_CLICK_EVENTS: readonly string[] = ["CompleteRegistration"];

/** Atributo que marca un elemento cuyo clic envia un evento. */
export const META_EVENT_ATTRIBUTE = "data-meta-event";

/**
 * Rutas (sin idioma) donde el pixel NI se carga NI registra nada.
 *
 * - `/account`: el area privada de quien compra. No es una pagina de la tienda.
 * - `/checkout/return`: la vuelta de la pasarela de pago, con sus datos en la
 *   URL. Meta recibe la URL de cada evento.
 *
 * El checkout y la confirmacion del pedido SI lo llevan desde DEC-087: son
 * donde ocurren `InitiateCheckout` y `Purchase`. Su URL lleva como mucho el
 * identificador del pedido, que no da acceso a nada sin la sesion y que el
 * propio `Purchase` manda como `eventID`.
 */
export const META_PIXEL_EXCLUDED_PATHS: readonly string[] = ["/account", "/checkout/return"];

/** Si `pathname` (sin prefijo de idioma) queda fuera del pixel. */
export function isMetaPixelExcludedPath(pathname: string): boolean {
  return META_PIXEL_EXCLUDED_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Si la cookie de exclusion esta puesta en `cookieHeader` (`document.cookie`). */
export function hasAdSharingOptOut(cookieHeader: string): boolean {
  return cookieHeader.split(";").some((part) => part.trim() === `${AD_SHARING_OPT_OUT_COOKIE}=1`);
}

/** Lo que decide si el pixel se carga en este navegador. */
export function metaPixelAllowed(context: {
  readonly hostname: string;
  readonly globalPrivacyControl: boolean;
  readonly cookieHeader: string;
  /** Hosts del sitio segun la marca guardada; sin el, los iniciales. */
  readonly hosts?: readonly string[];
}): boolean {
  const hosts = context.hosts ?? META_PIXEL_HOSTS;
  if (!hosts.includes(context.hostname.toLowerCase())) return false;
  if (context.globalPrivacyControl) return false;
  return !hasAdSharingOptOut(context.cookieHeader);
}

/** El `<img>` del `<noscript>`: un `PageView` para quien navega sin JavaScript. */
export function metaPixelNoscriptUrl(pixelId: string): string {
  return `${META_BEACON_ORIGIN}/tr?id=${encodeURIComponent(pixelId)}&ev=PageView&noscript=1`;
}

/**
 * JSON para incrustar en un `<script>`: sin `<` literal, para que ninguna
 * cadena pueda cerrar la etiqueta. Los valores ya vienen validados (cifras,
 * hosts con la forma de la CHECK de la 0040); esto es la segunda red.
 */
function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</gu, "\\u003c");
}

/**
 * El codigo base del pixel, para el `<script>` en linea del `<head>`.
 *
 * Es el fragmento OFICIAL de Meta (la cola `fbq` y la carga de `fbevents.js`)
 * envuelto en las cuatro comprobaciones de arriba, y publica
 * `window.__appMetaPixel` para que el resto de la tienda sepa si hay pixel:
 *
 *   status "ready" .... cargado e inicializado; se pueden mandar eventos.
 *   status "blocked" .. otro dominio, GPC o exclusion: no se carga nunca.
 *   status "excluded" . se entro por una ruta excluida; si despues se navega a
 *                       una pagina de la tienda, `load()` lo carga alli.
 *
 * `init` va UNA sola vez por documento: el layout raiz no se vuelve a
 * renderizar al navegar, React no re-ejecuta un `<script>` al hidratar, y el
 * propio fragmento sale si `window.__appMetaPixel` ya existe.
 *
 * `disablePushState` apaga el `PageView` automatico de Meta en cada
 * `pushState` (lo manda la tienda, ruta a ruta, saltando las excluidas), y
 * `allowDuplicatePageViews` evita que Meta descarte los siguientes del mismo
 * documento. `autoConfig` apagado: sin eventos automaticos con el texto de
 * los botones.
 */
export function metaPixelBaseScript(options: {
  readonly pixelId: string;
  readonly hosts: readonly string[];
  /** Codigos de idioma que pueden ir delante de la ruta (`/es/...`). */
  readonly locales: readonly string[];
}): string {
  const pixelId = normalizeMetaPixelId(options.pixelId);
  if (pixelId === null) return "";

  const localePrefix = new RegExp(
    `^/(?:${options.locales.map((locale) => locale.replace(/[^a-z-]/giu, "")).join("|")})(?=/|$)`,
    "u",
  );

  return `(function(w,d){
if(w.__appMetaPixel)return;
var ID=${inlineJson(pixelId)},HOSTS=${inlineJson(options.hosts.map((host) => host.toLowerCase()))},EXCLUDED=${inlineJson(META_PIXEL_EXCLUDED_PATHS)},OPT_OUT=${inlineJson(`${AD_SHARING_OPT_OUT_COOKIE}=1`)},LOCALE=${localePrefix.toString()};
function path(){var p=w.location.pathname.replace(LOCALE,"");return p===""?"/":p;}
function excluded(p){for(var i=0;i<EXCLUDED.length;i++){var x=EXCLUDED[i];if(p===x||p.indexOf(x+"/")===0)return true;}return false;}
function allowed(){if(HOSTS.indexOf(w.location.hostname.toLowerCase())<0)return false;if(w.navigator.globalPrivacyControl===true)return false;var c=d.cookie.split(";");for(var i=0;i<c.length;i++){if(c[i].replace(/^\\s+|\\s+$/g,"")===OPT_OUT)return false;}return true;}
var s={id:ID,status:"idle",pageKey:null,path:path,excluded:excluded,load:load};
w.__appMetaPixel=s;
function load(){
if(s.status==="ready")return true;
if(!allowed()){s.status="blocked";return false;}
!function(f,b,e,v,n,t,u){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;u=b.getElementsByTagName(e)[0];u.parentNode.insertBefore(t,u)}(w,d,"script",${inlineJson(META_SCRIPT_URL)});
w.fbq.disablePushState=true;w.fbq.allowDuplicatePageViews=true;
w.fbq("set","autoConfig",false,ID);w.fbq("init",ID);
s.status="ready";return true;}
if(excluded(path())){s.status="excluded";return;}
if(load()){w.fbq("track","PageView");s.pageKey=w.location.pathname;}
})(window,document);`;
}
