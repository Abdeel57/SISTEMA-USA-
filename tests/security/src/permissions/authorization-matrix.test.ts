/**
 * INVARIANTES de la matriz de autorizacion.
 *
 * Nota de estilo con consecuencia real: estas comprobaciones recorren el
 * catalogo con `Object.entries`/`Object.values` en lugar de indexar
 * `CAPABILITIES[id]` con identificadores sueltos. No es cosmetica. Recorrer los
 * valores garantiza que el test ve el catalogo COMPLETO: si manana alguien
 * anade una capacidad y se olvida de incluirla en `CAPABILITY_IDS`, la version
 * indexada seguiria pasando y esta falla. De paso desaparecen los avisos de
 * `security/detect-object-injection`, que aqui eran falsos positivos -las
 * claves son uniones literales cerradas, no entrada externa- pero cuya
 * presencia constante ensena a ignorar la regla donde si importa.
 *
 * DEC-015 (deny-by-default), DEC-006 (step-up) y DEC-017 (separacion de
 * funciones). Estos tests son la razon por la que la matriz esta escrita como
 * datos: una matriz de permisos que solo existe repartida en `if` no se puede
 * auditar de una sentada, ni antes de un sorteo ni delante de un tercero.
 *
 * Plantilla: una sola persona opera el panel con contrasena. Ningun rol exige
 * MFA, `authorize()` no exige step-up (el catalogo conserva `requiresStepUp`
 * como metadato) y `SEPARATION_OF_DUTIES` esta vacia. Deny-by-default, motivo,
 * segunda aprobacion y flags siguen igual.
 */

import { describe, expect, it } from "vitest";

import {
  authorize,
  CAPABILITIES,
  CAPABILITY_IDS,
  capabilitiesForRoles,
  findSeparationOfDutiesViolationsForRoles,
  getCapability,
  hasCapability,
  ROLE_CAPABILITIES,
  ROLE_IDS,
  ROLES,
  SEPARATION_OF_DUTIES,
  STEP_UP_MAX_AGE_SECONDS_LIMIT,
  type AuthorizationContext,
  type CapabilityId,
  type RoleId,
} from "@app/security";

function contextFor(
  roles: readonly RoleId[],
  capability: CapabilityId,
  overrides: Partial<AuthorizationContext> = {},
): AuthorizationContext {
  return {
    roles,
    capability,
    secondsSinceLastMfa: 10,
    stepUpMaxAgeSeconds: STEP_UP_MAX_AGE_SECONDS_LIMIT,
    reasonProvided: true,
    secondApprovalGranted: true,
    featureFlagEnabled: true,
    ...overrides,
  };
}

describe("coherencia del catalogo", () => {
  it("la clave de cada capacidad coincide con su identificador", () => {
    for (const [key, definition] of Object.entries(CAPABILITIES)) {
      expect(definition.id, key).toBe(key);
    }
  });

  it("toda capacidad concedida a un rol existe en el catalogo", () => {
    const known = new Set<string>(CAPABILITY_IDS);
    for (const [role, granted] of Object.entries(ROLE_CAPABILITIES)) {
      for (const capability of granted) {
        expect(known.has(capability), `${role} concede ${capability}, que no existe`).toBe(true);
      }
    }
  });

  it("toda capacidad no rutinaria se audita", () => {
    const silent = Object.values(CAPABILITIES)
      .filter((capability) => capability.sensitivity !== "ROUTINE" && !capability.emitsAuditEvent)
      .map((capability) => capability.id);
    expect(silent, "Hay capacidades sensibles que no dejan rastro").toStrictEqual([]);
  });

  it("toda capacidad critica exige step-up y motivo", () => {
    // Se comprueba el METADATO del catalogo. En la plantilla `authorize()` no
    // exige el step-up (ver "DEC-006: step-up y aprobaciones"), pero el motivo
    // si, y el metadato se conserva para poder volver a activarlo.
    const weak = Object.values(CAPABILITIES)
      .filter((capability) => capability.sensitivity === "CRITICAL")
      .filter((capability) => !capability.requiresStepUp || !capability.requiresReason)
      .map((capability) => capability.id);
    // Excepciones deliberadas, cada una con motivo. La lista es cerrada:
    // anadir una obliga a tocar este test, que es justo cuando debe discutirse.
    //
    // entry.reversal.create la ejecuta SYSTEM desde un webhook ya verificado;
    //   no hay persona a la que pedir MFA.
    // amoe.review.* es trabajo de cola, de alto volumen y con motivo
    //   obligatorio. Exigir MFA en cada resolucion acabaria en sesiones de
    //   step-up permanentes, que es peor control que el actual.
    // order.cash.confirm (DEC-078) es trabajo de mostrador: una confirmacion
    //   por cliente que paga en caja, con motivo obligatorio. Mismo argumento
    //   que la cola AMOE; lo que no se relaja es la traza -quien, cuando y por
    //   que, en una fila inmutable y en audit_events- ni la unicidad del cobro,
    //   que impone la base de datos.
    expect(weak).toStrictEqual([
      "order.cash.confirm",
      "entry.reversal.create",
      "amoe.review.approve",
      "amoe.review.reject",
    ]);
  });
});

