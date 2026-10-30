/**
 * APARTAR SIN CUENTA Y PAGAR POR ZELLE O VENMO (0042), CONTRA POSTGRESQL REAL.
 *
 * La tienda solo cobra por transferencia -sin tarjeta y sin efectivo-, asi que
 * comprar no pide cuenta: el visitante llena el carrito, deja su WhatsApp y su
 * nombre, aparta el pedido, sube la captura del pago diciendo con que app pago
 * y el organizador lo confirma en el panel.
 *
 * Se ejercita la aplicacion Fastify real por HTTP (`app.inject`) sobre una base
 * con todas las migraciones: la identidad de invitado, la sesion que se abre al
 * apartar, el cambio de canal al subir la captura, la cola del panel y el
 * corte de caja.
 *
 * `TEST_DATABASE_URL=... pnpm --filter @app/api test:integration`.
 */

import type { Database, DatabaseHandle } from "@app/database";
import { startTestDatabase, type TestDatabase } from "@app/database/testing";
import { hashPassword } from "@app/security";
import { sql } from "drizzle-orm";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp, type AppDependencies } from "../../src/app.js";
import { CONTRACT_GENERATION_CONFIG } from "../../src/config/contract-config.js";
import type { ApiConfig } from "../../src/config/env.js";
import { createIdentityRepositories } from "../../src/services/drizzle-identity.js";
import { createRepositories } from "../../src/services/drizzle-repositories.js";

// "fake" en los valores: la allowlist de .gitleaks.toml los reconoce por eso.
const PASSWORD = "fake-integration-fixture-password";
const UNIT_PRICE_MINOR = 500;
const SHIPPING_MINOR = 499;
const SESSION_COOKIE = CONTRACT_GENERATION_CONFIG.session.cookieName;
const CART_COOKIE = `${SESSION_COOKIE}_cart`;

/** PNG de 1x1. La API decide el tipo por la firma de los bytes. */
const RECEIPT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

let testDb: TestDatabase;
let handle: DatabaseHandle;
let db: Database;
let app: FastifyInstance;
let variantId = "";
let qrMediaId = "";

async function one<T>(query: ReturnType<typeof sql>): Promise<T> {
  const result = await db.execute<Record<string, T>>(query);
  const row = result.rows[0];
  const value = row === undefined ? undefined : Object.values(row)[0];
  if (value === undefined) {
    throw new Error("La consulta del escenario no devolvio nada.");
  }
  return value;
}

class Browser {
  public readonly jar = new Map<string, string>();

  public absorb(response: LightMyRequestResponse): void {
    for (const cookie of response.cookies) {
      const expired = cookie.value === "" || cookie.maxAge === 0;
      if (expired) this.jar.delete(cookie.name);
      else this.jar.set(cookie.name, cookie.value);
    }
  }

  public async request(
    method: "GET" | "POST" | "PUT",
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
    this.absorb(response);
    return response;
  }
}

let managerBrowser: Promise<Browser> | null = null;
function manager(): Promise<Browser> {
  managerBrowser ??= (async () => {
    const browser = new Browser();
    const login = await browser.request("POST", "/api/v1/auth/login", {
      email: "reserve-manager@example.invalid",
      password: PASSWORD,
    });
    expect(login.statusCode, login.body).toBe(200);
    return browser;
  })();
  return managerBrowser;
}

function errorCode(response: LightMyRequestResponse): string {
  return response.json<{ error: { code: string } }>().error.code;
}

async function fillCart(browser: Browser): Promise<void> {
  const added = await browser.request("POST", "/api/v1/cart/items", {
    variant_id: variantId,
    quantity: 1,
  });
  expect(added.statusCode, added.body).toBeLessThan(300);
}

const RESERVE = {
  contact_phone: "+52 55 1234 5678",
  first_name: "María",
  last_name: "López",
  language_preference: "es-US",
};

