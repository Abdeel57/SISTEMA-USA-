import { Alert, Badge, buttonVariants, Card, CardTitle, cn, EmptyState } from "@app/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AdjustmentDraftForm } from "@/components/admin/adjustment-draft-form";
import { AdminChrome } from "@/components/admin/admin-chrome";
import { AdminPager } from "@/components/admin/admin-pager";
import { openAdminScreen } from "@/components/admin/admin-screen";
import { SensitiveConfirmForm } from "@/components/admin/sensitive-confirm";
import { AdminSectionError } from "@/components/admin/admin-section-error";
import { adminHref } from "@/i18n/admin-routing";
import {
  adjustmentStatusLabeller,
  formatSignedEntries,
  reasonLabeller,
  warningLabeller,
} from "@/i18n/admin-labels";
import { formatEntryCount, formatZonedDateTime } from "@/i18n/formatters";
import { isLocale, type Locale } from "@/i18n/locales";
import { approveAdjustmentAction, createAdjustmentAction } from "@/lib/admin/actions";
import { can } from "@/lib/admin/capabilities";
import { ADJUSTMENT_APPROVAL_REASONS, ADJUSTMENT_REASONS } from "@/lib/admin/reason-codes";
import {
  ADJUSTMENT_DIRECTIONS,
  fetchAdminAdjustments,
  previewAdjustment,
  type AdminAdjustment,
  type SessionContext,
} from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Ajustes manuales de participaciones.
 *
 * DOS CAPACIDADES, UNA PANTALLA
 * -----------------------------
 * `entry.adjust.create` crea; `entry.adjust.approve` aprueba los pendientes.
 * La pantalla es la misma porque el expediente es el mismo.
 *
 * PLANTILLA: UN SOLO ADMINISTRADOR
 * --------------------------------
 * `dual_approval_for_sensitive_actions_enabled` arranca apagado, asi que el
 * ajuste se aplica al crearlo y la cola de pendientes suele estar vacia. Si
 * alguien enciende el flag, el ajuste nace pendiente y el mismo administrador
 * puede aprobarlo: aprobar lo propio esta permitido.
 *
 * NINGUNA CIFRA SALE DE ESTA PANTALLA
 * -----------------------------------
 * El "despues" de la confirmacion lo produce
 * `POST /admin/entry-adjustments/preview`. Sumar el delta al saldo aqui seria
 * una segunda implementacion del motor de participaciones viviendo en la
 * interfaz (DEC-023, requisito R13), que es lo que la red
 * `no-client-entry-math.test.ts` detecta.
 */
