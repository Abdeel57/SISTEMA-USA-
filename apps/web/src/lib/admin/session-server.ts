import type { Locale } from "@/i18n/locales";
import { fetchSession, type ApiFailure, type SessionContext, type SessionState } from "@/lib/api";
import { readSession } from "@/lib/session-server";

import { toAdminActor, type AdminActor } from "./capabilities";

/**
 * Estado de sesion de una pantalla del PANEL (DEC-006, DEC-048).
 *
 * CUATRO ESTADOS, uno mas que en el portal del participante, y el que sobra es
 * el que importa: `notStaff`.
 *
 * - `active` ....... sesion de personal. Se pinta el panel.
 * - `notStaff` ..... hay sesion valida, pero es de PARTICIPANTE. Ocurre de
 *   verdad y a diario: la cookie del escaparate tiene `Path=/`, asi que viaja
 *   tambien a `/admin`, y cualquiera que escriba la URL con su sesion de
 *   cliente abierta cae aqui. Se responde con un 403 deliberado -"esta cuenta
 *   no tiene acceso al panel"- y NO con el formulario de personal: ofrecer un
 *   login a quien ya tiene sesion valida invita a probar credenciales.
 * - `anonymous` .... no hay sesion. Se ofrece el inicio de sesion de personal.
 * - `unavailable` .. no se ha podido saber. Estado de error con su referencia.
 *
 * Colapsar `notStaff` en `anonymous` seria el fallo tipico y tiene consecuencia
 * concreta: convertiria el panel en un formulario de credenciales de personal
 * ofrecido a cualquiera que tenga una cuenta de cliente.
 */
export type AdminSessionState =
  | { readonly kind: "active"; readonly session: SessionState; readonly actor: AdminActor }
  | { readonly kind: "notStaff" }
  | { readonly kind: "anonymous" }
  | { readonly kind: "unavailable"; readonly failure: ApiFailure };

export interface AdminSessionContext {
  /** Cookies del navegador, para reenviarlas en el resto de lecturas. */
  readonly session: SessionContext;
  readonly state: AdminSessionState;
}

/**
 * Lee la sesion vigente para una pantalla del panel.
 *
 * UNA SOLA PETICION, igual que en el escaparate: `GET /auth/session` responde
 * 200 siempre y trae estado, alcance y roles, que es todo lo que el panel
 * necesita para decidir que pintar.
 *
 * NO SE PIDE `GET /me`. El panel no ensena el nombre de pila de quien opera:
 * ensena su correo y sus roles, que es lo que identifica a un actor en la
 * auditoria. Pedir el perfil seria una lectura de mas en cada pantalla para un
 * dato que no se usa.
 */
export async function loadAdminSession(locale: Locale): Promise<AdminSessionContext> {
  const session = await readSession();

  // Sin ninguna cookie no hay sesion posible. Se evita una llamada de red por
  // cada visita anonima a `/admin`, que ademas es de donde vendria el trafico
  // automatizado que busca paneles de administracion.
  if (session.cookie === null) {
    return { session, state: { kind: "anonymous" } };
  }

  const result = await fetchSession(locale, session);

  if (!result.ok) {
    return { session, state: { kind: "unavailable", failure: result.error } };
  }

  const data = result.data;

  /*
   * ESCRITA EN POSITIVO, Y NO ES ESTILO (HO-027).
   *
   * Dice que hace falta para PASAR -sesion autenticada, en estado `ACTIVE` y
   * con alcance `STAFF`- en vez de enumerar los casos que la bloquean. Una
   * guarda en negativo se puede reescribir con `?.` o `??` sin que nadie note
   * que ha cambiado de significado, y en `apps/api` ya paso: un `--fix`
   * convirtio `session === null || session.revokedAt !== null` en
   * `session?.revokedAt != null`, que con `session === null` evalua `false` y
   * dejaba autenticar a un token sin sesion.
   *
   * NO APLICAR `eslint --fix` A ESTA COMPROBACION SIN LEERLA. Y si alguna regla
   * sugiere "simplificarla", la simplificacion hay que probarla en negativo:
   * `ANONYMOUS`, un estado desconocido, una sesion `PARTICIPANT` y una
   * respuesta incoherente (`authenticated: true` con `state: "ANONYMOUS"`)
   * tienen que seguir sin dar acceso al panel. Hay tests para ellos.
   *
   * Las tres condiciones se exigen aunque el contrato las publique coherentes:
   * una respuesta incoherente se resuelve por el lado que menos acceso da.
   *
   * OJO con `prefer-optional-chain` aqui: la comprobacion es contra un valor
   * CONCRETO (`=== "ACTIVE"`, `=== "STAFF"`), que es el caso en el que la regla
   * es segura; peligrosa lo es contra `null`, que es lo que ocurrio en
   * `apps/api`. Se deja escrita asi de todas formas para que la diferencia no
   * dependa de que el siguiente la note.
   */
  const authenticated = data.authenticated && data.state === "ACTIVE";

  if (!authenticated) {
    return { session, state: { kind: "anonymous" } };
  }

  if (data.scope !== "STAFF") {
    return { session, state: { kind: "notStaff" } };
  }

  return { session, state: { kind: "active", session: data, actor: toAdminActor(data) } };
}
