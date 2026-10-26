"use client";

import { Alert, Button, Checkbox, FormField, Select, Textarea } from "@app/ui";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { FormError, LocaleField, useFieldError } from "@/components/auth-form-shell";
import type { Locale } from "@/i18n/locales";
import { IDLE, type ActionResult } from "@/lib/action-result";
// De la hoja y no del indice: el indice arrastra `http.ts`, que es de servidor.
import { AMOE_MODES, type AmoeMode } from "@/lib/api/contract";

/**
 * Los tres gestos de la pantalla de ajustes (§13.9, HO-041 resolucion fase 1).
 *
 * POR QUE TRES Y NO UNO
 * ---------------------
 * No todos los ajustes valen lo mismo. Un flag NO material -por ejemplo,
 * enseñar o no los numeros de participacion- se cambia con un interruptor y un
 * motivo. Un flag LEGALMENTE MATERIAL -si existe via gratuita, si los topes se
 * aplican, si los multiplicadores cuentan- cambia lo que la plataforma afirma
 * sobre las condiciones de participacion y va por su propia ruta y capacidad,
 * con confirmacion. El tercero es la decision sobre una solicitud que hubiera
 * quedado pendiente de antes.
 *
 * Plantilla: hay un solo administrador. La solicitud se APLICA al momento y
 * decidir la propia esta permitido.
 *
 * Fundirlos en un solo formulario habria hecho que el peso de la accion
 * dependiera del flag elegido en un desplegable, que es exactamente lo que la
 * separacion de rutas evita.
 *
 * NINGUNO DE LOS TRES ES EL CONTROL. El autorizador exige la capacidad; la
 * interfaz advierte y pinta el 409 o el 403 tal cual.
 *
 * VAN PLEGADOS EN LA PANTALLA. La pagina de interruptores los envuelve en un
 * `<details>` ("Cambiar") por ajuste: con los doce formularios abiertos la
 * pantalla media mas de 4.000px y el estado de cada ajuste -lo que se viene a
 * mirar- quedaba enterrado entre selectores de motivo. Los formularios no
 * cambian por eso: mismos campos, mismas acciones, mismo comportamiento.
 *
 * Los botones son de 44px (`md`) y dicen lo que hacen. En la decision,
 * aprobar y rechazar pesan lo mismo: uno al lado del otro en el escritorio y
 * apilados a lo ancho en el telefono, con el rechazo en tono de peligro.
 */

/**
 * Interruptor de un flag NO material.
 *
 * `enabled` viaja como el valor CONTRARIO al actual, resuelto en el servidor
 * que renderiza: el boton dice lo que va a hacer -"Encender" o "Apagar"- en vez
 * de ser una casilla cuyo estado hay que interpretar. Un interruptor que
 * cambia al pulsarlo y ademas necesita motivo produce el gesto ambiguo de
 * "cambiar y luego confirmar".
 */