const TRANSFER_SETTINGS = {
  cash_enabled: false,
  zelle_enabled: true,
  zelle_recipient_name: "Edgardo Fixture",
  zelle_recipient: "zelle@example.invalid",
  venmo_enabled: true,
  venmo_recipient_name: "Jose Fixture",
  venmo_handle: "@Jose-Fixture",
};

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

  const managerIdentity = await one<string>(
    sql`INSERT INTO identities (email, status, email_verified_at)
        VALUES ('reserve-manager@example.invalid', 'ACTIVE', now()) RETURNING id`,
  );
  await db.execute(
    sql`INSERT INTO identity_credentials (identity_id, password_hash)
        VALUES (${managerIdentity}, ${await hashPassword(PASSWORD)})`,
  );
  const adminUserId = await one<string>(
    sql`INSERT INTO admin_users (identity_id, full_name, status)
        VALUES (${managerIdentity}, 'Staff PROMOTION_MANAGER', 'ACTIVE') RETURNING id`,
  );
  await db.execute(
    sql`INSERT INTO admin_user_roles (admin_user_id, role_key, grant_reason)
        VALUES (${adminUserId}, 'PROMOTION_MANAGER', 'Escenario de integracion. Sin valor real.')`,
  );
  await db.execute(
    sql`INSERT INTO shipping_rates (amount_minor, currency, set_by_admin_user_id)
        VALUES (${SHIPPING_MINOR}, 'USD', ${adminUserId})`,
  );

  const productId = await one<string>(
    sql`INSERT INTO products (sku, slug, status, currency, kind, category_key)
        VALUES ('INT-RESERVE-CAP', 'int-reserve-cap', 'ACTIVE', 'USD', 'MERCHANDISE', NULL)
        RETURNING id`,
  );
  await db.execute(
    sql`INSERT INTO product_translations (product_id, locale, name, description)
        VALUES (${productId}, 'en-US', 'Fixture cap', 'Fixture merchandise.'),
               (${productId}, 'es-US', 'Gorra de prueba', 'Mercancia de prueba.')`,
  );
  variantId = await one<string>(
    sql`INSERT INTO product_variants
          (product_id, sku, status, price_amount_minor, currency, stock_quantity, position)
        VALUES (${productId}, 'INT-RESERVE-CAP-STD', 'ACTIVE', ${UNIT_PRICE_MINOR}, 'USD', 500, 0)
        RETURNING id`,
  );

  const dependencies: AppDependencies = {
    config,
    database: handle,
    repositories: createRepositories(db),
    identity: createIdentityRepositories(db),
    paymentProvider: { name: "none" } as never,
  };
  app = await createApp(dependencies);

  // La imagen del QR de Venmo, subida a la biblioteca como cualquier foto.
  const panel = await manager();
  const uploaded = await panel.request("POST", "/api/v1/admin/media", {
    data_base64: RECEIPT_PNG.toString("base64"),
  });
  expect(uploaded.statusCode, uploaded.body).toBe(201);
  qrMediaId = uploaded.json<{ id: string }>().id;
}, 180_000);

afterAll(async () => {
  await app?.close();
  await testDb?.stop();
});

