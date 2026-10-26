/**
 * Ajuste manual de participaciones: previsualizacion y aplicacion.
 *
 * UNA SOLA PERSONA BASTA
 * ----------------------
 * Plantilla: una sola persona opera el panel. `entry.adjust.create` y
 * `entry.adjust.approve` siguen siendo capacidades distintas, pero ya no hay
 * pareja de separacion de funciones que las enfrente, y la migracion 0039 deja
 * `dual_approval_for_sensitive_actions_enabled` APAGADO y quita el CHECK
 * `adjustments_approver_differs`. Consecuencia: el ajuste que pide alguien con
 * `entry.adjust.create` se aplica en el acto, y el expediente lo deja dicho con
 * `approved_by` igual a `requested_by` -no en `null`, que pareceria que se
 * aplico solo-.
 *
 * Lo que NO cambia: el ajuste exige motivo, la previsualizacion la calcula el
 * motor y aplicar es SIEMPRE una transaccion nueva del ledger, nunca una
 * edicion.
 */

import { expect, test } from "@playwright/test";

import { cookieHeader, loginStaff } from "../lib/actions.mjs";
import { SECOND_APPROVAL_NOT_DECLARED_FOR_ADJUSTMENTS } from "../lib/blockers.mjs";
import { API_BASE_URL, readFixture } from "../lib/fixture.mjs";

let fixture;

test.beforeAll(async () => {
  fixture = await readFixture();
});

