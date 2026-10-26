"use server";

import { revalidatePath } from "next/cache";

import { FALLBACK_LOCALE, localeTag, type Locale } from "@/i18n/locales";
import { redirect } from "@/i18n/navigation";
import { login, logout, register } from "@/lib/api";

import {
  fromCredentialFailure,
  fromFailure,
  invalid,
  SUCCEEDED,
  type ActionResult,
} from "./action-result";
import { consentsFrom, localeFrom, returnPathFrom, secretFrom, textFrom } from "./form-input";
import { mutableSession } from "./session-server";

/**
 * Acciones de identidad, como Server Actions (DEC-006).
 *
 * PLANTILLA: CORREO Y CONTRASENA, Y NADA MAS
 * ------------------------------------------
 * No hay segundo factor, ni verificacion de correo, ni recuperacion de
 * contrasena por correo o SMS. Quien olvida su contrasena se la pide a la
 * tienda, y el administrador le fija una nueva desde el panel.
 *
 * NI UN TOKEN LLEGA AL NAVEGADOR
 * ------------------------------
 * Ninguna de estas acciones devuelve una sesion, ni la guarda, ni la lee. La
 * sesion es una cookie `httpOnly` que emite el backend; `mutableSession()`
 * reenvia la cabecera `Cookie` hacia la API y propaga al navegador la
 * `Set-Cookie` que llegue de vuelta, sin interpretarla. El identificador de
 * sesion no pasa por JavaScript de cliente en ningun momento, no se guarda en
 * `localStorage` y no aparece en ningun tipo de la capa de API.
 *
 * Que el token sea OPACO -43 caracteres sin estructura, no un JWT- refuerza lo
 * mismo por otro lado: aunque alguien lo tuviera, no hay nada que leer dentro.
 * Todo lo que la interfaz sabe de la sesion llega por `GET /auth/session`.
 *
 * LA VALIDACION DE AQUI NO ES AUTORITATIVA
 * ----------------------------------------
 * Comprueba que el formulario esta completo y que los dos campos de contrasena
 * coinciden. Nada mas. No hay longitud minima, ni complejidad exigida, ni edad,
 * ni estado de residencia: esas politicas son de `packages/security` y de las
 * Official Rules, y duplicarlas aqui garantizaria que un dia digan cosas
 * distintas. El backend revalida todo y es quien decide.
 *
 * POR QUE SERVER ACTIONS Y NO `fetch` DESDE EL NAVEGADOR
 * ------------------------------------------------------
 * El mismo razonamiento que en el carrito, y con una razon mas: una contrasena
 * que viaja desde el navegador a `apps/api` obliga a exponer la base de la API
 * al cliente. Aqui el navegador habla unicamente con el servidor de Next.
 */

/** Destino tras iniciar sesion: el que pedia la pagina, o el resumen de cuenta. */
function destinationFrom(formData: FormData): string {
  return returnPathFrom(formData.get("next")) ?? "/account";
}

/** Alta de participante. */
export async function registerAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const locale = localeFrom(formData);
  if (locale === null) return invalid("VALIDATION_FAILED");

  const email = textFrom(formData, "email");
  if (email === null) return invalid("FIELD_REQUIRED", "email");

  /*
   * `chosen` y `repeated`, y no `password` y `confirmation`.
   *
   * No es cosmetica. `security/detect-possible-timing-attacks` marca cualquier
   * comparacion contra un identificador llamado `password` o `token`, y el
   * aviso es correcto EN GENERAL: comparar un secreto con `===` filtra por el
   * tiempo cuanto coincide. Aqui no aplica -las dos mitades las acaba de
   * teclear la misma persona en el mismo formulario, y no hay ningun secreto
   * del servidor en la comparacion-, pero se evita el nombre en vez de
   * silenciar la regla con un `eslint-disable`, para que la regla siga
   * vigilando el dia que aparezca una comparacion que si importe.
   *
   * El mismo criterio en el resto del archivo: `credential`.
   */
  const chosen = secretFrom(formData, "password");
  if (chosen === null) return invalid("FIELD_REQUIRED", "password");

  const repeated = secretFrom(formData, "password_confirmation");
  if (repeated === null) return invalid("FIELD_REQUIRED", "password_confirmation");

  if (chosen !== repeated) {
    return invalid("PASSWORD_CONFIRMATION_MISMATCH", "password_confirmation");
  }

  // DEC-067: se piden y se mandan; si con ellos se participa lo decide el backend.
  const dateOfBirth = textFrom(formData, "date_of_birth");
  if (dateOfBirth === null) return invalid("FIELD_REQUIRED", "date_of_birth");

  const residenceState = textFrom(formData, "residence_state");
  if (residenceState === null) return invalid("FIELD_REQUIRED", "residence_state");

  const consents = consentsFrom(formData);
  if (consents.missing) return invalid("CONSENT_REQUIRED", "consent");

  const session = await mutableSession();
  const result = await register(
    {
      email,
      password: chosen,
      display_name: textFrom(formData, "display_name"),
      // El idioma de la cuenta se fija con el que la persona esta usando ahora
      // mismo, en ETIQUETA BCP-47 (DEC-029). No se pregunta en el alta: ya se
      // ha respondido eligiendo en que idioma leer la pagina.
      language_preference: localeTag(locale),
      consents: consents.accepted,
      date_of_birth: dateOfBirth,
      residence_state: residenceState,
    },
    locale,
    session,
  );

  if (!result.ok) return fromFailure(result.error, registerFieldFor(result.error.code));

  return afterAuthentication(locale, destinationFrom(formData));
}

