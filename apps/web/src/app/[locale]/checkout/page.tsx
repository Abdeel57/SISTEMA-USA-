import { buttonVariants, Card, CardTitle, EmptyState } from "@app/ui";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SignInRequired } from "@/components/account-shell";
import { ApiErrorState } from "@/components/api-error-state";
import { CartTotals } from "@/components/cart-totals";
import { CheckoutForm } from "@/components/checkout-form";
import { EligibilityDeclarationForm } from "@/components/eligibility-declaration-form";
import { EntryQuotePanel } from "@/components/entry-quote-panel";
import type { CashDeliveryOptions } from "@/components/fulfillment-choice";
import { PageTitle } from "@/components/page-title";
import { ReserveForm } from "@/components/reserve-form";
import { formatMoney } from "@/i18n/formatters";
import { localeTag, type Locale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import {
  fetchActivePromotion,
  fetchCart,
  fetchMyEligibility,
  fetchSiteConfig,
  pickLocalized,
  type CartWithQuote,
  type PaymentMethod,
  type SiteConfigResponse,
} from "@/lib/api";
import { DEFAULT_DIAL_COUNTRY, dialOptions } from "@/lib/dial-codes";
import { isFeatureEnabled, toFeatureFlags } from "@/lib/flags";
import { loadParticipant } from "@/lib/participant-server";
import { readSession } from "@/lib/session-server";

/** Un checkout es de una sesion concreta: nunca se prerenderiza. */
export const dynamic = "force-dynamic";

/**
 * Checkout.
 *
 * TRES COMPROBACIONES ANTES DE ENSENAR EL FORMULARIO, y las tres son estados de
 * pantalla y no errores:
 *
 * 1. Sin sesion -> se pide la cuenta (crearla o iniciarla), con vuelta a esta
 *    misma pagina. Un pedido pertenece a una cuenta. DEC-079: el visitante ve a
 *    la vez su carrito y su total, y al volver el carrito ya es de la cuenta.
 * 2. Con el carrito vacio -> se dice, y se enlaza a la tienda. Ensenar un
 *    formulario de direccion para cobrar cero es peor que decirlo.
 * 3. Si el carrito no se puede leer -> el estado de error con su referencia.
 *
 * LA COTIZACION SE ENSENA Y SE ETIQUETA COMO ORIENTATIVA
 * ------------------------------------------------------
 * La cifra que se ve aqui la calculo el backend sobre el carrito de servidor, y
 * sigue siendo informativa hasta que la orden alcance el estado que las
 * Official Rules definan como cualificante. Esta pagina no la recalcula, no la
 * confirma y no promete que vaya a mantenerse: eso lo decide el backend cuando
 * llegue la confirmacion del pago.
 */
export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("checkout");
  const tEligibility = await getTranslations("eligibility");

  // 0042: si la tienda solo cobra por Zelle o Venmo, no se pide cuenta: se
  // aparta el pedido con el WhatsApp y el nombre. Vale igual con o sin sesion.
  const siteConfig = await fetchSiteConfig(locale);
  if (siteConfig.ok && siteConfig.data.payment_methods?.guest_checkout === true) {
    return <ReserveCheckout locale={locale} />;
  }

  const { session, state } = await loadParticipant(locale);

  if (state.kind === "anonymous") {
    // DEC-079: el visitante sin cuenta llega aqui con SU carrito (sesion de
    // carrito). Se le pide la cuenta para pagar, y a la vez se le ensena lo que
    // va a pagar: pedir una cuenta sin decir por cuanto es lo que hace que la
    // gente se vaya. Al volver del alta o del login, el carrito ya es de la
    // cuenta (lo pasa la API) y esta misma pagina sigue con el pago.
    const guestCart = await fetchCart(locale, await readSession());
    const hasLines = guestCart.ok && guestCart.data.lines.length > 0;
    const guestPayments = paymentOptionsOf(siteConfig.ok ? siteConfig.data : null);

    return (
      <CheckoutShell title={t("title")}>
        {hasLines ? (
          <div className="grid gap-s6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <AccountRequired />
            <aside className="flex flex-col gap-s4">
              <OrderSummary
                cart={guestCart.data}
                locale={locale}
                offersPickup={guestPayments.methods.includes("CASH")}
              />
            </aside>
          </div>
        ) : (
          <SignInRequired returnPath="/checkout" />
        )}
      </CheckoutShell>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <CheckoutShell title={t("title")}>
        <ApiErrorState failure={state.failure} headingLevel="h2" />
      </CheckoutShell>
    );
  }

  const [cartResult, promotionResult] = await Promise.all([
    fetchCart(locale, session),
    fetchActivePromotion(locale),
  ]);

  if (!cartResult.ok) {
    return (
      <CheckoutShell title={t("title")}>
        <ApiErrorState failure={cartResult.error} headingLevel="h2" />
      </CheckoutShell>
    );
  }

  const { lines, entry_quote: quote } = cartResult.data;

  if (lines.length === 0) {
    return (
      <CheckoutShell title={t("title")}>
        <EmptyState
          headingLevel="h2"
          title={t("emptyTitle")}
          description={t("emptyBody")}
          action={
            <Link href="/shop" className={buttonVariants({ variant: "buy" })}>
              {t("backToCart")}
            </Link>
          }
        />
      </CheckoutShell>
    );
  }

  // DEC-067: si la promocion comprueba edad o estado y la cuenta no los ha
  // declarado, se piden ANTES de cobrar. Si alguna de las dos lecturas falla no
  // se bloquea el pago: el backend vuelve a comprobarlo al otorgar.
  const configResult = siteConfig;
  const eligibilityResult = await fetchMyEligibility(locale, session);
  const flags = configResult.ok ? toFeatureFlags(configResult.data) : null;
  const checksEligibility =
    flags !== null &&
    (isFeatureEnabled(flags, "age_gate_enabled") ||
      isFeatureEnabled(flags, "state_eligibility_enforcement_enabled"));
  const needsDeclaration =
    checksEligibility && eligibilityResult.ok && !eligibilityResult.data.declared;
  const requiredConsents = configResult.ok ? (configResult.data.required_consents ?? []) : [];
  const payments = paymentOptionsOf(configResult.ok ? configResult.data : null);

  const timeZone =
    promotionResult.ok && promotionResult.data !== null
      ? promotionResult.data.legal_timezone
      : "UTC";

  return (
    <CheckoutShell title={t("title")} intro={t("intro")}>
      <div className="grid gap-s6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {needsDeclaration ? (
          <section aria-labelledby="checkout-eligibility">
            <h2 id="checkout-eligibility" className="app-display text-heading-lg text-text">
              {tEligibility("title")}
            </h2>

            <div className="mt-s5">
              <EligibilityDeclarationForm locale={locale} consents={requiredConsents} />
            </div>
          </section>
        ) : (
          // DEC-078: el formulario abre con la forma de pago -tarjeta o efectivo
          // en un punto de venta- y sigue con la direccion; los dos titulos
          // viven dentro de el, en el orden en que se rellenan.
          <section aria-label={t("title")}>
            {payments.methods.length === 0 ? (
              <EmptyState
                title={t("noPaymentMethodsTitle")}
                description={t("noPaymentMethodsBody")}
              />
            ) : (
              <CheckoutForm
                locale={locale}
                cashDelivery={cashDeliveryOf(cartResult.data, locale)}
                methods={payments.methods}
                zelle={payments.zelle}
              />
            )}
          </section>
        )}

        <aside className="flex flex-col gap-s4">
          <OrderSummary
            cart={cartResult.data}
            locale={locale}
            offersPickup={payments.methods.includes("CASH")}
          />

          <EntryQuotePanel quote={quote} locale={locale} timeZone={timeZone} />

          <p className="text-caption text-text-subtle">{t("entriesNote")}</p>
        </aside>
      </div>
    </CheckoutShell>
  );
}

