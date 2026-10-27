/**
 * Redireccion al dominio canonico con `www` (2026-10-27).
 *
 * Cuando el sitio se publica en `www.cliente.com`, el dominio raiz
 * `cliente.com` tambien apunta al servidor -tiene que hacerlo, o quien lo
 * escriba a mano veria un error de certificado- pero NO debe servir la pagina:
 * la cookie de sesion lleva `Domain=www.cliente.com` (`SESSION_COOKIE_DOMAIN`
 * sale de `SERVICE_FQDN_WEB`, que es el PRIMER dominio del servicio en
 * Coolify), asi que quien entrara sin `www` podria navegar pero no iniciar
 * sesion, y nada en los logs lo explicaria. Coolify tiene un ajuste de
 * redireccion www/no-www, pero no lo aplica a los dominios de un servicio de
 * docker-compose, asi que la hace la web.
 *
 * SOLO se redirige el dominio raiz del propio sitio, y solo cuando `SITE_URL`
 * lleva `www.`. Ningun otro host se toca: la sonda de salud entra por
 * `127.0.0.1`, y un dominio temporal o de pruebas tiene que seguir sirviendo
 * lo suyo. Un sitio publicado SIN `www` no redirige nada.
 */

/** Las variables de entorno que se leen; `process.env` o un objeto en los tests. */
type Env = Readonly<Record<string, string | undefined>>;

/** El host de `SITE_URL` si empieza por `www.`; si no, `null`. */
export function canonicalWwwHost(env: Env): string | null {
  const raw = env.SITE_URL ?? env.NEXT_PUBLIC_SITE_URL;
  if (raw === undefined || raw.trim() === "") return null;
  try {
    const host = new URL(raw.trim()).hostname.toLowerCase();
    return host.startsWith("www.") ? host : null;
  } catch {
    return null;
  }
}

/**
 * La URL a la que redirigir, o `null` si esta peticion no es del dominio raiz.
 *
 * `requestHost` es la cabecera `Host` tal cual (puede llevar puerto). La URL de
 * destino conserva ruta y consulta y fuerza `https:`: el dominio canonico solo
 * se sirve cifrado.
 */
export function canonicalRedirectUrl(env: Env, requestHost: string | null, url: URL): URL | null {
  const canonical = canonicalWwwHost(env);
  if (canonical === null || requestHost === null) return null;

  const host = requestHost.trim().toLowerCase().replace(/:\d+$/u, "");
  if (host !== canonical.slice("www.".length)) return null;

  const destination = new URL(url);
  destination.protocol = "https:";
  destination.host = canonical;
  return destination;
}
