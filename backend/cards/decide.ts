import { api, Query } from "encore.dev/api";
import { cardsDB } from "./db";

/**
 * The single source of truth for "which card should I use right now".
 *
 * Everything here is deterministic. No LLM decides anything — the model only
 * phrases the result this returns. That keeps the answer correct, instant and
 * free, and means the same question always gets the same answer.
 */

// ---------------------------------------------------------------------------
// Category taxonomy
// ---------------------------------------------------------------------------

/** Free text a user (or a voice transcript) might say -> canonical key. */
const CATEGORY_ALIASES: Record<string, string> = {
  gas: "gas", "gas station": "gas", "gas stations": "gas", fuel: "gas",
  petrol: "gas", shell: "gas", chevron: "gas", exxon: "gas", bp: "gas",

  groceries: "groceries", grocery: "groceries", supermarket: "groceries",
  supermarkets: "groceries", "grocery store": "groceries", safeway: "groceries",
  kroger: "groceries", "trader joe's": "groceries", "whole foods": "groceries",

  dining: "dining", restaurant: "dining", restaurants: "dining", food: "dining",
  eating: "dining", takeout: "dining", delivery: "dining", coffee: "dining",
  starbucks: "dining", lunch: "dining", dinner: "dining",

  travel: "travel", flights: "flights", flight: "flights", airline: "flights",
  hotels: "hotels", hotel: "hotels", airbnb: "hotels",

  streaming: "streaming", netflix: "streaming", spotify: "streaming",
  transit: "transit", uber: "transit", lyft: "transit", subway: "transit",
  entertainment: "entertainment",
  drugstores: "drugstores", drugstore: "drugstores", pharmacy: "drugstores",
  cvs: "drugstores", walgreens: "drugstores",
  online: "online", "online shopping": "online", amazon: "online",
  wholesale: "wholesale", costco: "wholesale", "sam's club": "wholesale",
  department: "department", target: "department",
  utilities: "utilities",
};

/**
 * A card earning on "travel" also earns on a flight or a hotel, so a query for
 * flights must consider the parent. Order matters: most specific first.
 */
const CATEGORY_PARENTS: Record<string, string[]> = {
  flights: ["travel"],
  hotels: ["travel"],
  transit: ["travel"],
};

/** Rate every card falls back to once a bonus cap is exhausted. */
const BASE_FALLBACK_RATE = 1.0;

/** A benefit closer than this to expiry is worth interrupting the user about. */
const EXPIRY_WARNING_DAYS = 45;

export function normalizeCategory(input: string): string {
  const raw = (input || "").trim().toLowerCase();
  if (!raw) return "all";
  if (CATEGORY_ALIASES[raw]) return CATEGORY_ALIASES[raw];

  // "I'm at a gas station" / "buying groceries" — find any alias mentioned.
  for (const alias of Object.keys(CATEGORY_ALIASES)) {
    if (raw.includes(alias)) return CATEGORY_ALIASES[alias];
  }
  return raw.replace(/\s+/g, "_");
}

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

function periodBounds(period: string, now: Date): { start: Date; end: Date } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  switch (period) {
    case "month":
      return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 0)) };
    case "quarter": {
      const q = Math.floor(m / 3) * 3;
      return { start: new Date(Date.UTC(y, q, 1)), end: new Date(Date.UTC(y, q + 3, 0)) };
    }
    default:
      return { start: new Date(Date.UTC(y, 0, 1)), end: new Date(Date.UTC(y, 11, 31)) };
  }
}

function daysUntil(d: Date, now: Date): number {
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}

