import { metaPixelBaseScript, metaPixelNoscriptUrl, normalizeMetaPixelId } from "@/lib/meta-pixel";

/**
 * Pixel de Meta de la tienda (DEC-086, DEC-087): el codigo base, para el
 * `<head>` del layout de la tienda.
 *
 * Es un `<script>` EN LINEA renderizado en el servidor: corre al parsear la
 * pagina, antes de hidratar, y por eso el primer `PageView` sale aunque la
 * persona se vaya antes de que cargue React. Lleva el nonce de la CSP de esta
 * peticion (la tienda no admite scripts en linea sin el).
 *
 * `suppressHydrationWarning`: el navegador oculta el valor de `nonce` en el
 * DOM, y React veria una diferencia que no lo es. React no vuelve a ejecutar un
 * `<script>` al hidratar, y el layout raiz no se vuelve a montar al navegar:
 * el pixel se inicializa una sola vez por documento.
 *
 * Sin identificador valido no pinta nada: el sitio no tiene pixel.
 */
export function MetaPixelBase({
  pixelId,
  hosts,
  locales,
  nonce,
}: {
  readonly pixelId: string | null;
  /** Dominio del sitio con y sin `www` (`RuntimeBrand.siteHosts`). */
  readonly hosts: readonly string[];
  readonly locales: readonly string[];
  readonly nonce: string | null;
}) {
  const id = normalizeMetaPixelId(pixelId);
  if (id === null) return null;

  return (
    <script
      id="meta-pixel-base"
      {...(nonce === null ? {} : { nonce })}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: metaPixelBaseScript({ pixelId: id, hosts, locales }) }}
    />
  );
}

/**
 * El `PageView` de quien navega SIN JavaScript: el `<img>` del fragmento
 * oficial de Meta. Va al principio del `<body>` (en el `<head>` un `<img>` no
 * es HTML valido; el navegador lo moveria igual).
 *
 * `allowed` lo decide el layout en el servidor con lo que si sabe ahi: el
 * host de la peticion, la cabecera `Sec-GPC` y la cookie de exclusion.
 */
export function MetaPixelNoscript({
  pixelId,
  allowed,
}: {
  readonly pixelId: string | null;
  readonly allowed: boolean;
}) {
  const id = normalizeMetaPixelId(pixelId);
  if (id === null || !allowed) return null;

  return (
    <noscript>
      {/* eslint-disable-next-line @next/next/no-img-element -- un pixel de 1x1 sin JavaScript no pasa por `next/image` */}
      <img height="1" width="1" style={{ display: "none" }} alt="" src={metaPixelNoscriptUrl(id)} />
    </noscript>
  );
}
