/**
 * Acceso de personal con correo y contrasena, y cola de revision AMOE.
 *
 * LA PLANTILLA NO TIENE SEGUNDO FACTOR
 * ------------------------------------
 * Decision del propietario: el acceso es correo y contrasena, para participantes
 * y para personal. `POST /auth/login` responde `state: "ACTIVE"` en el acto, no
 * existe `POST /auth/mfa/verify` y la pantalla `/admin/[locale]/mfa` se borro.
 * Lo que este fichero comprueba es que eso es VERDAD de punta a punta: que la
 * contrasena sola abre una sesion de personal completa -con sus roles y sus
 * capacidades- y que la pantalla de acceso lleva directa al panel.
 *
 * Lo que la plantilla NO relaja sigue comprobandose aqui: la cookie de personal
 * es `Strict` y vive en `/admin`, la matriz rol x capacidad sigue siendo
 * deny-by-default y una sesion de participante no entra al panel.
 */

import { expect, test } from "@playwright/test";

import {
  cookieHeader,
  expectNoApiErrorState,
  loginParticipant,
  loginStaff,
  sessionCookieHeaderFrom,
} from "../lib/actions.mjs";
import { ADMIN_DASHBOARD_ENDPOINTS_MISSING } from "../lib/blockers.mjs";
import { API_BASE_URL, FAKE_STAFF_PASSWORD, readFixture } from "../lib/fixture.mjs";

let fixture;

test.beforeAll(async () => {
  fixture = await readFixture();
});

test("la contrasena sola abre el panel: la API responde ACTIVE con roles y capacidades", async ({
  request,
}) => {
  const response = await request.post(`${API_BASE_URL}/auth/login`, {
    data: { email: fixture.staff.promotionManager.email, password: FAKE_STAFF_PASSWORD },
  });

  expect(response.status()).toBe(200);

  const body = await response.json();

  /*
   * LA COMPROBACION MAS IMPORTANTE DE ESTE FICHERO. Con la contrasena correcta
   * la sesion de personal queda ACTIVA en la misma respuesta: no hay estado
   * intermedio que completar ni codigo que pedir.
   */
  expect(body.authenticated).toBe(true);
  expect(body.state).toBe("ACTIVE");
  expect(body.scope).toBe("STAFF");
  expect(body.email).toBe(fixture.staff.promotionManager.email);
  expect(body.roles).toEqual(["PROMOTION_MANAGER"]);

  /*
   * Las capacidades las resuelve el servidor con el mismo catalogo que usa el
   * autorizador. Sin parejas de separacion de funciones, PROMOTION_MANAGER
   * transcribe Y aprueba fichas AMOE; pero la matriz sigue siendo
   * deny-by-default: no activa versiones de reglas.
   */
  expect(body.capabilities).toEqual(
    expect.arrayContaining([
      "amoe.review.read",
      "amoe.review.approve",
      "amoe.submission.transcribe",
      "entry.adjust.create",
    ]),
  );
  expect(body.capabilities).not.toContain("rules.version.activate");

  // La cookie de esa MISMA respuesta ya vale para la API, sin ningun paso mas.
  const session = await request.get(`${API_BASE_URL}/auth/session`, {
    headers: sessionCookieHeaderFrom(response),
  });
  expect(session.status()).toBe(200);

  const current = await session.json();
  expect(current.authenticated).toBe(true);
  expect(current.state).toBe("ACTIVE");
  expect(current.scope).toBe("STAFF");
  expect(current.roles).toEqual(["PROMOTION_MANAGER"]);
});

test("la pantalla de acceso lleva directa al panel, sin paso intermedio", async ({ page }) => {
  await loginStaff(page, fixture.staff.promotionManager);

  // El destino por defecto es la portada del panel, no otra pantalla de acceso.
  expect(new URL(page.url()).pathname).toBe("/admin/es");
  await expectNoApiErrorState(page);
});

