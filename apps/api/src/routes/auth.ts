/**
 * Autenticacion (DEC-006, DEC-045), version simple de la plantilla.
 *
 * UN SOLO SISTEMA, DOS POLITICAS
 *   Participante y personal comparten estas rutas: lo que cambia entre ellos es
 *   la POLITICA -audiencia de la cookie, `SameSite`, TTL y timeout de
 *   inactividad-, que decide `audienceForRoles` a partir de los roles. No hay un
 *   `/admin/login`.
 *
 * SOLO CORREO Y CONTRASENA
 *   Esta plantilla no envia correos ni SMS y no pide segundo factor: el alta y
 *   el inicio de sesion son con correo y contrasena, y nada mas. Si alguien
 *   olvida su contrasena, la cambia el administrador desde el panel
 *   (`POST /admin/participants/{id}/password`).
 *
 * POR QUE ESTAS RUTAS SON `PUBLIC`
 *   Porque son las que se usan ANTES de tener sesion. Que sean publicas no
 *   significa que sean laxas: el rate limiting las cubre y ninguna revela si
 *   una cuenta existe, con UNA excepcion declarada: el alta responde 409 ante
 *   un correo ya registrado (ver `ApiErrors.emailAlreadyRegistered`).
 *
 * NO SE DISTINGUE "NO EXISTE" DE "CONTRASENA INCORRECTA"
 *   Ambos producen el mismo error y, en la medida de lo posible, el mismo
 *   tiempo de respuesta. Si difirieran, esta ruta seria un oraculo para
 *   enumerar direcciones de correo registradas.
 */

import {
  assertPasswordAcceptable,
  audienceForRoles,
  capabilitiesForRoles,
  evaluateSession,
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  looksLikeSessionToken,
  MAXIMUM_PASSWORD_LENGTH,
  MINIMUM_PASSWORD_LENGTH,
  needsRehash,
  PasswordPolicyError,
  SESSION_POLICIES,
  verifyPassword,
  type RoleId,
  type SessionAudience,
} from "@app/security";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import type { AppDependencies } from "../app.js";
import { clearCartSessionCookie, resolveCartSession } from "../http/cart-session.js";
import {
  assertDeclaration,
  consentsInputSchema,
  dateOfBirthSchema,
  residenceStateSchema,
} from "../http/eligibility-input.js";
import { ApiErrors, errorEnvelopeSchema } from "../http/errors.js";
import type { RouteDefinition } from "../http/route-registry.js";
import {
  clearCookieOptionsFor,
  cookieNameFor,
  cookieOptionsFor,
  type SessionCookieConfig,
} from "../http/session-cookie.js";

/**
 * Umbral de bloqueo por intentos fallidos y duracion.
 *
 * Cinco intentos es suficientemente permisivo para quien se equivoca de verdad
 * y suficientemente estrecho para que probar contrasenas por fuerza bruta deje
 * de ser practico. El bloqueo es TEMPORAL a proposito: uno permanente convierte
 * el formulario de login en una forma de dejar fuera a cualquiera cuyo correo
 * se conozca.
 */
const LOCK_THRESHOLD = 5;
const LOCK_MINUTES = 15;

const loginBodySchema = z.object({
  email: z.string().min(3).max(320),
  password: z.string().min(1).max(1_024),
});