/**
 * DEC-079: cuanto se paga en efectivo segun se recoja o se envie, con las
 * cifras de la API formateadas. `null` si el carrito no lleva mercancia (solo
 * paquetes): no hay nada que recoger ni que enviar.
 *
 * Recogerlo cuesta el SUBTOTAL: es lo que cobra el backend cuando no hay envio
 * (y no hay impuestos, pendiente legal). Enviarlo cuesta el TOTAL del carrito,
 * que ya lleva el envio. Ninguna de las dos cifras se suma aqui.
 */
/**
 * 0041: las formas de pago que ofrece la tienda, en el orden en que salen.
 *
 * Sin `payment_methods` -una API anterior, o `/config` que no respondio- se
 * ofrece lo de siempre, tarjeta y efectivo: es lo que hacia el checkout antes y
 * la API sigue rechazando lo que no este activado.
 */
function paymentOptionsOf(config: SiteConfigResponse | null): {
  readonly methods: readonly PaymentMethod[];
  readonly zelle: NonNullable<SiteConfigResponse["payment_methods"]>["zelle"];
} {
  const published = config?.payment_methods;
  if (published === undefined) return { methods: ["CARD", "CASH"], zelle: null };

  const methods: PaymentMethod[] = [];
  if (published.zelle !== null) methods.push("ZELLE");
  if ((published.venmo ?? null) !== null) methods.push("VENMO");
  if (published.card) methods.push("CARD");
  if (published.cash) methods.push("CASH");
  return { methods, zelle: published.zelle };
}