describe("ajustes: Zelle y Venmo deciden si se compra sin cuenta", () => {
  it("con efectivo activado (como nace la tienda), apartar sin cuenta se rechaza", async () => {
    const visitor = new Browser();
    await fillCart(visitor);
    const response = await visitor.request("POST", "/api/v1/checkout/reserve", RESERVE);
    expect(response.statusCode, response.body).toBe(409);
    expect(errorCode(response)).toBe("GUEST_CHECKOUT_UNAVAILABLE");
  });

  it("Venmo exige nombre y un usuario valido, y un QR que exista", async () => {
    const panel = await manager();

    const noHandle = await panel.request("PUT", "/api/v1/admin/payment-settings", {
      ...TRANSFER_SETTINGS,
      venmo_handle: null,
    });
    expect(noHandle.statusCode, noHandle.body).toBe(422);
    expect(noHandle.body).toContain("venmo_handle");

    const badHandle = await panel.request("PUT", "/api/v1/admin/payment-settings", {
      ...TRANSFER_SETTINGS,
      venmo_handle: "jose fixture!",
    });
    expect(badHandle.statusCode, badHandle.body).toBe(422);

    const unknownQr = await panel.request("PUT", "/api/v1/admin/payment-settings", {
      ...TRANSFER_SETTINGS,
      venmo_qr_media_id: "00000000-0000-4000-8000-000000000000",
    });
    expect(unknownQr.statusCode, unknownQr.body).toBe(422);
    expect(unknownQr.body).toContain("unknown_media");
  });

  it("solo Zelle y Venmo: /config lo publica todo y dice que se compra sin cuenta", async () => {
    const panel = await manager();
    const saved = await panel.request("PUT", "/api/v1/admin/payment-settings", {
      ...TRANSFER_SETTINGS,
      venmo_qr_media_id: qrMediaId,
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json()).toMatchObject({
      venmo_enabled: true,
      // La arroba se quita al guardar.
      venmo_handle: "Jose-Fixture",
      venmo_qr_media_id: qrMediaId,
      guest_checkout: true,
    });

    const config = await app.inject({ method: "GET", url: "/api/v1/config" });
    expect(config.json<{ payment_methods: unknown }>().payment_methods).toEqual({
      card: false,
      cash: false,
      zelle: { recipient_name: "Edgardo Fixture", recipient: "zelle@example.invalid" },
      venmo: {
        recipient_name: "Jose Fixture",
        handle: "Jose-Fixture",
        qr_url: `/media/${qrMediaId}.png`,
      },
      guest_checkout: true,
    });
  });
});

describe("apartar sin cuenta", () => {
  const guest = new Browser();
  const reserved = { id: "", order_number: "" };

  it("sin carrito no hay nada que apartar, y no se crea a nadie", async () => {
    const before = await one<string>(
      sql`SELECT count(*)::text FROM identities WHERE guest_checkout_at IS NOT NULL`,
    );
    const response = await new Browser().request("POST", "/api/v1/checkout/reserve", RESERVE);
    expect(response.statusCode, response.body).toBe(409);
    expect(errorCode(response)).toBe("CART_EMPTY");
    expect(
      await one<string>(
        sql`SELECT count(*)::text FROM identities WHERE guest_checkout_at IS NOT NULL`,
      ),
    ).toBe(before);
  });

  it("exige un WhatsApp valido y el nombre", async () => {
    await fillCart(guest);

    const badPhone = await guest.request("POST", "/api/v1/checkout/reserve", {
      ...RESERVE,
      contact_phone: "llamame",
    });
    expect(badPhone.statusCode, badPhone.body).toBe(422);
    expect(badPhone.body).toContain("contact_phone");

    const noName = await guest.request("POST", "/api/v1/checkout/reserve", {
      ...RESERVE,
      first_name: "  ",
    });
    expect(noName.statusCode, noName.body).toBe(422);
    expect(noName.body).toContain("first_name");
  });

  it("aparta el pedido: pendiente, sin direccion, con envio, y abre la sesion del invitado", async () => {
    expect(guest.jar.has(CART_COOKIE)).toBe(true);

    const response = await guest.request("POST", "/api/v1/checkout/reserve", RESERVE);
    expect(response.statusCode, response.body).toBe(201);
    const body = response.json<{
      id: string;
      order_number: string;
      status: string;
      payment_method: string;
      total: { amount_minor: string };
    }>();
    reserved.id = body.id;
    reserved.order_number = body.order_number;
    expect(body.status).toBe("PENDING_PAYMENT");
    // Nace con el primer canal activado; cambia al subir la captura.
    expect(body.payment_method).toBe("ZELLE");
    expect(body.total.amount_minor).toBe(String(UNIT_PRICE_MINOR + SHIPPING_MINOR));

    // La sesion de escaparate del invitado, y la del carrito cerrada.
    expect(guest.jar.has(SESSION_COOKIE)).toBe(true);
    expect(guest.jar.has(CART_COOKIE)).toBe(false);

    const row = await db.execute<Record<string, unknown>>(
      sql`SELECT o.contact_name, o.contact_phone, o.shipping_address, o.fulfillment_method,
                 o.shipping_total_minor::text AS shipping, o.manual_payment_channel AS channel,
                 p.display_name, p.phone_e164 AS participant_phone,
                 i.email, i.phone_e164 AS login_phone, i.guest_checkout_at IS NOT NULL AS guest,
                 (SELECT count(*) FROM identity_credentials c WHERE c.identity_id = i.id)::int
                   AS credentials
            FROM orders o
            JOIN participants p ON p.id = o.participant_id
            JOIN identities i ON i.id = p.identity_id
           WHERE o.id = ${reserved.id}`,
    );
    expect(row.rows[0]).toEqual({
      contact_name: "María López",
      contact_phone: "+525512345678",
      shipping_address: null,
      fulfillment_method: "DELIVERY",
      shipping: String(SHIPPING_MINOR),
      channel: "ZELLE",
      display_name: "María López",
      participant_phone: "+525512345678",
      // Sin correo, sin celular de acceso y sin contrasena: no puede volver a
      // entrar, solo usar la sesion que se le abrio.
      email: null,
      login_phone: null,
      guest: true,
      credentials: 0,
    });
  });

  it("con su sesion ve su pedido, con su nombre y su WhatsApp", async () => {
    const detail = await guest.request("GET", `/api/v1/account/orders/${reserved.id}`);
    expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json()).toMatchObject({
      order_number: reserved.order_number,
      contact_name: "María López",
      contact_phone: "+525512345678",
      shipping_address: null,
    });
  });

  it("sube la captura diciendo que pago por Venmo: el pedido pasa a Venmo", async () => {
    const url = `/api/v1/account/orders/${reserved.id}/payment-receipts`;
    const uploaded = await guest.request("POST", url, {
      data_base64: RECEIPT_PNG.toString("base64"),
      payment_channel: "VENMO",
    });
    expect(uploaded.statusCode, uploaded.body).toBe(201);

    const detail = (await guest.request("GET", `/api/v1/account/orders/${reserved.id}`)).json<{
      payment_method: string;
      payment_receipts: unknown[];
    }>();
    expect(detail.payment_method).toBe("VENMO");
    expect(detail.payment_receipts).toHaveLength(1);
  });

  it("el panel lo encuentra en 'por revisar', con su nombre, y por su WhatsApp", async () => {
    const panel = await manager();

    const queue = (
      await panel.request(
        "GET",
        "/api/v1/admin/orders?payment_method=TRANSFER&awaiting_payment=true",
      )
    ).json<{ items: { id: string; payment_method: string; buyer_name: string | null }[] }>();
    const row = queue.items.find((item) => item.id === reserved.id);
    expect(row).toMatchObject({ payment_method: "VENMO", buyer_name: "María López" });

    const byPhone = (await panel.request("GET", "/api/v1/admin/orders?q=55%201234%205678")).json<{
      items: { id: string }[];
    }>();
    expect(byPhone.items.map((item) => item.id)).toContain(reserved.id);

    // Y un numero que no es el suyo no lo encuentra: la busqueda filtra de verdad.
    const otherPhone = (
      await panel.request("GET", "/api/v1/admin/orders?q=99%209999%209999")
    ).json<{ items: { id: string }[] }>();
    expect(otherPhone.items.map((item) => item.id)).not.toContain(reserved.id);

    const zelleOnly = (
      await panel.request("GET", "/api/v1/admin/orders?payment_method=ZELLE")
    ).json<{ items: { id: string }[] }>();
    expect(zelleOnly.items.map((item) => item.id)).not.toContain(reserved.id);
  });

  it("el organizador lo confirma y el corte lo cuenta como Venmo", async () => {
    const panel = await manager();
    const confirmed = await panel.request(
      "POST",
      `/api/v1/admin/orders/${reserved.id}/cash-payment/confirm`,
      { reason_code: "VENMO_PAYMENT_VERIFIED", notes: "Visto en Venmo" },
    );
    expect(confirmed.statusCode, confirmed.body).toBe(200);

    const detail = (await guest.request("GET", `/api/v1/account/orders/${reserved.id}`)).json<{
      status: string;
    }>();
    expect(detail.status).toBe("PAID");

    const cut = (await panel.request("GET", "/api/v1/admin/reports/daily-cut")).json<{
      venmo: { orders: number; amount: { amount_minor: string } };
      zelle: { orders: number };
    }>();
    expect(cut.venmo.orders).toBe(1);
    expect(cut.venmo.amount.amount_minor).toBe(String(UNIT_PRICE_MINOR + SHIPPING_MINOR));
    expect(cut.zelle.orders).toBe(0);
  });

  it("volver a comprar con la misma sesion no crea otro invitado", async () => {
    const guestsBefore = await one<string>(
      sql`SELECT count(*)::text FROM identities WHERE guest_checkout_at IS NOT NULL`,
    );
    await fillCart(guest);
    const again = await guest.request("POST", "/api/v1/checkout/reserve", {
      ...RESERVE,
      first_name: "María",
      last_name: undefined,
    });
    expect(again.statusCode, again.body).toBe(201);

    const owners = await db.execute<{ owners: number }>(
      sql`SELECT count(DISTINCT participant_id)::int AS owners
            FROM orders WHERE id IN (${reserved.id}, ${again.json<{ id: string }>().id})`,
    );
    expect(owners.rows[0]?.owners).toBe(1);
    expect(
      await one<string>(
        sql`SELECT count(*)::text FROM identities WHERE guest_checkout_at IS NOT NULL`,
      ),
    ).toBe(guestsBefore);
  });

  it("con Venmo apagado, una captura 'por Venmo' se rechaza", async () => {
    const panel = await manager();
    const saved = await panel.request("PUT", "/api/v1/admin/payment-settings", {
      ...TRANSFER_SETTINGS,
      venmo_enabled: false,
    });
    expect(saved.statusCode, saved.body).toBe(200);

    const visitor = new Browser();
    await fillCart(visitor);
    const order = await visitor.request("POST", "/api/v1/checkout/reserve", RESERVE);
    expect(order.statusCode, order.body).toBe(201);

    const response = await visitor.request(
      "POST",
      `/api/v1/account/orders/${order.json<{ id: string }>().id}/payment-receipts`,
      { data_base64: RECEIPT_PNG.toString("base64"), payment_channel: "VENMO" },
    );
    expect(response.statusCode, response.body).toBe(409);
    expect(errorCode(response)).toBe("PAYMENT_METHOD_UNAVAILABLE");
  });
});