const registerBodySchema = z.object({
  /**
   * La misma forma y el mismo tope que las CHECK de `identities`
   * (`identities_email_shape`, `identities_email_length`). Se repiten aqui
   * porque un correo que solo rechazara el motor saldria como 500, y a quien se
   * equivoca tecleando le corresponde un 422.
   */
  email: z
    .string()
    .trim()
    .max(254)
    .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/u),
  /**
   * Solo el tope, para acotar el trabajo de Argon2. La politica -longitud
   * minima- la decide `assertPasswordAcceptable` en el handler, con su propio
   * codigo de error.
   */
  password: z.string().min(1).max(MAXIMUM_PASSWORD_LENGTH),
  /** Mismos limites que `participants_display_name_length`. */
  display_name: z.string().trim().min(1).max(120).nullable().optional(),
  /** Etiqueta BCP-47 completa (DEC-029). Sin default: DEC-021 no admite uno. */
  language_preference: z.enum(["en-US", "es-US"]),
  /**
   * DEC-067: los documentos aceptados, con la version que se mostro. Tienen
   * que llegar TODOS los de `REQUIRED_CONSENTS` (`GET /config`); lo comprueba
   * el handler, que es quien conoce la version vigente.
   */
  consents: consentsInputSchema,
  /**
   * DEC-067: fecha de nacimiento y estado de residencia DECLARADOS. No se
   * decide aqui si la persona es elegible: eso se evalua al otorgar, contra
   * las reglas de cada promocion (`services/eligibility.ts`).
   */
  date_of_birth: dateOfBirthSchema,
  residence_state: residenceStateSchema,
});

/** Solo los topes: la politica de la nueva la decide `assertPasswordAcceptable`. */
const changePasswordBodySchema = z.object({
  current_password: z.string().min(1).max(MAXIMUM_PASSWORD_LENGTH),
  new_password: z.string().min(1).max(MAXIMUM_PASSWORD_LENGTH),
});

const sessionResponseSchema = z.object({
  authenticated: z.boolean(),
  state: z.enum(["ANONYMOUS", "ACTIVE"]),
  scope: z.enum(["PARTICIPANT", "STAFF"]).nullable(),
  email: z.string().nullable(),
  /** Siempre `true` en las cuentas nuevas: la plantilla no verifica correos. */
  email_verified: z.boolean(),
  /** Celular de cuentas antiguas, si lo hubiera. Las nuevas no lo tienen. */
  phone: z.string().nullable(),
  roles: z.array(z.string()),
  /**
   * Capacidades EFECTIVAS de la sesion, resueltas por el servidor con el mismo
   * catalogo que usa el autorizador (DEC-027). Vacias mientras la sesion no
   * autentique.
   */
  capabilities: z.array(z.string()),
});

type SessionResponse = z.infer<typeof sessionResponseSchema>;

/**
 * Las capacidades que se publican, calculadas como las ve el AUTORIZADOR.
 *
 * Los roles efectivos salen del scope, no de la persona (ver
 * `session-authorizer.ts`): una sesion de escaparate lleva solo PARTICIPANT
 * aunque la persona tenga roles administrativos.
 */
function publishedCapabilities(
  state: SessionResponse["state"],
  scope: SessionAudience,
  adminRoles: readonly RoleId[],
): string[] {
  if (state !== "ACTIVE") return [];
  const roles: readonly RoleId[] = scope === "STAFF" ? adminRoles : ["PARTICIPANT"];
  return [...capabilitiesForRoles(roles)].sort();
}

const ANONYMOUS: SessionResponse = {
  authenticated: false,
  state: "ANONYMOUS",
  scope: null,
  email: null,
  email_verified: false,
  phone: null,
  roles: [],
  capabilities: [],
};