export function FlagToggleForm({
  locale,
  action,
  flagKey,
  enabled,
  reasons,
}: {
  readonly locale: Locale;
  readonly action: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
  readonly flagKey: string;
  readonly enabled: boolean;
  readonly reasons: readonly { readonly value: string; readonly label: string }[];
}) {
  const t = useTranslations("admin.flags");
  const [state, formAction, pending] = useActionState(action, IDLE);
  const fieldError = useFieldError(state);

  return (
    <form action={formAction} className="flex flex-col gap-s3">
      <LocaleField locale={locale} />
      <input type="hidden" name="flag_key" value={flagKey} />
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />

      <FormError result={state} />

      {/* El 409 `FLAG_LEGALLY_MATERIAL` llega con `details.use` apuntando a la
          ruta correcta. Se ensena tal cual: no es "no tienes permiso" -eso
          seria falso- sino "este ajuste no se cambia por aqui". */}
      {state.status === "error" && state.detail !== null ? (
        <Alert tone="warning">
          <p className="font-mono text-body-sm">{state.detail}</p>
        </Alert>
      ) : null}

      {state.status === "ok" ? <Alert tone="success">{t("changed")}</Alert> : null}

      <FormField label={t("reasonLabel")} required error={fieldError("reason_code")}>
        <Select name="reason_code" required defaultValue={reasons[0]?.value ?? ""}>
          {reasons.map((reason) => (
            <option key={reason.value} value={reason.value}>
              {reason.label}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label={t("reasonTextLabel")} error={fieldError("reason_text")}>
        <Textarea name="reason_text" rows={2} />
      </FormField>

      <Button
        type="submit"
        variant={enabled ? "danger" : "primary"}
        loading={pending}
        className="w-full sm:w-auto sm:self-start"
      >
        {enabled ? t("turnOff") : t("turnOn")}
      </Button>
    </form>
  );
}

/**
 * Cambio de un ajuste LEGALMENTE MATERIAL.
 *
 * Sirve para las dos cosas que van por solicitud de cambio: un flag material y
 * la modalidad AMOE. Lo que cambia entre las dos es UN campo -un booleano
 * implicito o un enum- y por eso es un solo componente con una rama, en vez de
 * dos formularios que compartirian todo lo demas.
 *
 * Plantilla: el cambio se APLICA al momento (`status: "APPLIED"`) y la accion
 * revalida el panel, asi que la pantalla ya muestra el valor nuevo. Si la API
 * respondiera otra cosa, se diria tal cual en vez de suponerla.
 */
export function SettingChangeRequestForm({
  locale,
  action,
  settingKind,
  settingKey,
  settingLabel,
  enabled,
  currentMode,
  reasons,
}: {
  readonly locale: Locale;
  readonly action: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
  readonly settingKind: "FEATURE_FLAG" | "AMOE_MODE";
  readonly settingKey: string;
  /**
   * Nombre legible del ajuste, ya traducido, para la casilla de confirmacion.
   * La clave tecnica (`amoe_enabled`) sigue viajando en el campo oculto; lo
   * que se LEE al confirmar es "Metodo gratuito de participacion".
   */
  readonly settingLabel: string;
  /** Estado actual del flag. Solo para `FEATURE_FLAG`. */
  readonly enabled?: boolean;
  /** Modalidad vigente. Solo para `AMOE_MODE`. */
  readonly currentMode?: AmoeMode | null;
  readonly reasons: readonly { readonly value: string; readonly label: string }[];
}) {
  const t = useTranslations("admin.flags");
  const [state, formAction, pending] = useActionState(action, IDLE);
  const fieldError = useFieldError(state);
  const [confirmed, setConfirmed] = useState(false);

  const isFlag = settingKind === "FEATURE_FLAG";

  return (
    <form action={formAction} className="flex flex-col gap-s3">
      <LocaleField locale={locale} />
      <input type="hidden" name="setting_kind" value={settingKind} />
      <input type="hidden" name="setting_key" value={settingKey} />
      {isFlag ? (
        <input type="hidden" name="enabled" value={enabled === true ? "false" : "true"} />
      ) : null}

      {/* LA ADVERTENCIA VA ANTES DEL GESTO, no despues. Quien opera tiene que
          saber que esto cambia las condiciones de participacion ANTES de
          escribir el motivo. */}
      <Alert tone="info">{t("materialNotice")}</Alert>

      <FormError result={state} />

      {state.status === "error" && state.detail !== null ? (
        <Alert tone="danger">
          <p className="font-mono text-body-sm">{state.detail}</p>
        </Alert>
      ) : null}

      {state.status === "ok" ? (
        <Alert tone={state.detail === "APPLIED" ? "success" : "info"}>
          {state.detail === "APPLIED" ? t("requestApplied") : t("requestCreated")}
        </Alert>
      ) : null}

      {isFlag ? null : (
        <FormField
          label={t("amoeModeLabel")}
          description={t("amoeModeHint")}
          error={fieldError("amoe_mode")}
        >
          {/* El VALOR es el del contrato (`MAIL_IN_REVIEW`); lo que se LEE es
              su nombre ("Por correo postal"). Un enum en crudo no le dice nada
              a quien lleva la tienda. */}
          <Select name="amoe_mode" defaultValue={currentMode ?? ""}>
            <option value="">{t("amoeModeNone")}</option>
            {AMOE_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {t(`amoeModes.${mode}`)}
              </option>
            ))}
          </Select>
        </FormField>
      )}

      <FormField label={t("reasonLabel")} required error={fieldError("reason_code")}>
        <Select name="reason_code" required defaultValue={reasons[0]?.value ?? ""}>
          {reasons.map((reason) => (
            <option key={reason.value} value={reason.value}>
              {reason.label}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField
        label={t("reasonTextLabel")}
        description={t("reasonTextHint")}
        error={fieldError("reason_text")}
      >
        <Textarea name="reason_text" rows={2} />
      </FormField>

      <Checkbox
        name="confirmed"
        checked={confirmed}
        onChange={(event) => setConfirmed(event.currentTarget.checked)}
        label={isFlag ? t("confirmFlagRequest", { name: settingLabel }) : t("confirmModeRequest")}
      />

      <Button
        type="submit"
        variant="primary"
        loading={pending}
        disabled={!confirmed}
        className="w-full sm:w-auto sm:self-start"
      >
        {t("requestChange")}
      </Button>
    </form>
  );
}

/**
 * Decision sobre una solicitud pendiente.
 *
 * Plantilla: con la solicitud aplicada al momento, solo queda alguna pendiente
 * si se creo antes. Hay un solo administrador, y decidir la propia esta
 * permitido: los dos botones se ofrecen siempre.
 *
 * DOS BOTONES Y UN SOLO FORMULARIO. El motivo es el mismo campo para aprobar y
 * para rechazar -"por que se decide asi"- y duplicarlo produciria dos motivos
 * escritos para la misma decision.
 */
export function SettingChangeDecisionForm({
  locale,
  action,
  requestId,
  reasons,
}: {
  readonly locale: Locale;
  readonly action: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
  readonly requestId: string;
  readonly reasons: readonly { readonly value: string; readonly label: string }[];
}) {
  const t = useTranslations("admin.flags");
  const [state, formAction, pending] = useActionState(action, IDLE);
  const fieldError = useFieldError(state);

  return (
    <form action={formAction} className="flex flex-col gap-s3">
      <LocaleField locale={locale} />
      <input type="hidden" name="request_id" value={requestId} />

      <FormError result={state} />
      {state.status === "ok" ? <Alert tone="success">{t("decisionSaved")}</Alert> : null}

      <FormField label={t("reasonLabel")} required error={fieldError("reason_code")}>
        <Select name="reason_code" required defaultValue={reasons[0]?.value ?? ""}>
          {reasons.map((reason) => (
            <option key={reason.value} value={reason.value}>
              {reason.label}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label={t("reasonTextLabel")} error={fieldError("reason_text")}>
        <Textarea name="reason_text" rows={2} />
      </FormField>

      {/* MISMO PESO PARA LAS DOS DECISIONES: mismo alto (44px) y mismo ancho,
          una al lado de la otra en el escritorio y apiladas a lo ancho en el
          telefono. Ninguna es "la buena" por defecto; el tono -primario y
          peligro- dice cual es cual, y el texto tambien. */}
      <div className="grid grid-cols-1 gap-s3 sm:max-w-md sm:grid-cols-2">
        {/* `name="decision"` en el propio boton: el navegador manda el valor del
            boton que se pulso, asi que un solo formulario cubre las dos
            decisiones sin estado de cliente. */}
        <Button
          type="submit"
          name="decision"
          value="approve"
          variant="primary"
          fullWidth
          loading={pending}
        >
          {t("approve")}
        </Button>

        <Button
          type="submit"
          name="decision"
          value="reject"
          variant="danger"
          fullWidth
          loading={pending}
        >
          {t("reject")}
        </Button>
      </div>
    </form>
  );
}
