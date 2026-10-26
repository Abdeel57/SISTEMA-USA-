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

import { setParticipantPasswordAction } from "@/lib/admin/actions";
import { IDLE } from "@/lib/action-result";
import { adminParticipantPasswordPath, apiBaseUrl } from "@/lib/api";
import { scenarios } from "@/mocks/handlers";
import { mockApiServer } from "@/mocks/node";

/**
 * CONTRASENA NUEVA DE UN PARTICIPANTE, DESDE EL PANEL (plantilla).
 *
 * No hay recuperacion por correo: quien olvida su contrasena la pide a la
 * tienda y el administrador le fija una con
 * `POST /admin/participants/{id}/password` (`participant.password.reset`).
 *
 * LO QUE SE PROTEGE
 * -----------------
 * 1. Que se llame a la ruta del participante correcto, con la contrasena TAL
 *    CUAL se tecleo -sin recortar- y con nada mas en el cuerpo.
 * 2. Que el 422 `WEAK_PASSWORD` se atribuya al CAMPO y publique el minimo que
 *    manda la API, no uno escrito en el frontend.
 * 3. Que un 404 sea un fallo del formulario entero, no del campo.
 */

const API = apiBaseUrl().replace(/\/+$/, "");
const PARTICIPANT_ID = "par_0000000000000001";

function passwordForm(entries: Readonly<Record<string, string>>): FormData {
  const formData = new FormData();
  formData.set("locale", "es");
  formData.set("participant_id", PARTICIPANT_ID);
  for (const [name, value] of Object.entries(entries)) formData.set(name, value);
  return formData;
}

describe("setParticipantPasswordAction", () => {
  it("manda la contrasena, sin recortar, a la ruta del participante", async () => {
    const bodies: unknown[] = [];
    mockApiServer.use(
      http.post(`${API}${adminParticipantPasswordPath(PARTICIPANT_ID)}`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ ok: true });
      }),
    );

    const result = await setParticipantPasswordAction(
      IDLE,
      passwordForm({ password: " una frase larga " }),
    );

    expect(result.status).toBe("ok");
    expect(bodies).toEqual([{ password: " una frase larga " }]);
  });

  it("sin contrasena no llama a la API y senala el campo", async () => {
    const result = await setParticipantPasswordAction(IDLE, passwordForm({}));

    expect(result.status).toBe("error");
    expect(result.code).toBe("FIELD_REQUIRED");
    expect(result.field).toBe("password");
  });

  it("WEAK_PASSWORD va junto al campo, con el minimo que manda la API", async () => {
    // 16 y no 8 a proposito: si el numero estuviera escrito en el frontend,
    // este caso lo detectaria.
    mockApiServer.use(scenarios.adminParticipantPasswordWeak(PARTICIPANT_ID, 16));

    const result = await setParticipantPasswordAction(IDLE, passwordForm({ password: "corta" }));

    expect(result.status).toBe("error");
    expect(result.code).toBe("WEAK_PASSWORD");
    expect(result.field).toBe("password");
    expect(result.minimumPasswordLength).toBe(16);
  });

  it("un participante que no existe es un fallo del formulario, no del campo", async () => {
    mockApiServer.use(
      http.post(`${API}${adminParticipantPasswordPath(PARTICIPANT_ID)}`, () =>
        HttpResponse.json(
          { error: { code: "NOT_FOUND", request_id: "req_mock_000000000000" } },
          { status: 404 },
        ),
      ),
    );

    const result = await setParticipantPasswordAction(
      IDLE,
      passwordForm({ password: "una frase larga" }),
    );

    expect(result.status).toBe("error");
    expect(result.code).toBe("NOT_FOUND");
    expect(result.field).toBeNull();
  });

  it("el escenario de exito de la API simulada contesta `{ ok: true }`", async () => {
    mockApiServer.use(scenarios.adminParticipantPassword(PARTICIPANT_ID));

    const result = await setParticipantPasswordAction(
      IDLE,
      passwordForm({ password: "una frase larga" }),
    );

    expect(result.status).toBe("ok");
  });
});