export function buildAuthRoutes(dependencies: AppDependencies): RouteDefinition[] {
  const { identity, config, repositories } = dependencies;

  /** La politica de contrasena, traducida a su codigo de error. */
  function assertPassword(password: string): void {
    try {
      assertPasswordAcceptable(password);
    } catch (error) {
      if (error instanceof PasswordPolicyError) {
        throw ApiErrors.weakPassword({
          reason: error.reason,
          minimum_length: MINIMUM_PASSWORD_LENGTH,
          maximum_length: MAXIMUM_PASSWORD_LENGTH,
        });
      }
      throw error;
    }
  }

  const cookieConfig: SessionCookieConfig = {
    name: config.session.cookieName,
    secure: config.session.cookieSecure,
    domain: config.session.cookieDomain,
  };

  /**
   * Lee la sesion presentada por la peticion, si la hay.
   *
   * Prueba ambas cookies -personal y participante- porque el navegador puede
   * llevar las dos. Gana la de personal.
   */
  function readSession(request: {
    cookies: Record<string, string | undefined>;
  }): { token: string; audience: SessionAudience } | null {
    for (const audience of ["STAFF", "PARTICIPANT"] as const) {
      const raw = request.cookies[cookieNameFor(cookieConfig.name, audience)];

      if (raw !== undefined && looksLikeSessionToken(raw)) {
        return { token: raw, audience };
      }
    }

    return null;
  }

  /**
   * Abre una sesion y emite su cookie.
   *
   * Lo comparten el login y el alta para que las dos entradas no puedan
   * divergir en TTL, scope o atributos de cookie.
   */
  async function openSession(
    request: FastifyRequest,
    reply: FastifyReply,
    identityId: string,
    audience: SessionAudience,
    now: Date,
  ): Promise<void> {
    const policy = SESSION_POLICIES[audience];
    const token = generateSessionToken();

    await identity.sessions.create({
      tokenHash: hashSessionToken(token),
      identityId,
      scope: audience,
      expiresAt: new Date(now.getTime() + policy.absoluteTtlMinutes * 60_000),
      ipAddress: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null,
    });

    void reply.setCookie(
      cookieNameFor(cookieConfig.name, audience),
      token,
      cookieOptionsFor(audience, cookieConfig, policy.absoluteTtlMinutes * 60),
    );
  }

  /**
   * DEC-079: el carrito que el visitante lleno SIN cuenta pasa a la cuenta.
   *
   * NUNCA tumba el inicio de sesion. La persona ya demostro quien es; si la
   * adopcion falla, se registra y su carrito anonimo sigue donde estaba.
   */
  async function adoptGuestCart(
    request: FastifyRequest,
    reply: FastifyReply,
    identityId: string,
    now: Date,
  ): Promise<void> {
    const guest = await resolveCartSession(request, { identity, config }, now.getTime());
    if (guest === null) {
      return;
    }

    try {
      const promotion = await repositories.promotions.findActive();
      const { adoptedLines } = await repositories.carts.adoptSessionCart(
        guest.id,
        identityId,
        promotion?.id ?? null,
      );
      await identity.cartSessions.revoke(guest.id, "adopted_by_account", now);
      clearCartSessionCookie(reply, config);
      request.log.info(
        { event: "cart.guest_adopted", adopted_lines: adoptedLines },
        "carrito adoptado",
      );
    } catch (error) {
      request.log.warn(
        { event: "cart.guest_adoption_failed", err: error },
        "no se pudo pasar el carrito anonimo a la cuenta",
      );
    }
  }

  return [
    {
      method: "POST",
      url: "/api/v1/auth/register",
      operationId: "register",
      summary: "Alta de participante con correo y contrasena.",
      description:
        "Crea identidad, credencial Argon2id y perfil de participante en una transaccion, y abre sesion de escaparate en el acto. No se envia ningun correo: la cuenta queda lista para usarse. Nunca crea personal: los roles administrativos no se conceden por aqui.",
      tags: ["auth"],
      authorization: {
        kind: "PUBLIC",
        justification:
          "Es la ruta con la que se obtiene una cuenta, asi que no puede exigir una. Solo crea participantes -sin roles ni capacidades de personal- y el rate limiting la cubre. Revela si un correo ya esta registrado (409): ver `ApiErrors.emailAlreadyRegistered`.",
      },
      schema: {
        body: registerBodySchema,
        response: {
          201: sessionResponseSchema,
          409: errorEnvelopeSchema,
          422: errorEnvelopeSchema,
        },
      },
      handler: async (request, reply) => {
        const body = request.body as z.infer<typeof registerBodySchema>;
        const now = new Date();

        assertPassword(body.password);

        // DEC-067: antes de Argon2, para no gastar un hash en un alta que va a
        // rechazarse por un dato que falta.
        const consents = assertDeclaration(body, now);

        // Se hashea ANTES de saber si el correo esta libre. El 409 de abajo ya
        // dice que existe, asi que el tiempo no esconde nada; el orden esta
        // para que la transaccion del alta no tenga dentro decenas de
        // milisegundos de Argon2 con una conexion del pool cogida.
        const passwordHash = await hashPassword(body.password);

        const created = await identity.identities.registerParticipant({
          email: body.email,
          passwordHash,
          displayName: body.display_name ?? null,
          preferredLocale: body.language_preference,
          eligibility: {
            dateOfBirth: body.date_of_birth,
            residenceState: body.residence_state,
            declaredAt: now,
          },
          consents,
        });

        if (created === null) {
          throw ApiErrors.emailAlreadyRegistered();
        }

        // Siempre `PARTICIPANT`, sin pasar por `audienceForRoles`: una
        // identidad recien creada no tiene roles.
        await openSession(request, reply, created.id, "PARTICIPANT", now);
        // DEC-079: lo que lleno sin cuenta, a la cuenta recien creada.
        await adoptGuestCart(request, reply, created.id, now);

        void reply.code(201);

        return {
          authenticated: true,
          state: "ACTIVE" as const,
          scope: "PARTICIPANT" as const,
          email: created.email,
          email_verified: created.emailVerifiedAt !== null,
          phone: created.phoneE164 ?? null,
          roles: [],
          capabilities: publishedCapabilities("ACTIVE", "PARTICIPANT", []),
        } satisfies SessionResponse;
      },
    },

    {
      method: "POST",
      url: "/api/v1/auth/login",
      operationId: "login",
      summary: "Iniciar sesion con correo y contrasena.",
      description:
        "Crea una sesion opaca. Participantes y personal entran igual: solo con correo y contrasena. La audiencia de la cookie (escaparate o panel) la deciden los roles.",
      tags: ["auth"],
      authorization: {
        kind: "PUBLIC",
        justification:
          "Es la ruta que se usa antes de tener sesion. No revela si una cuenta existe: credenciales invalidas y cuenta inexistente producen la misma respuesta.",
      },
      schema: {
        body: loginBodySchema,
        response: {
          200: sessionResponseSchema,
          401: errorEnvelopeSchema,
          423: errorEnvelopeSchema,
          422: errorEnvelopeSchema,
        },
      },
      handler: async (request, reply) => {
        const body = request.body as z.infer<typeof loginBodySchema>;
        const now = new Date();

        const found = await identity.identities.findByEmail(body.email);
        const credential =
          found === null ? null : await identity.identities.findCredential(found.id);

        // Se hashea SIEMPRE, exista la cuenta o no. Sin este trabajo ficticio,
        // una cuenta inexistente responderia en microsegundos y una existente
        // en decenas de milisegundos: la diferencia es medible desde fuera y
        // convierte el login en un enumerador de correos registrados.
        if (found === null || credential === null) {
          await hashPassword("contrasena-ficticia-para-igualar-el-tiempo");
          throw ApiErrors.unauthenticated();
        }

        if (credential.lockedUntil !== null && credential.lockedUntil > now) {
          throw ApiErrors.accountLocked(
            Math.ceil((credential.lockedUntil.getTime() - now.getTime()) / 1_000),
          );
        }

        const ok = await verifyPassword(body.password, credential.passwordHash);

        await identity.identities.recordLoginAttempt({
          identityId: found.id,
          succeeded: ok,
          now,
          lockThreshold: LOCK_THRESHOLD,
          lockMinutes: LOCK_MINUTES,
        });

        if (!ok) {
          throw ApiErrors.unauthenticated();
        }

        // Subir el coste de Argon2 no invalida los hashes viejos, pero este es
        // el unico momento en que se tiene la contrasena en claro para poder
        // regenerarlos.
        if (needsRehash(credential.passwordHash)) {
          await identity.identities.updatePasswordHash(found.id, await hashPassword(body.password));
        }

        // La identidad tiene que estar viva. SUSPENDED o CLOSED no entran,
        // aunque la contrasena sea correcta.
        if (found.status !== "ACTIVE") {
          throw ApiErrors.unauthenticated();
        }

        const roles = (await identity.identities.listAdminRoles(found.id)) as readonly RoleId[];

        // Y si es personal, su cuenta administrativa tambien. Desactivar la
        // cuenta de quien se va no borra sus asignaciones; sin esta
        // comprobacion, una cuenta DEACTIVATED que conserve sus roles seguiria
        // entrando al panel.
        if (roles.length > 0) {
          const adminUser = await identity.identities.findAdminUser(found.id);

          if (adminUser?.status !== "ACTIVE") {
            throw ApiErrors.unauthenticated();
          }
        }

        const audience = audienceForRoles(roles);
        await openSession(request, reply, found.id, audience, now);

        // DEC-079: solo el escaparate tiene carrito.
        if (audience === "PARTICIPANT") {
          await adoptGuestCart(request, reply, found.id, now);
        }

        return {
          authenticated: true,
          state: "ACTIVE" as const,
          scope: audience,
          email: found.email,
          email_verified: found.emailVerifiedAt !== null,
          phone: found.phoneE164 ?? null,
          roles: [...roles],
          capabilities: publishedCapabilities("ACTIVE", audience, roles),
        } satisfies SessionResponse;
      },
    },

    {
      method: "GET",
      url: "/api/v1/auth/session",
      operationId: "getSession",
      summary: "Estado de la sesion actual.",
      description:
        "Devuelve el estado sin exigirla: sin sesion responde `ANONYMOUS` con 200, no 401. Es lo que consulta el frontend en cada render.",
      tags: ["auth"],
      authorization: {
        kind: "PUBLIC",
        justification:
          "Responde sobre la sesion de quien pregunta y solo sobre ella. Sin cookie devuelve el estado anonimo, que no es informacion de nadie.",
      },
      schema: { response: { 200: sessionResponseSchema } },
      handler: async (request) => {
        const presented = readSession(request);

        if (presented === null) {
          return ANONYMOUS;
        }

        const session = await identity.sessions.findByTokenHash(hashSessionToken(presented.token));

        if (session === null) {
          return ANONYMOUS;
        }

        const now = new Date();
        const roles = await identity.identities.listAdminRoles(session.identityId);

        // La politica la evalua `packages/security`: expirada, inactiva o
        // revocada son estados con reglas que ya estan probadas alli.
        const state = evaluateSession(
          {
            audience: session.scope,
            createdAt: session.createdAt.getTime(),
            lastSeenAt: session.lastSeenAt.getTime(),
            revokedAt: session.revokedAt?.getTime() ?? null,
            // Sin segundo factor en esta plantilla.
            mfaSatisfied: true,
          },
          now.getTime(),
        );

        if (state !== "ACTIVE") {
          return ANONYMOUS;
        }

        await identity.sessions.touch(session.id, now);

        const record = await identity.identities.findById(session.identityId);

        return {
          authenticated: true,
          state: "ACTIVE" as const,
          scope: session.scope,
          email: record?.email ?? null,
          email_verified: record?.emailVerifiedAt != null,
          phone: record?.phoneE164 ?? null,
          roles: [...roles],
          capabilities: publishedCapabilities("ACTIVE", session.scope, roles as readonly RoleId[]),
        } satisfies SessionResponse;
      },
    },

    {
      method: "POST",
      url: "/api/v1/auth/logout",
      operationId: "logout",
      summary: "Cerrar la sesion actual.",
      description:
        "Revoca la sesion en base de datos ADEMAS de borrar la cookie. Borrar solo la cookie dejaria el token vivo para quien lo hubiera copiado.",
      tags: ["auth"],
      authorization: {
        kind: "PUBLIC",
        justification:
          "Idempotente y solo actua sobre la sesion presentada en la propia peticion. Sin cookie no hace nada y responde igual.",
      },
      schema: { response: { 200: z.object({ ok: z.literal(true) }) } },
      handler: async (request, reply) => {
        const presented = readSession(request);

        if (presented !== null) {
          const session = await identity.sessions.findByTokenHash(
            hashSessionToken(presented.token),
          );

          if (session !== null) {
            await identity.sessions.revoke(session.id, "user_logout", new Date());
          }

          void reply.clearCookie(
            cookieNameFor(cookieConfig.name, presented.audience),
            clearCookieOptionsFor(presented.audience, cookieConfig),
          );
        }

        // Siempre 200. Un 401 al cerrar sesion no le sirve a nadie y ademas
        // revelaria si la cookie presentada era valida.
        return { ok: true as const };
      },
    },

    {
      method: "POST",
      url: "/api/v1/auth/password",
      operationId: "changeOwnPassword",
      summary: "Cambiar la contrasena propia.",
      description:
        "Exige sesion y la contrasena ACTUAL. Al cambiarla cierra todas las sesiones de la cuenta y abre una nueva en el acto: quien la cambia sigue dentro y cualquier otra sesion abierta (otro equipo, una cookie copiada) queda fuera. Es como el personal cambia la contrasena inicial que le dieron.",
      tags: ["auth"],
      authorization: {
        kind: "PUBLIC",
        justification:
          "Solo actua sobre la cuenta de la sesion presentada en la propia peticion y exige su contrasena actual. Sin sesion valida responde 401 y no toca nada.",
      },
      schema: {
        body: changePasswordBodySchema,
        response: {
          200: z.object({ ok: z.literal(true) }),
          401: errorEnvelopeSchema,
          422: errorEnvelopeSchema,
          423: errorEnvelopeSchema,
        },
      },
      handler: async (request, reply) => {
        const body = request.body as z.infer<typeof changePasswordBodySchema>;
        const now = new Date();

        const presented = readSession(request);
        if (presented === null) throw ApiErrors.unauthenticated();

        const session = await identity.sessions.findByTokenHash(hashSessionToken(presented.token));
        if (session === null) throw ApiErrors.unauthenticated();

        const state = evaluateSession(
          {
            audience: session.scope,
            createdAt: session.createdAt.getTime(),
            lastSeenAt: session.lastSeenAt.getTime(),
            revokedAt: session.revokedAt?.getTime() ?? null,
            mfaSatisfied: true,
          },
          now.getTime(),
        );
        if (state !== "ACTIVE") throw ApiErrors.unauthenticated();

        const credential = await identity.identities.findCredential(session.identityId);
        if (credential === null) throw ApiErrors.unauthenticated();

        if (credential.lockedUntil !== null && credential.lockedUntil > now) {
          throw ApiErrors.accountLocked(
            Math.ceil((credential.lockedUntil.getTime() - now.getTime()) / 1_000),
          );
        }

        // La nueva primero: rechazarla no cuesta un Argon2 ni gasta un intento.
        assertPassword(body.new_password);

        // La actual cuenta para el bloqueo igual que en el login: sin esto, una
        // sesion robada seria una forma de probar contrasenas sin limite.
        const ok = await verifyPassword(body.current_password, credential.passwordHash);
        await identity.identities.recordLoginAttempt({
          identityId: session.identityId,
          succeeded: ok,
          now,
          lockThreshold: LOCK_THRESHOLD,
          lockMinutes: LOCK_MINUTES,
        });
        if (!ok) throw ApiErrors.currentPasswordInvalid();

        await identity.identities.setPasswordAfterReset(
          session.identityId,
          await hashPassword(body.new_password),
        );

        // Todas fuera, tambien esta, y una nueva para quien acaba de cambiarla.
        await identity.sessions.revokeAllForIdentity(session.identityId, "password_changed", now);
        await openSession(request, reply, session.identityId, session.scope, now);

        request.log.info(
          { event: "auth.password_changed", scope: session.scope },
          "contrasena propia cambiada",
        );

        return { ok: true as const };
      },
    },
  ];
}
