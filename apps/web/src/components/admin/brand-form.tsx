"use client";

import { Alert, Button, cn, FOCUS_VISIBLE_CLASSES, FormField, Input, useFormField } from "@app/ui";
import { useTranslations } from "next-intl";
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import { ImageUploadField } from "@/components/admin/image-upload-field";
import { FormError, LocaleField, useFieldError } from "@/components/auth-form-shell";
import type { Locale } from "@/i18n/locales";
import { IDLE } from "@/lib/action-result";
import { updateBrandAction } from "@/lib/admin/brand-actions";
import { BRAND_LIMITS, BRAND_TIME_ZONE_SUGGESTIONS } from "@/lib/admin/brand-input";
import type { AdminBrandResponse } from "@/lib/api";

/**
 * Formulario de la marca del sitio (§17, migracion 0040).
 *
 * UN SOLO FORMULARIO PARA LA FILA ENTERA. `PUT /admin/brand` reemplaza todo, y
 * por eso aqui no hay "guardar solo los colores": se edita lo que haga falta y
 * se guarda todo junto, con los valores actuales ya puestos en cada campo.
 * Los grupos (`<fieldset>`) existen para que quien opera encuentre lo suyo sin
 * leer dieciocho campos seguidos, no porque se guarden por separado.
 *
 * La server action se pasa TAL CUAL a `useActionState`: el formulario se envia
 * aunque la pagina no haya hidratado. Todos los controles son NO CONTROLADOS
 * con `defaultValue`; lo unico que anade JavaScript es ensenar el hex del color
 * y el porcentaje del patron al lado de su control, que es comodidad y no
 * funcion.
 *
 * EL LOGOTIPO ACTUAL VIAJA EN UN CAMPO OCULTO, al contrario que la foto de un
 * producto. Alli, no mandar `image_url` deja la que habia (es un `PATCH`); aqui
 * el `PUT` reemplaza la fila, asi que si no se repite el `id` del logotipo, se
 * pierde. La accion lo valida como entrada de usuario (UUID o vacio).
 *
 * LOS LIMITES DEL NAVEGADOR (`maxLength`, `pattern`, `type="email"`) son los
 * mismos que aplica la accion y despues la API. Existen para frenar ANTES de
 * enviar: React reinicia los campos no controlados tras cada envio, y perder
 * dieciocho campos tecleados por un prefijo de nueve letras seria una mala
 * tarde.
 */
