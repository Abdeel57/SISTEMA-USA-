/**
 * Marca del sitio desde el panel (tabla `brand_profile`, migracion 0040).
 *
 * Igual que `admin-shipping` y `media`: se inyecta en la aplicacion REAL y se
 * lee lo que sale por el cable. Lo que impone el motor -las CHECK de la 0040,
 * la clave ajena del logotipo- es de `packages/database`; aqui se prueba la
 * FORMA de la peticion y de la respuesta, y que lo invalido se rechaza con el
 * campo exacto antes de llegar al motor.
 *
 * LOS INVARIANTES QUE ESTE ARCHIVO VIGILA
 *   1. `GET /config` publica la marca guardada, y es la misma que ve el panel.
 *   2. Guardar reemplaza la fila entera y deja constancia de quien lo hizo.
 *   3. Colores, prefijos y dominio se normalizan (minusculas / mayusculas).
 *   4. Un logotipo que no existe es 422, no un error del motor.
 *   5. Una zona horaria inventada es 422.
 *   6. Queda en la auditoria como `brand.updated`, con los campos que cambiaron.
 */

import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp, type AppDependencies } from "../src/app.js";
import { CONTRACT_GENERATION_CONFIG } from "../src/config/contract-config.js";
import { createFakeRepositories, FIXTURE_BRAND } from "./support/in-memory-repositories.js";

const ADMIN_USER_ID = "44444444-4444-4444-8444-444444444444";
const LOGO_ID = "5d5d5d5d-5d5d-4d5d-8d5d-5d5d5d5d5d5d";
const NOW = new Date("2026-10-13T12:00:00.000Z");

/** `vi.mock` se eleva sobre los imports, asi que el estado va en `vi.hoisted`. */
const shared: { emitted: unknown[] } = vi.hoisted(() => ({ emitted: [] }));

vi.mock("../src/http/require-staff.js", () => ({
  requireStaffContext: () =>
    Promise.resolve({
      principal: { actor: { type: "ADMIN", adminUserId: ADMIN_USER_ID }, scope: "STAFF" },
      roles: [],
      secondsSinceLastMfa: 10,
      adminUserId: ADMIN_USER_ID,
    }),
}));

/*
 * Solo el reloj y el sumidero de auditoria son de esta prueba. Los demas
 * modulos de rutas leen `domain.repositories.*` al CONSTRUIRSE (no al atender),
 * asi que el doble les da objetos vacios para que la app arranque.
 */
vi.mock("../src/services/domain-registry.js", () => ({
  domainServicesFor: () => ({
    clock: { now: () => NOW },
    repositories: { orders: {}, ledger: {}, snapshots: {}, amoe: {}, adjustments: {} },
    audit: {
      emit: (event: unknown) => {
        shared.emitted.push(event);
        return Promise.resolve();
      },
    },
  }),
}));

function buildDependencies(knownMediaIds: readonly string[] = []): AppDependencies {
  return {
    config: CONTRACT_GENERATION_CONFIG,
    database: { role: "app", db: {}, pool: {}, close: () => Promise.resolve() },
    paymentProvider: { name: "none" },
    repositories: createFakeRepositories({ knownMediaIds }),
  } as unknown as AppDependencies;
}

/** App con el autorizador ABIERTO. La postura por defecto se prueba aparte. */
async function appAllowingPermissions(knownMediaIds?: readonly string[]): Promise<FastifyInstance> {
  const app = await createApp(buildDependencies(knownMediaIds));
  app.appAuthorizer = () => ({ allowed: true });
  return app;
}