function cashDeliveryOf(cart: CartWithQuote, locale: Locale): CashDeliveryOptions | null {
  if (cart.shipping.status === "NOT_REQUIRED" || cart.subtotal === null) return null;

  const pickupTotal = formatMoney(cart.subtotal, locale);
  if (pickupTotal === null) return null;

  const shipping = cart.shipping.amount === null ? null : formatMoney(cart.shipping.amount, locale);
  const total = cart.total === null ? null : formatMoney(cart.total, locale);

  return {
    pickupTotal,
    delivery:
      cart.shipping.status === "CHARGED" && shipping !== null && total !== null
        ? { shipping, total }
        : null,
  };
}

/**
 * 0042: comprar sin cuenta. El formulario de "Apartar" y, al lado, lo que se
 * va a pagar. El total es el del carrito, envio incluido si lleva mercancia: es
 * lo que se pagara por Zelle o Venmo.
 */
async function ReserveCheckout({ locale }: { readonly locale: Locale }) {
  const t = await getTranslations("checkout");
  const cart = await fetchCart(locale, await readSession());

  if (!cart.ok) {
    return (
      <CheckoutShell title={t("title")}>
        <ApiErrorState failure={cart.error} headingLevel="h2" />
      </CheckoutShell>
    );
  }

  if (cart.data.lines.length === 0) {
    return (
      <CheckoutShell title={t("title")}>
        <EmptyState
          headingLevel="h2"
          title={t("emptyTitle")}
          description={t("emptyBody")}
          action={
            <Link href="/shop" className={buttonVariants({ variant: "buy" })}>
              {t("backToCart")}
            </Link>
          }
        />
      </CheckoutShell>
    );
  }

  const total = cart.data.total === null ? null : formatMoney(cart.data.total, locale);

  return (
    <CheckoutShell title={t("title")}>
      <div className="grid gap-s6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start">
        <ReserveForm
          locale={locale}
          dialOptions={dialOptions(localeTag(locale))}
          defaultCountry={DEFAULT_DIAL_COUNTRY}
          total={total}
        />
        <aside className="flex flex-col gap-s4">
          <OrderSummary cart={cart.data} locale={locale} offersPickup={false} />
        </aside>
      </div>
    </CheckoutShell>
  );
}

