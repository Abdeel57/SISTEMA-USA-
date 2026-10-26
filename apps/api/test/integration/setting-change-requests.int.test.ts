/**
 * SOLICITUDES DE CAMBIO DE AJUSTES, CONTRA POSTGRESQL REAL.
 *
 * Existe por un fallo de produccion: al aplicar la solicitud de encender
 * `entry_multipliers_enabled`, pedida con el motivo "Otro" y una nota, la API
 * respondia 500. La ruta guardaba como motivo escrito solo el codigo (`OTHER`,
 * 5 caracteres) y el trigger de DEC-013 (migracion `0005`) exige 10.
 *
 * Plantilla: una sola persona opera el panel, asi que la solicitud se aplica
 * en el acto. Aqui la aplicacion es la real, con su autorizador y la base de
 * datos con todas las migraciones, incluida la 0039.
 *
 * `TEST_DATABASE_URL=... pnpm --filter @app/api test:integration`.
 */

import { UnconfiguredPaymentProvider } from "@app/commerce";
import type { Database, DatabaseHandle } from "@app/database";
import { startTestDatabase, type TestDatabase } from "@app/database/testing";
import { hashPassword } from "@app/security";
import { sql } from "drizzle-orm";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../src/app.js";
import { CONTRACT_GENERATION_CONFIG } from "../../src/config/contract-config.js";
import type { ApiConfig } from "../../src/config/env.js";
import { createIdentityRepositories } from "../../src/services/drizzle-identity.js";
import { createRepositories } from "../../src/services/drizzle-repositories.js";

// "fake" en el valor: la allowlist de .gitleaks.toml lo reconoce por eso.
const PASSWORD = "fake-integration-fixture-password";

interface Staff {
  readonly email: string;
  readonly adminUserId: string;
}

let testDb: TestDatabase;
let handle: DatabaseHandle;
let db: Database;
let app: FastifyInstance;
let admin: Staff;

async function one<T>(query: ReturnType<typeof sql>): Promise<T> {
  const result = await db.execute<Record<string, T>>(query);
  const row = result.rows[0];
  const value = row === undefined ? undefined : Object.values(row)[0];
  if (value === undefined) throw new Error("La consulta del escenario no devolvio nada.");
  return value;
}

async function insertStaff(email: string, roleKey: string): Promise<Staff> {
  const identityId = await one<string>(
    sql`INSERT INTO identities (email, status, email_verified_at)
        VALUES (${email}, 'ACTIVE', now()) RETURNING id`,
  );
  await db.execute(
    sql`INSERT INTO identity_credentials (identity_id, password_hash)
        VALUES (${identityId}, ${await hashPassword(PASSWORD)})`,
  );
  const adminUserId = await one<string>(
    sql`INSERT INTO admin_users (identity_id, full_name, status)
        VALUES (${identityId}, ${`Staff ${email}`}, 'ACTIVE') RETURNING id`,
  );
  await db.execute(
    sql`INSERT INTO admin_user_roles (admin_user_id, role_key, grant_reason)
        VALUES (${adminUserId}, ${roleKey}, 'Escenario de integracion. Sin valor real.')`,
  );
  return { email, adminUserId };
}

class Browser {
  private readonly jar = new Map<string, string>();

  public async request(
    method: "GET" | "POST",
    url: string,
    payload?: unknown,
  ): Promise<LightMyRequestResponse> {
    const response = await app.inject({
      method,
      url,
      headers: {
        cookie: [...this.jar.entries()].map(([name, value]) => `${name}=${value}`).join("; "),
      },
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });
    for (const cookie of response.cookies) {
      if (cookie.value === "" || cookie.maxAge === 0) this.jar.delete(cookie.name);
      else this.jar.set(cookie.name, cookie.value);
    }
    return response;
  }
}

/** Sesion de personal: solo correo y contrasena (plantilla, sin segundo factor). */
async function staffSession(staff: Staff): Promise<Browser> {
  const browser = new Browser();
  const login = await browser.request("POST", "/api/v1/auth/login", {
    email: staff.email,
    password: PASSWORD,
  });
  expect(login.statusCode, login.body).toBe(200);
  return browser;
}

beforeAll(async () => {
  testDb = await startTestDatabase();
  handle = testDb.connectAs("app");
  db = handle.db;

  const config: ApiConfig = {
    ...CONTRACT_GENERATION_CONFIG,
    http: {
      ...CONTRACT_GENERATION_CONFIG.http,
      rateLimit: { windowSeconds: 60, maxRequests: 10_000 },
    },
  };

  // Una sola persona de Cumplimiento: pide y aplica.
  admin = await insertStaff("compliance.one@example.invalid", "COMPLIANCE_OFFICER");

  app = await createApp({
    config,
    database: handle,
    repositories: createRepositories(db),
    identity: createIdentityRepositories(db),
    paymentProvider: new UnconfiguredPaymentProvider(),
  });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await testDb?.stop();
});

describe("cambiar un flag legalmente material", () => {
  it("pedido con 'Otro' y una nota, se aplica en el acto y el flag se enciende", async () => {
    const session = await staffSession(admin);
    const created = await session.request("POST", "/api/v1/admin/settings/change-requests", {
      setting_kind: "FEATURE_FLAG",
      setting_key: "entry_multipliers_enabled",
      enabled: true,
      reason_code: "OTHER",
      reason_text: "El cliente lo indica",
    });

    expect(created.statusCode, created.body).toBe(201);
    expect(created.json<{ status: string; decided_by_admin_user_id: string }>()).toMatchObject({
      status: "APPLIED",
      decided_by_admin_user_id: admin.adminUserId,
    });

    const flag = await db.execute<{ enabled: boolean; update_reason: string }>(
      sql`SELECT enabled, update_reason FROM feature_flags
           WHERE key = 'entry_multipliers_enabled'`,
    );
    expect(flag.rows[0]).toEqual({
      enabled: true,
      update_reason: "OTHER — entry_multipliers_enabled: El cliente lo indica",
    });
  });

  it("y el historico del flag guarda el cambio con ese motivo", async () => {
    // El historico lo escribe un trigger SECURITY DEFINER; se lee como
    // propietario para no depender de los permisos del rol de la aplicacion.
    // `testDb.stop()` cierra esta conexion junto con las demas.
    const owner = testDb.connectAsOwner();
    const history = await owner.db.execute<{ new_value: string; reason: string }>(
      sql`SELECT new_value, reason FROM feature_flag_changes
           WHERE flag_key = 'entry_multipliers_enabled'
           ORDER BY recorded_at DESC LIMIT 1`,
    );
    expect(history.rows[0]).toEqual({
      new_value: "true",
      reason: "OTHER — entry_multipliers_enabled: El cliente lo indica",
    });
  });

  it("la doble aprobacion arranca apagada (migracion 0039)", async () => {
    const dual = await db.execute<{ enabled: boolean }>(
      sql`SELECT enabled FROM feature_flags
           WHERE key = 'dual_approval_for_sensitive_actions_enabled'`,
    );
    expect(dual.rows[0]?.enabled).toBe(false);
  });
});
