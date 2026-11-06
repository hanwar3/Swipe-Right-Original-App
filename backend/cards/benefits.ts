import { api, APIError } from "encore.dev/api";
import { randomBytes } from "node:crypto";
import { cardsDB } from "./db";
import { currentUserId } from "../lib/session";
import { rateLimit } from "../lib/ratelimit";
import { cached, invalidate } from "../lib/cache";
import { dateOnly, isPeriod, periodWindow } from "./periods";

/*
 * Card credits: one catalogue for everyone, and each user's own usage, custom
 * credits and hidden credits next to it. Usage is per period, so a monthly
 * credit used in March is unused again in April, on every device.
 */

export interface CatalogueBenefit {
  id: number;
  cardId: number;
  /** Stable id the app has always used, e.g. "107_doordash_credit". */
  slug: string;
  name: string;
  description?: string;
  /** "statement_credit" | "subscription" */
  kind: string;
  /** "usd" (value in cents) | "count" (value is a number of uses) */
  unit: string;
  valueCents: number;
  /** month | quarter | half | year | anniversary | four_years */
  period: string;
  category?: string;
  version: number;
  /** What changed last, e.g. "Now $15 a month (was $5)." */
  changeNote?: string;
  changedAt?: string;
  custom?: boolean;
}

function toBenefit(r: Record<string, any>): CatalogueBenefit {
  return {
    id: Number(r.id),
    cardId: Number(r.card_id),
    slug: r.slug ?? `srv_${r.id}`,
    name: r.name,
    description: r.description ?? undefined,
    kind: r.kind,
    unit: r.unit,
    valueCents: r.value_amount,
    period: r.period,
    category: r.display_category ?? undefined,
    version: r.version,
    changeNote: r.change_note ?? undefined,
    changedAt: r.changed_at ? new Date(r.changed_at).toISOString() : undefined,
    custom: r.source === "custom" || undefined,
  };
}

export const CATALOGUE_KEY = "benefits:catalogue";

// Every card's credits as they stand today. Public: no user data in it, so
// each instance serves it from memory for a minute.
export const catalogue = api(
  { expose: true, method: "GET", path: "/benefits/catalogue" },
  async (): Promise<{ benefits: CatalogueBenefit[] }> => ({
    benefits: await cached(CATALOGUE_KEY, 60_000, async () => {
      const rows = await cardsDB.queryAll`
      SELECT id, card_id, slug, name, description, kind, unit, value_amount, period,
             display_category, version, change_note, changed_at, source
      FROM card_benefits
      WHERE user_id IS NULL AND retired_at IS NULL
      ORDER BY card_id, value_amount DESC
    `;
      return rows.map(toBenefit);
    }),
  })
);

export interface BenefitUsage {
  benefitId: number;
  usedCents: number;
  /** "manual" when tapped in the app, "portal" when read off the issuer's site. */
  source: string;
  asOf?: string;
  periodEnd: string;
}

export interface MyBenefits {
  usage: BenefitUsage[];
  custom: CatalogueBenefit[];
  hidden: number[];
  /** Where this user's own portal disagrees with the catalogue. */
  overrides: { benefitId: number; valueCents?: number; period?: string }[];
}

export const mine = api(
  { expose: true, auth: true, method: "GET", path: "/benefits/mine" },
  async (): Promise<MyBenefits> => {
    const userId = currentUserId();
    const usage = await cardsDB.queryAll`
      SELECT benefit_id, used_amount, source, as_of, period_end
      FROM user_benefit_usage
      WHERE user_id = ${userId} AND period_start <= CURRENT_DATE AND period_end >= CURRENT_DATE
    `;
    const custom = await cardsDB.queryAll`
      SELECT id, card_id, slug, name, description, kind, unit, value_amount, period,
             display_category, version, change_note, changed_at, source
      FROM card_benefits
      WHERE user_id = ${userId} AND source = 'custom' AND retired_at IS NULL
      ORDER BY id
    `;
    const prefs = await cardsDB.queryAll`
      SELECT benefit_id, hidden, value_override, period_override
      FROM user_benefit_prefs WHERE user_id = ${userId}
    `;
    return {
      usage: usage.map((u) => ({
        benefitId: Number(u.benefit_id),
        usedCents: u.used_amount,
        source: u.source ?? "manual",
        asOf: u.as_of ? new Date(u.as_of).toISOString() : undefined,
        periodEnd: dateOnly(new Date(u.period_end)),
      })),
      custom: custom.map(toBenefit),
      hidden: prefs.filter((p) => p.hidden).map((p) => Number(p.benefit_id)),
      overrides: prefs
        .filter((p) => p.value_override !== null || p.period_override !== null)
        .map((p) => ({
          benefitId: Number(p.benefit_id),
          valueCents: p.value_override ?? undefined,
          period: p.period_override ?? undefined,
        })),
    };
  }
);

