import { cardsDB } from "./db";
import { periodWindow } from "./periods";
import { crowdMerchants } from "./offer_crowd";
import type { Contender, DecideResponse } from "./decide";

/**
 * Questions about the wallet itself, not about a purchase:
 *   "Which offers expire this week?"    "Any offers at Nike?"
 *   "What credits do I have left?"      "Which credits reset this month?"
 *
 * Answered from the same data Insights shows, deterministically, in the
 * decision's shape: the most relevant card comes forward in the deck, the
 * sentence is spoken, and the details are the "why" lines. An offer that was
 * never added in the issuer's portal pays nothing, so every answer says so.
 */

export interface AnswerItem {
  cardId: number;
  cardName: string;
  title: string;
  detail: string;
  daysLeft?: number;
  /** An offer that still has to be added in the portal. */
  needsAdding?: boolean;
}

export interface QuestionAnswer {
  kind: "expiring_offers" | "merchant_offers" | "credits_left";
  items: AnswerItem[];
}

type Question =
  | { kind: "expiring_offers"; days: number; label: string }
  | { kind: "merchant_offers"; merchant: string }
  | { kind: "credits_left"; soon: boolean; days: number; label: string };

const GENERIC = new Set([
  "cash back", "cashback", "my", "my card", "my cards", "all", "the", "any", "new", "good", "best",
  "card", "cards", "these", "those", "some", "current", "active", "live", "available", "it", "them",
]);

function windowOf(q: string): { days: number; label: string } {
  if (/\btoday\b/.test(q)) return { days: 0, label: "today" };
  if (/\btomorrow\b/.test(q)) return { days: 1, label: "by tomorrow" };
  if (/\bweek(end)?\b/.test(q)) return { days: 7, label: "this week" };
  if (/\bmonth\b/.test(q)) return { days: 31, label: "this month" };
  return { days: 14, label: "in the next two weeks" };
}