export default async function AdminAdjustmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    cursor?: string;
    participant_id?: string;
    promotion_id?: string;
    direction?: string;
    quantity?: string;
    approve?: string;
  }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const query = await searchParams;
  const t = await getTranslations({ locale, namespace: "admin.adjustments" });

  const screen = await openAdminScreen({
    locale,
    current: "adjustments",
    path: "/adjustments",
    title: t("title"),
    /*
     * Sin capacidad de pantalla: al expediente entran DOS capacidades
     * distintas, y exigir una sola aqui dejaria fuera a la mitad de quienes
     * tienen que trabajar en el. La comprobacion se hace justo debajo, contra
     * las dos, y se explica en pantalla si no se tiene ninguna.
     */
    capability: null,
  });

  if (!screen.ok) return screen.node;

  const canCreate = can(screen.actor, "entry.adjust.create");
  const canApprove = can(screen.actor, "entry.adjust.approve");

  if (!canCreate && !canApprove) {
    return (
      <AdminChrome locale={locale} actor={screen.actor} current="adjustments" title={t("title")}>
        <EmptyState headingLevel="h2" title={t("noAccessTitle")} description={t("noAccessBody")} />
      </AdminChrome>
    );
  }

  const queue = await fetchAdminAdjustments(
    {
      status: "PENDING_APPROVAL",
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    },
    locale,
    screen.session,
  );

  const pendingApproval =
    queue.ok && query.approve !== undefined
      ? (queue.data.items.find((item) => item.id === query.approve) ?? null)
      : null;

  return (
    <AdminChrome
      locale={locale}
      actor={screen.actor}
      current="adjustments"
      title={t("title")}
      description={t("description")}
    >
      <div className="flex flex-col gap-s8">
        {pendingApproval === null ? null : (
          <ApprovalPanel locale={locale} adjustment={pendingApproval} canApprove={canApprove} />
        )}

        {canCreate ? (
          <ProposalSection locale={locale} session={screen.session} query={query} />
        ) : null}

        <section aria-labelledby="adjustments-queue">
          <h2 id="adjustments-queue" className="app-display text-heading-lg text-text">
            {t("queueHeading")}
          </h2>

          <div className="mt-s4">
            {!queue.ok ? (
              <AdminSectionError failure={queue.error} headingLevel="h3" />
            ) : queue.data.items.length === 0 ? (
              <EmptyState
                headingLevel="h3"
                title={t("queueEmptyTitle")}
                description={t("queueEmptyBody")}
              />
            ) : (
              <ul className="flex list-none flex-col gap-s4">
                {queue.data.items.map((item) => (
                  <li key={item.id}>
                    <QueueRow adjustment={item} locale={locale} canApprove={canApprove} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {queue.ok ? (
            <div className="mt-s6">
              <AdminPager
                locale={locale}
                path="/adjustments"
                nextCursor={queue.data.next_cursor}
                hasItems={queue.data.items.length > 0}
              />
            </div>
          ) : null}
        </section>
      </div>
    </AdminChrome>
  );
}

/**
 * Propuesta: formulario de cuatro campos -participante, promocion, sentido y
 * cantidad- y, si la URL los trae, la previsualizacion con su confirmacion.
 */
async function ProposalSection({
  locale,
  session,
  query,
}: {
  readonly locale: Locale;
  readonly session: SessionContext;
  readonly query: {
    participant_id?: string;
    promotion_id?: string;
    direction?: string;
    quantity?: string;
  };
}) {
  const t = await getTranslations({ locale, namespace: "admin.adjustments" });
  const reasonLabel = await reasonLabeller(locale);
  const warningLabel = await warningLabeller(locale);

  const participantId = query.participant_id;
  const promotionId = query.promotion_id;

  /*
   * SENTIDO Y CANTIDAD, tal como los pide la API. La interfaz no traduce un
   * signo a un sentido ni al reves: `direction` se compara contra la lista del
   * contrato y `quantity` tiene que ser un entero positivo. Las dos son
   * comprobaciones de FORMA -que la URL sea legible-, no reglas de negocio; si
   * el ajuste es posible lo contesta la previsualizacion.
   */
  const direction = ADJUSTMENT_DIRECTIONS.find((value) => value === query.direction) ?? null;

  const rawQuantity = query.quantity;
  const parsed = rawQuantity === undefined ? Number.NaN : Number.parseInt(rawQuantity, 10);
  const quantity = Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;

  const draftStarted = query.direction !== undefined || rawQuantity !== undefined;

  const draftUsable =
    participantId !== undefined &&
    promotionId !== undefined &&
    direction !== null &&
    quantity !== null;

  const preview = draftUsable
    ? await previewAdjustment(
        { participant_id: participantId, promotion_id: promotionId, direction, quantity },
        locale,
        session,
      )
    : null;

  return (
    <section aria-labelledby="adjustments-new" className="flex flex-col gap-s5">
      <h2 id="adjustments-new" className="app-display text-heading-lg text-text">
        {t("newHeading")}
      </h2>

      <AdjustmentDraftForm locale={locale} defaultPromotionId={promotionId ?? null} />

      {draftStarted && !draftUsable ? <Alert tone="danger">{t("draftInvalid")}</Alert> : null}

      {preview === null ? null : !preview.ok ? (
        /*
         * UN 404 AQUI NO ES UNA AVERIA. Con `manual_adjustments_enabled`
         * apagado la ruta responde 404 -igual que crear-: la funcion no existe
         * para nadie, y un 403 sugeriria que existe y que a este operador no se
         * le deja usarla. Se pinta como ausencia deliberada, que es la
         * diferencia entre "esto no esta encendido" y "esto esta roto".
         */
        preview.error.status === 404 ? (
          <Alert tone="info" title={t("previewUnavailableTitle")}>
            {t("previewUnavailableBody")}
          </Alert>
        ) : (
          <AdminSectionError failure={preview.error} headingLevel="h3" />
        )
      ) : (
        <Card elevation="raised" padding="lg">
          <CardTitle as="h3" size="sm">
            {t("confirmTitle")}
          </CardTitle>

          <p className="mt-s2 text-body-sm text-text-muted">
            {/*
             * El participante sale de la URL y no de la respuesta: la
             * previsualizacion contesta CIFRAS -antes, cambio, despues- y no
             * repite el identificador con el que se pregunto. Es el mismo que
             * viaja en los campos ocultos, asi que lo que se lee y lo que se
             * firma no pueden separarse.
             */}
            {t("confirmBody", { participant: participantId ?? "" })}
          </p>

          {preview.data.requires_second_approval ? (
            <Alert tone="info" className="mt-s4">
              {t("secondApprovalNotice")}
            </Alert>
          ) : null}

          <div className="mt-s5">
            <SensitiveConfirmForm
              locale={locale}
              action={createAdjustmentAction}
              /*
               * Se firma EXACTAMENTE lo que se previsualizo: los mismos cuatro
               * datos que produjeron la tabla. No se reenvia `proposed_delta`
               * -la API pide sentido y cantidad- ni se reconstruye ninguno de
               * los dos a partir del otro.
               */
              hiddenFields={{
                participant_id: participantId ?? "",
                promotion_id: promotionId ?? "",
                direction: direction ?? "",
                quantity: String(quantity ?? ""),
              }}
              impact={[
                {
                  label: t("impactEntries"),
                  before: formatEntryCount(preview.data.before, locale),
                  delta: formatSignedEntries(preview.data.proposed_delta, (value) =>
                    formatEntryCount(value, locale),
                  ),
                  after: formatEntryCount(preview.data.after, locale),
                },
              ]}
              /*
               * LA HORA DEL SALDO. Un saldo es una foto: entre esta lectura y la
               * firma puede entrar una compra o una descalificacion, y sin el
               * instante una pantalla abierta media hora parece hablar del
               * presente.
               */
              balanceAsOf={
                formatZonedDateTime(preview.data.as_of, locale, {
                  timeZone: "UTC",
                  showTimeZoneName: true,
                }) ?? preview.data.as_of
              }
              /*
               * `would_make_balance_negative` lo contesta LA MISMA funcion que
               * rechaza el ajuste al aplicarlo, no una reimplementacion. Si
               * llega encendido no se ofrece la firma: no es el control -el
               * backend rechaza igual- pero evita hacer leer, motivar y
               * confirmar algo que ya se sabe que va a fallar.
               */
              {...(preview.data.would_make_balance_negative
                ? { blockedReason: warningLabel("BALANCE_WOULD_GO_NEGATIVE") }
                : {})}
              reasons={ADJUSTMENT_REASONS.map((key) => ({ value: key, label: reasonLabel(key) }))}
              submitLabel={t("proposeSubmit")}
              confirmLabel={t("proposeConfirm")}
              destructive={direction === "DEBIT"}
            />
          </div>
        </Card>
      )}
    </section>
  );
}

/**
 * Panel de aprobacion de un ajuste pendiente.
 *
 * Plantilla: se ofrece tambien sobre el ajuste propio. Con un solo
 * administrador no hay nadie mas que pueda aprobarlo.
 */
async function ApprovalPanel({
  locale,
  adjustment,
  canApprove,
}: {
  readonly locale: Locale;
  readonly adjustment: AdminAdjustment;
  readonly canApprove: boolean;
}) {
  const t = await getTranslations({ locale, namespace: "admin.adjustments" });
  const reasonLabel = await reasonLabeller(locale);

  return (
    <Card elevation="raised" padding="lg">
      <CardTitle as="h2" size="sm">
        {t("approveTitle")}
      </CardTitle>

      <dl className="mt-s4 grid grid-cols-1 gap-s3 sm:grid-cols-2">
        <div>
          <dt className="text-caption uppercase tracking-wide text-text-subtle">
            {t("proposedBy")}
          </dt>
          <dd className="text-body-sm text-text">{adjustment.created_by_actor_email}</dd>
        </div>

        <div>
          <dt className="text-caption uppercase tracking-wide text-text-subtle">
            {t("participantLabel")}
          </dt>
          <dd className="text-body-sm text-text">{adjustment.participant_email}</dd>
        </div>

        <div>
          <dt className="text-caption uppercase tracking-wide text-text-subtle">
            {t("reasonGiven")}
          </dt>
          <dd className="text-body-sm text-text">{reasonLabel(adjustment.reason_key)}</dd>
        </div>

        <div>
          <dt className="text-caption uppercase tracking-wide text-text-subtle">
            {t("proposedAt")}
          </dt>
          <dd className="text-body-sm text-text">
            {formatZonedDateTime(adjustment.created_at, locale, { timeZone: "UTC" }) ?? ""}
          </dd>
        </div>
      </dl>

      {adjustment.reason_note === null ? null : (
        <p className="mt-s4 whitespace-pre-line rounded-md border border-border bg-surface-sunken p-3 text-body-sm text-text-muted">
          {adjustment.reason_note}
        </p>
      )}

      <div className="mt-s6">
        {!canApprove ? (
          <EmptyState
            headingLevel="h3"
            title={t("cannotApproveTitle")}
            description={t("cannotApproveBody")}
          />
        ) : (
          <SensitiveConfirmForm
            locale={locale}
            action={approveAdjustmentAction}
            hiddenFields={{ adjustment_id: adjustment.id }}
            impact={[
              {
                label: t("impactEntries"),
                /*
                 * El saldo del participante NO se pide aqui: la cola no lo trae
                 * y el panel no tiene endpoint de saldo por participante. Se
                 * ensena lo que si es cierto -el delta propuesto- y el "antes" y
                 * el "despues" quedan marcados como no publicados, en vez de
                 * calcularlos, que es lo prohibido. Queda como peticion abierta.
                 */
                before: t("balanceNotPublished"),
                delta: formatSignedEntries(adjustment.quantity_delta, (value) =>
                  formatEntryCount(value, locale),
                ),
                after: null,
              },
            ]}
            reasons={ADJUSTMENT_APPROVAL_REASONS.map((key) => ({
              value: key,
              label: reasonLabel(key),
            }))}
            submitLabel={t("approveSubmit")}
            confirmLabel={t("approveConfirm")}
          />
        )}
      </div>

      <div className="mt-s5">
        <Link
          href={adminHref(locale, "/adjustments")}
          className={buttonVariants({ variant: "ghost" })}
        >
          {t("cancel")}
        </Link>
      </div>
    </Card>
  );
}

/** Fila de la cola de aprobacion. */
async function QueueRow({
  adjustment,
  locale,
  canApprove,
}: {
  readonly adjustment: AdminAdjustment;
  readonly locale: Locale;
  readonly canApprove: boolean;
}) {
  const t = await getTranslations({ locale, namespace: "admin.adjustments" });
  const statusLabel = await adjustmentStatusLabeller(locale);

  return (
    <Card elevation="flat" padding="md">
      <div className="flex flex-col gap-s3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="break-words text-body-md text-text">{adjustment.participant_email}</p>
          <p className="mt-s1 text-body-sm font-semibold tabular-nums text-text">
            {formatSignedEntries(adjustment.quantity_delta, (value) =>
              formatEntryCount(value, locale),
            )}
          </p>
        </div>

        {/* La insignia arriba y "Revisar" de 44px debajo, a lo ancho en el
            telefono: es lo unico que se hace con esta fila. */}
        <div className="flex flex-col gap-s3 sm:flex-row sm:items-center">
          <Badge tone="warning" size="sm" wrap className="self-start sm:self-auto">
            {statusLabel(adjustment.status)}
          </Badge>

          {canApprove ? (
            <Link
              href={`${adminHref(locale, "/adjustments")}?approve=${encodeURIComponent(adjustment.id)}`}
              className={cn(buttonVariants({ variant: "secondary" }), "w-full sm:w-auto")}
            >
              {t("reviewCta")}
            </Link>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
