/**
 * Credit periods, shared by the engine, the card profile and usage logging.
 *
 *   month | quarter | half (Jan-Jun, Jul-Dec) | year
 *   anniversary | four_years   no calendar deadline the app can know, so
 *                              usage stands until the user changes it
 */
export type PeriodKey = "month" | "quarter" | "half" | "year" | "anniversary" | "four_years";

export const PERIODS: PeriodKey[] = ["month", "quarter", "half", "year", "anniversary", "four_years"];

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

/** The window this period's usage counts against right now. */
export function periodWindow(period: string, now = new Date()): { start: Date; end: Date; open: boolean } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  switch (period) {
    case "month":
      return { start: utc(y, m, 1), end: utc(y, m + 1, 0), open: false };
    case "quarter": {
      const q = Math.floor(m / 3) * 3;
      return { start: utc(y, q, 1), end: utc(y, q + 3, 0), open: false };
    }
    case "half": {
      const h = m < 6 ? 0 : 6;
      return { start: utc(y, h, 1), end: utc(y, h + 6, 0), open: false };
    }
    case "anniversary":
    case "four_years":
      return { start: utc(2000, 0, 1), end: utc(9999, 11, 31), open: true };
    default:
      return { start: utc(y, 0, 1), end: utc(y, 11, 31), open: false };
  }
}

export function isPeriod(p: unknown): p is PeriodKey {
  return typeof p === "string" && (PERIODS as string[]).includes(p);
}

export function dateOnly(d: Date): string {
  return d.toISOString().split("T")[0];
}