/** Which wallet question this is, or null for an ordinary "what am I buying". */
export function classify(raw: string): Question | null {
  const q = (raw || "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
  if (!q) return null;
  const offerWord = /\b(offers?|deals?|promos?)\b/.test(q);
  const expiryWord = /\b(expir\w*|ending|ends?|run(ning)? out|last chance|about to)\b/.test(q);
  const creditWord = /\b(credits?|benefits?|perks?)\b/.test(q);

  if (offerWord && expiryWord) return { kind: "expiring_offers", ...windowOf(q) };

  if (creditWord && /\b(left|remaining|unused|use|used|have|expir\w*|reset\w*|ending|lose|losing|waste|wasting)\b/.test(q)) {
    const soon = expiryWord || /\b(reset\w*|lose|losing|waste|wasting|soon)\b/.test(q);
    return { kind: "credits_left", soon, ...windowOf(q) };
  }

  if (!offerWord) return null;
  const at = /\b(?:offers?|deals?|promos?)\s+(?:at|for|on|from|with)\s+(.+?)[?.!]*$/.exec(q);
  const before = /^(?:any|got|have i got|do i have|is there|are there|show me|what)?\s*(?:an?\s+)?(.+?)\s+(?:offers?|deals?|promos?)[?.!]*$/.exec(q);
  let merchant = (at?.[1] ?? before?.[1] ?? "")
    .replace(/\b(right now|today|this (week|month)|now|please|on my cards?|i have)\b/g, "")
    .replace(/^(the|a|an)\s+/, "")
    .trim();
  if (/^(what|which|show|list|do i|any)$/.test(merchant)) merchant = "";
  if (!merchant || GENERIC.has(merchant) || merchant.length < 2) {
    // "What offers do I have?" lists them, soonest first.
    return { kind: "expiring_offers", days: 3650, label: "" };
  }
  return { kind: "merchant_offers", merchant };
}

const money = (cents: number) => "$" + (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
const DAY = 86400000;

function daysUntil(end: Date, now: Date): number {
  const a = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const b = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.max(0, Math.round((b - a) / DAY));
}

function when(end: Date, now: Date): string {
  const d = daysUntil(end, now);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d < 7) return end.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return end.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const shortName = (name: string, issuer: string) => {
  const trimmed = name.replace(new RegExp(`^${issuer}\\s+`, "i"), "").replace(/\s*(credit )?card$/i, "").trim();
  return trimmed || name;
};

function contender(card: { card_id: number; card_name: string; issuer: string; network: string | null }, reasons: string[]): Contender {
  return {
    cardId: Number(card.card_id),
    cardName: card.card_name,
    displayName: card.card_name,
    issuer: card.issuer,
    network: card.network || "Visa",
    effectiveRate: 0,
    baseRate: 0,
    reasons,
    capExhausted: false,
  };
}

function answer(kind: QuestionAnswer["kind"], spoken: string, items: AnswerItem[], lead?: Contender): DecideResponse {
  return {
    categoryKey: "question",
    winner: lead,
    contenders: lead ? [lead] : [],
    expiring: [],
    spoken,
    answer: { kind, items },
  };
}

interface OfferRow {
  card_id: number;
  card_name: string;
  issuer: string;
  network: string | null;
  merchant_name: string;
  offer_description: string;
  end_date: Date | string | null;
  is_activated: boolean;
}

async function liveOffers(userId: string): Promise<OfferRow[]> {
  return cardsDB.queryAll<OfferRow>`
    SELECT mo.card_id, c.name AS card_name, c.issuer, c.network, mo.merchant_name,
           mo.offer_description, mo.end_date, mo.is_activated
    FROM merchant_offers mo
    JOIN cards c ON c.id = mo.card_id
    JOIN user_portfolios up ON up.card_id = mo.card_id AND up.user_id = mo.user_id AND up.is_active = TRUE
    WHERE mo.user_id = ${userId}
      AND mo.disappeared_at IS NULL
      AND mo.is_used = FALSE
      AND (mo.end_date IS NULL OR mo.end_date >= CURRENT_DATE)
    ORDER BY mo.end_date ASC NULLS LAST, mo.is_activated ASC
  `;
}

/** `flag` marks offers still to add; off in spoken lines, which say it once at the end. */
function offerLine(o: OfferRow, now: Date, flag = true): string {
  const ends = o.end_date ? `, ends ${when(new Date(o.end_date), now)}` : "";
  return `${o.merchant_name}: ${o.offer_description} on ${shortName(o.card_name, o.issuer)}${ends}${flag && !o.is_activated ? " (add it first)" : ""}`;
}

function toItem(o: OfferRow, now: Date): AnswerItem {
  const end = o.end_date ? new Date(o.end_date) : undefined;
  return {
    cardId: Number(o.card_id),
    cardName: o.card_name,
    title: `${o.merchant_name}: ${o.offer_description}`,
    detail: `${shortName(o.card_name, o.issuer)}${end ? ` · ends ${when(end, now)}` : ""}${o.is_activated ? " · added" : " · not added yet"}`,
    daysLeft: end ? daysUntil(end, now) : undefined,
    needsAdding: !o.is_activated,
  };
}

function addReminder(offers: OfferRow[]): string {
  const missing = offers.filter((o) => !o.is_activated);
  if (!missing.length) return "";
  const issuers = [...new Set(missing.map((o) => o.issuer))];
  const one = missing.length === 1;
  return ` ${one ? "It isn't" : `${missing.length} aren't`} added yet: add ${one ? "it" : "them"} in ${issuers.join(" and ")} first, or ${one ? "it pays" : "they pay"} nothing.`;
}

async function expiringOffers(userId: string, q: { days: number; label: string }, now: Date): Promise<DecideResponse> {
  const all = await liveOffers(userId);
  const dated = q.days >= 3650 ? all : all.filter((o) => o.end_date && daysUntil(new Date(o.end_date), now) <= q.days);
  if (!dated.length) {
    const spoken = !all.length
      ? "You don't have any offers synced yet. Update a card from its bank page in Insights, or with the browser extension."
      : `No offers end ${q.label}. You have ${all.length} live offer${all.length === 1 ? "" : "s"}.`;
    return answer("expiring_offers", spoken, []);
  }
  const top = dated.slice(0, 2);
  const lead = q.days >= 3650
    ? `You have ${dated.length} live offer${dated.length === 1 ? "" : "s"}. Soonest: `
    : `${dated.length} offer${dated.length === 1 ? " ends" : "s end"} ${q.label}: `;
  const spoken = `${lead}${top.map((o) => offerLine(o, now, false)).join("; ")}.${addReminder(top)}`;
  return answer(
    "expiring_offers",
    spoken,
    dated.slice(0, 10).map((o) => toItem(o, now)),
    contender(top[0], dated.slice(0, 4).map((o) => offerLine(o, now)))
  );
}

/**
 * Same rule as the crowd hints: a merchant is only mentioned when 5+
 * cardholders have it. Called only when this user has no such offer, so all
 * of those cardholders are other people.
 */
async function othersHaveIt(userId: string, merchant: string): Promise<string | null> {
  const issuers = await cardsDB.queryAll<{ issuer: string }>`
    SELECT DISTINCT c.issuer FROM user_portfolios up JOIN cards c ON c.id = up.card_id
    WHERE up.user_id = ${userId} AND up.is_active = TRUE
  `;
  const want = merchant.toLowerCase();
  for (const { issuer } of issuers) {
    const crowd = await crowdMerchants(issuer);
    if (crowd.some((c) => c.merchant.toLowerCase().includes(want))) return issuer;
  }
  return null;
}

async function merchantOffers(userId: string, merchant: string, now: Date): Promise<DecideResponse> {
  const words = merchant.toLowerCase();
  const matches = (await liveOffers(userId)).filter((o) => {
    const m = o.merchant_name.toLowerCase();
    return m.includes(words) || words.includes(m);
  });
  const name = merchant.replace(/\b\w/g, (c) => c.toUpperCase());
  if (!matches.length) {
    const issuer = await othersHaveIt(userId, merchant);
    const spoken = issuer
      ? `No ${name} offer on your cards right now, but other ${issuer} cardholders have one. Check your ${issuer} offers and update.`
      : `No ${name} offer on your cards right now.`;
    return answer("merchant_offers", spoken, []);
  }
  // Added offers first: they pay today.
  matches.sort((a, b) => Number(b.is_activated) - Number(a.is_activated));
  const best = matches[0];
  const ends = best.end_date ? `, until ${when(new Date(best.end_date), now)}` : "";
  const more = matches.length > 1 ? ` ${matches.length - 1} more on your other cards.` : "";
  const spoken = `${shortName(best.card_name, best.issuer)} has a ${best.merchant_name} offer: ${best.offer_description}${ends}.${addReminder([best])}${more}`;
  return answer(
    "merchant_offers",
    spoken,
    matches.map((o) => toItem(o, now)),
    contender(best, matches.slice(0, 4).map((o) => offerLine(o, now)))
  );
}

interface CreditRow {
  card_id: number;
  card_name: string;
  issuer: string;
  network: string | null;
  name: string;
  unit: string;
  value_amount: number;
  period: string;
  used_amount: number | null;
  ends_on: Date | string | null;
}

async function creditsLeft(userId: string, q: { soon: boolean; days: number; label: string }, now: Date): Promise<DecideResponse> {
  const rows = await cardsDB.queryAll<CreditRow>`
    SELECT b.card_id, c.name AS card_name, c.issuer, c.network, b.name, b.unit,
           COALESCE(p.value_override, b.value_amount) AS value_amount,
           COALESCE(p.period_override, b.period) AS period,
           u.used_amount, u.ends_on
    FROM card_benefits b
    JOIN cards c ON c.id = b.card_id
    JOIN user_portfolios up ON up.card_id = b.card_id AND up.user_id = ${userId} AND up.is_active = TRUE
    LEFT JOIN user_benefit_prefs p ON p.benefit_id = b.id AND p.user_id = ${userId}
    LEFT JOIN user_benefit_usage u
      ON u.benefit_id = b.id AND u.user_id = ${userId}
     AND u.period_start <= CURRENT_DATE AND u.period_end >= CURRENT_DATE
    WHERE (b.user_id IS NULL OR b.user_id = ${userId})
      AND b.retired_at IS NULL
      AND COALESCE(p.hidden, FALSE) = FALSE
      AND b.unit = 'usd'
  `;
  const credits = rows
    .map((r) => {
      const w = periodWindow(r.period, now);
      const end = r.ends_on ? new Date(r.ends_on) : w.open ? undefined : w.end;
      return { ...r, remaining: Math.max(0, r.value_amount - (r.used_amount ?? 0)), daysLeft: end ? daysUntil(end, now) : undefined };
    })
    .filter((r) => r.remaining > 0)
    .sort((a, b) => (a.daysLeft ?? 99999) - (b.daysLeft ?? 99999) || b.remaining - a.remaining);

  if (!rows.length) {
    return answer("credits_left", "None of the cards in your wallet have credits I know about. You can add one in Insights.", []);
  }
  const shown = q.soon ? credits.filter((c) => c.daysLeft !== undefined && c.daysLeft <= Math.max(q.days, 7)) : credits;
  if (!shown.length) {
    const spoken = q.soon
      ? `Nothing resets ${q.label} with money left on it.${credits.length ? ` You still have ${money(credits.reduce((s, c) => s + c.remaining, 0))} in credits overall.` : ""}`
      : "You've used every credit this period. Nice.";
    return answer("credits_left", spoken, []);
  }

  const line = (c: (typeof credits)[number]) =>
    `${money(c.remaining)} ${c.name} on ${shortName(c.card_name, c.issuer)}${
      c.daysLeft === undefined ? "" : c.daysLeft === 0 ? ", resets today" : `, resets in ${c.daysLeft} day${c.daysLeft === 1 ? "" : "s"}`
    }`;
  const total = shown.reduce((s, c) => s + c.remaining, 0);
  const cards = new Set(shown.map((c) => c.card_id)).size;
  const lead = q.soon
    ? `${money(total)} in credits resets ${q.label}. Soonest: `
    : `You have ${money(total)} in credits left across ${cards} card${cards === 1 ? "" : "s"}. Soonest: `;
  const spoken = `${lead}${shown.slice(0, 2).map(line).join("; ")}.`;
  return answer(
    "credits_left",
    spoken,
    shown.slice(0, 10).map((c) => ({
      cardId: Number(c.card_id),
      cardName: c.card_name,
      title: `${c.name}: ${money(c.remaining)} left`,
      detail: `${shortName(c.card_name, c.issuer)}${c.daysLeft === undefined ? "" : ` · resets in ${c.daysLeft} day${c.daysLeft === 1 ? "" : "s"}`}`,
      daysLeft: c.daysLeft,
    })),
    contender(shown[0], shown.slice(0, 4).map(line))
  );
}

/** Answers a wallet question, or returns null so the purchase engine takes it. */
export async function answerQuestion(userId: string, text: string, now = new Date()): Promise<DecideResponse | null> {
  const q = classify(text);
  if (!q) return null;
  if (q.kind === "expiring_offers") return expiringOffers(userId, q, now);
  if (q.kind === "merchant_offers") return merchantOffers(userId, q.merchant, now);
  return creditsLeft(userId, q, now);
}