describe("deny-by-default", () => {
  it("ningun rol tiene todas las capacidades", () => {
    for (const [role, granted] of Object.entries(ROLE_CAPABILITIES)) {
      expect(granted.length, role).toBeLessThan(CAPABILITY_IDS.length);
    }
  });

  it("un participante no accede a nada del personal", () => {
    const forbidden: readonly CapabilityId[] = [
      "participant.list",
      "entry.ledger.read",
      "pii.view.full",
      "export.download",
      "export.finalize",
      "draw.initiate",
      "audit.read",
      "rbac.role.assign",
    ];
    for (const capability of forbidden) {
      expect(hasCapability(["PARTICIPANT"], capability), capability).toBe(false);
      expect(authorize(contextFor(["PARTICIPANT"], capability)).allowed).toBe(false);
    }
  });

  it("atencion al participante no finaliza exports, no ajusta entries y no sortea", () => {
    const forbidden: readonly CapabilityId[] = [
      "export.finalize",
      "export.download",
      "entry.adjust.create",
      "entry.adjust.approve",
      "draw.initiate",
      "pii.view.full",
      "participant.disqualify",
    ];
    for (const capability of forbidden) {
      expect(hasCapability(["SUPPORT"], capability), capability).toBe(false);
    }
  });

  it("el rol SYSTEM no se asigna a personas", () => {
    expect(ROLES.SYSTEM.assignableToHuman).toBe(false);
  });

  it("plantilla: ningun rol exige MFA, tampoco los de personal", () => {
    // El acceso es solo con contrasena. Deny-by-default no depende de esto: lo
    // que un rol puede hacer lo sigue diciendo la matriz de capacidades.
    for (const role of Object.values(ROLES)) {
      expect(role.requiresMfa, role.id).toBe(false);
    }
  });
});

describe("DEC-017: separacion de funciones", () => {
  it("quien finaliza el snapshot no puede iniciar el sorteo", () => {
    expect(hasCapability(["COMPLIANCE_OFFICER"], "export.finalize")).toBe(true);
    expect(hasCapability(["COMPLIANCE_OFFICER"], "draw.initiate")).toBe(false);
    expect(hasCapability(["DRAW_OFFICER"], "draw.initiate")).toBe(true);
    expect(hasCapability(["DRAW_OFFICER"], "export.finalize")).toBe(false);
  });

  it("ningun rol acumula por si solo las dos mitades de una restriccion", () => {
    for (const role of ROLE_IDS) {
      const violations = findSeparationOfDutiesViolationsForRoles([role]);
      expect(
        violations.map((constraint) => constraint.id),
        role,
      ).toStrictEqual([]);
    }
  });

  it("plantilla: no hay parejas de separacion de funciones, y acumular roles no deniega", () => {
    // Una sola persona tiene todos los roles de personal. Con parejas
    // declaradas se le negarian el sorteo, los exports y los ajustes.
    expect(SEPARATION_OF_DUTIES).toStrictEqual([]);

    const staff = Object.values(ROLES)
      .filter((role) => role.kind === "STAFF")
      .map((role) => role.id);
    expect(findSeparationOfDutiesViolationsForRoles(staff)).toStrictEqual([]);

    const decision = authorize(contextFor(["COMPLIANCE_OFFICER", "DRAW_OFFICER"], "draw.initiate"));
    expect(decision.allowed).toBe(true);

    // Acumular todos los roles de personal no deniega NINGUNA de sus
    // capacidades por separacion de funciones.
    for (const capability of capabilitiesForRoles(staff)) {
      const accumulated = authorize(contextFor(staff, capability));
      expect(accumulated.allowed ? null : accumulated.reason, capability).not.toBe(
        "SEPARATION_OF_DUTIES",
      );
    }
  });

  it("cada restriccion apunta a capacidades que existen", () => {
    const known = new Set<string>(CAPABILITY_IDS);
    for (const constraint of SEPARATION_OF_DUTIES) {
      expect(known.has(constraint.capabilities[0]), constraint.id).toBe(true);
      expect(known.has(constraint.capabilities[1]), constraint.id).toBe(true);
      expect(constraint.source.length).toBeGreaterThan(0);
    }
  });
});

