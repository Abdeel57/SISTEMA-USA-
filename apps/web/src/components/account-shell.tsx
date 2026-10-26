import { buttonVariants, cn, EmptyState } from "@app/ui";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { isLocale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { isFeatureEnabled } from "@/lib/flags";
import { loadFeatureFlags } from "@/lib/flags-server";

import { PageTitle } from "./page-title";

/**
 * Cromo comun del portal del participante.
 *
 * Una sola navegacion para las cinco pantallas, y un solo sitio donde se decide
 * como se ve el estado "sin sesion". Que ese estado este aqui y no en cada
 * pagina es lo que impide que la sexta pantalla se lo invente distinto.
 */

const ACCOUNT_ROUTES = [
  { href: "/account", key: "overview" },
  { href: "/account/entries", key: "entries" },
  { href: "/account/orders", key: "orders" },
  { href: "/account/profile", key: "profile" },
] as const;

/**
 * La entrada de la via gratuita, DETRAS DE `amoe_enabled` (DEC-032).
 *
 * Se declara aparte y no dentro de `ACCOUNT_ROUTES` porque no es una seccion
 * mas: es una funcion que puede no existir. Con el flag apagado no se pinta -ni
 * como enlace gris, ni como "proximamente"-, porque anunciar un metodo gratuito
 * que no esta configurado es afirmar algo sobre las condiciones de
 * participacion (CLAUDE.md #1 y #2). Ocultar es aqui el estado deliberado.
 *
 * El flag se lee EN SERVIDOR, en la misma peticion que el render, que es lo que
 * DEC-013 exige. Es una lectura mas por pantalla del portal, y es el precio de
 * que la navegacion no anuncie lo que no existe.
 */
const AMOE_ROUTE = { href: "/account/amoe", key: "amoe" } as const;

/**
 * Navegacion del portal.
 *
 * `aria-current="page"` lo marca la pagina activa pasando su `href`. Se pasa en
 * vez de deducirlo con `usePathname` para que este componente siga siendo de
 * servidor: convertirlo en cliente por una marca de estado activo arrastraria
 * al navegador toda la navegacion de la cuenta.
 *
 * En movil es una tira con scroll horizontal PROPIO -no del documento- para que
 * las cuatro secciones quepan sin apilarse y sin empujar el ancho de la pagina.
 */
export async function AccountNav({ current }: { readonly current: string }) {
  const t = await getTranslations("account.nav");

  /*
   * El locale sale de la peticion y no de una prop, para no tener que tocar las
   * seis pantallas del portal por anadir una entrada. `getLocale()` devuelve el
   * que resolvio el middleware de i18n; si algun dia devolviera algo que no es
   * un locale soportado -no deberia-, se cae del lado seguro: sin flags leidos,
   * `amoe_enabled` toma su valor seguro, que es apagado.
   */
  const locale = await getLocale();
  const flags = isLocale(locale) ? await loadFeatureFlags(locale) : undefined;
  const showAmoe = flags !== undefined && isFeatureEnabled(flags, "amoe_enabled");

  const routes = showAmoe ? [...ACCOUNT_ROUTES, AMOE_ROUTE] : ACCOUNT_ROUTES;

  return (
    <nav aria-label={t("overview")} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max list-none items-center gap-1 border-b border-border pb-s2">
        {routes.map((route) => (
          <li key={route.href}>
            <Link
              href={route.href}
              {...(route.href === current ? { "aria-current": "page" as const } : {})}
              className={cn(
                "app-display inline-flex min-h-touch items-center whitespace-nowrap rounded-md px-3",
                "text-body-sm font-medium transition-colors duration-fast ease-standard",
                "outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
                route.href === current
                  ? "text-brand"
                  : "text-text-muted hover:bg-brand/10 hover:text-brand",
              )}
            >
              {t(route.key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Contenedor de una pantalla del portal: titulo, navegacion y contenido. */
export function AccountShell({
  title,
  current,
  children,
}: {
  readonly title: string;
  readonly current: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="app-container py-s10 pb-s16">
      <PageTitle>{title}</PageTitle>

      <div className="mt-s6">
        <AccountNav current={current} />
      </div>

      <div className="mt-s8">{children}</div>
    </div>
  );
}

/**
 * Estado "hace falta iniciar sesion".
 *
 * NO ES UN ERROR, y por eso es un `EmptyState` y no un `ErrorState`: no hay
 * nada roto. Es el estado normal de cualquier visitante que todavia no ha
 * entrado, y tambien el de quien vuelve una semana despues con la sesion
 * caducada.
 *
 * `returnPath` viaja hasta el formulario de inicio de sesion para poder
 * devolver a la persona exactamente a donde iba. Lo valida `returnPathFrom` en
 * la accion: sin esa validacion, el parametro convertiria la pantalla de
 * entrada en un redirector abierto.
 */
export async function SignInRequired({ returnPath }: { readonly returnPath: string }) {
  const t = await getTranslations("account.signInRequired");
  const query = `?next=${encodeURIComponent(returnPath)}`;

  return (
    <EmptyState
      headingLevel="h2"
      title={t("title")}
      description={t("body")}
      action={
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/account/login${query}`} className={buttonVariants({ variant: "accent" })}>
            {t("signIn")}
          </Link>
          <Link
            href={`/account/register${query}`}
            className={buttonVariants({ variant: "secondary" })}
          >
            {t("register")}
          </Link>
        </div>
      }
    />
  );
}
