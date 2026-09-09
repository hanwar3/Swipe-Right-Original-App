import { api, Query } from "encore.dev/api";
import { cardsDB } from "./db";

/**
 * Everything about one card in one call.
 *
 * Two audiences: the deck's flip-out summary, which needs the headline rate
 * and a couple of live offers, and the card profile screen, which needs the
 * full picture of what has been used and what is about to expire.
 */

export interface ProfileParams {
  userId: Query<string>;
  cardId: Query<number>;
}

export interface RateRow {
  category: string;
  categoryKey: string;
  rate: number;
  isRotating: boolean;
  capAmountCents?: number;
  capSpentCents?: number;
  capRemainingCents?: number;
  capPeriod?: string;
}

export interface BenefitRow {
  benefitId: number;
  name: string;
  description?: string;
  valueCents: number;
  usedCents: number;
  remainingCents: number;
  period: string;
  daysLeft: number;
  categoryKey?: string;
}

export interface OfferRow {
  id: number;
  merchantName: string;
  offerDescription: string;
  cashbackRate?: number;
  cashbackAmountCents?: number;
  minimumSpendCents?: number;
  isActivated: boolean;
  endDate?: string;
  daysLeft?: number;
}

export interface CardProfileResponse {
  cardId: number;
  name: string;
  displayName: string;
  issuer: string;
  network: string;
  type: string;
  annualFeeCents: number;
  inPortfolio: boolean;
  /** Best few rates, highest first. The deck summary shows the top three. */
  rates: RateRow[];
  benefits: BenefitRow[];
  offers: OfferRow[];
  /** Total credit still on the table across every benefit on this card. */
  unusedBenefitCents: number;
  /** Soonest benefit or offer expiry, in days. Undefined when nothing expires. */
  soonestExpiryDays?: number;
}

function periodEnd(period: string, now: Date): Date {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  if (period === "month") return new Date(Date.UTC(y, m + 1, 0));
  if (period === "quarter") return new Date(Date.UTC(y, Math.floor(m / 3) * 3 + 3, 0));
  return new Date(Date.UTC(y, 11, 31));
}

const dayMs = 86400000;

