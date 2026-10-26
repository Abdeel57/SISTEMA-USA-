import { Button, cn } from "@app/ui";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { adminHref } from "@/i18n/admin-routing";
import type { Locale } from "@/i18n/locales";
import { staffLogoutAction } from "@/lib/admin/actions";
import type { AdminActor } from "@/lib/admin/capabilities";
import {
  ADMIN_QUICK_NAV,
  groupedNavFor,
  quickNavFor,
  type AdminScreenKey,
} from "@/lib/admin/navigation";

import { AdminLanguageSwitcher } from "./admin-language-switcher";
import { AdminMoreMenu } from "./admin-more-menu";
import { AdminIcon } from "./admin-nav-icons";

/**
 * Cromo del panel: cabecera, navegacion por capacidad y contenedor.
 *
 * UN SOLO SITIO DONDE SE DECIDE QUE VE CADA ACTOR
 * -----------------------------------------------
 * La navegacion se deriva de `visibleNavFor(actor)` (via `groupedNavFor` y
 * `quickNavFor`), que consulta capacidades y no roles. Ninguna pantalla pinta
 * su propio menu, y por eso no puede existir una que ensene un enlace que las
 * demas ocultan.
 *
 * Ocultar NO es autorizar: quien escriba la URL llega igual y recibe el 403 del
 * backend, pintado como estado deliberado. Esto existe para no mandar a nadie a
 * una puerta cerrada.
 *
 * PANEL CLARO Y PENSADO PARA LOS DOS TAMANOS
 * ------------------------------------------
 * El panel es blanco (los tokens los pone `adminThemeCss` en el layout) y su
 * menu cambia de forma, no solo de ancho:
 *
 *   - en la computadora, una columna fija a la izquierda con las secciones
 *     AGRUPADAS por lo que se viene a hacer, cada una con su icono;
 *   - en el telefono y la tableta, una barra fija abajo -al alcance del pulgar-
 *     con lo que se abre a diario (Inicio, Pedidos, Corte, Catalogo) y un
 *     "Mas" que abre el menu completo, el idioma y la sesion.
 *
 * Antes el telefono tenia una tira de catorce secciones con scroll horizontal
 * escondido: la mitad del menu no se veia y no habia nada que dijera que
 * existia.
 */

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

/**
 * Boton de cierre de sesion.
 *
 * Es un `<form>` con Server Action y no un enlace: cerrar sesion CAMBIA estado
 * en el servidor -revoca la fila de sesion- y un `GET` que muta se dispara con
 * un prefetch del navegador o con la primera extension que precargue enlaces.
 */
function AdminLogout({
  locale,
  label,
  fullWidth = false,
}: {
  readonly locale: Locale;
  readonly label: string;
  readonly fullWidth?: boolean;
}) {
  return (
    <form action={staffLogoutAction} className={cn(fullWidth && "w-full")}>
      <input type="hidden" name="locale" value={locale} />
      <Button
        type="submit"
        variant="secondary"
        size={fullWidth ? "md" : "sm"}
        fullWidth={fullWidth}
        iconStart={<AdminIcon name="signOut" className="h-4 w-4 shrink-0" />}
      >
        {label}
      </Button>
    </form>
  );
}

/**
 * El menu completo, agrupado. Lo usan la columna de la computadora y el panel
 * "Mas" del telefono: es UNA lista, pintada en dos sitios.
 */