/** Un cuerpo valido entero; cada prueba cambia lo que le interesa. */
function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Ruta Norte",
    wordmark: { lead: "Ruta", tail: "Norte" },
    legal: {
      name: "Ruta Norte LLC",
      entity_description: "a Texas limited liability company",
      governing_law_state: "Texas",
      venue: "Harris County, Texas",
      street: "500 Main St",
      city_state_zip: "Houston, TX 77002",
    },
    contact_email: "hola@rutanorte.com",
    domain: "RutaNorte.com",
    time_zone: "America/Chicago",
    numbering: { order_prefix: "rn", entry_prefix: "tk" },
    colors: { brand: "#E10012", accent: "#FFD400" },
    pattern_opacity_percent: 12,
    logo_media_id: null,
    ...overrides,
  };
}

interface BrandBody {
  readonly name: string;
  readonly wordmark: { lead: string; tail: string };
  readonly domain: string;
  readonly numbering: { order_prefix: string; entry_prefix: string };
  readonly colors: { brand: string; accent: string };
  readonly pattern_opacity_percent: number;
  readonly logo_url: string | null;
  readonly logo_media_id: string | null;
  readonly updated_by_admin_user_id: string | null;
  readonly time_zone: string;
}

interface ErrorBody {
  readonly error: { readonly code: string; readonly details?: { issues?: { path: string }[] } };
}

beforeEach(() => {
  shared.emitted = [];
});

describe("GET /api/v1/config (brand)", () => {
  it("publica la marca guardada con la forma que la web aplica", async () => {
    const app = await createApp(buildDependencies());
    const response = await app.inject({ method: "GET", url: "/api/v1/config" });

    expect(response.statusCode).toBe(200);
    const { brand } = response.json<{ brand: BrandBody & { legal: Record<string, string> } }>();
    expect(brand.name).toBe(FIXTURE_BRAND.name);
    expect(brand.wordmark).toEqual({ lead: "Mi", tail: "Marca" });
    expect(brand.legal.city_state_zip).toBe(FIXTURE_BRAND.cityStateZip);
    expect(brand.colors).toEqual({ brand: "#38bdf8", accent: "#2563eb" });
    expect(brand.pattern_opacity_percent).toBe(16);
    expect(brand.logo_url).toBeNull();
    // Lo que solo interesa al panel NO sale por la ruta publica.
    expect(brand).not.toHaveProperty("logo_media_id");
    expect(brand).not.toHaveProperty("updated_by_admin_user_id");
    await app.close();
  });
});

describe("GET /api/v1/admin/brand", () => {
  it("devuelve lo publico mas el logotipo y quien guardo", async () => {
    const app = await appAllowingPermissions();
    const response = await app.inject({ method: "GET", url: "/api/v1/admin/brand" });

    expect(response.statusCode).toBe(200);
    const body = response.json<BrandBody>();
    expect(body.name).toBe("Mi Marca");
    expect(body.logo_media_id).toBeNull();
    // Valores iniciales: nadie ha guardado todavia.
    expect(body.updated_by_admin_user_id).toBeNull();
    await app.close();
  });
});

