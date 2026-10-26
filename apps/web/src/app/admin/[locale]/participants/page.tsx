import { Alert, Badge, EmptyState } from "@app/ui";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AdminChrome } from "@/components/admin/admin-chrome";
import { AdminPager } from "@/components/admin/admin-pager";
import { openAdminScreen } from "@/components/admin/admin-screen";
import { AdminSectionError } from "@/components/admin/admin-section-error";
import { ParticipantPasswordForm } from "@/components/admin/participant-password-form";
import {
  ResponsiveRecords,
  TABLE_NOWRAP_CLASS,
  type ResponsiveColumn,
} from "@/components/admin/responsive-records";
import { formatZonedDate } from "@/i18n/formatters";
import { isLocale } from "@/i18n/locales";
import { can } from "@/lib/admin/capabilities";
import { fetchAdminParticipants, fetchSiteConfig, type AdminParticipantRow } from "@/lib/api";
import { passwordMinimumFrom } from "@/lib/password-policy";

export const dynamic = "force-dynamic";

/**
 * Listado de participantes.
 *
 * EL PII SE ENMASCARA EN EL SERVIDOR, NO AQUI. `pii.view.masked` y
 * `pii.view.full` son dos capacidades distintas y quien decide cual aplica es
 * el backend, que manda el correo ya enmascarado si toca. Esta pantalla no tapa
 * nada al pintarlo: si lo hiciera, el dato completo estaria igualmente en el
 * HTML y en la respuesta de red, y el enmascarado seria decorativo.
 *
 * `pii_masked` viaja como DATO para que la pantalla pueda decir POR QUE se ve
 * un correo a medias. Sin ese campo, la fila parece corrupta y alguien acaba
 * abriendo un ticket por un control que funciona.
 *
 * NO HAY BOTON DE DESCALIFICAR. `participant.disqualify` existe en el contrato,
 * pero descalificar revierte participaciones y su ruta sigue en `PROPOSED`.
 * Ofrecer el boton antes de poder ejecutar la reversion con su confirmacion
 * completa y su motivo seria justo el atajo que esta interfaz evita en todas
 * las demas pantallas.
 *
 * SI HAY "CAMBIAR CONTRASENA" (plantilla). No existe recuperacion por correo:
 * quien olvida su contrasena la pide a la tienda y se le fija aqui, en su fila,
 * porque el panel no tiene ficha de participante. Solo con
 * `participant.password.reset`.
 *
 * EN EL TELEFONO, TARJETAS (`ResponsiveRecords`). Correo, nombre,
 * identificador, alta, avisos y contrasena eran seis columnas que en 390px
 * obligaban a arrastrar la tabla para llegar al boton de la contrasena. En la
 * tarjeta el identificador y la contrasena van a lo ancho: uno se copia entero
 * y la otra es un formulario. Sin `rowHref`: no hay ficha que abrir.
 */
