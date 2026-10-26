import { BRAND } from "@app/brand";
import { describe, expect, it } from "vitest";

import {
  DAILY_CUT_TIME_ZONE,
  dailyCutWindow,
  isCalendarDate,
  nextDate,
  startOfLocalDay,
} from "../src/services/daily-cut.js";

/**
 * Ventana del corte de caja (DEC-085): de 12:00 a. m. a 11:59 p. m. en la hora
 * del negocio (`timeZone` de `packages/brand`), con su cambio de horario. Lo
 * que se comprueba son los dias en los que una cuenta a mano se equivoca, con
 * una zona fija para que el resultado no dependa de la marca configurada.
 */
describe("startOfLocalDay con cambio de horario (America/Denver)", () => {
  const ZONE = "America/Denver";
  const window = (date: string) => ({
    from: startOfLocalDay(date, ZONE),
    to: startOfLocalDay(nextDate(date), ZONE),
  });

  it("un dia de verano empieza a las 06:00 UTC (MDT)", () => {
    expect(window("2026-10-08")).toEqual({
      from: new Date("2026-10-08T06:00:00.000Z"),
      to: new Date("2026-10-09T06:00:00.000Z"),
    });
  });

  it("un dia de invierno empieza a las 07:00 UTC (MST)", () => {
    expect(window("2026-12-15")).toEqual({
      from: new Date("2026-12-15T07:00:00.000Z"),
      to: new Date("2026-12-16T07:00:00.000Z"),
    });
  });

  it("el dia en que se atrasa la hora dura 25 horas", () => {
    const { from, to } = window("2026-11-01");
    expect(from).toEqual(new Date("2026-11-01T06:00:00.000Z"));
    expect(to).toEqual(new Date("2026-11-02T07:00:00.000Z"));
    expect(to.getTime() - from.getTime()).toBe(25 * 60 * 60 * 1000);
  });

  it("el dia en que se adelanta la hora dura 23 horas", () => {
    const { from, to } = window("2026-03-08");
    expect(from).toEqual(new Date("2026-03-08T07:00:00.000Z"));
    expect(to.getTime() - from.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it("no depende de la zona del servidor: otra zona da otros instantes", () => {
    expect(startOfLocalDay("2026-10-08", "America/Chicago")).toEqual(
      new Date("2026-10-08T05:00:00.000Z"),
    );
  });
});

describe("dailyCutWindow", () => {
  it("usa la zona horaria del negocio configurada en la marca", () => {
    expect(DAILY_CUT_TIME_ZONE).toBe(BRAND.timeZone);
    expect(dailyCutWindow("2026-10-08")).toEqual({
      from: startOfLocalDay("2026-10-08", BRAND.timeZone),
      to: startOfLocalDay("2026-10-09", BRAND.timeZone),
    });
  });
});

describe("fechas de calendario", () => {
  it("el dia siguiente cruza meses y anos", () => {
    expect(nextDate("2026-10-31")).toBe("2026-11-01");
    expect(nextDate("2026-12-31")).toBe("2027-01-01");
  });

  it("rechaza fechas imposibles y formatos ajenos", () => {
    expect(isCalendarDate("2026-10-08")).toBe(true);
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2026-02-29")).toBe(false);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("10/08/2026")).toBe(false);
    expect(isCalendarDate("2026-10-8")).toBe(false);
  });
});