test("con `next`, el acceso lleva directo a la pantalla del panel que se pedia", async ({
  page,
}) => {
  await page.goto("/admin/es/login?next=/admin/es/amoe");

  await page.locator('input[name="email"]').fill(fixture.staff.promotionManager.email);
  await page.locator('input[name="password"]').fill(FAKE_STAFF_PASSWORD);
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.waitForURL(/\/admin\/es\/amoe(?:[?#]|$)/u, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Revisión gratuita", level: 1 })).toBeVisible();
  await expectNoApiErrorState(page);
});

test("la cookie de personal es Strict y vive en /admin", async ({ page }) => {
  const staffCookie = await loginStaff(page, fixture.staff.promotionManager);

  /*
   * `SameSite=Strict` y `Path=/admin` no son detalles: son la razon de que el
   * panel viva en `/admin/[locale]` y no en `/[locale]/admin`. Con ese `Path`,
   * desde `/es/admin` el navegador NO enviaria la cookie y el panel estaria
   * permanentemente deslogueado.
   */
  expect(staffCookie.httpOnly).toBe(true);
  expect(staffCookie.sameSite).toBe("Strict");
  expect(staffCookie.path).toBe("/admin");
  expect(staffCookie.name).toBe("app_session_staff");

  const session = await page.request.get(`${API_BASE_URL}/auth/session`, {
    headers: cookieHeader(staffCookie),
  });
  const body = await session.json();

  expect(body.authenticated).toBe(true);
  expect(body.scope).toBe("STAFF");
  expect(body.roles).toEqual(["PROMOTION_MANAGER"]);
});

test("la cola de revision AMOE responde con su forma paginada", async ({ page }) => {
  const staffCookie = await loginStaff(page, fixture.staff.promotionManager);

  const response = await page.request.get(
    `${API_BASE_URL}/admin/amoe-submissions?promotion_id=${fixture.promotion.id}`,
    { headers: cookieHeader(staffCookie) },
  );

  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(Array.isArray(body.items)).toBe(true);

  /*
   * LA COLA NO PUBLICA EL PAYLOAD, Y EL CORREO VA ENMASCARADO.
   *
   * Lleva `participant_id` interno y las cifras de impacto, nunca lo que la
   * persona escribio: quien revisa decide con los numeros y con la
   * procedencia, no leyendo la ficha.
   *
   * El correo si viaja desde HO-041 -sin el, dos fichas del mismo sobre son
   * indistinguibles en pantalla- pero ENMASCARADO en la frontera, que es el
   * patron de `apps/api/src/http/pii.ts`. La diferencia importa: enmascarado
   * permite distinguir dos filas; completo permitiria exportar una lista de
   * correos desde una pantalla de revision.
   */
  for (const item of body.items) {
    expect(item.participant_id).toBeTruthy();
    expect(item).not.toHaveProperty("payload");
    if (item.participant_email !== null && item.participant_email !== undefined) {
      expect(item.participant_email, "el correo de la cola no esta enmascarado").toContain("*");
    }
  }
});

test("un participante no entra al panel aunque su cookie viaje a /admin", async ({ page }) => {
  /*
   * Ocurre a diario: la cookie del escaparate tiene `Path=/`, asi que llega
   * tambien a `/admin`. Lo correcto es el rechazo por AUDIENCIA, no un error.
   */
  await loginParticipant(page, fixture.participant.email);

  await page.goto("/admin/es");

  // No debe verse el panel, y tampoco el estado de error de la capa de API:
  // esto es una denegacion deliberada, no un fallo de red.
  await expectNoApiErrorState(page);
  await expect(page.getByRole("button", { name: "Aprobar" })).toHaveCount(0);
});

/*
 * LA APROBACION DE UN ENVIO AMOE SE PRUEBA EN `11-mail-in-amoe.spec.mjs`.
 *
 * Desde el borrador v2 la unica via gratuita es POSTAL (`MAIL_IN_REVIEW`, 2,000
 * por ficha): el envio no lo hace el participante desde una pantalla, lo
 * transcribe un operador desde el panel. Y en la plantilla, quien lo transcribe
 * PUEDE aprobarlo: la coordenada es `specs/11-mail-in-amoe.spec.mjs` -> "quien
 * transcribe tambien puede aprobar".
 *
 * Lo que se queda aqui es lo que sigue siendo de este fichero: el acceso del
 * personal y la FORMA de la cola de revision.
 */

test.describe("pantallas del panel con backend propio", () => {
  test.fixme(
    ADMIN_DASHBOARD_ENDPOINTS_MISSING,
    "El panel llama a /admin/dashboard, /admin/promotions, /admin/orders, /admin/audit-events y otros que apps/api no sirve. Ver lib/blockers.mjs.",
  );

  test("el cuadro de mando trae cifras del backend", async ({ page }) => {
    await loginStaff(page, fixture.staff.promotionManager);

    await page.goto("/admin/es");
    await expectNoApiErrorState(page);
  });
});