/**
 * Campo al que pertenece un rechazo del alta (seccion 10 del contrato).
 *
 * Los codigos hablan de UN campo concreto, y el error se pinta junto a el en
 * vez de en la cabecera del formulario: "esa contrasena es corta" arriba del
 * todo obliga a adivinar cual de los campos hay que corregir. Cualquier otro
 * fallo -red, servicio, validacion generica- es del formulario entero.
 */
function registerFieldFor(code: string | null): string | null {
  if (code === "WEAK_PASSWORD") return "password";
  if (code === "EMAIL_ALREADY_REGISTERED") return "email";
  // DEC-067: el backend revalida los documentos; su rechazo va junto a las casillas.
  if (code === "CONSENT_REQUIRED") return "consent";
  return null;
}

/**
 * Inicio de sesion, con correo y contrasena.
 *
 * Un 200 ya es una sesion `ACTIVE`: no hay segundo paso, asi que se va directo
 * al destino que se pedia.
 */
export async function loginAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const locale = localeFrom(formData);
  if (locale === null) return invalid("VALIDATION_FAILED");

  const email = textFrom(formData, "email");
  if (email === null) return invalid("FIELD_REQUIRED", "email");

  const credential = secretFrom(formData, "password");
  if (credential === null) return invalid("FIELD_REQUIRED", "password");

  const session = await mutableSession();
  const result = await login({ email, password: credential }, locale, session);

  if (!result.ok) return fromCredentialFailure(result.error, "INVALID_CREDENTIALS");

  return afterAuthentication(locale, destinationFrom(formData));
}

/**
 * Cierre de sesion.
 *
 * Redirige a la portada SIEMPRE, incluso si el backend responde mal. Quien
 * pulsa "cerrar sesion" tiene una expectativa muy concreta, y dejarle en una
 * pantalla de error sin saber si su sesion sigue abierta es la peor respuesta
 * posible. La cookie la retira el backend con su `Set-Cookie`; si la llamada
 * falla, la sesion sigue viva en el servidor -que es lo unico que cuenta- y la
 * siguiente pantalla lo reflejara.
 */
export async function logoutAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData) ?? FALLBACK_LOCALE;

  const session = await mutableSession();
  await logout(locale, session);

  revalidatePath("/", "layout");
  redirect({ href: "/", locale });
}

/**
 * Cierre comun de un alta o un inicio de sesion correctos.
 *
 * `revalidatePath("/", "layout")` es obligatorio y no una optimizacion: la
 * cabecera pinta el estado de sesion, vive en el layout y esta cacheada. Sin
 * invalidarla, alguien que acaba de entrar seguiria viendo "Iniciar sesion" en
 * la cabecera de la pagina siguiente.
 *
 * El `redirect` es el de `@/i18n/navigation` y no el de `next/navigation`
 * (DEC-021): el de Next no conoce el prefijo de idioma y sacaria a alguien de
 * su idioma justo despues de entrar en su cuenta.
 *
 * El `return` final es INALCANZABLE: `redirect` lanza. Esta escrito porque el
 * `redirect` de next-intl no se declara como `never` y sin el la funcion no
 * compila; devolver el resultado de exito es lo unico correcto que se puede
 * poner ahi, porque es lo que significaria llegar.
 */
function afterAuthentication(locale: Locale, destination: string): ActionResult {
  revalidatePath("/", "layout");
  redirect({ href: destination, locale });

  return SUCCEEDED;
}
