import { describe, expect, it } from "vitest";

import { normalizeContactPhone } from "../src/services/contact-phone.js";

/**
 * El WhatsApp del comprador (0041), como lo escribe una persona, a E.164.
 *
 * LO QUE SE VIGILA
 *   1. Los formatos habituales de EE. UU. salen como `+1` y diez cifras.
 *   2. Un numero con su `+` o con `00` delante se respeta, sea del pais que sea.
 *   3. Lo que no es un telefono -letras, cifras de menos, un numero extranjero
 *      sin prefijo- se rechaza, en vez de guardar un numero al que no llegaria
 *      el aviso.
 */
describe("normalizeContactPhone", () => {
  it.each([
    ["(512) 555-0134", "+15125550134"],
    ["512 555 0134", "+15125550134"],
    ["512.555.0134", "+15125550134"],
    ["5125550134", "+15125550134"],
    ["1 512 555 0134", "+15125550134"],
    ["+1 (512) 555-0134", "+15125550134"],
  ])("EE. UU.: %s -> %s", (typed, e164) => {
    expect(normalizeContactPhone(typed)).toBe(e164);
  });

  it.each([
    ["+52 55 1234 5678", "+525512345678"],
    ["0052 55 1234 5678", "+525512345678"],
    ["+57 300 123 4567", "+573001234567"],
  ])("con prefijo de pais: %s -> %s", (typed, e164) => {
    expect(normalizeContactPhone(typed)).toBe(e164);
  });

  it.each([
    [""],
    ["   "],
    ["llamame"],
    ["512-555-CASA"],
    ["555-0134"],
    ["55 1234 5678 9"],
    ["+0 512 555 0134"],
    ["+1234567890123456"],
  ])("rechaza %j", (typed) => {
    expect(normalizeContactPhone(typed)).toBeNull();
  });
});