export default async function AdminParticipantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const { cursor } = await searchParams;
  const t = await getTranslations({ locale, namespace: "admin.participants" });

  const screen = await openAdminScreen({
    locale,
    current: "participants",
    path: "/participants",
    title: t("title"),
    capability: "participant.list",
  });

  if (!screen.ok) return screen.node;

  const canSetPassword = can(screen.actor, "participant.password.reset");

  // El minimo de contrasena solo se pide si se va a pintar el formulario.
  const [result, configResult] = await Promise.all([
    fetchAdminParticipants(cursor === undefined ? {} : { cursor }, locale, screen.session),
    canSetPassword ? fetchSiteConfig(locale) : Promise.resolve(null),
  ]);

  const passwordMinimum = configResult === null ? null : passwordMinimumFrom(configResult);

  /*
   * SE PREGUNTA POR LA CAPACIDAD PARA DECIR ALGO DISTINTO, NO PARA ENSENAR ALGO
   * DISTINTO.
   *
   * Esta ruta enmascara SIEMPRE (seccion 11.7): quien tiene `pii.view.full` ve
   * exactamente lo mismo que quien no la tiene. Sin este aviso, esa persona
   * concluiria que su permiso no funciona; con el, sabe que el dato completo se
   * pide por otra via, una ficha cada vez, con motivo.
   *
   * La pantalla llego a decir lo contrario -"estas viendo datos personales
   * completos"- sobre una tabla enmascarada. Un aviso falso sobre PII es peor
   * que no tener aviso.
   */
  const hasFullPii = can(screen.actor, "pii.view.full");

  // La columna entera desaparece sin la capacidad: un formulario que
  // responderia 403 no se ofrece. En la tarjeta del telefono va a lo ancho.
  const passwordColumn: readonly ResponsiveColumn<AdminParticipantRow>[] = canSetPassword
    ? [
        {
          id: "password",
          header: t("columnPassword"),
          cardSpan: "full",
          cell: (row) => (
            <ParticipantPasswordForm
              locale={locale}
              participantId={row.id}
              minimumLength={passwordMinimum}
            />
          ),
        },
      ]
    : [];

  return (
    <AdminChrome
      locale={locale}
      actor={screen.actor}
      current="participants"
      title={t("title")}
      description={t("description")}
    >
      {!result.ok ? (
        <AdminSectionError failure={result.error} headingLevel="h2" />
      ) : (
        <div className="flex flex-col gap-s6">
          <Alert tone="info">{hasFullPii ? t("fullPiiNotice") : t("maskedPiiNotice")}</Alert>

          <ResponsiveRecords<AdminParticipantRow>
            caption={t("tableCaption")}
            scrollRegionLabel={t("tableCaption")}
            rows={result.data.items}
            rowKey={(row) => row.id}
            emptyState={
              <EmptyState headingLevel="h2" title={t("emptyTitle")} description={t("emptyBody")} />
            }
            columns={[
              {
                id: "email",
                header: t("columnEmail"),
                isRowHeader: true,
                /*
                 * CADENA VACIA NO ES UN HUECO: es una cuenta anonimizada, es
                 * decir "no hay correo". `a***@dominio` es "hay correo y esta
                 * oculto". Pintar las dos igual -o pintar la primera como una
                 * celda en blanco- convierte un dato en un fallo aparente.
                 */
                cell: (row) =>
                  row.email === "" ? (
                    <span className="text-text-muted">{t("anonymizedEmail")}</span>
                  ) : (
                    row.email
                  ),
              },
              {
                id: "name",
                header: t("columnName"),
                cell: (row) => row.display_name ?? t("noDisplayName"),
              },
              {
                id: "id",
                header: t("columnId"),
                cardSpan: "full",
                // El identificador se ensena ENTERO y monoespaciado: es lo que
                // se pega en el formulario de ajuste, y uno truncado no sirve.
                cell: (row) => <span className="break-all font-mono text-caption">{row.id}</span>,
              },
              {
                id: "createdAt",
                header: t("columnCreated"),
                // Mes corto y sin partir en la tabla: la fecha larga ocupaba
                // tres lineas.
                cell: (row) => (
                  <span className={TABLE_NOWRAP_CLASS}>
                    {formatZonedDate(row.created_at, locale, {
                      timeZone: "UTC",
                      dateStyle: "medium",
                    }) ?? ""}
                  </span>
                ),
              },
              {
                id: "flags",
                header: t("columnFlags"),
                cell: (row) => (
                  <span className="flex flex-wrap gap-1">
                    {row.disqualified ? (
                      <Badge tone="danger" size="sm" wrap>
                        {t("disqualified")}
                      </Badge>
                    ) : null}
                    {row.pii_masked ? (
                      <Badge tone="neutral" size="sm" wrap>
                        {t("masked")}
                      </Badge>
                    ) : null}
                  </span>
                ),
              },
              ...passwordColumn,
            ]}
          />

          <AdminPager
            locale={locale}
            path="/participants"
            nextCursor={result.data.next_cursor}
            hasItems={result.data.items.length > 0}
          />
        </div>
      )}
    </AdminChrome>
  );
}