export function BrandForm({
  locale,
  brand,
}: {
  readonly locale: Locale;
  /** La marca guardada, que rellena cada campo. */
  readonly brand: AdminBrandResponse;
}) {
  const t = useTranslations("admin.brand");
  const [state, formAction, pending] = useActionState(updateBrandAction, IDLE);
  const fieldError = useFieldError(state);
  const timeZoneListId = useId();

  return (
    <form action={formAction} className="flex flex-col gap-s6">
      <LocaleField locale={locale} />
      <input type="hidden" name="logo_media_id" value={brand.logo_media_id ?? ""} />

      <FormError result={state} />
      {state.status === "ok" ? <Alert tone="success">{t("saved")}</Alert> : null}

      {/* --- Identidad: nombre, logotipo de texto y logotipo grafico. */}
      <Group legend={t("identityLegend")} first>
        <FormField
          label={t("nameLabel")}
          description={t("nameHint")}
          required
          requiredHint={t("requiredHint")}
          error={fieldError("name")}
        >
          <Input
            name="name"
            defaultValue={brand.name}
            maxLength={BRAND_LIMITS.name}
            autoComplete="organization"
            required
          />
        </FormField>

        <div className="grid grid-cols-1 gap-s4 sm:grid-cols-2">
          <FormField
            label={t("wordmarkLeadLabel")}
            description={t("wordmarkLeadHint")}
            required
            requiredHint={t("requiredHint")}
            error={fieldError("wordmark_lead")}
          >
            <Input
              name="wordmark_lead"
              defaultValue={brand.wordmark.lead}
              maxLength={BRAND_LIMITS.wordmarkLead}
              autoComplete="off"
              required
            />
          </FormField>

          <FormField
            label={t("wordmarkTailLabel")}
            description={t("wordmarkTailHint")}
            error={fieldError("wordmark_tail")}
          >
            <Input
              name="wordmark_tail"
              defaultValue={brand.wordmark.tail}
              maxLength={BRAND_LIMITS.wordmarkTail}
              autoComplete="off"
            />
          </FormField>
        </div>

        <div className="flex flex-col gap-s2">
          <ImageUploadField
            name="logo"
            label={t("logoLabel")}
            currentUrl={brand.logo_url}
            error={fieldError("logo_file")}
          />
          <p className="text-caption text-text-subtle">{t("logoHint")}</p>
        </div>
      </Group>

      {/* --- Colores y patron de fondo. */}
      <Group legend={t("colorsLegend")}>
        <div className="grid grid-cols-1 gap-s4 sm:grid-cols-2">
          <FormField
            label={t("colorBrandLabel")}
            description={t("colorBrandHint")}
            required
            error={fieldError("color_brand")}
          >
            <ColorInput name="color_brand" defaultValue={brand.colors.brand} />
          </FormField>

          <FormField
            label={t("colorAccentLabel")}
            description={t("colorAccentHint")}
            required
            error={fieldError("color_accent")}
          >
            <ColorInput name="color_accent" defaultValue={brand.colors.accent} />
          </FormField>
        </div>

        <FormField
          label={t("patternLabel")}
          description={t("patternHint")}
          error={fieldError("pattern_opacity_percent")}
          className="max-w-[28rem]"
        >
          <RangeInput
            name="pattern_opacity_percent"
            defaultValue={brand.pattern_opacity_percent}
            max={BRAND_LIMITS.patternOpacityMax}
            format={(value) => t("patternValue", { value })}
          />
        </FormField>
      </Group>

      {/* --- Datos legales: los que imprimen Terminos, Privacidad y el aviso de California. */}
      <Group legend={t("legalLegend")} intro={t("legalIntro")}>
        <div className="grid grid-cols-1 gap-s4 sm:grid-cols-2">
          <FormField
            label={t("legalNameLabel")}
            description={t("legalNameHint")}
            required
            requiredHint={t("requiredHint")}
            error={fieldError("legal_name")}
          >
            <Input
              name="legal_name"
              defaultValue={brand.legal.name}
              maxLength={BRAND_LIMITS.legalName}
              autoComplete="organization"
              required
            />
          </FormField>

          <FormField
            label={t("legalEntityLabel")}
            description={t("legalEntityHint")}
            required
            requiredHint={t("requiredHint")}
            error={fieldError("legal_entity_description")}
          >
            <Input
              name="legal_entity_description"
              defaultValue={brand.legal.entity_description}
              maxLength={BRAND_LIMITS.legalEntityDescription}
              autoComplete="off"
              required
            />
          </FormField>

          <FormField
            label={t("legalStateLabel")}
            description={t("legalStateHint")}
            required
            requiredHint={t("requiredHint")}
            error={fieldError("legal_governing_law_state")}
          >
            <Input
              name="legal_governing_law_state"
              defaultValue={brand.legal.governing_law_state}
              maxLength={BRAND_LIMITS.legalGoverningLawState}
              autoComplete="off"
              required
            />
          </FormField>

          <FormField
            label={t("legalVenueLabel")}
            description={t("legalVenueHint")}
            required
            requiredHint={t("requiredHint")}
            error={fieldError("legal_venue")}
          >
            <Input
              name="legal_venue"
              defaultValue={brand.legal.venue}
              maxLength={BRAND_LIMITS.legalVenue}
              autoComplete="off"
              required
            />
          </FormField>

          <FormField
            label={t("legalStreetLabel")}
            required
            requiredHint={t("requiredHint")}
            error={fieldError("legal_street")}
          >
            <Input
              name="legal_street"
              defaultValue={brand.legal.street}
              maxLength={BRAND_LIMITS.legalStreet}
              autoComplete="street-address"
              required
            />
          </FormField>

          <FormField
            label={t("legalCityLabel")}
            required
            requiredHint={t("requiredHint")}
            error={fieldError("legal_city_state_zip")}
          >
            <Input
              name="legal_city_state_zip"
              defaultValue={brand.legal.city_state_zip}
              maxLength={BRAND_LIMITS.legalCityStateZip}
              autoComplete="off"
              required
            />
          </FormField>
        </div>
      </Group>

      {/* --- Contacto y dominio. */}
      <Group legend={t("contactLegend")}>
        <div className="grid grid-cols-1 gap-s4 sm:grid-cols-2">
          <FormField
            label={t("emailLabel")}
            description={t("emailHint")}
            required
            requiredHint={t("requiredHint")}
            error={fieldError("contact_email")}
          >
            <Input
              name="contact_email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              defaultValue={brand.contact_email}
              required
            />
          </FormField>

          <FormField
            label={t("domainLabel")}
            description={t("domainHint")}
            required
            requiredHint={t("requiredHint")}
            error={fieldError("domain")}
          >
            <Input
              name="domain"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              defaultValue={brand.domain}
              required
            />
          </FormField>
        </div>
      </Group>

      {/* --- Numeracion y zona horaria. */}
      <Group legend={t("numberingLegend")} intro={t("numberingHint")}>
        <div className="grid grid-cols-1 gap-s4 sm:grid-cols-3">
          <FormField
            label={t("orderPrefixLabel")}
            description={t("orderPrefixHint")}
            required
            requiredHint={t("requiredHint")}
            error={fieldError("order_prefix")}
          >
            <Input
              name="order_prefix"
              defaultValue={brand.numbering.order_prefix}
              minLength={2}
              maxLength={8}
              pattern="[A-Za-z0-9]{2,8}"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="uppercase"
              required
            />
          </FormField>

          <FormField
            label={t("entryPrefixLabel")}
            description={t("entryPrefixHint")}
            required
            requiredHint={t("requiredHint")}
            error={fieldError("entry_prefix")}
          >
            <Input
              name="entry_prefix"
              defaultValue={brand.numbering.entry_prefix}
              minLength={2}
              maxLength={8}
              pattern="[A-Za-z0-9]{2,8}"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="uppercase"
              required
            />
          </FormField>

          <FormField
            label={t("timeZoneLabel")}
            description={t("timeZoneHint")}
            required
            requiredHint={t("requiredHint")}
            error={fieldError("time_zone")}
          >
            <Input
              name="time_zone"
              list={timeZoneListId}
              defaultValue={brand.time_zone}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </FormField>
          <datalist id={timeZoneListId}>
            {BRAND_TIME_ZONE_SUGGESTIONS.map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
        </div>
      </Group>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={pending}
        className="w-full sm:w-auto sm:self-start"
      >
        {t("save")}
      </Button>
    </form>
  );
}

/** Un grupo de campos con su rotulo. Todos menos el primero llevan filete arriba. */
function Group({
  legend,
  intro,
  first = false,
  children,
}: {
  readonly legend: string;
  readonly intro?: string;
  readonly first?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <fieldset
      className={cn("flex flex-col gap-s4 border-0 p-0", !first && "border-t border-border pt-s5")}
    >
      <legend className="app-display text-heading-sm text-text">{legend}</legend>
      {intro === undefined ? null : (
        <p className="max-w-[48rem] text-body-sm text-text-muted">{intro}</p>
      )}
      {children}
    </fieldset>
  );
}

/**
 * Vuelve a leer el valor de un control cuando el formulario SE REINICIA.
 *
 * React reinicia los campos no controlados despues de cada envio, y el texto
 * que se ensena al lado del control (el hex, el porcentaje) es estado de React:
 * sin esto seguiria diciendo lo que se eligio antes de guardar, mientras el
 * control ya ensena lo guardado.
 *
 * El evento `reset` se despacha ANTES de restaurar los valores, asi que se lee
 * el control en una microtarea, cuando ya tiene el valor restaurado.
 */
function useValueAfterReset(
  ref: RefObject<HTMLInputElement | null>,
  onValue: (value: string) => void,
): void {
  useEffect(() => {
    const input = ref.current;
    const form = input?.form;
    if (input === null || input === undefined || form === null || form === undefined) {
      return undefined;
    }

    const sync = (): void => {
      queueMicrotask(() => {
        onValue(input.value);
      });
    };

    form.addEventListener("reset", sync);
    return () => {
      form.removeEventListener("reset", sync);
    };
  }, [ref, onValue]);
}

/**
 * Selector de color nativo, cableado al `FormField` que lo envuelve, con el
 * hex al lado: el selector solo ensena una mancha de color, y quien copia un
 * `#rrggbb` de su manual de marca necesita ver que es el que quedo.
 *
 * Componente aparte porque `useFormField` lee el contexto del `FormField`, y
 * un hook solo ve el contexto de SUS ancestros.
 */
function ColorInput({
  name,
  defaultValue,
}: {
  readonly name: string;
  readonly defaultValue: string;
}) {
  const field = useFormField();
  const inputRef = useRef<HTMLInputElement>(null);
  const [hex, setHex] = useState(defaultValue);

  useValueAfterReset(inputRef, setHex);

  return (
    <div className="flex items-center gap-s3">
      <input
        ref={inputRef}
        type="color"
        name={name}
        defaultValue={defaultValue}
        id={field?.controlId}
        aria-describedby={field?.describedBy}
        aria-invalid={field?.invalid === true ? true : undefined}
        required={field?.required}
        onChange={(event) => {
          setHex(event.currentTarget.value);
        }}
        className={cn(
          "h-control-md w-16 shrink-0 cursor-pointer rounded-md border bg-surface p-1",
          "transition-colors duration-fast ease-standard",
          FOCUS_VISIBLE_CLASSES,
          field?.invalid === true
            ? "border-danger"
            : "border-border-strong hover:border-text-subtle",
        )}
      />
      <output htmlFor={field?.controlId} className="font-mono text-body-sm tabular-nums text-text">
        {hex}
      </output>
    </div>
  );
}

/** Deslizador entero de 0 a `max`, con el valor visible al lado. */
function RangeInput({
  name,
  defaultValue,
  max,
  format,
}: {
  readonly name: string;
  readonly defaultValue: number;
  readonly max: number;
  /** Como decir el valor ("16 %"), ya traducido por quien llama. */
  readonly format: (value: string) => string;
}) {
  const field = useFormField();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(String(defaultValue));

  useValueAfterReset(inputRef, setValue);

  return (
    <div className="flex items-center gap-s4">
      <input
        ref={inputRef}
        type="range"
        name={name}
        min={0}
        max={max}
        step={1}
        defaultValue={defaultValue}
        id={field?.controlId}
        aria-describedby={field?.describedBy}
        aria-invalid={field?.invalid === true ? true : undefined}
        onChange={(event) => {
          setValue(event.currentTarget.value);
        }}
        className={cn("h-control-md w-full cursor-pointer accent-brand", FOCUS_VISIBLE_CLASSES)}
      />
      <output
        htmlFor={field?.controlId}
        className="w-12 shrink-0 text-right text-body-sm tabular-nums text-text"
      >
        {format(value)}
      </output>
    </div>
  );
}
