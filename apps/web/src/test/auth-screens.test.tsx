import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", async () => {
  const { createElement } = await import("react");

  return {
    usePathname: () => "/",
    redirect: () => undefined,
    getPathname: ({ href }: { href: string }) => href,
    Link: ({
      href,
      locale,
      children,
      ...rest
    }: {
      href: string;
      locale?: string;
      children: ReactNode;
    }) =>
      createElement(
        "a",
        { href: locale === undefined ? href : `/${locale}${href}`, ...rest },
        children,
      ),
  };
});

/*
 * Las Server Actions no se pueden importar en jsdom: son funciones marcadas
 * `"use server"` que Next transforma en tiempo de build. Se sustituyen por
 * funciones que devuelven el estado inicial, porque lo que se prueba aqui es lo
 * que la pantalla PINTA, no lo que la accion HACE.
 */
vi.mock("@/lib/auth-actions", () => {
  const idle = {
    status: "idle" as const,
    code: null,
    requestId: null,
    field: null,
    retryAfterSeconds: null,
  };

  return {
    registerAction: () => Promise.resolve(idle),
    loginAction: () => Promise.resolve(idle),
    logoutAction: () => Promise.resolve(undefined),
  };
});

import { LoginForm } from "@/components/login-form";
import { RegisterForm } from "@/components/register-form";
import { LOCALES, type Locale } from "@/i18n/locales";
import { requiredConsents, unknownConsent } from "@/mocks/fixtures/account";

import enMessages from "../../messages/en-US.json";
import esMessages from "../../messages/es-US.json";

/**
 * Pantallas de identidad (FE-M4).
 *
 * LAS DOS REDES QUE IMPORTAN DE VERDAD AQUI
 * -----------------------------------------
 * 1. Que el alta NO PREGUNTE nada legal que nadie ha aprobado: ni edad, ni
 *    estado de residencia, ni una casilla de elegibilidad escrita por el
 *    frontend. Las unicas casillas que aparecen son las que publica el backend.
 * 2. Que en ningun formulario haya un token ni un `localStorage` (DEC-006).
 *
 * Un test que solo comprobara que los campos se ven no detectaria a nadie
 * anadiendo un "confirmo que tengo 18 anos", que es exactamente el cambio
 * bienintencionado que hay que impedir.
 */

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

describe("formulario de inicio de sesion", () => {
  it.each(LOCALES)("pinta correo y contrasena, y nada mas, en %s", (locale) => {
    const { container } = renderIn(locale, <LoginForm locale={locale} returnPath={null} />);

    // Plantilla: solo correo. Un campo de correo de verdad, para que el
    // navegador y el gestor de contrasenas lo traten como tal.
    const email = container.querySelector('input[name="email"]');
    expect(email).not.toBeNull();
    expect(email?.getAttribute("type")).toBe("email");
    expect(email?.getAttribute("autocomplete")).toBe("email");
    expect(container.querySelector('input[name="password"]')).not.toBeNull();

    // Ni celular, ni codigo de un solo uso.
    expect(container.querySelector('input[name="identifier"]')).toBeNull();
    expect(container.querySelector('input[type="tel"]')).toBeNull();
    expect(container.querySelector('input[autocomplete="one-time-code"]')).toBeNull();
  });

  it.each(LOCALES)(
    "quien olvida su contrasena lee que la pida a la tienda, sin enlace de recuperacion, en %s",
    (locale) => {
      const { container } = renderIn(locale, <LoginForm locale={locale} returnPath={null} />);
      const messages = locale === "en" ? enMessages : esMessages;

      expect(screen.getByText(messages.auth.login.forgotHint)).toBeInTheDocument();
      expect(container.querySelector('a[href*="forgot"]')).toBeNull();
      expect(container.querySelector('a[href*="reset"]')).toBeNull();
    },
  );

  it("el destino de vuelta viaja en un campo oculto", () => {
    const { container } = renderIn("en", <LoginForm locale="en" returnPath="/account/entries" />);

    const hidden = container.querySelector('input[name="next"]');
    expect(hidden).not.toBeNull();
    expect(hidden?.getAttribute("value")).toBe("/account/entries");
  });

  it("sin destino de vuelta no se pinta el campo", () => {
    const { container } = renderIn("en", <LoginForm locale="en" returnPath={null} />);
    expect(container.querySelector('input[name="next"]')).toBeNull();
  });

  it("el campo de contrasena pide la guardada, no una nueva", () => {
    // `current-password` y no `new-password`: con el segundo, el gestor de
    // contrasenas ofrece GENERAR una en la pantalla de entrar.
    const { container } = renderIn("en", <LoginForm locale="en" returnPath={null} />);

    expect(container.querySelector('input[name="password"]')?.getAttribute("autocomplete")).toBe(
      "current-password",
    );
  });
});

