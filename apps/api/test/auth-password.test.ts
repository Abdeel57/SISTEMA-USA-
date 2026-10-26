/**
 * Cambio de la contrasena propia (`POST /api/v1/auth/password`).
 *
 * Es como el personal cambia la contrasena inicial que le dieron. Lo que estos
 * casos protegen:
 *
 *   1. sin sesion no se toca nada (401);
 *   2. sin la contrasena ACTUAL correcta no se cambia, y el fallo cuenta para
 *      el bloqueo -una sesion robada no puede probar contrasenas sin limite-;
 *   3. la nueva cumple la politica de `packages/security`;
 *   4. al cambiarla se cierran TODAS las sesiones de la cuenta y quien la
 *      cambio recibe una nueva del mismo tipo (personal sigue en el panel).
 *
 * Repositorios falsos y en memoria, como en `auth-register.test.ts`.
 */

import { describe, expect, it } from "vitest";
import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
  type SessionAudience,
} from "@app/security";

import { createApp, type AppDependencies } from "../src/app.js";
import { CONTRACT_GENERATION_CONFIG } from "../src/config/contract-config.js";
import { cookieNameFor } from "../src/http/session-cookie.js";
import type {
  CreateSessionInput,
  IdentityRepositories,
  SessionRecord,
} from "../src/services/identity-ports.js";
import { createFakeRepositories } from "./support/in-memory-repositories.js";

const STAFF_COOKIE = cookieNameFor(CONTRACT_GENERATION_CONFIG.session.cookieName, "STAFF");

const IDENTITY = "55555555-5555-4555-8555-555555555555";
const CURRENT = "FAKE-inicial-2026";
const NEXT = "FAKE-nueva-2026";

interface LoginAttempt {
  readonly succeeded: boolean;
}

async function fakeIdentity(options: { readonly lockedUntil?: Date | null } = {}) {
  const token = generateSessionToken();
  const now = new Date();
  const session: SessionRecord = {
    id: "66666666-6666-4666-8666-666666666666",
    identityId: IDENTITY,
    scope: "STAFF" satisfies SessionAudience,
    mfaVerifiedAt: null,
    expiresAt: new Date(now.getTime() + 60 * 60_000),
    lastSeenAt: now,
    revokedAt: null,
    createdAt: now,
  };

  const state = {
    passwordHash: await hashPassword(CURRENT),
    attempts: [] as LoginAttempt[],
    revokedFor: [] as string[],
    created: [] as CreateSessionInput[],
    hashChanges: 0,
  };

  const unused = (): never => {
    throw new Error("no deberia llamarse desde el cambio de contrasena");
  };

  const identity = {
    identities: {
      findCredential: (identityId: string) =>
        Promise.resolve(
          identityId === IDENTITY
            ? {
                identityId,
                passwordHash: state.passwordHash,
                failedAttempts: 0,
                lockedUntil: options.lockedUntil ?? null,
              }
            : null,
        ),
      recordLoginAttempt: (input: LoginAttempt) => {
        state.attempts.push({ succeeded: input.succeeded });
        return Promise.resolve();
      },
      setPasswordAfterReset: (_identityId: string, passwordHash: string) => {
        state.passwordHash = passwordHash;
        state.hashChanges += 1;
        return Promise.resolve();
      },
      registerParticipant: unused,
      findByEmail: unused,
      findById: unused,
      findActiveMfaFactor: unused,
      listAdminRoles: unused,
      findAdminUser: unused,
      updatePasswordHash: unused,
      consumeMfaCounter: unused,
    },
    sessions: {
      findByTokenHash: (tokenHash: string) =>
        Promise.resolve(tokenHash === hashSessionToken(token) ? session : null),
      revokeAllForIdentity: (identityId: string) => {
        state.revokedFor.push(identityId);
        return Promise.resolve(1);
      },
      create: (input: CreateSessionInput) => {
        state.created.push(input);
        return Promise.resolve({ ...session, id: "77777777-7777-4777-8777-777777777777" });
      },
      touch: unused,
      markMfaVerified: unused,
      revoke: unused,
    },
  } as unknown as IdentityRepositories;

  return { identity, token, state };
}

async function changePassword(
  payload: Record<string, unknown>,
  options: { readonly withCookie?: boolean; readonly lockedUntil?: Date | null } = {},
) {
  const fake = await fakeIdentity({ lockedUntil: options.lockedUntil ?? null });
  const dependencies = {
    config: CONTRACT_GENERATION_CONFIG,
    database: { role: "app", db: {}, pool: {}, close: () => Promise.resolve() },
    paymentProvider: { name: "none" },
    repositories: createFakeRepositories(),
    identity: fake.identity,
  } as unknown as AppDependencies;

  const app = await createApp(dependencies);
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/password",
    payload,
    ...(options.withCookie === false ? {} : { cookies: { [STAFF_COOKIE]: fake.token } }),
  });
  await app.close();

  return { response, state: fake.state };
}

function errorCode(response: { json: () => unknown }): string {
  return (response.json() as { error: { code: string } }).error.code;
}

describe("cambio de la contrasena propia", () => {
  it("sin sesion responde 401 y no toca nada", async () => {
    const { response, state } = await changePassword(
      { current_password: CURRENT, new_password: NEXT },
      { withCookie: false },
    );

    expect(response.statusCode).toBe(401);
    expect(state.hashChanges).toBe(0);
    expect(state.attempts).toEqual([]);
  });

  it("con la actual equivocada no cambia nada y cuenta como intento fallido", async () => {
    const { response, state } = await changePassword({
      current_password: "FAKE-no-es-esta",
      new_password: NEXT,
    });

    expect(response.statusCode).toBe(422);
    expect(errorCode(response)).toBe("CURRENT_PASSWORD_INVALID");
    expect(state.attempts).toEqual([{ succeeded: false }]);
    expect(state.hashChanges).toBe(0);
    expect(state.revokedFor).toEqual([]);
  });

  it("una nueva demasiado corta es WEAK_PASSWORD, sin gastar un intento", async () => {
    const { response, state } = await changePassword({
      current_password: CURRENT,
      new_password: "corta",
    });

    expect(response.statusCode).toBe(422);
    expect(errorCode(response)).toBe("WEAK_PASSWORD");
    expect(state.attempts).toEqual([]);
    expect(state.hashChanges).toBe(0);
  });

  it("con la cuenta bloqueada responde 423", async () => {
    const { response, state } = await changePassword(
      { current_password: CURRENT, new_password: NEXT },
      { lockedUntil: new Date(Date.now() + 10 * 60_000) },
    );

    expect(response.statusCode).toBe(423);
    expect(state.hashChanges).toBe(0);
  });

  it("la cambia, cierra todas las sesiones y abre una nueva de personal", async () => {
    const { response, state } = await changePassword({
      current_password: CURRENT,
      new_password: NEXT,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });

    // La nueva queda guardada como hash, nunca en claro.
    expect(state.hashChanges).toBe(1);
    expect(state.passwordHash).not.toContain(NEXT);
    expect(await verifyPassword(NEXT, state.passwordHash)).toBe(true);
    expect(await verifyPassword(CURRENT, state.passwordHash)).toBe(false);

    // Todas fuera, y una nueva del MISMO tipo para quien la cambio.
    expect(state.revokedFor).toEqual([IDENTITY]);
    expect(state.created).toHaveLength(1);
    expect(state.created[0]?.scope).toBe("STAFF");
    expect(response.cookies.find((cookie) => cookie.name === STAFF_COOKIE)?.value).toBeTruthy();
  });
});
