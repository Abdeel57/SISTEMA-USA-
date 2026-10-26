/**
 * Acciones compartidas del recorrido.
 *
 * Todo lo que dos pruebas necesitan hacer igual vive aqui, para que un cambio
 * de copy o de nombre de campo se arregle en un sitio. Los selectores usan
 * `name=` y no `getByLabel` a proposito: `FormField` de `packages/ui` concatena
 * la etiqueta con el indicador de obligatorio SIN espacio, de modo que el
 * nombre accesible del campo de correo es "CorreoObligatorio" y no "Correo".
 * Un selector por etiqueta seria correcto en apariencia y fallaria siempre.
 */

import { expect } from "@playwright/test";

import { FAKE_PARTICIPANT_PASSWORD, FAKE_STAFF_PASSWORD } from "./fixture.mjs";

/**
 * Cualquier URL del panel que NO sea la pantalla de acceso.
 *
 * Es a donde lleva `staffLoginAction` tras un 200: el panel (`/admin/es`) o la
 * ruta del panel que se pedia en `next`. Si la accion devolviera a
 * `/admin/es/login`, la espera no se cumpliria y la prueba fallaria aqui, que
 * es donde esta el problema.
 */
const ADMIN_URL_AFTER_LOGIN = /\/admin\/es(?!\/login)(?:[/?#]|$)/u;

/** Inicia sesion como participante y deja la pagina en `/es/account`. */
export async function loginParticipant(page, email) {
  await page.goto("/es/account/login");

  // Plantilla: solo correo y contrasena. El campo es el `EmailField` comun de
  // `auth-form-shell`, el mismo que usa el acceso del personal.
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(FAKE_PARTICIPANT_PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();

  // Sin pasos intermedios: la accion redirige directamente al portal.
  await page.waitForURL(/\/es\/account(\?|$)/, { timeout: 30_000 });
}

/**
 * Inicia sesion como personal: correo y contrasena, y nada mas.
 *
 * La plantilla no tiene segundo factor: un 200 de `POST /auth/login` ya es la
 * sesion abierta y la pantalla lleva directa al panel.
 *
 * Devuelve el valor de la cookie de personal, porque las comprobaciones que van
 * directas a la API la necesitan como cabecera: su `Path` es `/admin`, asi que
 * el navegador NO la enviaria a `/api/v1/...` por su cuenta. Ese `Path` es
 * exactamente la razon de que el panel viva en `/admin/[locale]`.
 */
export async function loginStaff(page, { email }) {
  await page.goto("/admin/es/login");

  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(FAKE_STAFF_PASSWORD);
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.waitForURL(ADMIN_URL_AFTER_LOGIN, { timeout: 30_000 });

  const cookies = await page.context().cookies();
  const staffCookie = cookies.find((cookie) => cookie.name.endsWith("_staff"));

  expect(
    staffCookie,
    "tras iniciar sesion debe existir una cookie de personal con sufijo _staff",
  ).toBeDefined();

  return staffCookie;
}

/** Cabecera `Cookie` para hablar con la API con una cookie concreta. */
export function cookieHeader(cookie) {
  return { cookie: `${cookie.name}=${cookie.value}` };
}

/**
 * Cabecera `Cookie` a partir del `Set-Cookie` de una respuesta de la API.
 *
 * Para las pruebas que hablan con la API sin navegador (`request`): el tarro
 * de cookies del contexto SI guarda la cookie de personal, pero con
 * `Path=/admin` no la adjunta a `/api/v1/...`, asi que un `login` seguido de
 * cualquier otra llamada en el mismo contexto viajaria sin sesion. Se lee la
 * cookie de la respuesta y se manda a mano, que es lo mismo que hace
 * `loginStaff` con la del navegador.
 */
export function sessionCookieHeaderFrom(response, name = "app_session_staff") {
  const setCookie = response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => header.value)
    .find((value) => value.startsWith(`${name}=`));
  expect(setCookie, `la respuesta debe emitir la cookie ${name}`).toBeDefined();
  const pair = setCookie.split(";")[0];
  return { cookie: pair };
}

/**
 * Comprueba que una pagina NO esta mostrando el estado de error de la capa de
 * API.
 *
 * Es la misma comprobacion que hace `apps/web/scripts/smoke.mjs`, y por el
 * mismo motivo: una pantalla con el estado de error responde 200 y contiene
 * todo el diccionario de i18n, de modo que "responde 200" no prueba nada. Los
 * textos se repiten aqui a proposito, en vez de importarlos del diccionario:
 * comparar un mensaje consigo mismo daria verde siempre.
 */
export async function expectNoApiErrorState(page) {
  await expect(page.getByText("No hemos podido cargar esta sección")).toHaveCount(0);
  await expect(page.getByText("We could not load this section")).toHaveCount(0);
}