describe("formulario de alta", () => {
  it.each(LOCALES)(
    "pregunta fecha de nacimiento y estado (DEC-067), y ningun otro dato legal en %s",
    (locale) => {
      const { container } = renderIn(
        locale,
        <RegisterForm locale={locale} consents={[]} returnPath={null} />,
      );

      // Las Official Rules definen al "Entrant" por edad y estado: esos dos se
      // preguntan. Lo demas no lo piden las Reglas y no se pregunta.
      const dateOfBirth = container.querySelector('input[name="date_of_birth"]');
      expect(dateOfBirth?.getAttribute("type")).toBe("date");
      expect(dateOfBirth?.hasAttribute("required")).toBe(true);

      const state = container.querySelector('select[name="residence_state"]');
      // 50 estados + DC, mas la opcion vacia de "elige".
      expect(state?.querySelectorAll("option")).toHaveLength(52);
      expect(state?.querySelector('option[value="DC"]')).not.toBeNull();
      expect(state?.querySelector('option[value="PR"]')).toBeNull();

      for (const forbidden of ["birth_date", "age", "state", "region", "country"]) {
        expect(
          container.querySelector(`[name="${forbidden}"]`),
          `el alta pregunta un dato que las Reglas no piden: ${forbidden}`,
        ).toBeNull();
      }
    },
  );

  it("sin consentimientos publicados no pinta ninguna casilla", () => {
    const { container } = renderIn(
      "en",
      <RegisterForm locale="en" consents={[]} returnPath={null} />,
    );

    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it("pinta las casillas que publica el backend, con su version", () => {
    const { container } = renderIn(
      "en",
      <RegisterForm locale="en" consents={requiredConsents} returnPath={null} />,
    );

    const consent = requiredConsents[0];
    expect(consent).toBeDefined();
    if (consent === undefined) return;

    expect(container.querySelector(`input[name="consent_accepted:${consent.key}"]`)).not.toBeNull();

    // Clave y version viajan juntas: aceptar unas reglas sin decir cual version
    // es una afirmacion sin fecha.
    const hidden = container.querySelector('input[name="consent"]');
    expect(hidden?.getAttribute("value")).toBe(`${consent.key}:${consent.version}`);
    // El patron sale de un fixture de este repositorio, no de entrada de usuario.
    // eslint-disable-next-line security/detect-non-literal-regexp
    expect(screen.getByText(new RegExp(consent.version))).toBeInTheDocument();
  });

  it("una clave de consentimiento desconocida no aparece en crudo", () => {
    renderIn("es", <RegisterForm locale="es" consents={[unknownConsent]} returnPath={null} />);

    // Nunca la clave tecnica delante de un participante; un texto generico que
    // remite a las Reglas Oficiales.
    expect(screen.queryByText(/SOMETHING_THE_FRONTEND_DOES_NOT_KNOW/)).toBeNull();
    expect(screen.getByText(esMessages.auth.consent.fallback)).toBeInTheDocument();
  });

  it.each(LOCALES)("las dos contrasenas piden una nueva en %s", (locale) => {
    const { container } = renderIn(
      locale,
      <RegisterForm locale={locale} consents={[]} returnPath={null} />,
    );

    for (const name of ["password", "password_confirmation"]) {
      expect(container.querySelector(`input[name="${name}"]`)?.getAttribute("autocomplete")).toBe(
        "new-password",
      );
    }
  });
});

describe("alta solo con correo (plantilla)", () => {
  it.each(LOCALES)("pide el correo y no ofrece celular ni codigo SMS en %s", (locale) => {
    const { container } = renderIn(
      locale,
      <RegisterForm locale={locale} consents={[]} returnPath={null} />,
    );

    const email = container.querySelector('input[name="email"]');
    expect(email).not.toBeNull();
    expect(email?.getAttribute("type")).toBe("email");

    // Ni selector de canal, ni celular, ni codigo, ni comprobacion anti-bots.
    expect(container.querySelector("button[aria-pressed]")).toBeNull();
    expect(container.querySelector('input[name="phone"]')).toBeNull();
    expect(container.querySelector('input[name="sms_code"]')).toBeNull();
    expect(container.querySelector('input[name="method"]')).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
  });
});