export const profile = api<ProfileParams, CardProfileResponse>(
  { expose: true, method: "GET", path: "/cards/profile" },
  async (params) => {
    const now = new Date();
    const { userId, cardId } = params;

    const card = await cardsDB.queryRow<{
      id: number; name: string; issuer: string; network: string | null;
      type: string | null; annual_fee: number; nickname: string | null;
      in_portfolio: boolean;
    }>`
      SELECT c.id, c.name, c.issuer, c.network, c.type, c.annual_fee,
             up.nickname,
             (up.id IS NOT NULL) AS in_portfolio
      FROM cards c
      LEFT JOIN user_portfolios up
        ON up.card_id = c.id AND up.user_id = ${userId} AND up.is_active = TRUE
      WHERE c.id = ${cardId}
    `;

    if (!card) {
      return {
        cardId, name: "Unknown card", displayName: "Unknown card", issuer: "",
        network: "", type: "credit", annualFeeCents: 0, inPortfolio: false,
        rates: [], benefits: [], offers: [], unusedBenefitCents: 0,
      };
    }

    // --- rates, with cap headroom ------------------------------------------
    const rateRows = await cardsDB.queryAll<{
      category: string; category_key: string; cashback_rate: string;
      is_rotating: boolean; cap_amount: number | null; cap_period: string | null;
      spent_amount: number | null;
    }>`
      SELECT cc.category, cc.category_key, cc.cashback_rate, cc.is_rotating,
             cc.cap_amount, cc.cap_period, ucs.spent_amount
      FROM card_categories cc
      LEFT JOIN user_category_spend ucs
        ON ucs.card_id = cc.card_id
       AND ucs.category_key = cc.category_key
       AND ucs.user_id = ${userId}
       AND ucs.period_start <= CURRENT_DATE
       AND ucs.period_end >= CURRENT_DATE
      WHERE cc.card_id = ${cardId}
      ORDER BY cc.cashback_rate DESC
    `;

    const rates: RateRow[] = rateRows.map((r) => {
      const cap = r.cap_amount ?? undefined;
      const spent = r.spent_amount ?? 0;
      return {
        category: r.category,
        categoryKey: r.category_key,
        rate: parseFloat(r.cashback_rate),
        isRotating: r.is_rotating,
        capAmountCents: cap,
        capSpentCents: cap ? spent : undefined,
        capRemainingCents: cap ? Math.max(0, cap - spent) : undefined,
        capPeriod: r.cap_period ?? undefined,
      };
    });

    // --- benefits, with what is left and how long is left ------------------
    const benefitRows = await cardsDB.queryAll<{
      id: number; name: string; description: string | null; value_amount: number;
      period: string; category_key: string | null; used_amount: number | null;
    }>`
      SELECT b.id, b.name, b.description, b.value_amount, b.period, b.category_key,
             u.used_amount
      FROM card_benefits b
      LEFT JOIN user_benefit_usage u
        ON u.benefit_id = b.id AND u.user_id = ${userId}
       AND u.period_start <= CURRENT_DATE AND u.period_end >= CURRENT_DATE
      WHERE b.card_id = ${cardId}
      ORDER BY b.value_amount DESC
    `;

    const benefits: BenefitRow[] = benefitRows.map((b) => {
      const used = b.used_amount ?? 0;
      const end = periodEnd(b.period, now);
      return {
        benefitId: b.id,
        name: b.name,
        description: b.description ?? undefined,
        valueCents: b.value_amount,
        usedCents: used,
        remainingCents: Math.max(0, b.value_amount - used),
        period: b.period,
        daysLeft: Math.max(0, Math.ceil((end.getTime() - now.getTime()) / dayMs)),
        categoryKey: b.category_key ?? undefined,
      };
    });

    // --- live merchant offers ----------------------------------------------
    const offerRows = await cardsDB.queryAll<{
      id: number; merchant_name: string; offer_description: string;
      cashback_rate: string | null; cashback_amount: number | null;
      minimum_spend: number | null; is_activated: boolean; end_date: Date | null;
    }>`
      SELECT id, merchant_name, offer_description, cashback_rate, cashback_amount,
             minimum_spend, is_activated, end_date
      FROM merchant_offers
      WHERE user_id = ${userId}
        AND card_id = ${cardId}
        AND is_used = FALSE
        AND (end_date IS NULL OR end_date >= CURRENT_DATE)
      ORDER BY is_activated DESC, end_date ASC NULLS LAST
    `;

    const offers: OfferRow[] = offerRows.map((o) => {
      const end = o.end_date ? new Date(o.end_date) : undefined;
      return {
        id: o.id,
        merchantName: o.merchant_name,
        offerDescription: o.offer_description,
        cashbackRate: o.cashback_rate ? parseFloat(o.cashback_rate) : undefined,
        cashbackAmountCents: o.cashback_amount ?? undefined,
        minimumSpendCents: o.minimum_spend ?? undefined,
        isActivated: o.is_activated,
        endDate: end ? end.toISOString().split("T")[0] : undefined,
        daysLeft: end ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / dayMs)) : undefined,
      };
    });

    const unusedBenefitCents = benefits.reduce((s, b) => s + b.remainingCents, 0);

    const expiries = [
      ...benefits.filter((b) => b.remainingCents > 0).map((b) => b.daysLeft),
      ...offers.map((o) => o.daysLeft).filter((d): d is number => d !== undefined),
    ];

    return {
      cardId: card.id,
      name: card.name,
      displayName: card.nickname || card.name,
      issuer: card.issuer,
      network: card.network || "Visa",
      type: card.type || "credit",
      annualFeeCents: card.annual_fee,
      inPortfolio: !!card.in_portfolio,
      rates,
      benefits,
      offers,
      unusedBenefitCents,
      soonestExpiryDays: expiries.length ? Math.min(...expiries) : undefined,
    };
  }
);