describe("el inventario es el tope (0043)", () => {
  async function stockLeft(): Promise<number> {
    return Number(
      await one<string>(
        sql`SELECT stock_quantity::text FROM product_variants WHERE id = ${variantId}`,
      ),
    );
  }

  async function setStock(quantity: number): Promise<void> {
    await db.execute(
      sql`UPDATE product_variants SET stock_quantity = ${quantity} WHERE id = ${variantId}`,
    );
  }

  it("apartar descuenta lo que queda, y cancelar lo devuelve", async () => {
    await setStock(5);
    const visitor = new Browser();
    await fillCart(visitor);
    const order = await visitor.request("POST", "/api/v1/checkout/reserve", RESERVE);
    expect(order.statusCode, order.body).toBe(201);
    expect(await stockLeft()).toBe(4);

    const panel = await manager();
    const cancelled = await panel.request(
      "POST",
      `/api/v1/admin/orders/${order.json<{ id: string }>().id}/cancel`,
      { reason_code: "DUPLICATE_ORDER" },
    );
    expect(cancelled.statusCode, cancelled.body).toBe(200);
    expect(await stockLeft()).toBe(5);
  });

  it("sin existencias no se puede apartar, ni aunque estuviera en el carrito", async () => {
    await setStock(1);
    const first = new Browser();
    const second = new Browser();
    await fillCart(first);
    await fillCart(second);

    const won = await first.request("POST", "/api/v1/checkout/reserve", RESERVE);
    expect(won.statusCode, won.body).toBe(201);
    expect(await stockLeft()).toBe(0);

    const late = await second.request("POST", "/api/v1/checkout/reserve", RESERVE);
    expect(late.statusCode, late.body).toBe(409);
    expect(errorCode(late)).toBe("INSUFFICIENT_STOCK");
    expect(await stockLeft()).toBe(0);
  });

  it("dos compras a la vez de la ultima unidad: solo una pasa", async () => {
    await setStock(1);
    const buyers = [new Browser(), new Browser(), new Browser()];
    for (const buyer of buyers) await fillCart(buyer);

    const responses = await Promise.all(
      buyers.map((buyer) => buyer.request("POST", "/api/v1/checkout/reserve", RESERVE)),
    );
    const codes = responses.map((response) => response.statusCode).sort();
    expect(codes, responses.map((response) => response.body).join("\n")).toEqual([201, 409, 409]);
    expect(await stockLeft()).toBe(0);

    // Ningun pedido quedo sin lineas por el rechazo.
    const orphans = await one<string>(
      sql`SELECT count(*)::text FROM orders o
           WHERE NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id)`,
    );
    expect(orphans).toBe("0");
  });
});
