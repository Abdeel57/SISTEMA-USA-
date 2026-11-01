import { buttonVariants, EmptyState } from "@app/ui";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { ApiErrorState } from "@/components/api-error-state";
import { adminHref } from "@/i18n/admin-routing";
import type { Locale } from "@/i18n/locales";
import type { AdminActor } from "@/lib/admin/capabilities";
import { can } from "@/lib/admin/capabilities";
import type { AdminScreenKey } from "@/lib/admin/navigation";
import { loadAdminSession } from "@/lib/admin/session-server";
import type { AdminCapability, ApiFailure, SessionContext } from "@/lib/api";

import { AdminAccessFrame, AdminChrome } from "./admin-chrome";

/**
 * Apertura de una pantalla del panel.
 *
 * POR QUE ES UNA FUNCION Y NO UN COMPONENTE ENVOLVENTE
 * ----------------------------------------------------
 * Un `<AdminGuard>` que envolviera a la pantalla tendria que renderizar a sus
 * hijos SIEMPRE -React no puede "no evaluar" a un hijo ya construido-, y eso
 * significa que la pantalla habria pedido sus datos antes de saber si el actor
 * tiene derecho a verlos. Con una funcion, la pagina no llama a ningun `fetch`
 * hasta que esta autorizada, que es la unica forma de que una pantalla sin
 * permiso no genere trafico contra el backend.
 *
 * DEVUELVE UNA DE DOS COSAS y quien llama tiene que decidir explicitamente:
 * el nodo ya renderizado del estado bloqueado, o el actor y su sesion.
 *
 * LOS CUATRO ESTADOS BLOQUEADOS SE PINTAN DISTINTO A PROPOSITO
 * ------------------------------------------------------------
 * Sin sesion, sesion de cliente, error de lectura y falta de capacidad son
 * cuatro situaciones con cuatro respuestas correctas distintas.
 * Colapsarlas en "no autorizado" manda a la persona equivocada a hacer lo
 * equivocado: a teclear una contrasena que ya tiene, a llamar a soporte por un
 * fallo de red, o a pedir un permiso que si tiene.
 */

export type AdminScreenResult =
  | {
      readonly ok: true;
      readonly session: SessionContext;
      readonly actor: AdminActor;
    }
  | { readonly ok: false; readonly node: ReactNode };

export async function openAdminScreen(options: {
  readonly locale: Locale;
  /** Entrada de navegacion que corresponde a esta pantalla. */
  readonly current: AdminScreenKey;
  /** Ruta INTERNA del panel, para poder volver aqui tras iniciar sesion. */
  readonly path: string;
  /** Titulo ya traducido, para el marco cuando falta la capacidad. */
  readonly title: string;
  /**
   * Capacidad minima para ver la pantalla. `null` en las que no exigen ninguna
   * concreta -no hay ninguna hoy, y el hueco existe para no forzar una
   * capacidad inventada el dia que aparezca una pantalla puramente informativa.
   */
  readonly capability: AdminCapability | null;
}): Promise<AdminScreenResult> {
  const { locale, current, path, title, capability } = options;
  const { session, state } = await loadAdminSession(locale);

  if (state.kind === "anonymous") {
    return { ok: false, node: <StaffSignInRequired locale={locale} returnPath={path} /> };
  }

  if (state.kind === "notStaff") {
    return { ok: false, node: <NotStaffNotice locale={locale} returnPath={path} /> };
  }

  if (state.kind === "unavailable") {
    return { ok: false, node: <AdminUnavailable locale={locale} failure={state.failure} /> };
  }

  const { actor } = state;

  if (capability !== null && !can(actor, capability)) {
    return {
      ok: false,
      node: (
        <AdminChrome locale={locale} actor={actor} current={current} title={title}>
          <CapabilityDenied locale={locale} capability={capability} />
        </AdminChrome>
      ),
    };
  }

  return { ok: true, session, actor };
}

/**
 * Sin sesion.
 *
 * NO ES UN ERROR. Es el estado normal de cualquiera que abra el panel por la
 * manana, y tambien el de quien vuelve tras las ocho horas de TTL absoluto de
 * una sesion de personal (DEC-006).
 */