/** A credit the user may log against: on a card they hold, catalogue or their own. */
async function ownedBenefit(userId: string, benefitId: number) {
  const row = await cardsDB.queryRow<{ id: number; value_amount: number; period: string; unit: string }>`
    SELECT b.id,
           COALESCE(p.value_override, b.value_amount) AS value_amount,
           COALESCE(p.period_override, b.period) AS period,
           b.unit
    FROM card_benefits b
    JOIN user_portfolios up ON up.card_id = b.card_id AND up.user_id = ${userId}
    LEFT JOIN user_benefit_prefs p ON p.benefit_id = b.id AND p.user_id = ${userId}
    WHERE b.id = ${benefitId} AND (b.user_id IS NULL OR b.user_id = ${userId})
  `;
  if (!row) throw APIError.notFound("That credit is not on a card in your wallet");
  return row;
}

async function writeUsage(userId: string, benefitId: number, usedCents: number, period: string, onlyIfEmpty = false) {
  const w = periodWindow(period);
  if (onlyIfEmpty) {
    await cardsDB.exec`
      INSERT INTO user_benefit_usage (user_id, benefit_id, period_start, period_end, used_amount, source, as_of, updated_at)
      VALUES (${userId}, ${benefitId}, ${dateOnly(w.start)}::date, ${dateOnly(w.end)}::date, ${usedCents}, 'manual', NOW(), NOW())
      ON CONFLICT (user_id, benefit_id, period_start) DO NOTHING
    `;
    return w;
  }
  await cardsDB.exec`
    INSERT INTO user_benefit_usage (user_id, benefit_id, period_start, period_end, used_amount, source, as_of, updated_at)
    VALUES (${userId}, ${benefitId}, ${dateOnly(w.start)}::date, ${dateOnly(w.end)}::date, ${usedCents}, 'manual', NOW(), NOW())
    ON CONFLICT (user_id, benefit_id, period_start) DO UPDATE SET
      used_amount = EXCLUDED.used_amount,
      period_end  = EXCLUDED.period_end,
      source      = 'manual',
      as_of       = NOW(),
      updated_at  = NOW()
  `;
  return w;
}

export interface LogUsageRequest {
  benefitId: number;
  /** Total used this period (not a delta), in cents or uses. */
  usedCents: number;
}

// The manual tap: "I've used $8 of this month's $10." Stored for the current period.
export const logUsage = api<LogUsageRequest, { usedCents: number; periodEnd: string }>(
  { expose: true, auth: true, method: "POST", path: "/benefits/usage" },
  async (req) => {
    const userId = currentUserId();
    rateLimit(`benefit-usage:${userId}`, 120, 60_000);
    const b = await ownedBenefit(userId, req.benefitId);
    const used = Number.isFinite(req.usedCents) ? Math.round(Math.max(0, Math.min(req.usedCents, b.value_amount))) : 0;
    const w = await writeUsage(userId, b.id, used, b.period);
    return { usedCents: used, periodEnd: dateOnly(w.end) };
  }
);

const CATEGORIES = ["Travel", "Hotels", "Dining", "Rides", "Streaming", "Entertainment", "Shopping", "Groceries", "Wellness", "Other"];

export interface AddCustomRequest {
  cardId: number;
  name: string;
  valueCents: number;
  unit?: string;
  period: string;
  category?: string;
}

