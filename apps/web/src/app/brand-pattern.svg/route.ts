import { topoSvg } from "@app/design-system/topo-svg";

import { loadBrand } from "@/lib/brand-server";

/**
 * El patron topografico con el color y la intensidad que eligio el
 * administrador (migracion 0040).
 *
 * Es un FICHERO y no un `data:` en linea: la geometria pesa ~30 KB y asi viaja
 * una vez y se cachea, en vez de ir dentro del HTML de cada pagina. La hoja en
 * linea del layout lo referencia como `/brand-pattern.svg?v=<version>`, donde
 * la version cambia con el color o la intensidad (`patternVersion`): asi se
 * puede servir `immutable` un ano y aun asi ver el nuevo en cuanto cambie la
 * marca. Sin `v` -o con una que ya no es la vigente- se sirve sin cache.
 *
 * La misma funcion que usa el preset de Tailwind para las tintas fijas, con
 * el color de marca EFECTIVO (ya aclarado si el elegido no se leia sobre
 * negro), para que el patron y los titulares sean del mismo tono.
 *
 * Queda fuera del middleware por llevar punto en la ruta, como `/media/...`.
 * Las cabeceras de seguridad son las de una imagen que no ejecuta nada.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const brand = await loadBrand();
  const requestedVersion = new URL(request.url).searchParams.get("v");

  const svg = topoSvg({
    stroke: effectiveStroke(brand.themeCss),
    opacity: brand.patternOpacityPercent / 100,
    width: 1,
  });

  return new Response(svg, {
    status: 200,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control":
        requestedVersion === brand.patternVersion
          ? "public, max-age=31536000, immutable"
          : "no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}

/**
 * El color de marca tal como se pinta, leido de la propia hoja de tema para que
 * no pueda discrepar de los titulares: `--app-color-brand:R G B` -> `rgb(R G B)`.
 */
function effectiveStroke(themeCss: string): string {
  const match = /--app-color-brand:(\d+ \d+ \d+)/u.exec(themeCss);
  return match === null ? "#38bdf8" : `rgb(${match[1] ?? "56 189 248"})`;
}
