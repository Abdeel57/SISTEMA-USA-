import { Alert, Badge, buttonVariants, Card, CardTitle, cn } from "@app/ui";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { AdminChrome } from "@/components/admin/admin-chrome";
import { openAdminScreen } from "@/components/admin/admin-screen";
import { AdminSectionError } from "@/components/admin/admin-section-error";
import {
  FlagToggleForm,
  SettingChangeDecisionForm,
  SettingChangeRequestForm,
} from "@/components/admin/flag-forms";
import { flagLabeller, reasonLabeller } from "@/i18n/admin-labels";
import { formatZonedDateTime } from "@/i18n/formatters";
import { isLocale, type Locale } from "@/i18n/locales";
import {
  decideSettingChangeAction,
  requestSettingChangeAction,
  updateFeatureFlagAction,
} from "@/lib/admin/actions";
import { can } from "@/lib/admin/capabilities";
import { FLAG_UPDATE_REASONS } from "@/lib/admin/reason-codes";
import {
  AMOE_MODES,
  fetchAdminFeatureFlags,
  fetchAdminSettingChangeRequests,
  type AdminFeatureFlagRow,
  type AdminSettingChangeRequest,
  type AmoeMode,
} from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Interruptores de la plataforma: feature flags y modalidad AMOE
 * (§13.9, DEC-054 punto 3, modificado por HO-041 resolucion fase 1).
 *
 * SE LLAMA "INTERRUPTORES" Y NO "AJUSTES" (HO-041, ronda de cierre e2e). En la
 * navegacion del panel esta pantalla se rotulaba "Ajustes", exactamente igual
 * que `/adjustments`, y el menu en espanol tenia dos entradas con el mismo
 * nombre llevando a sitios que no se parecen en nada: una cambia el
 * comportamiento del sistema y la otra mueve participaciones del ledger de una
 * persona. En ingles no colisionaban -"Settings" y "Adjustments"- y por eso el
 * choque no se veia leyendo el diccionario: se veia mirando el menu en espanol.
 *
 * `admin.nav.flags` dice ahora "Interruptores" / "Feature flags", y el titulo
 * de la pantalla acompana.
 *
 * DOS CLASES DE AJUSTE, DOS GESTOS DISTINTOS
 * ------------------------------------------
 * - **No material**: interruptor con motivo. Una capacidad (`flag.update`).
 * - **Legalmente material** y la **modalidad AMOE**: solicitud de cambio con
 *   motivo y confirmacion, y otra capacidad. Encender `amoe_enabled` o apagar
 *   `entry_caps_enabled` cambia lo que la plataforma afirma o aplica sobre las
 *   condiciones de participacion.
 *
 * Plantilla: hay un solo administrador y la solicitud se APLICA al momento; la
 * accion revalida el panel y la tarjeta ya pinta el valor nuevo. La lista de
 * pendientes solo aparece si quedo alguna de antes, y entonces el mismo
 * administrador puede decidirla.
 *
 * La pantalla no elige cual toca: lo dice `is_legally_material`, que publica el
 * backend desde el catalogo de `packages/security`. Un espejo de esa lista aqui
 * seria una segunda fuente de verdad sobre que es legalmente material, que es
 * justo lo que `CLAUDE.md` §4 prohibe.
 *
 * UNA FILA COMPACTA POR AJUSTE, EL FORMULARIO PLEGADO
 * ---------------------------------------------------
 * Cada ajuste se lee en tres lineas: su NOMBRE, UNA FRASE que dice que hace en
 * lenguaje de tienda y su ESTADO (Encendido / Apagado). El formulario de
 * siempre -motivo, nota, confirmacion y boton- va dentro de un `<details>`
 * cuyo resumen es un boton de 44px, "Cambiar". Con los doce abiertos la
 * pantalla media mas de 4.000px y quien entraba a mirar si algo estaba
 * encendido tenia que recorrer doce formularios. `<details>` funciona sin
 * JavaScript, se abre con teclado y el lector de pantalla anuncia si esta
 * abierto.
 *
 * NINGUNA CLAVE TECNICA EN PANTALLA. Ni `amoe_enabled` debajo del nombre ni
 * `MAIL_IN_REVIEW` como modalidad: el nombre de cada ajuste sale de
 * `flagLabeller` y el de cada modalidad de `admin.flags.amoeModes`. Las claves
 * siguen viajando en los campos ocultos de los formularios, que es lo que lee
 * la API.
 *
 * LO QUE ESTA PANTALLA NO ES
 * --------------------------
 * No es un control de acceso. Ocultar un boton es cortesia -no mandar a nadie a
 * una puerta cerrada-; quien autoriza es el backend en cada peticion, y sus
 * respuestas se pintan tal cual: el 403 del autorizador y el 409
 * `FLAG_LEGALLY_MATERIAL` cuando alguien intenta cambiar por `PATCH` un flag
 * material.
 */