async function AdminNavGroups({
  actor,
  locale,
  current,
  touch,
}: {
  readonly actor: AdminActor;
  readonly locale: Locale;
  readonly current: AdminScreenKey;
  /** En el telefono cada fila mide 48px; en la computadora, 40px. */
  readonly touch: boolean;
}) {
  const t = await getTranslations({ locale, namespace: "admin" });
  const groups = groupedNavFor(actor);

  return (
    <nav aria-label={t("nav.label")}>
      <div className="flex flex-col gap-s5">
        {groups.map(({ group, items }) => (
          // El rotulo del grupo es texto y no un `<h2>`: en la computadora el
          // menu va ANTES que el titulo de la pagina, y un `<h2>` delante del
          // `<h1>` desordena el indice de titulos que recorre un lector de
          // pantalla. El grupo se anuncia igual, por `aria-labelledby`.
          <section key={group} aria-labelledby={`admin-nav-${group}-${touch ? "m" : "d"}`}>
            <p
              id={`admin-nav-${group}-${touch ? "m" : "d"}`}
              className="mb-s1 px-3 text-caption font-semibold uppercase tracking-wide text-text-subtle"
            >
              {t(`navGroups.${group}`)}
            </p>

            <ul className="flex list-none flex-col gap-0.5">
              {items.map((item) => {
                const isCurrent = item.key === current;

                return (
                  <li key={item.key}>
                    <Link
                      href={adminHref(locale, item.path)}
                      {...(isCurrent ? { "aria-current": "page" as const } : {})}
                      className={cn(
                        "relative flex w-full items-center gap-3 rounded-lg px-3",
                        touch ? "min-h-12 text-body-md" : "min-h-10 text-body-sm",
                        "font-medium transition-colors duration-fast ease-standard",
                        FOCUS_RING,
                        isCurrent
                          ? "bg-brand-subtle font-semibold text-brand"
                          : "text-text-muted hover:bg-surface-sunken hover:text-text",
                      )}
                    >
                      {/* La raya de la izquierda: el activo no depende solo del color. */}
                      {isCurrent ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-2 left-0 w-1 rounded-full bg-brand"
                        />
                      ) : null}
                      <AdminIcon name={item.key} />
                      <span className="min-w-0 truncate">{t(`nav.${item.key}`)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </nav>
  );
}

/**
 * La barra inferior del telefono y la tableta.
 *
 * Cuatro accesos directos y "Mas". Cada boton ocupa una quinta parte del ancho
 * y 56px de alto (mas que los 44px minimos: es la zona del pulgar), con icono y
 * una palabra. Se queda fija abajo y respeta el indicador de inicio del iPhone.
 */
async function AdminBottomBar({
  actor,
  locale,
  current,
}: {
  readonly actor: AdminActor;
  readonly locale: Locale;
  readonly current: AdminScreenKey;
}) {
  const t = await getTranslations({ locale, namespace: "admin" });
  const quick = quickNavFor(actor);
  const currentIsQuick = (ADMIN_QUICK_NAV as readonly string[]).includes(current);

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-surface/95 backdrop-blur",
        "pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_-8px_rgb(15_23_42/0.18)]",
        "lg:hidden print:hidden",
      )}
    >
      <nav aria-label={t("chrome.quickNav")}>
        <ul className="mx-auto flex h-14 max-w-xl list-none items-stretch">
          {quick.map((item) => {
            const isCurrent = item.key === current;

            return (
              <li key={item.key} className="min-w-0 flex-1">
                <Link
                  href={adminHref(locale, item.path)}
                  {...(isCurrent ? { "aria-current": "page" as const } : {})}
                  className={cn(
                    "relative flex h-full w-full flex-col items-center justify-center gap-0.5 px-1",
                    "text-[0.6875rem] font-semibold leading-tight",
                    "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus",
                    isCurrent ? "text-brand" : "text-text-muted",
                  )}
                >
                  {isCurrent ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-brand"
                    />
                  ) : null}
                  <AdminIcon name={item.key} className="h-6 w-6 shrink-0" />
                  <span className="max-w-full truncate">
                    {t(`navShort.${item.key as (typeof ADMIN_QUICK_NAV)[number]}`)}
                  </span>
                </Link>
              </li>
            );
          })}

          <li className="min-w-0 flex-1">
            <AdminMoreMenu
              label={t("chrome.more")}
              title={t("chrome.moreTitle")}
              closeLabel={t("chrome.close")}
              icon={<AdminIcon name="more" className="h-6 w-6 shrink-0" />}
              active={!currentIsQuick}
            >
              <div className="flex flex-col gap-s6">
                <AdminNavGroups actor={actor} locale={locale} current={current} touch />

                <section
                  aria-labelledby="admin-more-account"
                  className="flex flex-col gap-s3 border-t border-border pt-s5"
                >
                  <p
                    id="admin-more-account"
                    className="px-1 text-caption font-semibold uppercase tracking-wide text-text-subtle"
                  >
                    {t("chrome.account")}
                  </p>

                  <p className="px-1 text-body-sm text-text-muted">
                    {t("chrome.signedInAs")}{" "}
                    <span className="break-all font-semibold text-text">{actor.email}</span>
                  </p>

                  <Link
                    href={adminHref(locale, "/account")}
                    {...(current === "account" ? { "aria-current": "page" as const } : {})}
                    className={cn(
                      "flex min-h-touch items-center gap-3 rounded-lg px-3 text-body-md font-medium",
                      current === "account"
                        ? "bg-brand-subtle font-semibold text-brand"
                        : "text-text-muted hover:bg-surface-sunken hover:text-text",
                      FOCUS_RING,
                    )}
                  >
                    <AdminIcon name="account" />
                    {t("chrome.myAccount")}
                  </Link>

                  <AdminLanguageSwitcher locale={locale} size="lg" />

                  <Link
                    href={`/${locale}`}
                    className={cn(
                      "flex min-h-touch items-center gap-3 rounded-lg px-3 text-body-md font-medium text-text-muted hover:bg-surface-sunken hover:text-text",
                      FOCUS_RING,
                    )}
                  >
                    <AdminIcon name="store" />
                    {t("chrome.viewStore")}
                  </Link>

                  <AdminLogout locale={locale} label={t("chrome.signOut")} fullWidth />
                </section>
              </div>
            </AdminMoreMenu>
          </li>
        </ul>
      </nav>
    </div>
  );
}

/**
 * Cabecera del panel.
 *
 * Se usa TAMBIEN en las pantallas sin sesion -el login-, sin identidad ni
 * navegacion: la marca y el idioma tienen que estar ahi antes de
 * entrar, y una pantalla de acceso sin conmutador de idioma deja fuera a la
 * mitad del personal.
 *
 * Con sesion, en el telefono la cabecera solo lleva la marca: el idioma, la
 * cuenta y el boton de salir viven en "Mas", donde hay sitio para ellos.
 */
async function AdminHeader({
  locale,
  actor,
}: {
  readonly locale: Locale;
  readonly actor: AdminActor | null;
}) {
  const t = await getTranslations({ locale, namespace: "admin.chrome" });

  return (
    // `print:hidden`: un informe impreso del panel (el corte de caja, DEC-085) no
    // lleva marca, idioma ni boton de salir.
    <header className="sticky top-0 z-sticky border-b border-border bg-surface/95 backdrop-blur print:hidden">
      <div className="app-container flex h-14 items-center justify-between gap-s4 lg:h-16">
        <div className="flex min-w-0 items-center gap-s3">
          <Link
            href={adminHref(locale)}
            className={cn(
              "min-w-0 truncate rounded-sm text-heading-sm font-bold tracking-tight text-text",
              FOCUS_RING,
            )}
          >
            {t("brand")}
          </Link>

          <span className="shrink-0 rounded-md bg-brand-subtle px-2 py-0.5 text-caption font-semibold text-brand">
            {t("panelLabel")}
          </span>
        </div>

        <div
          className={cn(
            "flex items-center gap-s3",
            // Con sesion, el telefono lo encuentra todo en "Mas".
            actor !== null && "hidden lg:flex",
          )}
        >
          {actor === null ? null : (
            <Link
              href={`/${locale}`}
              className={cn(
                "inline-flex min-h-9 items-center gap-2 rounded-md px-2 text-body-sm font-medium text-text-muted hover:text-text",
                FOCUS_RING,
              )}
            >
              <AdminIcon name="store" className="h-4 w-4 shrink-0" />
              {t("viewStore")}
            </Link>
          )}

          <AdminLanguageSwitcher locale={locale} />

          {actor === null ? null : (
            <>
              {/* El correo lleva a Mi cuenta, donde se cambia la contrasena. */}
              <Link
                href={adminHref(locale, "/account")}
                title={t("myAccount")}
                className={cn(
                  "inline-flex min-h-9 max-w-[18rem] items-center gap-2 rounded-md px-2 text-body-sm text-text-muted hover:text-text",
                  FOCUS_RING,
                )}
              >
                <AdminIcon name="account" className="h-4 w-4 shrink-0" />
                <span className="truncate">{actor.email}</span>
              </Link>
              <AdminLogout locale={locale} label={t("signOut")} />
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * Contenedor de una pantalla del panel CON sesion.
 *
 * `title` y `description` llegan ya traducidos: este componente no resuelve
 * copy de la pantalla que envuelve, porque entonces tendria que conocer todas.
 */
export async function AdminChrome({
  locale,
  actor,
  current,
  title,
  description,
  actions,
  children,
}: {
  readonly locale: Locale;
  readonly actor: AdminActor;
  readonly current: AdminScreenKey;
  readonly title: string;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: "admin.chrome" });

  return (
    <>
      <AdminHeader locale={locale} actor={actor} />

      <div className="app-container flex flex-1 gap-s8 py-s5 lg:py-s8">
        <aside className="hidden w-60 shrink-0 lg:block print:hidden">
          {/* Fija bajo la cabecera y con scroll propio si no cabe. */}
          <div className="sticky top-24 max-h-[calc(100svh_-_7rem)] overflow-y-auto pb-s4">
            <AdminNavGroups actor={actor} locale={locale} current={current} touch={false} />
          </div>
        </aside>

        <main
          id="admin-main"
          aria-label={t("mainLandmark")}
          // Abajo, el hueco de la barra inferior del telefono (56px + el borde
          // del iPhone), para que el final de la pagina no quede tapado.
          className="min-w-0 flex-1 pb-[calc(5.5rem_+_env(safe-area-inset-bottom))] lg:pb-s12 print:pb-0"
        >
          <div className="flex flex-wrap items-end justify-between gap-s4">
            <div className="min-w-0">
              <h1 className="text-heading-lg font-bold tracking-tight text-text">{title}</h1>
              {description === undefined ? null : (
                <p className="mt-s1 max-w-prose text-body-md text-text-muted">{description}</p>
              )}
            </div>

            {actions === undefined ? null : (
              <div className="flex flex-wrap items-center gap-s3">{actions}</div>
            )}
          </div>

          {/*
           * AVISO DE CAPACIDADES PROVISIONALES.
           *
           * Mientras el backend no publique `capabilities` en `SessionState`, el
           * panel las deriva de un espejo local de la matriz de
           * `packages/security`. Eso puede desincronizarse, y el sintoma seria
           * un enlace visible que responde 403 -o, peor, uno ausente que si
           * estaba permitido-. Se dice en pantalla en vez de dejarlo en un
           * comentario: quien opera tiene que saber que lo que ve es una
           * aproximacion.
           */}
          {actor.capabilitiesPublished ? null : (
            <p className="mt-s4 rounded-lg border border-warning/40 bg-warning-subtle px-3 py-2 text-body-sm text-text">
              {t("provisionalCapabilities")}
            </p>
          )}

          <div className="mt-s6">{children}</div>
        </main>
      </div>

      <AdminBottomBar actor={actor} locale={locale} current={current} />
    </>
  );
}

/**
 * Contenedor de una pantalla del panel SIN sesion utilizable.
 *
 * Login, sesion de participante y error de lectura comparten
 * este marco: sin navegacion -no hay a donde navegar- y centrado, porque lo
 * unico que hay en pantalla es una accion.
 */
export async function AdminAccessFrame({
  locale,
  children,
}: {
  readonly locale: Locale;
  readonly children: ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: "admin.chrome" });

  return (
    <>
      <AdminHeader locale={locale} actor={null} />

      <main
        id="admin-main"
        aria-label={t("mainLandmark")}
        className="app-container flex flex-1 items-start justify-center py-s10 pb-s16"
      >
        <div className="w-full max-w-md">{children}</div>
      </main>
    </>
  );
}
