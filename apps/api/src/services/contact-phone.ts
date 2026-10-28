/**
 * El WhatsApp del comprador (0041), en E.164: `+` y de 8 a 15 digitos, que es
 * lo que piden `wa.me` y la CHECK `orders_contact_phone_shape`.
 *
 * SE ACEPTA COMO LO ESCRIBE UNA PERSONA. "(512) 555-0134", "512 555 0134",
 * "+52 55 1234 5678" o "0052...": espacios, guiones, puntos y parentesis se
 * quitan; `00` delante es lo mismo que `+`.
 *
 * DIEZ CIFRAS SIN PREFIJO SON DE EE. UU. O CANADA. La tienda vende en Estados
 * Unidos, y casi nadie escribe el `+1` de su propio numero; once cifras que
 * empiezan por `1` son ese mismo numero con el prefijo. Un numero de otro pais
 * sin su `+` no se puede adivinar: si no cuadra, se rechaza y la persona lo
 * corrige, en vez de guardar un numero al que nunca llegaria el aviso.
 */
const E164 = /^\+[1-9]\d{7,14}$/u;

/** Solo lo que una persona teclea en un telefono. Una letra ya no es un numero. */
const TYPED_PHONE = /^[+\d\s().-]+$/u;

export function normalizeContactPhone(raw: string): string | null {
  const typed = raw.trim();
  if (typed === "" || !TYPED_PHONE.test(typed)) return null;

  const digits = typed.replace(/\D/gu, "");

  let e164: string;
  if (typed.startsWith("+")) {
    e164 = `+${digits}`;
  } else if (digits.startsWith("00")) {
    e164 = `+${digits.slice(2)}`;
  } else if (digits.length === 10) {
    e164 = `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith("1")) {
    e164 = `+${digits}`;
  } else {
    return null;
  }

  return E164.test(e164) ? e164 : null;
}
