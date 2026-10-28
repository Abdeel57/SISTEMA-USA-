// De la hoja y no del indice: el indice arrastra `http.ts`, que es de servidor.
import { ADMIN_MEDIA_CONTENT_TYPES } from "@/lib/api/admin-contract";

/**
 * Reduccion de fotos EN EL NAVEGADOR antes de subirlas.
 *
 * La camara de un telefono produce 4-12 MB y el tope es 5 MiB: sin reducir, la
 * mayoria de las fotos hechas en el momento rebotarian. Se reescala a 2000 px
 * de lado mayor, que sobra para una ficha de producto o para leer un
 * comprobante, y el formulario pasa de megas a cientos de KB -que en datos
 * moviles es la diferencia entre guardar y quedarse mirando-.
 *
 * Lo usan las fotos del catalogo del panel (`ImageUploadField`) y el
 * comprobante de Zelle del comprador (0041). Solo se importa desde componentes
 * de cliente: usa `document` y `createImageBitmap`.
 */

/** Lado mayor, en pixeles, al que se reduce una foto antes de enviarla. */
const MAX_DIMENSION = 2000;

/** Por debajo de esto no se toca: ya es ligera y recodificar solo pierde calidad. */
const RESIZE_THRESHOLD_BYTES = 1_000_000;

const JPEG_QUALITY = 0.86;

/**
 * Reduce una foto en el navegador. Devuelve el fichero original si no hace
 * falta, si el navegador no sabe, o si el resultado no mejora.
 *
 * NUNCA LANZA: es una mejora. Si algo falla, el fichero original sigue en el
 * input y el servidor decide.
 */
export async function downscale(file: File): Promise<File> {
  if (file.size <= RESIZE_THRESHOLD_BYTES) return file;
  if (typeof createImageBitmap !== "function") return file;

  try {
    // `from-image` aplica la orientacion EXIF: sin ello, una foto hecha con el
    // telefono en vertical saldria tumbada al redibujarla.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (context === null) return file;

    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    // Se conserva el tipo: un PNG o un WebP pueden llevar transparencia, y
    // pasarlos a JPEG la pintaria de negro. Un navegador que no sepa codificar
    // el tipo pedido devuelve PNG, que tambien esta admitido.
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, file.type, JPEG_QUALITY);
    });

    if (blob === null || blob.size >= file.size) return file;
    if (!(ADMIN_MEDIA_CONTENT_TYPES as readonly string[]).includes(blob.type)) return file;

    return new File([blob], file.name, { type: blob.type, lastModified: file.lastModified });
  } catch {
    return file;
  }
}

/** Sustituye el fichero del input. `false` si el navegador no lo permite. */
export function replaceInputFile(input: HTMLInputElement, file: File): boolean {
  try {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    return true;
  } catch {
    return false;
  }
}
