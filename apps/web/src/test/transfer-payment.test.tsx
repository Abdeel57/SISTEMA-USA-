import { fireEvent, render, screen, within } from "@testing-library/react";
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

vi.mock("@/lib/reserve-actions", () => {
  const idle = { status: "idle" as const, code: null, requestId: null, field: null };
  return { reserveOrderAction: () => Promise.resolve(idle) };
});

import { CheckoutForm } from "@/components/checkout-form";
import { ReserveForm } from "@/components/reserve-form";
import { TransferPaymentCard } from "@/components/transfer-payment-card";
import type { Locale } from "@/i18n/locales";
import type { OrderDetail } from "@/lib/api";
import { composeWhatsApp, DEFAULT_DIAL_COUNTRY, dialOptions } from "@/lib/dial-codes";

import enMessages from "../../messages/en-US.json";
import esMessages from "../../messages/es-US.json";

/**
 * Pago por transferencia -Zelle (0041) y Venmo (0042)- y "Apartar" sin
 * cuenta, lo que ve el comprador.
 *
 * LO QUE SE VIGILA
 *   1. "Apartar" pide solo la lada (todos los paises, Estados Unidos primero),
 *      el WhatsApp, el nombre y los apellidos opcionales.
 *   2. La tarjeta del pedido dice a quien pagar, cuanto y que poner en la nota;
 *      con Zelle y Venmo deja elegir, y la captura viaja con la app elegida.
 *   3. Con la captura subida, el mensaje final: el organizador confirma por
 *      WhatsApp. Pagado, ya no pide nada.
 */

const ZELLE = { recipient_name: "Edgardo Fixture", recipient: "pagos@example.invalid" };
const VENMO = {
  recipient_name: "Jose Fixture",
  handle: "Jose-Fixture",
  qr_url: "/media/0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f.png",
};

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

function transferOrder(overrides: Partial<OrderDetail> = {}): OrderDetail {
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
    contact_phone: "+525512345678",
    contact_name: "María López",
    payment_receipts: [],
    entry_calculation: null,
    ...overrides,
  };
}

const RECEIPT = {
  id: "1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a",
  uploaded_at: "2026-10-28T19:00:00.000Z",
  content_type: "image/png" as const,
  byte_size: 120_000,
};

describe("apartar sin cuenta", () => {
  it("pide la lada, el WhatsApp, el nombre y los apellidos opcionales, y nada mas", () => {
    const { container } = renderIn(
      "es",
      <ReserveForm
        locale="es"
        dialOptions={dialOptions("es-US")}
        defaultCountry={DEFAULT_DIAL_COUNTRY}
        total="$9.99"
      />,
    );

    expect(screen.getByText(/\$9\.99/u)).toBeInTheDocument();
    const dial = screen.getByLabelText(esMessages.checkout.reserve.dialLabel);
    expect(dial).toHaveValue("US");
    expect(within(dial).getAllByRole("option").length).toBeGreaterThan(200);
    // Estados Unidos y Mexico primero; despues, en orden alfabetico.
    const first = within(dial).getAllByRole("option").slice(0, 2);
    expect(first.map((option) => option.getAttribute("value"))).toEqual(["US", "MX"]);

    const whatsapp = screen.getByLabelText(
      new RegExp(esMessages.checkout.reserve.whatsappLabel, "u"),
    );
    expect(whatsapp).toHaveAttribute("name", "whatsapp");
    expect(whatsapp).toHaveAttribute("type", "tel");
    expect(
      screen.getByLabelText(
        new RegExp(esMessages.checkout.reserve.firstNameLabel.replace(/[()]/gu, "\\$&"), "u"),
      ),
    ).toBeRequired();
    expect(
      screen.getByLabelText(
        new RegExp(esMessages.checkout.reserve.lastNameLabel.replace(/[()]/gu, "\\$&"), "u"),
      ),
    ).not.toBeRequired();

    // Ni correo, ni contrasena, ni estado, ni direccion.
    const names = [...container.querySelectorAll("input, select")].map((field) =>
      field.getAttribute("name"),
    );
    expect(names.filter((name) => name !== "locale")).toEqual([
      "dial_country",
      "whatsapp",
      "first_name",
      "last_name",
    ]);
    expect(
      screen.getByRole("button", { name: esMessages.checkout.reserve.submit }),
    ).toBeInTheDocument();
  });

  it("cambiar de pais cambia la lada que se ve", () => {
    renderIn(
      "es",
      <ReserveForm
        locale="es"
        dialOptions={dialOptions("es-US")}
        defaultCountry={DEFAULT_DIAL_COUNTRY}
        total={null}
      />,
    );

    expect(screen.getByText("US +1")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(esMessages.checkout.reserve.dialLabel), {
      target: { value: "MX" },
    });
    expect(screen.getByText("MX +52")).toBeInTheDocument();
  });

  it("compone el WhatsApp en E.164 con la lada elegida", () => {
    expect(composeWhatsApp("US", "(512) 555-0134")).toBe("+15125550134");
    // El "1" que se marca delante en Estados Unidos no se duplica.
    expect(composeWhatsApp("US", "1 512 555 0134")).toBe("+15125550134");
    expect(composeWhatsApp("MX", "55 1234 5678")).toBe("+525512345678");
    expect(composeWhatsApp("SV", "7123-4567")).toBe("+50371234567");
    expect(composeWhatsApp("US", "llamame")).toBeNull();
    expect(composeWhatsApp("US", "123")).toBeNull();
    expect(composeWhatsApp("ZZ", "5551234567")).toBeNull();
  });
});

