import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", async () => {
  const { createElement } = await import("react");

  return {
    usePathname: () => "/checkout",
    useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
    redirect: () => undefined,
    getPathname: ({ href }: { href: string }) => href,
    Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) =>
      createElement("a", { href, ...rest }, children),
  };
});

vi.mock("@/lib/checkout-actions", () => {
  const idle = { status: "idle" as const, code: null, requestId: null, field: null };
  return { startCheckoutAction: () => Promise.resolve(idle) };
});

vi.mock("@/lib/payment-receipt-actions", () => {
  const idle = { status: "idle" as const, code: null, requestId: null, field: null };
  return { uploadPaymentReceiptAction: () => Promise.resolve(idle) };
});

import { CheckoutForm } from "@/components/checkout-form";
import { ZellePaymentCard } from "@/components/zelle-payment-card";
import type { Locale } from "@/i18n/locales";
import type { OrderDetail } from "@/lib/api";

import enMessages from "../../messages/en-US.json";
import esMessages from "../../messages/es-US.json";

/**
 * Pago por Zelle (0041), lo que ve el comprador.
 *
 * LO QUE SE VIGILA
 *   1. El checkout ofrece SOLO las formas de pago que la tienda tiene activas,
 *      y con Zelle pide el WhatsApp, obligatorio.
 *   2. La tarjeta del pedido dice a quien pagar, cuanto y que poner en la nota,
 *      y deja subir el comprobante mientras el pedido siga pendiente.
 *   3. Con el comprobante ya subido, lo dice; pagado, ya no pide nada.
 */

const ZELLE = { recipient_name: "Rifas Fixture LLC", recipient: "pagos@example.invalid" };

function renderIn(locale: Locale, ui: ReactNode) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? enMessages : esMessages}
      timeZone="UTC"
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

function zelleOrder(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f",
    order_number: "RFS-00000042",
    status: "PENDING_PAYMENT",
    placed_at: "2026-10-28T18:00:00.000Z",
    total: { amount_minor: "2500", currency: "USD" },
    item_count: 1,
    promotion_id: null,
    entry_state: "PENDING_QUALIFICATION",
    entries_granted: null,
    payment_method: "ZELLE",
    items: [],
    subtotal: { amount_minor: "2500", currency: "USD" },
    shipping_total: null,
    tax_total: null,
    shipping_address: null,
    contact_phone: "+15125550134",
    payment_receipts: [],
    entry_calculation: null,
    ...overrides,
  };
}

describe("checkout con Zelle", () => {
  it("solo ofrece las formas activas y, con Zelle, pide el WhatsApp", () => {
    renderIn(
      "es",
      <CheckoutForm locale="es" cashDelivery={null} methods={["ZELLE"]} zelle={ZELLE} />,
    );

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(1);
    expect(radios[0]).toHaveAttribute("value", "ZELLE");
    expect(radios[0]).toBeChecked();

    const whatsapp = screen.getByLabelText(new RegExp(esMessages.checkout.fields.whatsapp, "u"));
    expect(whatsapp).toHaveAttribute("name", "contact_phone");
    expect(whatsapp).toHaveAttribute("type", "tel");
    expect(
      screen.getByRole("button", { name: esMessages.checkout.payment.zelleCta }),
    ).toBeInTheDocument();
  });

  it("sin Zelle activado no aparece ni el WhatsApp", () => {
    renderIn(
      "en",
      <CheckoutForm locale="en" cashDelivery={null} methods={["CARD"]} zelle={null} />,
    );

    expect(screen.queryByRole("radio", { name: /zelle/iu })).toBeNull();
    expect(
      screen.queryByLabelText(new RegExp(enMessages.checkout.fields.whatsapp, "u")),
    ).toBeNull();
  });
});

describe("tarjeta de pago por Zelle", () => {
  it("pendiente y sin comprobante: a quien pagar, cuanto, la nota y la subida", () => {
    renderIn(
      "es",
      <ZellePaymentCard
        order={zelleOrder()}
        zelle={ZELLE}
        locale="es"
        timeZone="America/Chicago"
      />,
    );

    expect(
      screen.getByRole("heading", { name: esMessages.orderConfirmation.zelle.pendingTitle }),
    ).toBeInTheDocument();
    expect(screen.getByText(ZELLE.recipient_name)).toBeInTheDocument();
    expect(screen.getByText(ZELLE.recipient)).toBeInTheDocument();
    expect(screen.getByText("RFS-00000042")).toBeInTheDocument();
    expect(screen.getAllByText("$25.00").length).toBeGreaterThan(0);

    const file = screen.getByLabelText(
      new RegExp(esMessages.orderConfirmation.zelle.uploadLabel, "u"),
    );
    expect(file).toHaveAttribute("type", "file");
    expect(file).toHaveAttribute("name", "receipt_file");
  });

  it("con comprobante subido, dice que lo esta revisando y permite subir otro", () => {
    renderIn(
      "en",
      <ZellePaymentCard
        order={zelleOrder({
          payment_receipts: [
            {
              id: "1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a",
              uploaded_at: "2026-10-28T19:00:00.000Z",
              content_type: "image/png",
              byte_size: 120_000,
            },
          ],
        })}
        zelle={ZELLE}
        locale="en"
        timeZone="America/Chicago"
      />,
    );

    expect(
      screen.getByRole("heading", { name: enMessages.orderConfirmation.zelle.reviewTitle }),
    ).toBeInTheDocument();
    const status = screen.getAllByRole("status")[0];
    expect(status).toBeDefined();
    expect(within(status!).getByText(/\+15125550134/u)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: enMessages.orderConfirmation.zelle.uploadAnotherCta }),
    ).toBeInTheDocument();
  });

  it("pagado: confirma y ya no pide comprobante", () => {
    renderIn(
      "es",
      <ZellePaymentCard
        order={zelleOrder({ status: "PAID" })}
        zelle={ZELLE}
        locale="es"
        timeZone="America/Chicago"
      />,
    );

    expect(
      screen.getByRole("heading", { name: esMessages.orderConfirmation.zelle.paidTitle }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(new RegExp(esMessages.orderConfirmation.zelle.uploadLabel, "u")),
    ).toBeNull();
  });
});