export default async function AdminFlagsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "admin.flags" });

  const screen = await openAdminScreen({
    locale,
    current: "flags",
    path: "/flags",
    title: t("title"),
    capability: "flag.read",
  });

  if (!screen.ok) return screen.node;

  const [flags, requests] = await Promise.all([
    fetchAdminFeatureFlags(locale, screen.session),
    fetchAdminSettingChangeRequests({ status: "PENDING_APPROVAL" }, locale, screen.session),
  ]);

  /*
   * DOS CAPACIDADES, DOS GESTOS. Quien solo tiene `flag.update` ve los
   * interruptores de los no materiales y, en los materiales, el aviso de que su
   * cuenta no puede cambiarlos. No se oculta el bloque entero: pareceria que la
   * funcion no existe, y el ticket seria "no se puede encender AMOE" en vez de
   * "no tengo permiso para pedirlo".
   */
  const canUpdate = can(screen.actor, "flag.update");
  const canUpdateMaterial = can(screen.actor, "flag.update.legally_material");

  const reasons = FLAG_UPDATE_REASONS.map((value) => value);

  const amoeMode = flags.ok ? flags.data.amoe_mode : null;
  const amoePending = flags.ok
    ? (flags.data.amoe_mode_pending_change_request_id ?? null) !== null
    : false;

  return (
    <AdminChrome
      locale={locale}
      actor={screen.actor}
      current="flags"
      title={t("title")}
      description={t("body")}
    >
      {!flags.ok ? (
        <AdminSectionError failure={flags.error} headingLevel="h2" />
      ) : (
        <div className="flex flex-col gap-s6">
          {/* LAS SOLICITUDES PENDIENTES VAN PRIMERO, y solo si hay alguna. Con
              un solo administrador los cambios se aplican al momento, asi que
              una lista vacia seria ruido; un fallo de lectura si se dice. */}
          {requests.ok && requests.data.items.length === 0 ? null : (
            <Card as="section" elevation="raised" padding="lg">
              <CardTitle as="h2" size="sm">
                {t("pendingHeading")}
              </CardTitle>

              <p className="mt-s2 text-body-sm text-text-muted">{t("pendingBody")}</p>

              <div className="mt-s4">
                {!requests.ok ? (
                  <AdminSectionError failure={requests.error} headingLevel="h3" />
                ) : (
                  <ul className="flex list-none flex-col gap-s4">
                    {requests.data.items.map((request) => (
                      <li key={request.id}>
                        <PendingRequestCard
                          request={request}
                          locale={locale}
                          canDecide={canUpdateMaterial}
                          reasons={reasons}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          )}

          {/* MODALIDAD AMOE. Va aparte de la lista de flags porque no es un
              flag: es un ENUM, y se cambia con la misma solicitud que un flag
              material desde HO-041 (su ruta propia desaparecio). */}
          <Card as="section" elevation="raised" padding="lg" aria-labelledby="flags-amoe-mode">
            <SettingRow
              headingId="flags-amoe-mode"
              headingLevel="h2"
              name={t("amoeModeHeading")}
              description={t("amoeModeDescription")}
              badges={
                <Badge tone={amoeMode === null ? "neutral" : "success"} size="sm" wrap>
                  {amoeMode === null ? t("amoeModeNone") : await amoeModeName(locale, amoeMode)}
                </Badge>
              }
            >
              {amoeMode === null ? (
                <p className="text-body-sm text-text-muted">{t("amoeModeUnset")}</p>
              ) : null}
            </SettingRow>

            <div className="mt-s4">
              {amoePending ? (
                <Alert tone="info">{t("hasPendingRequest")}</Alert>
              ) : canUpdateMaterial ? (
                <ChangeDisclosure label={t("change")}>
                  <SettingChangeRequestForm
                    locale={locale}
                    action={requestSettingChangeAction}
                    settingKind="AMOE_MODE"
                    settingKey="amoe_mode"
                    settingLabel={t("amoeModeHeading")}
                    currentMode={amoeMode}
                    reasons={await labelled(locale, reasons)}
                  />
                </ChangeDisclosure>
              ) : (
                <p className="text-body-sm text-text-muted">{t("noMaterialCapability")}</p>
              )}
            </div>
          </Card>

          <section aria-labelledby="flags-list">
            <h2 id="flags-list" className="app-display text-heading-lg text-text">
              {t("listHeading")}
            </h2>

            {/* Dos columnas desde `lg`: las filas son cortas, y en una sola
                columna de 1.200px cada una era una banda casi vacia. `items-start`
                para que abrir un formulario no estire la tarjeta de al lado. */}
            <ul className="mt-s4 grid list-none grid-cols-1 items-start gap-s4 lg:grid-cols-2">
              {flags.data.items.map((flag) => (
                <li key={flag.key}>
                  <FlagCard
                    flag={flag}
                    locale={locale}
                    canUpdate={canUpdate}
                    canUpdateMaterial={canUpdateMaterial}
                    reasons={reasons}
                  />
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </AdminChrome>
  );
}

/** Traduce las claves de motivo una vez, para todos los formularios. */
async function labelled(
  locale: Locale,
  reasons: readonly string[],
): Promise<readonly { readonly value: string; readonly label: string }[]> {
  const label = await reasonLabeller(locale);
  return reasons.map((value) => ({ value, label: label(value) }));
}

/**
 * Nombre legible de una modalidad AMOE ("Por correo postal"), nunca el enum.
 *
 * La lista de modalidades es CERRADA en el contrato (`AMOE_MODES`), asi que la
 * clave de copy se compone con el valor y el tipado de next-intl comprueba que
 * existan las cuatro. Si la API mandara una que la interfaz no conoce, se dice
 * que no hay nombre para ella en vez de pintar el codigo.
 */
async function amoeModeName(locale: Locale, mode: string): Promise<string> {
  const t = await getTranslations({ locale, namespace: "admin.flags" });
  const known = AMOE_MODES.find((value): value is AmoeMode => value === mode);
  return known === undefined ? t("amoeModeUnknown") : t(`amoeModes.${known}`);
}

/**
 * Una frase en lenguaje de tienda sobre lo que hace cada interruptor.
 *
 * Misma convencion que `flagLabeller` (`admin.flags.keys.<camelCase>`), en
 * `admin.flags.hints`. Lista explicita: un flag que la interfaz no conoce se
 * pinta sin frase -con su nombre, que ya cae a la clave- en vez de inventarle
 * una explicacion.
 */
async function flagHintLabeller(locale: Locale): Promise<(key: string) => string | null> {
  const t = await getTranslations({ locale, namespace: "admin.flags.hints" });

  return (key) => {
    switch (key) {
      case "amoe_enabled":
        return t("amoeEnabled");
      case "visible_entry_numbers_enabled":
        return t("visibleEntryNumbersEnabled");
      case "internal_draw_enabled":
        return t("internalDrawEnabled");
      case "state_eligibility_enforcement_enabled":
        return t("stateEligibilityEnforcementEnabled");
      case "age_gate_enabled":
        return t("ageGateEnabled");
      case "entry_multipliers_enabled":
        return t("entryMultipliersEnabled");
      case "entry_caps_enabled":
        return t("entryCapsEnabled");
      case "entry_expiration_enabled":
        return t("entryExpirationEnabled");
      case "winner_publication_enabled":
        return t("winnerPublicationEnabled");
      case "manual_adjustments_enabled":
        return t("manualAdjustmentsEnabled");
      case "provisional_entries_enabled":
        return t("provisionalEntriesEnabled");
      case "dual_approval_for_sensitive_actions_enabled":
        return t("dualApprovalForSensitiveActionsEnabled");
      default:
        return null;
    }
  };
}

/**
 * La parte de las Reglas Oficiales de la que depende un flag, dicha como tema
 * ("quien puede participar") y no como el codigo que manda la API
 * (`ELIGIBILITY`, ver `packages/security/src/flags.ts`).
 *
 * Esos codigos NO son claves de la configuracion de reglas: pasarlos por
 * `rulesKeyLabeller` pintaba "Clave OFFICIAL_RULES". Un codigo desconocido no
 * se traduce a ciegas: la linea simplemente no se pinta, y la insignia "Afecta
 * a las reglas" sigue avisando.
 */
async function legalTopicLabeller(locale: Locale): Promise<(code: string) => string | null> {
  const t = await getTranslations({ locale, namespace: "admin.flags.legalTopics" });

  return (code) => {
    switch (code) {
      case "AMOE":
        return t("amoe");
      case "VISIBLE_ENTRY_NUMBERS":
        return t("visibleEntryNumbers");
      case "INTERNAL_DRAW":
        return t("internalDraw");
      case "ELIGIBILITY":
        return t("eligibility");
      case "OFFICIAL_RULES":
        return t("officialRules");
      case "WINNER_PUBLICATION":
        return t("winnerPublication");
      default:
        return null;
    }
  };
}

/**
 * Cabecera comun de un ajuste: nombre, frase, insignias y lineas de contexto.
 *
 * En el telefono las insignias van debajo del nombre; desde `sm`, a su
 * derecha. El nombre es un encabezado de verdad (`h2` para la modalidad, que
 * es su propia seccion; `h3` para cada flag de la lista), de modo que la
 * pantalla se recorre por encabezados con un lector de pantalla.
 */
function SettingRow({
  headingId,
  headingLevel,
  name,
  description,
  badges,
  children,
}: {
  readonly headingId?: string;
  readonly headingLevel: "h2" | "h3";
  readonly name: string;
  readonly description: string | null;
  readonly badges: ReactNode;
  readonly children?: ReactNode;
}) {
  const Heading = headingLevel;

  return (
    <div className="flex flex-col gap-s3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <Heading id={headingId} className="text-body-md font-semibold text-text">
          {name}
        </Heading>
        {description === null ? null : (
          <p className="mt-s1 text-body-sm text-text-muted">{description}</p>
        )}
        {children === undefined || children === null ? null : (
          <div className="mt-s2 flex flex-col gap-s1">{children}</div>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-s2 sm:max-w-[45%] sm:justify-end">
        {badges}
      </div>
    </div>
  );
}

/**
 * "Cambiar": el formulario de un ajuste, plegado.
 *
 * `<details>`/`<summary>` nativo: abre y cierra sin JavaScript, con teclado
 * (Intro o Espacio sobre el resumen) y el lector de pantalla anuncia si esta
 * desplegado. El resumen tiene el aspecto y el alto (44px) de un boton
 * secundario, a lo ancho en el telefono. La flecha gira al abrir; es
 * decorativa.
 */
function ChangeDisclosure({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <details className="group">
      <summary
        className={cn(
          buttonVariants({ variant: "secondary" }),
          "w-full cursor-pointer list-none sm:w-auto [&::-webkit-details-marker]:hidden",
        )}
      >
        {label}
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 20 20"
          fill="none"
          className="h-4 w-4 shrink-0 transition-transform duration-fast group-open:rotate-180"
        >
          <path
            d="M5 7.5 10 12.5l5-5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>

      <div className="mt-s4 border-t border-border pt-s4">{children}</div>
    </details>
  );
}

/**
 * Un flag, con el gesto que le corresponde.
 *
 * LA MATERIALIDAD SE VE ANTES DE TOCAR NADA: una insignia junto al estado
 * ("Afecta a las reglas") y, si la hay, la parte de las Reglas Oficiales de la
 * que depende, con su nombre legible. El identificador tecnico ya no se pinta:
 * a quien lleva la tienda no le dice nada, y el formulario lo sigue mandando.
 */
async function FlagCard({
  flag,
  locale,
  canUpdate,
  canUpdateMaterial,
  reasons,
}: {
  readonly flag: AdminFeatureFlagRow;
  readonly locale: Locale;
  readonly canUpdate: boolean;
  readonly canUpdateMaterial: boolean;
  readonly reasons: readonly string[];
}) {
  const t = await getTranslations({ locale, namespace: "admin.flags" });
  const flagLabel = await flagLabeller(locale);
  const flagHint = await flagHintLabeller(locale);
  const topicLabel = await legalTopicLabeller(locale);
  const options = await labelled(locale, reasons);

  const pending = flag.pending_change_request_id ?? null;
  const name = flagLabel(flag.key);
  const topic =
    flag.legal_dependency === undefined || flag.legal_dependency === null
      ? null
      : topicLabel(flag.legal_dependency);

  return (
    <Card elevation="flat" padding="md">
      <SettingRow
        headingLevel="h3"
        name={name}
        description={flagHint(flag.key)}
        badges={
          <>
            <Badge tone={flag.enabled ? "success" : "neutral"} size="sm" wrap>
              {flag.enabled ? t("stateOn") : t("stateOff")}
            </Badge>

            {flag.is_legally_material ? (
              <Badge tone="warning" size="sm" wrap>
                {t("legallyMaterial")}
              </Badge>
            ) : null}
          </>
        }
      >
        {topic === null ? null : (
          <p className="text-caption text-text-subtle">{t("legalDependency", { topic })}</p>
        )}

        {flag.updated_at === undefined || flag.updated_at === null ? null : (
          <p className="text-caption text-text-subtle">
            {t("updatedAt", {
              instant: formatZonedDateTime(flag.updated_at, locale, { timeZone: "UTC" }) ?? "",
            })}
          </p>
        )}
      </SettingRow>

      <div className="mt-s4">
        {/*
         * CON UNA SOLICITUD VIVA NO SE OFRECE OTRO GESTO.
         *
         * Dos cambios en vuelo sobre el mismo valor dejarian a alguien
         * aprobando uno que ya no es el actual. Se dice que hay una pendiente y
         * la lista de arriba es donde se decide.
         */}
        {pending !== null ? (
          <Alert tone="info">{t("hasPendingRequest")}</Alert>
        ) : flag.is_legally_material ? (
          canUpdateMaterial ? (
            <ChangeDisclosure label={t("change")}>
              <SettingChangeRequestForm
                locale={locale}
                action={requestSettingChangeAction}
                settingKind="FEATURE_FLAG"
                settingKey={flag.key}
                settingLabel={name}
                enabled={flag.enabled}
                reasons={options}
              />
            </ChangeDisclosure>
          ) : (
            <p className="text-body-sm text-text-muted">{t("noMaterialCapability")}</p>
          )
        ) : canUpdate ? (
          <ChangeDisclosure label={t("change")}>
            <FlagToggleForm
              locale={locale}
              action={updateFeatureFlagAction}
              flagKey={flag.key}
              enabled={flag.enabled}
              reasons={options}
            />
          </ChangeDisclosure>
        ) : (
          <p className="text-body-sm text-text-muted">{t("noUpdateCapability")}</p>
        )}
      </div>
    </Card>
  );
}

/**
 * Una solicitud pendiente, con lo que se pide y quien lo pidio.
 *
 * EL VALOR SOLICITADO SE LEE, NO SE ADIVINA. `requested_value` es opaco en el
 * contrato -su forma depende de `setting_kind`- y aqui se leen las dos claves
 * conocidas. Si no aparece ninguna, se dice que no esta publicado en vez de
 * pintar `[object Object]`: aprobar un cambio sin ver el valor seria firmar en
 * blanco.
 *
 * El resumen -que se pidio, por que y cuando- se ve siempre; la decision va
 * plegada en "Revisar y decidir", con aprobar y rechazar del mismo peso.
 */
async function PendingRequestCard({
  request,
  locale,
  canDecide,
  reasons,
}: {
  readonly request: AdminSettingChangeRequest;
  readonly locale: Locale;
  readonly canDecide: boolean;
  readonly reasons: readonly string[];
}) {
  const t = await getTranslations({ locale, namespace: "admin.flags" });
  const flagLabel = await flagLabeller(locale);
  const reasonLabel = await reasonLabeller(locale);
  const options = await labelled(locale, reasons);

  const requested = request.requested_value ?? null;
  const enabled =
    requested !== null && typeof requested.enabled === "boolean" ? requested.enabled : null;
  const mode =
    requested !== null && typeof requested.amoe_mode === "string" ? requested.amoe_mode : null;
  const modeCleared = requested !== null && requested.amoe_mode === null;

  const requestedAt =
    request.requested_at === undefined || request.requested_at === null
      ? null
      : formatZonedDateTime(request.requested_at, locale, { timeZone: "UTC" });

  return (
    <Card elevation="flat" padding="md">
      <SettingRow
        headingLevel="h3"
        name={
          request.setting_kind === "AMOE_MODE"
            ? t("amoeModeHeading")
            : flagLabel(request.setting_key)
        }
        description={
          enabled !== null
            ? enabled
              ? t("requestedOn")
              : t("requestedOff")
            : mode !== null
              ? t("requestedMode", { mode: await amoeModeName(locale, mode) })
              : modeCleared
                ? t("requestedModeNone")
                : t("requestedUnknown")
        }
        badges={
          <Badge tone="warning" size="sm" wrap>
            {t("statusPending")}
          </Badge>
        }
      >
        {request.reason_code === undefined || request.reason_code === null ? null : (
          <p className="text-body-sm text-text-muted">
            {t("requestReason", { reason: reasonLabel(request.reason_code) })}
          </p>
        )}

        {/* La nota libre la escribio una persona: se renderiza como TEXTO, nunca
            como marcado, igual que cualquier otro campo tecleado por alguien. */}
        {request.reason_text === undefined || request.reason_text === null ? null : (
          <p className="whitespace-pre-line text-body-sm text-text-muted">{request.reason_text}</p>
        )}

        {requestedAt === null ? null : (
          <p className="text-caption text-text-subtle">
            {t("requestedAt", { instant: requestedAt })}
          </p>
        )}
      </SettingRow>

      <div className="mt-s4">
        {canDecide ? (
          <ChangeDisclosure label={t("decide")}>
            <SettingChangeDecisionForm
              locale={locale}
              action={decideSettingChangeAction}
              requestId={request.id}
              reasons={options}
            />
          </ChangeDisclosure>
        ) : (
          <p className="text-body-sm text-text-muted">{t("noMaterialCapability")}</p>
        )}
      </div>
    </Card>
  );
}