export async function StaffSignInRequired({
  locale,
  returnPath,
}: {
  readonly locale: Locale;
  readonly returnPath: string;
}) {
  const t = await getTranslations({ locale, namespace: "admin.access" });
  const destination = adminHref(locale, returnPath);

  return (
    <AdminAccessFrame locale={locale}>
      <EmptyState
        headingLevel="h1"
        title={t("signInTitle")}
        description={t("signInBody")}
        action={
          <Link
            href={`${adminHref(locale, "/login")}?next=${encodeURIComponent(destination)}`}
            className={buttonVariants({ variant: "accent" })}
          >
            {t("signInCta")}
          </Link>
        }
      />
    </AdminAccessFrame>
  );
}

/**
 * Sesion valida, pero de PARTICIPANTE.
 *
 * OCURRE A DIARIO, no es un caso raro: la cookie del escaparate tiene `Path=/`,
 * asi que viaja tambien a `/admin`, y cualquiera que escriba la URL con su
 * sesion de cliente abierta cae aqui.
 *
 * Y LE PASA AL PROPIO DUENO (2026-10-31). Desde "Apartar" (0042), probar una
 * compra en el mismo navegador deja una sesion de cliente de un mes; cuando la
 * de personal caduca (ocho horas), el panel caia aqui y la unica salida era
 * "Volver a la tienda": el dueno no podia entrar a su propio panel. Por eso se
 * ofrece tambien ENTRAR COMO ADMINISTRADOR. El formulario de personal ya
 * aceptaba una sesion de cliente -esta en `/admin/<idioma>/login`, a la vista,
 * y es el sitio donde alguien con las dos cuentas entra con la de trabajo-,
 * asi que esconder el enlace no protegia nada: solo dejaba fuera al dueno. Los
 * intentos siguen limitados por el bloqueo de la cuenta y por el rate limit.
 */
export async function NotStaffNotice({
  locale,
  returnPath,
}: {
  readonly locale: Locale;
  /** Ruta INTERNA del panel a la que volver tras iniciar sesion. */
  readonly returnPath: string;
}) {
  const t = await getTranslations({ locale, namespace: "admin.access" });
  const destination = adminHref(locale, returnPath);

  return (
    <AdminAccessFrame locale={locale}>
      <EmptyState
        headingLevel="h1"
        title={t("notStaffTitle")}
        description={t("notStaffBody")}
        action={
          <div className="flex flex-col items-stretch gap-s3 sm:flex-row sm:justify-center">
            <Link
              href={`${adminHref(locale, "/login")}?next=${encodeURIComponent(destination)}`}
              className={buttonVariants({ variant: "accent" })}
            >
              {t("notStaffSignIn")}
            </Link>
            <Link href={`/${locale}`} className={buttonVariants({ variant: "secondary" })}>
              {t("backToStore")}
            </Link>
          </div>
        }
      />
    </AdminAccessFrame>
  );
}

/** La lectura de sesion fallo. Es un error, y se distingue de no tener sesion. */
export function AdminUnavailable({
  locale,
  failure,
}: {
  readonly locale: Locale;
  readonly failure: ApiFailure;
}) {
  return (
    <AdminAccessFrame locale={locale}>
      <ApiErrorState failure={failure} headingLevel="h1" />
    </AdminAccessFrame>
  );
}

/**
 * Falta la capacidad.
 *
 * Se dice CUAL falta, con su identificador tecnico. En el escaparate eso seria
 * inaceptable -una clave en pantalla delante de un cliente-, pero aqui el
 * identificador es exactamente lo que quien opera necesita para pedir el
 * permiso correcto a quien administra los roles, y lo que evita el ticket de
 * "no puedo entrar en una pantalla".
 */
export async function CapabilityDenied({
  locale,
  capability,
}: {
  readonly locale: Locale;
  readonly capability: AdminCapability;
}) {
  const t = await getTranslations({ locale, namespace: "admin.access" });

  return (
    <EmptyState
      headingLevel="h2"
      title={t("forbiddenTitle")}
      description={t("forbiddenBody", { capability })}
    />
  );
}