describe("checkout con cuenta", () => {
  it("solo ofrece las formas activas y, con Venmo, pide el WhatsApp", () => {
    renderIn(
      "es",
      <CheckoutForm locale="es" cashDelivery={null} methods={["VENMO"]} zelle={null} />,
    );

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(1);
    expect(radios[0]).toHaveAttribute("value", "VENMO");

    const whatsapp = screen.getByLabelText(new RegExp(esMessages.checkout.fields.whatsapp, "u"));
    expect(whatsapp).toHaveAttribute("name", "contact_phone");
    expect(
      screen.getByRole("button", { name: esMessages.checkout.payment.venmoCta }),
    ).toBeInTheDocument();
  });

  it("sin Zelle ni Venmo no aparece el WhatsApp", () => {
    renderIn(
      "en",
      <CheckoutForm locale="en" cashDelivery={null} methods={["CARD"]} zelle={null} />,
    );

    expect(screen.queryByRole("radio", { name: /zelle|venmo/iu })).toBeNull();
    expect(
      screen.queryByLabelText(new RegExp(enMessages.checkout.fields.whatsapp, "u")),
    ).toBeNull();
  });
});

describe("tarjeta de pago por transferencia", () => {
  const copy = esMessages.orderConfirmation.transfer;

  it("pendiente: a quien pagar por Zelle, cuanto, la nota y la subida", () => {
    const { container } = renderIn(
      "es",
      <TransferPaymentCard
        order={transferOrder()}
        zelle={ZELLE}
        venmo={VENMO}
        locale="es"
        timeZone="America/Chicago"
      />,
    );

    expect(screen.getByRole("heading", { name: copy.pendingTitle })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: copy.zelleTab })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText(ZELLE.recipient_name)).toBeInTheDocument();
    expect(screen.getByText(ZELLE.recipient)).toBeInTheDocument();
    expect(screen.getByText("RFS-00000042")).toBeInTheDocument();
    expect(screen.getAllByText("$25.00").length).toBeGreaterThan(0);

    const file = screen.getByLabelText(new RegExp(copy.uploadLabel, "u"));
    expect(file).toHaveAttribute("type", "file");
    expect(container.querySelector('input[name="payment_channel"]')).toHaveValue("ZELLE");
  });

  it("con Venmo elegido: el QR, el usuario, el enlace y la captura viaja como Venmo", () => {
    const { container } = renderIn(
      "es",
      <TransferPaymentCard
        order={transferOrder()}
        zelle={ZELLE}
        venmo={VENMO}
        locale="es"
        timeZone="America/Chicago"
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: copy.venmoTab }));

    expect(screen.getByRole("img", { name: /Jose Fixture/u })).toHaveAttribute("src", VENMO.qr_url);
    expect(screen.getByText("@Jose-Fixture")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: copy.openVenmo });
    expect(link.getAttribute("href")).toBe(
      "https://venmo.com/Jose-Fixture?txn=pay&amount=25.00&note=RFS-00000042",
    );
    expect(screen.queryByText(ZELLE.recipient)).toBeNull();
    expect(container.querySelector('input[name="payment_channel"]')).toHaveValue("VENMO");
  });

  it("con solo una app no hay pestanas", () => {
    renderIn(
      "es",
      <TransferPaymentCard
        order={transferOrder({ payment_method: "VENMO" })}
        zelle={null}
        venmo={VENMO}
        locale="es"
        timeZone="America/Chicago"
      />,
    );

    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByText("@Jose-Fixture")).toBeInTheDocument();
  });

  it("con la captura subida: el organizador confirmara por WhatsApp", () => {
    renderIn(
      "en",
      <TransferPaymentCard
        order={transferOrder({ payment_receipts: [RECEIPT] })}
        zelle={ZELLE}
        venmo={VENMO}
        locale="en"
        timeZone="America/Chicago"
      />,
    );

    expect(
      screen.getByRole("heading", { name: enMessages.orderConfirmation.transfer.reviewTitle }),
    ).toBeInTheDocument();
    expect(screen.getByText(/WhatsApp at \+525512345678/u)).toBeInTheDocument();
    // Subir otra queda a mano, pero plegado.
    expect(
      screen.getByText(enMessages.orderConfirmation.transfer.wrongReceipt),
    ).toBeInTheDocument();
  });

  it("pagado: confirma y ya no pide captura", () => {
    renderIn(
      "es",
      <TransferPaymentCard
        order={transferOrder({ status: "PAID" })}
        zelle={ZELLE}
        venmo={VENMO}
        locale="es"
        timeZone="America/Chicago"
      />,
    );

    expect(screen.getByRole("heading", { name: copy.paidTitle })).toBeInTheDocument();
    expect(screen.queryByLabelText(new RegExp(copy.uploadLabel, "u"))).toBeNull();
  });
});