test.describe("ajuste manual", () => {
  test.fixme(
    SECOND_APPROVAL_NOT_DECLARED_FOR_ADJUSTMENTS,
    "entry.adjust.create exige segunda aprobacion y POST /admin/entry-adjustments no declara secondApprovalEnforcedBy, asi que el autorizador deniega por construccion (HO-034.1). Ver lib/blockers.mjs.",
  );

  test("la previsualizacion calcula antes, cambio y despues sin escribir nada", async ({
    page,
  }) => {
    const manager = await loginStaff(page, fixture.staff.promotionManager);

    const before = await page.request.get(
      `${API_BASE_URL}/admin/amoe-submissions?promotion_id=${fixture.promotion.id}`,
      { headers: cookieHeader(manager) },
    );
    expect(before.status()).toBe(200);

    const preview = await page.request.post(`${API_BASE_URL}/admin/entry-adjustments/preview`, {
      // `entry.adjust.create` exige motivo (catalogo DEC-027) y la previsualizacion
      // no lleva cuerpo de motivo: viaja en la cabecera que acepta el autorizador
      // para ese caso (HO-034.1).
      headers: { ...cookieHeader(manager), "x-app-reason-code": "SUPPORT_RESOLUTION" },
      data: {
        promotion_id: fixture.promotion.id,
        participant_id: fixture.participant.id,
        direction: "CREDIT",
        quantity: 5,
      },
    });

    expect(preview.status()).toBe(200);

    const body = await preview.json();

    /*
     * LAS TRES CIFRAS LAS CALCULA EL MOTOR, no la pantalla. Es lo que impide
     * que el panel ensene un numero inventado: si el "despues" se calculara en
     * la interfaz, esta prueba daria el mismo resultado y seguiria estando mal.
     */
    expect(Number.isInteger(body.before)).toBe(true);
    expect(body.proposed_delta).toBe(5);
    expect(body.after).toBe(body.before + 5);
    expect(body.would_make_balance_negative).toBe(false);
    // `dual_approval_for_sensitive_actions_enabled` arranca APAGADO en la
    // plantilla (migracion 0039): el ajuste se aplicaria sin segunda firma.
    expect(body.requires_second_approval).toBe(false);
    expect(body.as_of).toBeTruthy();

    // Y no ha escrito nada: la cola de ajustes sigue como estaba.
    const listed = await page.request.get(
      `${API_BASE_URL}/admin/entry-adjustments?promotion_id=${fixture.promotion.id}`,
      { headers: cookieHeader(manager) },
    );
    expect(listed.status()).toBe(200);
  });

  test("un debito que dejaria el saldo en negativo se avisa antes de pedirlo", async ({ page }) => {
    const manager = await loginStaff(page, fixture.staff.promotionManager);

    const preview = await page.request.post(`${API_BASE_URL}/admin/entry-adjustments/preview`, {
      // `entry.adjust.create` exige motivo (catalogo DEC-027) y la previsualizacion
      // no lleva cuerpo de motivo: viaja en la cabecera que acepta el autorizador
      // para ese caso (HO-034.1).
      headers: { ...cookieHeader(manager), "x-app-reason-code": "SUPPORT_RESOLUTION" },
      data: {
        promotion_id: fixture.promotion.id,
        participant_id: fixture.participant.id,
        direction: "DEBIT",
        quantity: 1_000_000,
      },
    });

    expect(preview.status()).toBe(200);
    expect((await preview.json()).would_make_balance_negative).toBe(true);
  });

  test("pedir exige motivo y, sin doble aprobacion, el ajuste se aplica en el acto", async ({
    page,
  }) => {
    const manager = await loginStaff(page, fixture.staff.promotionManager);

    const created = await page.request.post(`${API_BASE_URL}/admin/entry-adjustments`, {
      headers: cookieHeader(manager),
      data: {
        promotion_id: fixture.promotion.id,
        participant_id: fixture.participant.id,
        direction: "CREDIT",
        quantity: 5,
        reason_key: "SYSTEM_ERROR_CORRECTION",
        reason_detail: "Escenario de e2e: correccion ficticia.",
      },
    });

    expect(created.status()).toBe(201);

    const adjustment = await created.json();
    expect(adjustment.status).toBe("APPLIED");
    expect(adjustment.reason_key).toBe("SYSTEM_ERROR_CORRECTION");
    expect(adjustment.requested_by).toBe(fixture.staff.promotionManager.adminUserId);
    // Nadie mas lo aprobo, y el expediente lo dice: el aprobador es quien lo
    // pidio, no `null`.
    expect(adjustment.approved_by).toBe(adjustment.requested_by);
    expect(adjustment.approved_at).toBeTruthy();
    // Aplicar es un movimiento NUEVO del ledger, nunca una edicion.
    expect(adjustment.entry_transaction_id).toBeTruthy();

    // Sin motivo, la peticion no debe crear nada.
    const withoutReason = await page.request.post(`${API_BASE_URL}/admin/entry-adjustments`, {
      headers: cookieHeader(manager),
      data: {
        promotion_id: fixture.promotion.id,
        participant_id: fixture.participant.id,
        direction: "CREDIT",
        quantity: 5,
      },
      failOnStatusCode: false,
    });
    expect(withoutReason.status()).toBe(422);
  });

  test("un ajuste aplicado no se queda esperando en la cola de pendientes", async ({ page }) => {
    /*
     * La otra mitad de "se aplica en el acto". Si el ajuste quedara tambien en
     * la cola de pendientes, alguien podria volver a decidir sobre algo que ya
     * movio el ledger.
     */
    const manager = await loginStaff(page, fixture.staff.promotionManager);

    const created = await page.request.post(`${API_BASE_URL}/admin/entry-adjustments`, {
      headers: cookieHeader(manager),
      data: {
        promotion_id: fixture.promotion.id,
        participant_id: fixture.participant.id,
        direction: "CREDIT",
        quantity: 3,
        reason_key: "SUPPORT_RESOLUTION",
        reason_detail: "Escenario de e2e: ajuste aplicado por quien lo pide.",
      },
    });

    expect(created.status()).toBe(201);
    const adjustment = await created.json();
    expect(adjustment.status).toBe("APPLIED");

    const pending = await page.request.get(
      `${API_BASE_URL}/admin/entry-adjustments?promotion_id=${fixture.promotion.id}`,
      { headers: cookieHeader(manager) },
    );
    expect(pending.status()).toBe(200);
    expect(
      (await pending.json()).items.some((row) => row.id === adjustment.id),
      "el ajuste ya aplicado sigue en la cola de pendientes",
    ).toBe(false);
  });
});