function money(cents: number): string {
  return "$" + (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DecideParams {
  userId: Query<string>;
  /** Free text is fine: "gas", "I'm at Costco", "buying groceries". */
  category: Query<string>;
  /** Optional purchase amount in cents; unlocks real dollar comparisons. */
  amountCents?: Query<number>;
}

export interface Contender {
  cardId: number;
  cardName: string;
  displayName: string;
  issuer: string;
  network: string;
  effectiveRate: number;
  baseRate: number;
  /** Cashback in cents, only when amountCents was supplied. */
  valueCents?: number;
  /** Plain-language justification, most important first. */
  reasons: string[];
  capRemainingCents?: number;
  capExhausted: boolean;
  offerApplied?: string;
}

export interface ExpiringBenefit {
  cardId: number;
  cardName: string;
  name: string;
  description?: string;
  remainingCents: number;
  daysLeft: number;
}

export interface Nudge {
  kind: "expiring_benefit" | "cap_warning";
  headline: string;
  detail: string;
  /** True when acting on the nudge beats the top card on pure cashback. */
  overridesWinner: boolean;
  cardId?: number;
}

export interface DecideResponse {
  categoryKey: string;
  winner?: Contender;
  runnerUp?: Contender;
  contenders: Contender[];
  expiring: ExpiringBenefit[];
  nudge?: Nudge;
  /** Deterministic one-liner. Safe to speak verbatim if the LLM is unavailable. */
  spoken: string;
}

// ---------------------------------------------------------------------------
// The endpoint
// ---------------------------------------------------------------------------

export const decide = api<DecideParams, DecideResponse>(
  { expose: true, method: "GET", path: "/cards/decide" },
  async (params) => runDecision(params.userId, params.category, params.amountCents)
);

/**
 * The engine, callable in-process. The AI service uses this directly so a
 * spoken answer costs one database round trip instead of an HTTP hop.
 */
export async function runDecision(
  userIdArg: string,
  categoryArg: string,
  amountArg?: number
): Promise<DecideResponse> {
  {
    const now = new Date();
    const userId = userIdArg;
    const categoryKey = normalizeCategory(categoryArg);
    const amountCents = amountArg && amountArg > 0 ? amountArg : undefined;

    // Categories that can satisfy this query, best match first.
    const applicable = [categoryKey, ...(CATEGORY_PARENTS[categoryKey] || []), "all"];

    // --- 1. Portfolio + every rate that could apply -------------------------
    const rows = await cardsDB.queryAll<{
      card_id: number; name: string; nickname: string | null; issuer: string;
      network: string | null; category_key: string; cashback_rate: string;
      cap_amount: number | null; cap_period: string | null; is_rotating: boolean;
    }>`
      SELECT up.card_id, c.name, up.nickname, c.issuer, c.network,
             cc.category_key, cc.cashback_rate, cc.cap_amount, cc.cap_period, cc.is_rotating
      FROM user_portfolios up
      JOIN cards c ON c.id = up.card_id
      JOIN card_categories cc ON cc.card_id = up.card_id
      WHERE up.user_id = ${userId}
        AND up.is_active = TRUE
        AND cc.category_key = ANY(${applicable})
    `;

    if (rows.length === 0) {
      return {
        categoryKey, contenders: [], expiring: [],
        spoken: "You don't have any cards in your portfolio yet. Add a few and I can start picking for you.",
      };
    }

    // --- 2. User-chosen categories override the card's default --------------
    const choices = await cardsDB.queryAll<{
      card_id: number; category_key: string; cashback_rate: string;
    }>`
      SELECT card_id, category_key, cashback_rate
      FROM user_category_choices
      WHERE user_id = ${userId}
        AND period_start <= CURRENT_DATE
        AND period_end >= CURRENT_DATE
    `;
    const chosen = new Map<number, { key: string; rate: number }>();
    for (const c of choices) {
      chosen.set(c.card_id, { key: c.category_key, rate: parseFloat(c.cashback_rate) });
    }

    // --- 3. Spend against caps ---------------------------------------------
    const spendRows = await cardsDB.queryAll<{
      card_id: number; category_key: string; spent_amount: number;
    }>`
      SELECT card_id, category_key, spent_amount
      FROM user_category_spend
      WHERE user_id = ${userId}
        AND period_start <= CURRENT_DATE
        AND period_end >= CURRENT_DATE
    `;
    const spent = new Map<string, number>();
    for (const s of spendRows) spent.set(`${s.card_id}:${s.category_key}`, s.spent_amount);

    // --- 4. Merchant offers -------------------------------------------------
    const offerRows = await cardsDB.queryAll<{
      card_id: number; merchant_name: string; offer_description: string;
      cashback_rate: string | null; cashback_amount: number | null;
      minimum_spend: number | null; is_activated: boolean;
    }>`
      SELECT card_id, merchant_name, offer_description, cashback_rate,
             cashback_amount, minimum_spend, is_activated
      FROM merchant_offers
      WHERE user_id = ${userId}
        AND is_used = FALSE
        AND (end_date IS NULL OR end_date >= CURRENT_DATE)
        AND (LOWER(merchant_name) LIKE ${"%" + categoryKey + "%"}
             OR LOWER(offer_description) LIKE ${"%" + categoryKey + "%"})
      ORDER BY is_activated DESC
    `;

    // --- 5. Build one contender per card ------------------------------------
    const byCard = new Map<number, Contender>();

    for (const r of rows) {
      const rate = parseFloat(r.cashback_rate);
      const specificity = applicable.indexOf(r.category_key);
      if (specificity < 0) continue;

      const override = chosen.get(r.card_id);
      const useOverride = override && applicable.includes(override.key);
      const candidateRate = useOverride ? override.rate : rate;
      const candidateKey = useOverride ? override.key : r.category_key;

      const reasons: string[] = [];
      let effective = candidateRate;
      let capRemaining: number | undefined;
      let capExhausted = false;

      if (r.cap_amount) {
        const used = spent.get(`${r.card_id}:${candidateKey}`) || 0;
        capRemaining = Math.max(0, r.cap_amount - used);
        if (capRemaining === 0) {
          effective = BASE_FALLBACK_RATE;
          capExhausted = true;
          reasons.push(`${candidateRate}% cap is used up this ${r.cap_period || "period"} — drops to ${BASE_FALLBACK_RATE}%`);
        } else if (amountCents && amountCents > capRemaining) {
          // Part of this purchase earns the bonus, the rest does not.
          const bonusPart = capRemaining / amountCents;
          effective = candidateRate * bonusPart + BASE_FALLBACK_RATE * (1 - bonusPart);
          reasons.push(`Only ${money(capRemaining)} of the ${candidateRate}% cap is left, so this purchase blends to ${effective.toFixed(1)}%`);
        } else {
          reasons.push(`${money(capRemaining)} left of the ${candidateRate}% cap this ${r.cap_period || "period"}`);
        }
      }

      if (useOverride) {
        reasons.unshift(`You set this card to ${override!.key} for this period`);
      } else if (r.is_rotating) {
        reasons.unshift(`${candidateRate}% rotating category, active now`);
      } else if (r.category_key === "all" && specificity > 0) {
        reasons.unshift(`Flat ${candidateRate}% on everything`);
      } else {
        reasons.unshift(`${candidateRate}% on ${candidateKey}`);
      }

      const existing = byCard.get(r.card_id);
      if (existing && existing.effectiveRate >= effective) continue;

      byCard.set(r.card_id, {
        cardId: r.card_id,
        cardName: r.name,
        displayName: r.nickname || r.name,
        issuer: r.issuer,
        network: r.network || "Visa",
        effectiveRate: Math.round(effective * 100) / 100,
        baseRate: candidateRate,
        reasons,
        capRemainingCents: capRemaining,
        capExhausted,
      });
    }

    // --- 6. Merchant offers can beat the category rate ----------------------
    for (const o of offerRows) {
      const c = byCard.get(o.card_id);
      if (!c) continue; // offer on a card they don't hold

      let offerRate: number | undefined;
      if (o.cashback_rate) {
        offerRate = parseFloat(o.cashback_rate);
      } else if (o.cashback_amount && o.minimum_spend && o.minimum_spend > 0) {
        offerRate = (o.cashback_amount / o.minimum_spend) * 100;
      }

      if (offerRate && offerRate > c.effectiveRate) {
        c.effectiveRate = Math.round(offerRate * 100) / 100;
        c.offerApplied = o.offer_description;
        c.reasons.unshift(
          o.is_activated
            ? `Activated offer at ${o.merchant_name} beats the category rate`
            : `Offer at ${o.merchant_name} — activate it first`
        );
      }
    }

    const contenders = [...byCard.values()].sort((a, b) => b.effectiveRate - a.effectiveRate);
    if (amountCents) {
      for (const c of contenders) {
        c.valueCents = Math.round((amountCents * c.effectiveRate) / 100);
      }
    }

    const winner = contenders[0];
    const runnerUp = contenders[1];

    // --- 7. Benefits about to expire ----------------------------------------
    const benefitRows = await cardsDB.queryAll<{
      benefit_id: number; card_id: number; card_name: string; name: string;
      description: string | null; value_amount: number; period: string;
      category_key: string | null; used_amount: number | null;
    }>`
      SELECT b.id AS benefit_id, b.card_id, c.name AS card_name, b.name,
             b.description, b.value_amount, b.period, b.category_key,
             u.used_amount
      FROM card_benefits b
      JOIN cards c ON c.id = b.card_id
      JOIN user_portfolios up ON up.card_id = b.card_id
        AND up.user_id = ${userId} AND up.is_active = TRUE
      LEFT JOIN user_benefit_usage u
        ON u.benefit_id = b.id AND u.user_id = ${userId}
        AND u.period_start <= CURRENT_DATE AND u.period_end >= CURRENT_DATE
    `;

    const expiring: ExpiringBenefit[] = [];
    for (const b of benefitRows) {
      const remaining = b.value_amount - (b.used_amount || 0);
      if (remaining <= 0) continue;

      const { end } = periodBounds(b.period, now);
      const daysLeft = daysUntil(end, now);
      if (daysLeft > EXPIRY_WARNING_DAYS) continue;

      expiring.push({
        cardId: b.card_id,
        cardName: b.card_name,
        name: b.name,
        description: b.description || undefined,
        remainingCents: remaining,
        daysLeft,
      });
    }
    expiring.sort((a, b) => a.daysLeft - b.daysLeft);

    // --- 8. The tradeoff -----------------------------------------------------
    // Only surface a benefit the user could actually use on THIS purchase.
    let nudge: Nudge | undefined;
    const relevant = expiring.find((e) => {
      const b = benefitRows.find((r) => r.card_id === e.cardId && r.name === e.name);
      return !b?.category_key || applicable.includes(b.category_key);
    });

    if (relevant && winner) {
      const alt = contenders.find((c) => c.cardId === relevant.cardId);
      let overrides = false;
      let detail: string;

      if (alt && amountCents) {
        // Real comparison: lost cashback versus credit that would otherwise vanish.
        const lost = (winner.valueCents || 0) - (alt.valueCents || 0);
        const gain = Math.min(relevant.remainingCents, amountCents);
        overrides = gain > lost;
        detail = overrides
          ? `Using ${alt.displayName} costs you ${money(lost)} in cashback but rescues ${money(gain)} of credit. Net ${money(gain - lost)} ahead.`
          : `Worth ${money(relevant.remainingCents)}, but switching would cost ${money(lost)} in cashback here. Save it for a bigger purchase.`;
      } else {
        detail = `${money(relevant.remainingCents)} unused${alt ? ` on your ${alt.displayName}` : ""}. Tell me the amount and I'll work out whether it beats the cashback.`;
        overrides = false;
      }

      nudge = {
        kind: "expiring_benefit",
        headline: `${relevant.name} expires in ${relevant.daysLeft} day${relevant.daysLeft === 1 ? "" : "s"}`,
        detail,
        overridesWinner: overrides,
        cardId: relevant.cardId,
      };
    } else if (winner?.capExhausted) {
      nudge = {
        kind: "cap_warning",
        headline: "Bonus cap reached",
        detail: `${winner.displayName} has used its bonus allowance, so it's earning the base rate now.`,
        overridesWinner: false,
      };
    }

    // --- 9. A correct sentence, with no model involved -----------------------
    let spoken: string;
    if (!winner) {
      spoken = "Nothing in your portfolio earns on this one.";
    } else if (nudge?.overridesWinner) {
      const alt = contenders.find((c) => c.cardId === nudge!.cardId)!;
      spoken = `Use ${alt.displayName}. You'd earn a little more on ${winner.displayName}, but ${alt.displayName} has credit expiring in ${relevant!.daysLeft} days that's worth more.`;
    } else {
      const gap = runnerUp ? winner.effectiveRate - runnerUp.effectiveRate : 0;
      spoken =
        `Use ${winner.displayName} — ${winner.effectiveRate}% back.` +
        (gap > 0.4 ? ` That's ${gap.toFixed(1)} points better than anything else you hold.` : "");
    }

    return { categoryKey, winner, runnerUp, contenders, expiring, nudge, spoken };
  }
}