function cleanText(raw: unknown, max: number): string {
  return typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

async function insertCustom(userId: string, req: AddCustomRequest): Promise<CatalogueBenefit | null> {
  const name = cleanText(req.name, 60);
  if (!name) throw APIError.invalidArgument("Give the credit a name");
  if (!isPeriod(req.period)) throw APIError.invalidArgument("Pick how often the credit resets");
  const unit = req.unit === "count" ? "count" : "usd";
  const value = Math.round(Number(req.valueCents));
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000) {
    throw APIError.invalidArgument("Enter what the credit is worth");
  }
  const category = CATEGORIES.includes(String(req.category)) ? String(req.category) : "Other";

  const holds = await cardsDB.queryRow`
    SELECT 1 AS ok FROM user_portfolios WHERE user_id = ${userId} AND card_id = ${req.cardId}
  `;
  if (!holds) throw APIError.notFound("That card is not in your wallet");
  const count = await cardsDB.queryRow<{ n: number }>`
    SELECT COUNT(*)::int AS n FROM card_benefits WHERE user_id = ${userId} AND source = 'custom'
  `;
  if ((count?.n ?? 0) >= 60) throw APIError.resourceExhausted("That's the most custom credits one account can hold");

  const row = await cardsDB.queryRow`
    INSERT INTO card_benefits
      (card_id, user_id, slug, name, description, value_amount, period, kind, unit, display_category, source)
    VALUES
      (${req.cardId}, ${userId}, ${`custom_${randomBytes(6).toString("hex")}`}, ${name}, 'Added by you.',
       ${value}, ${req.period}, 'statement_credit', ${unit}, ${category}, 'custom')
    ON CONFLICT (card_id, COALESCE(user_id, ''), LOWER(name)) DO NOTHING
    RETURNING id, card_id, slug, name, description, kind, unit, value_amount, period,
              display_category, version, change_note, changed_at, source
  `;
  return row ? toBenefit(row) : null;
}

// A credit the catalogue does not list, on a card the user holds.
export const addCustom = api<AddCustomRequest, CatalogueBenefit>(
  { expose: true, auth: true, method: "POST", path: "/benefits/custom" },
  async (req) => {
    const userId = currentUserId();
    rateLimit(`benefit-custom:${userId}`, 30, 60 * 60_000);
    const added = await insertCustom(userId, req);
    if (!added) throw APIError.alreadyExists("You already have a credit with that name on this card");
    return added;
  }
);

export const removeCustom = api<{ id: number }, { removed: boolean }>(
  { expose: true, auth: true, method: "POST", path: "/benefits/custom/:id/delete" },
  async ({ id }) => {
    const userId = currentUserId();
    const row = await cardsDB.queryRow`
      DELETE FROM card_benefits WHERE id = ${id} AND user_id = ${userId} AND source = 'custom' RETURNING id
    `;
    if (!row) throw APIError.notFound("No such credit");
    return { removed: true };
  }
);

// "This credit doesn't apply to me": hides a catalogue credit for this user only.
export const setHidden = api<{ id: number; hidden: boolean }, { hidden: boolean }>(
  { expose: true, auth: true, method: "POST", path: "/benefits/:id/visibility" },
  async ({ id, hidden }) => {
    const userId = currentUserId();
    const row = await cardsDB.queryRow`
      SELECT id FROM card_benefits WHERE id = ${id} AND user_id IS NULL
    `;
    if (!row) throw APIError.notFound("No such credit");
    await cardsDB.exec`
      INSERT INTO user_benefit_prefs (user_id, benefit_id, hidden, updated_at)
      VALUES (${userId}, ${id}, ${!!hidden}, NOW())
      ON CONFLICT (user_id, benefit_id) DO UPDATE SET hidden = EXCLUDED.hidden, updated_at = NOW()
    `;
    return { hidden: !!hidden };
  }
);

export interface ImportRequest {
  /** Dollars-used entries keyed by the app's benefit ids (slugs). */
  credits: { slug: string; usedCents: number }[];
  subscriptions: { slug: string; active: boolean }[];
  hidden: string[];
  custom: AddCustomRequest[];
}

