import { ADMIN_MEDIA_CONTENT_TYPES, adminPaymentReceiptPath, apiBaseUrl } from "@/lib/api";
import { readSession } from "@/lib/session-server";

/**
 * La imagen de un comprobante de Zelle, para el panel (0041).
 *
 * POR QUE PASA POR AQUI
 * ---------------------
 * El navegador no habla con la API y la CSP fija `img-src 'self'`, igual que
 * con las fotos del catalogo (`/media/[file]`). La diferencia es que esto NO es
 * publico: vive bajo `/admin`, donde el navegador manda la cookie de personal
 * (`Path=/admin`, DEC-006), y se la reenvia a la API, que exige `order.read`
 * -la misma capacidad que la ficha del pedido-. Sin sesion, o sin permiso, no
 * sale ni un byte.
 *
 * Nada se cachea fuera del navegador de quien lo pidio (`private, no-store`):
 * una captura de un pago puede llevar datos bancarios.
 */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const PRIVATE = { "cache-control": "private, no-store" } as const;

export async function GET(
  _request: Request,
  context: { params: Promise<{ locale: string; id: string; receiptId: string }> },
): Promise<Response> {
  const { id, receiptId } = await context.params;

  // Se comprueba ANTES de componer la URL: lo que no tenga forma de uuid no
  // llega a la API ni como ruta.
  if (!UUID.test(id) || !UUID.test(receiptId)) {
    return new Response(null, { status: 404, headers: PRIVATE });
  }

  const session = await readSession();

  let upstream: Response;
  try {
    upstream = await fetch(
      `${apiBaseUrl().replace(/\/+$/u, "")}${adminPaymentReceiptPath(id, receiptId)}`,
      {
        headers: session.cookie === null ? {} : { cookie: session.cookie },
        cache: "no-store",
      },
    );
  } catch {
    return new Response(null, { status: 502, headers: PRIVATE });
  }

  // Sin sesion o sin permiso, lo dice; cualquier otra cosa es "no existe".
  if (upstream.status === 401 || upstream.status === 403) {
    return new Response(null, { status: upstream.status, headers: PRIVATE });
  }
  if (!upstream.ok) return new Response(null, { status: 404, headers: PRIVATE });

  // Solo imagenes. Un envelope JSON o un HTML de un intermediario no sale por
  // aqui con el origen del panel.
  const contentType = upstream.headers.get("content-type") ?? "";
  if (!(ADMIN_MEDIA_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    return new Response(null, { status: 404, headers: PRIVATE });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...PRIVATE,
      "content-type": contentType,
      "content-security-policy": "default-src 'none'; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
}
