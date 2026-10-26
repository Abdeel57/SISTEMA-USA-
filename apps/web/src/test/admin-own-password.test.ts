import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      toString: () => "app_dev_session_staff=Bd4kM9tXr6ZaP1wQ7nJc2sF5hL8gV3eY-uRiO_pCz0T",
      set: () => undefined,
    }),
  headers: () => Promise.resolve(new Headers({ host: "localhost:3000" })),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import { changeOwnPasswordAction } from "@/lib/admin/actions";
import { IDLE } from "@/lib/action-result";
import { API_PATHS, apiBaseUrl } from "@/lib/api";
import { mockApiServer } from "@/mocks/node";

/**
 * MI CUENTA: CAMBIAR LA CONTRASENA PROPIA (`POST /auth/password`).
 *
 * Es como quien recibe una cuenta con contrasena inicial la cambia por una suya.
 *
 * LO QUE SE PROTEGE
 * -----------------
 * 1. Que viajen la actual y la nueva TAL CUAL se teclearon, y nada mas.
 * 2. Que una repeticion distinta se pare aqui, sin llamar a la API.
 * 3. Que cada fallo de la API se pinte junto a SU campo: la actual equivocada
 *    junto a "Contrasena actual", la nueva corta junto a "Contrasena nueva".
 */

const API = apiBaseUrl().replace(/\/+$/, "");

function passwordForm(entries: Readonly<Record<string, string>>): FormData {
  const formData = new FormData();
  formData.set("locale", "es");
  for (const [name, value] of Object.entries(entries)) formData.set(name, value);
  return formData;
}

const FILLED = {
  current_password: "clave-actual-1",
  password: " una frase nueva ",
  password_confirmation: " una frase nueva ",
} as const;

function failWith(code: string, details?: Readonly<Record<string, unknown>>) {
  return http.post(`${API}${API_PATHS.authPassword}`, () =>
    HttpResponse.json(
      {
        error: {
          code,
          request_id: "req_mock_000000000000",
          ...(details === undefined ? {} : { details }),
        },
      },
      { status: 422 },
    ),
  );
}

describe("changeOwnPasswordAction", () => {
  it("manda la actual y la nueva, sin recortar y sin la repeticion", async () => {
    const bodies: unknown[] = [];
    mockApiServer.use(
      http.post(`${API}${API_PATHS.authPassword}`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ ok: true });
      }),
    );

    const result = await changeOwnPasswordAction(IDLE, passwordForm(FILLED));

    expect(result.status).toBe("ok");
    expect(bodies).toEqual([{ current_password: "clave-actual-1", new_password: " una frase nueva " }]);
  });

  it("si la repeticion no coincide no llama a la API", async () => {
    const bodies: unknown[] = [];
    mockApiServer.use(
      http.post(`${API}${API_PATHS.authPassword}`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ ok: true });
      }),
    );

    const result = await changeOwnPasswordAction(
      IDLE,
      passwordForm({ ...FILLED, password_confirmation: "otra cosa" }),
    );

    expect(result.code).toBe("PASSWORD_CONFIRMATION_MISMATCH");
    expect(result.field).toBe("password_confirmation");
    expect(bodies).toEqual([]);
  });

  it("sin la actual senala ese campo", async () => {
    const result = await changeOwnPasswordAction(
      IDLE,
      passwordForm({ password: FILLED.password, password_confirmation: FILLED.password }),
    );

    expect(result.code).toBe("FIELD_REQUIRED");
    expect(result.field).toBe("current_password");
  });

  it("la actual equivocada va junto a su campo", async () => {
    mockApiServer.use(failWith("CURRENT_PASSWORD_INVALID"));

    const result = await changeOwnPasswordAction(IDLE, passwordForm(FILLED));

    expect(result.code).toBe("CURRENT_PASSWORD_INVALID");
    expect(result.field).toBe("current_password");
  });

  it("una nueva corta va junto a su campo, con el minimo de la API", async () => {
    mockApiServer.use(
      failWith("WEAK_PASSWORD", { reason: "too_short", minimum_length: 12, maximum_length: 1024 }),
    );

    const result = await changeOwnPasswordAction(IDLE, passwordForm(FILLED));

    expect(result.code).toBe("WEAK_PASSWORD");
    expect(result.field).toBe("password");
    expect(result.minimumPasswordLength).toBe(12);
  });
});
