import { createHash } from "node:crypto";
import log from "encore.dev/log";
import { cardsDB } from "./db";
import { invalidate } from "../lib/cache";
import { CATALOGUE_KEY } from "./benefits";

/**
 * Keeping the catalogue current from the people who hold the cards.
 *
 * When a portal sync reads a credit, it is matched to the catalogue row for
 * that card. If the portal shows a different value, that user sees their
 * portal's number straight away (a personal override), and an anonymous
 * observation is recorded. Once QUORUM different cardholders' portals agree on
 * the same new value inside 90 days, and they are a clear majority, the
 * catalogue changes for everyone, with a note saying what moved.
 */

const QUORUM = 3;

// Words that describe any credit, so they say nothing about which one it is.
const STOP = new Set([
  "credit", "credits", "statement", "annual", "annually", "monthly", "month", "mo", "yearly", "year", "yr",
  "quarterly", "quarter", "semi", "semiannual", "half", "the", "a", "an", "your", "per", "each", "every",
  "card", "benefit", "benefits", "complimentary", "cash", "back", "usd", "up", "to", "of", "for", "and",
  "in", "on", "with", "promo", "promos", "offer", "earn", "get", "free",
]);

export function benefitTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9+ ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w))
  );
}

/** Jaccard overlap of the distinctive words: "Travel credit" ~ "$300 Annual Travel Credit". */
export function similarity(a: string, b: string): number {
  const x = benefitTokens(a);
  const y = benefitTokens(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return shared / (x.size + y.size - shared);
}

/** The catalogue row a portal's credit refers to, if any is a clear match. */
export function matchCatalogue<T extends { name: string }>(portalName: string, rows: T[]): T | undefined {
  let best: T | undefined;
  let score = 0.5; // strictly better than half, so "DashPass" never matches "DoorDash credit"
  for (const r of rows) {
    const s = similarity(portalName, r.name);
    if (s > score) {
      best = r;
      score = s;
    }
  }
  return best;
}

const money = (cents: number) => "$" + (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
const per = (period: string) =>
  ({ month: "a month", quarter: "a quarter", half: "every six months", year: "a year" } as Record<string, string>)[period] ?? "";

/** Records one cardholder's portal reading and changes the catalogue once enough agree. */
export async function observeCatalogueValue(
  userId: string,
  benefitId: number,
  valueCents: number,
  period: string
): Promise<boolean> {
  const reporter = createHash("sha256").update(`${userId}:${benefitId}`).digest("hex");
  await cardsDB.exec`
    INSERT INTO benefit_observations (benefit_id, reporter, value_amount, period, observed_at)
    VALUES (${benefitId}, ${reporter}, ${valueCents}, ${period}, NOW())
    ON CONFLICT (benefit_id, reporter) DO UPDATE SET
      value_amount = EXCLUDED.value_amount, period = EXCLUDED.period, observed_at = NOW()
  `;

  const current = await cardsDB.queryRow<{ value_amount: number; period: string; version: number }>`
    SELECT value_amount, period, version FROM card_benefits WHERE id = ${benefitId} AND user_id IS NULL
  `;
  if (!current) return false;

  const top = await cardsDB.queryRow<{ value_amount: number; period: string; n: number; total: number }>`
    SELECT value_amount, period, COUNT(*)::int AS n, (SUM(COUNT(*)) OVER ())::int AS total
    FROM benefit_observations
    WHERE benefit_id = ${benefitId} AND observed_at > NOW() - INTERVAL '90 days'
    GROUP BY value_amount, period
    ORDER BY n DESC
    LIMIT 1
  `;
  if (!top || top.n < QUORUM || top.n * 2 <= top.total) return false;
  if (top.value_amount === current.value_amount && top.period === current.period) return false;

  const was = `${money(current.value_amount)}${current.period !== top.period ? ` ${per(current.period)}` : ""}`;
  const note = `Now ${money(top.value_amount)} ${per(top.period)} (was ${was}), per ${top.n} cardholders' portals.`;
  const updated = await cardsDB.queryRow`
    UPDATE card_benefits SET
      value_amount = ${top.value_amount}, period = ${top.period},
      version = version + 1, change_note = ${note}, changed_at = NOW()
    WHERE id = ${benefitId} AND version = ${current.version}
    RETURNING version
  `;
  if (!updated) return false; // someone else just changed it

  await cardsDB.exec`
    INSERT INTO benefit_changes (benefit_id, version, old_value_amount, new_value_amount, old_period, new_period, source, reporters, note)
    VALUES (${benefitId}, ${updated.version}, ${current.value_amount}, ${top.value_amount},
            ${current.period}, ${top.period}, 'crowd', ${top.n}, ${note})
  `;
  // Personal overrides that now match the catalogue have done their job.
  await cardsDB.exec`
    UPDATE user_benefit_prefs SET value_override = NULL, period_override = NULL, updated_at = NOW()
    WHERE benefit_id = ${benefitId}
      AND value_override = ${top.value_amount}
      AND COALESCE(period_override, ${top.period}) = ${top.period}
  `;
  // Everyone should see the new value now, not when the cached catalogue expires.
  invalidate(CATALOGUE_KEY);
  log.info("catalogue credit updated by consensus", { benefitId, reporters: top.n });
  return true;
}