/**
 * Lo que se va a pagar: lineas, y subtotal, envio y total (DEC-079).
 *
 * Lo comparten el checkout con cuenta y el del visitante sin cuenta. Ninguna
 * cifra se calcula aqui: el subtotal de linea, el envio y el total llegan
 * calculados por el backend.
 */
async function OrderSummary({
  cart,
  locale,
  offersPickup,
}: {
  readonly cart: CartWithQuote;
  readonly locale: Locale;
  /** 0041: solo con efectivo hay punto de venta donde recoger sin envio. */
  readonly offersPickup: boolean;
}) {
  const t = await getTranslations("checkout");

  return (
    <Card elevation="raised" padding="md">
      <CardTitle as="h2" size="sm">
        {t("reviewHeading")}
      </CardTitle>

      <ul className="mt-s4 flex list-none flex-col gap-s3">
        {cart.lines.map((line) => (
          <li key={line.id} className="flex items-baseline justify-between gap-s3">
            <span className="min-w-0 text-body-sm text-text-muted">
              {pickLocalized(line.name, locale)}
              {" · "}
              <span className="tabular-nums">{line.quantity}</span>
            </span>

            {/* El subtotal de linea LLEGA CALCULADO. Aqui no se multiplica
                cantidad por precio, ni siquiera cuando parece trivial. */}
            <span className="shrink-0 text-body-sm tabular-nums text-text">
              {formatMoney(line.line_subtotal, locale)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-s4 border-t border-border pt-s3">
        <CartTotals cart={cart} locale={locale} />
      </div>

      {/* DEC-079: el total de arriba es el de envio a domicilio. Quien paga en
          efectivo y lo recoge no paga el envio, y tiene que saberlo antes de
          elegir. */}
      {cart.shipping.status === "NOT_REQUIRED" || !offersPickup ? null : (
        <p className="mt-s3 text-caption text-text-subtle">{t("pickupNote")}</p>
      )}

      <div className="mt-s4">
        <Link href="/cart" className="text-body-sm text-text-muted underline underline-offset-4">
          {t("backToCart")}
        </Link>
      </div>
    </Card>
  );
}

/**
 * DEC-079: el visitante sin cuenta, en el paso de pagar.
 *
 * Crear cuenta va PRIMERO: quien llega aqui sin sesion lo mas probable es que
 * no la tenga. Las dos salidas llevan `?next=/checkout`, y al volver el carrito
 * ya es de la cuenta: lo pasa la API al registrarse o iniciar sesion.
 */
async function AccountRequired() {
  const t = await getTranslations("checkout.accountRequired");
  const query = `?next=${encodeURIComponent("/checkout")}`;

  return (
    <section aria-labelledby="checkout-account-required">
      <h2 id="checkout-account-required" className="app-display text-heading-lg text-text">
        {t("title")}
      </h2>
      <p className="mt-s3 max-w-[40rem] text-body-md text-text-muted">{t("body")}</p>

      <div className="mt-s6 flex flex-col gap-s3 sm:flex-row sm:flex-wrap">
        <Link
          href={`/account/register${query}`}
          className={buttonVariants({ variant: "accent", size: "lg" })}
        >
          {t("register")}
        </Link>
        <Link
          href={`/account/login${query}`}
          className={buttonVariants({ variant: "secondary", size: "lg" })}
        >
          {t("signIn")}
        </Link>
      </div>
    </section>
  );
}

/** Contenedor comun de la pantalla, para no repetirlo en los cinco estados. */
function CheckoutShell({
  title,
  intro,
  children,
}: {
  readonly title: string;
  readonly intro?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="app-container py-s10 pb-s16">
      <PageTitle>{title}</PageTitle>

      {intro === undefined ? null : (
        <p className="mt-s4 max-w-[52rem] text-body-md text-text-muted">{intro}</p>
      )}

      <div className="mt-s8">{children}</div>
    </div>
  );
}