describe("DEC-006: step-up y aprobaciones", () => {
  it("plantilla: sin MFA reciente se finaliza un export (el step-up no se exige)", () => {
    expect(getCapability("export.finalize").requiresStepUp).toBe(true);
    const decision = authorize(
      contextFor(["COMPLIANCE_OFFICER"], "export.finalize", { secondsSinceLastMfa: null }),
    );
    expect(decision.allowed).toBe(true);
  });

  it("plantilla: ninguna capacidad se deniega por STEP_UP_REQUIRED, con o sin MFA", () => {
    // `requiresStepUp` queda como metadato del catalogo; `authorize()` ignora
    // `secondsSinceLastMfa` y `stepUpMaxAgeSeconds`. Se recorre todo el
    // catalogo con quien tenga cada capacidad, y con MFA ausente, caducado o
    // con una ventana configurada mayor que el tope.
    const contexts: readonly Partial<AuthorizationContext>[] = [
      { secondsSinceLastMfa: null },
      { secondsSinceLastMfa: STEP_UP_MAX_AGE_SECONDS_LIMIT + 1 },
      { stepUpMaxAgeSeconds: 86_400, secondsSinceLastMfa: 3_600 },
    ];
    for (const capability of CAPABILITY_IDS) {
      const holders = ROLE_IDS.filter((role) => hasCapability([role], capability));
      for (const role of holders) {
        for (const overrides of contexts) {
          const decision = authorize(contextFor([role], capability, overrides));
          expect(decision.allowed, `${capability} | ${role}`).toBe(true);
        }
      }
    }
  });

  it("sin MFA, el motivo sigue siendo obligatorio donde el catalogo lo exige", () => {
    // Quitar el step-up no arrastra al resto de la puerta.
    const decision = authorize(
      contextFor(["COMPLIANCE_OFFICER"], "export.finalize", {
        secondsSinceLastMfa: null,
        reasonProvided: false,
      }),
    );
    expect(decision.allowed ? null : decision.reason).toBe("REASON_REQUIRED");
  });

  it("un cambio sin motivo no se autoriza", () => {
    const decision = authorize(
      contextFor(["COMPLIANCE_OFFICER"], "participant.disqualify", { reasonProvided: false }),
    );
    expect(decision.allowed ? null : decision.reason).toBe("REASON_REQUIRED");
  });

  it("un ajuste manual sin segunda aprobacion no se autoriza", () => {
    const decision = authorize(
      contextFor(["PROMOTION_MANAGER"], "entry.adjust.create", { secondApprovalGranted: false }),
    );
    expect(decision.allowed ? null : decision.reason).toBe("SECOND_APPROVAL_REQUIRED");
  });
});

describe("DEC-013: capacidades condicionadas por feature flag", () => {
  it("si el flag no se ha consultado, se deniega", () => {
    const decision = authorize(
      contextFor(["DRAW_OFFICER"], "draw.initiate", { featureFlagEnabled: null }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.allowed ? null : decision.reason).toBe("FEATURE_FLAG_NOT_EVALUATED");
  });

  it("con el flag apagado, se deniega", () => {
    const decision = authorize(
      contextFor(["DRAW_OFFICER"], "draw.initiate", { featureFlagEnabled: false }),
    );
    expect(decision.allowed ? null : decision.reason).toBe("FEATURE_FLAG_DISABLED");
  });

  it("las capacidades de AMOE y de sorteo dependen de un flag", () => {
    const flagged: readonly CapabilityId[] = [
      "amoe.self.submit",
      "amoe.review.approve",
      "amoe.review.reject",
      "draw.authorization.create",
      "draw.initiate",
      "winner.publish",
    ];
    for (const capability of flagged) {
      expect(getCapability(capability).dependsOnFeatureFlag, capability).toBe(true);
    }
  });

  it("capacidadesForRoles acumula sin duplicar", () => {
    const effective = capabilitiesForRoles(["SUPPORT", "SUPPORT"]);
    expect(effective.size).toBe(new Set(ROLE_CAPABILITIES.SUPPORT).size);
  });
});

describe("capacidades sin rol asignado", () => {
  it("la unica capacidad que hoy no tiene ningun rol es pii.export", () => {
    const assigned = new Set<CapabilityId>();
    for (const granted of Object.values(ROLE_CAPABILITIES)) {
      for (const capability of granted) {
        assigned.add(capability);
      }
    }
    const orphans = CAPABILITY_IDS.filter((id) => !assigned.has(id));

    // No es un olvido: extraer PII fuera del sistema no es tarea de ningun rol
    // mientras no exista un flujo de solicitud de datos con su procedimiento.
    // Deny-by-default significa exactamente esto: la capacidad existe, esta
    // documentada y nadie la tiene.
    expect(orphans).toStrictEqual(["pii.export"]);
  });
});