// One-time move of what a browser logged before accounts synced. Never
// overwrites anything the server already has for the current period.
export const importLocal = api<ImportRequest, { imported: number }>(
  { expose: true, auth: true, method: "POST", path: "/benefits/import" },
  async (req) => {
    const userId = currentUserId();
    rateLimit(`benefit-import:${userId}`, 5, 60 * 60_000);
    const limit = <T>(xs: T[] | undefined) => (Array.isArray(xs) ? xs.slice(0, 200) : []);

    const rows = await cardsDB.queryAll<{ id: number; slug: string; value_amount: number; period: string }>`
      SELECT b.id, b.slug, b.value_amount, b.period
      FROM card_benefits b
      JOIN user_portfolios up ON up.card_id = b.card_id AND up.user_id = ${userId}
      WHERE b.user_id IS NULL AND b.slug IS NOT NULL AND b.retired_at IS NULL
    `;
    const bySlug = new Map<string, typeof rows>();
    for (const r of rows) bySlug.set(r.slug, [...(bySlug.get(r.slug) ?? []), r]);

    let imported = 0;
    for (const c of limit(req.credits)) {
      for (const b of bySlug.get(String(c.slug)) ?? []) {
        const used = Math.round(Math.max(0, Math.min(Number(c.usedCents) || 0, b.value_amount)));
        if (used > 0) {
          await writeUsage(userId, b.id, used, b.period, true);
          imported++;
        }
      }
    }
    for (const s of limit(req.subscriptions)) {
      if (!s.active) continue;
      for (const b of bySlug.get(String(s.slug)) ?? []) {
        await writeUsage(userId, b.id, b.value_amount, b.period, true);
        imported++;
      }
    }
    for (const slug of limit(req.hidden)) {
      for (const b of bySlug.get(String(slug)) ?? []) {
        await cardsDB.exec`
          INSERT INTO user_benefit_prefs (user_id, benefit_id, hidden, updated_at)
          VALUES (${userId}, ${b.id}, TRUE, NOW())
          ON CONFLICT (user_id, benefit_id) DO NOTHING
        `;
        imported++;
      }
    }
    for (const c of limit(req.custom).slice(0, 30)) {
      try {
        if (await insertCustom(userId, c)) imported++;
      } catch {
        /* a card no longer in the wallet, or a malformed entry: skip it */
      }
    }
    return { imported };
  }
);

export interface UpdateCatalogueRequest {
  /** One row, or every card that lists this slug. */
  benefitId?: number;
  slug?: string;
  valueCents?: number;
  period?: string;
  name?: string;
  description?: string;
  /** Shown to cardholders, e.g. "Now $15 a month (was $5)." */
  note: string;
}

// Editorial update when an issuer changes a credit. Internal only: run it
// from the Encore dashboard's API explorer, never reachable from the web.
export const updateCatalogue = api<UpdateCatalogueRequest, { updated: number }>(
  { expose: false },
  async (req) => {
    if (!req.benefitId && !req.slug) throw APIError.invalidArgument("benefitId or slug");
    if (req.period !== undefined && !isPeriod(req.period)) throw APIError.invalidArgument("bad period");
    const note = cleanText(req.note, 200);
    if (!note) throw APIError.invalidArgument("Say what changed");
    const targets = await cardsDB.queryAll<{ id: number; value_amount: number; period: string; version: number }>`
      SELECT id, value_amount, period, version FROM card_benefits
      WHERE user_id IS NULL AND (id = ${req.benefitId ?? -1} OR slug = ${req.slug ?? ""})
    `;
    for (const t of targets) {
      await cardsDB.exec`
        UPDATE card_benefits SET
          value_amount = COALESCE(${req.valueCents ?? null}, value_amount),
          period       = COALESCE(${req.period ?? null}, period),
          name         = COALESCE(${req.name ? cleanText(req.name, 60) : null}, name),
          description  = COALESCE(${req.description ? cleanText(req.description, 200) : null}, description),
          version      = version + 1,
          change_note  = ${note},
          changed_at   = NOW()
        WHERE id = ${t.id}
      `;
      await cardsDB.exec`
        INSERT INTO benefit_changes (benefit_id, version, old_value_amount, new_value_amount, old_period, new_period, source, note)
        VALUES (${t.id}, ${t.version + 1}, ${t.value_amount}, ${req.valueCents ?? t.value_amount},
                ${t.period}, ${req.period ?? t.period}, 'editorial', ${note})
      `;
    }
    invalidate(CATALOGUE_KEY);
    return { updated: targets.length };
  }
);
