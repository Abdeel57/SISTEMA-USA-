/**
 * Abre una sesion y emite su cookie.
 *
 * La comparten el login, el alta (`routes/auth.ts`) y el apartado sin cuenta
 * (0042, `routes/orders.ts`) para que ninguna entrada pueda divergir en TTL,
 * scope o atributos de cookie.
 */

import {
  generateSessionToken,
  hashSessionToken,
  SESSION_POLICIES,
  type SessionAudience,
} from "@app/security";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { AppDependencies } from "../app.js";
import { cookieNameFor, cookieOptionsFor, type SessionCookieConfig } from "./session-cookie.js";

export function sessionCookieConfigOf(config: AppDependencies["config"]): SessionCookieConfig {
  return {
    name: config.session.cookieName,
    secure: config.session.cookieSecure,
    domain: config.session.cookieDomain,
  };
}

export async function openSession(
  dependencies: Pick<AppDependencies, "config" | "identity">,
  request: FastifyRequest,
  reply: FastifyReply,
  identityId: string,
  audience: SessionAudience,
  now: Date,
): Promise<void> {
  const policy = SESSION_POLICIES[audience];
  const token = generateSessionToken();

  await dependencies.identity.sessions.create({
    tokenHash: hashSessionToken(token),
    identityId,
    scope: audience,
    expiresAt: new Date(now.getTime() + policy.absoluteTtlMinutes * 60_000),
    ipAddress: request.ip ?? null,
    userAgent: request.headers["user-agent"] ?? null,
  });

  void reply.setCookie(
    cookieNameFor(dependencies.config.session.cookieName, audience),
    token,
    cookieOptionsFor(
      audience,
      sessionCookieConfigOf(dependencies.config),
      policy.absoluteTtlMinutes * 60,
    ),
  );
}