describe("PUT /api/v1/admin/brand", () => {
  it("guarda la fila entera, normaliza y deja constancia de quien (invariantes 2 y 3)", async () => {
    const app = await appAllowingPermissions();
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/brand",
      payload: validBody(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<BrandBody>();
    expect(body.name).toBe("Ruta Norte");
    expect(body.domain).toBe("rutanorte.com");
    expect(body.numbering).toEqual({ order_prefix: "RN", entry_prefix: "TK" });
    expect(body.colors).toEqual({ brand: "#e10012", accent: "#ffd400" });
    expect(body.pattern_opacity_percent).toBe(12);
    expect(body.updated_by_admin_user_id).toBe(ADMIN_USER_ID);

    // Y `GET /config` ya publica lo nuevo: es lo que la web aplica.
    const config = await app.inject({ method: "GET", url: "/api/v1/config" });
    expect(config.json<{ brand: BrandBody }>().brand.name).toBe("Ruta Norte");
    await app.close();
  });

  it("queda en la auditoria como brand.updated con los campos que cambiaron (invariante 6)", async () => {
    const app = await appAllowingPermissions();
    await app.inject({
      method: "PUT",
      url: "/api/v1/admin/brand",
      payload: validBody({
        ...FIXTURE_BRAND_BODY,
        name: "Otra Marca",
        colors: { brand: "#000000", accent: "#2563eb" },
      }),
    });

    expect(shared.emitted).toHaveLength(1);
    const event = shared.emitted[0] as {
      action: string;
      actor: { type: string; adminUserId: string };
      metadata: { changed_fields: string[] };
      occurredAt: Date;
    };
    expect(event.action).toBe("brand.updated");
    expect(event.actor).toEqual({ type: "ADMIN", adminUserId: ADMIN_USER_ID });
    expect(event.occurredAt).toBe(NOW);
    expect(event.metadata.changed_fields).toEqual(["name", "colorBrand"]);
    await app.close();
  });

  it("acepta un logotipo subido y publica su ruta", async () => {
    const app = await appAllowingPermissions([LOGO_ID]);
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/brand",
      payload: validBody({ logo_media_id: LOGO_ID }),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<BrandBody>();
    expect(body.logo_media_id).toBe(LOGO_ID);
    expect(body.logo_url).toBe(`/media/${LOGO_ID}.png`);
    await app.close();
  });

  it("rechaza con 422 un logotipo que no existe, antes del motor (invariante 4)", async () => {
    const app = await appAllowingPermissions();
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/brand",
      payload: validBody({ logo_media_id: LOGO_ID }),
    });

    expect(response.statusCode).toBe(422);
    const body = response.json<ErrorBody>();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.error.details?.issues?.[0]?.path).toBe("logo_media_id");
    expect(shared.emitted).toHaveLength(0);
    await app.close();
  });

  it.each([
    ["zona horaria inventada", { time_zone: "Marte/Olympus" }],
    ["color sin almohadilla", { colors: { brand: "38bdf8", accent: "#2563eb" } }],
    ["prefijo de una letra", { numbering: { order_prefix: "A", entry_prefix: "NUM" } }],
    ["dominio con protocolo", { domain: "https://mimarca.com" }],
    ["correo sin arroba", { contact_email: "contacto.mimarca.com" }],
    ["patron fuera de rango", { pattern_opacity_percent: 41 }],
    ["nombre vacio", { name: "   " }],
  ])("rechaza con 422: %s (invariante 5)", async (_label, overrides) => {
    const app = await appAllowingPermissions();
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/brand",
      payload: validBody(overrides),
    });

    expect(response.statusCode).toBe(422);
    expect(response.json<ErrorBody>().error.code).toBe("VALIDATION_FAILED");
    expect(shared.emitted).toHaveLength(0);
    await app.close();
  });
});

/** El fixture de la marca inicial, con la forma del cuerpo del `PUT`. */
const FIXTURE_BRAND_BODY = {
  name: FIXTURE_BRAND.name,
  wordmark: { lead: FIXTURE_BRAND.wordmarkLead, tail: FIXTURE_BRAND.wordmarkTail },
  legal: {
    name: FIXTURE_BRAND.legalName,
    entity_description: FIXTURE_BRAND.legalEntity,
    governing_law_state: FIXTURE_BRAND.governingLawState,
    venue: FIXTURE_BRAND.venue,
    street: FIXTURE_BRAND.street,
    city_state_zip: FIXTURE_BRAND.cityStateZip,
  },
  contact_email: FIXTURE_BRAND.contactEmail,
  domain: FIXTURE_BRAND.domain,
  time_zone: FIXTURE_BRAND.timeZone,
  numbering: {
    order_prefix: FIXTURE_BRAND.orderNumberPrefix,
    entry_prefix: FIXTURE_BRAND.entryNumberPrefix,
  },
  colors: { brand: FIXTURE_BRAND.colorBrand, accent: FIXTURE_BRAND.colorAccent },
  pattern_opacity_percent: FIXTURE_BRAND.patternOpacityPercent,
  logo_media_id: null,
};
