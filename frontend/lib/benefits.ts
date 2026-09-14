import { useEffect, useState } from 'react';

/**
 * Card benefits and the usage the user has logged against them.
 *
 * Moved out of the old Wallet page so Insights can own it. The benefit ids and
 * the localStorage keys are unchanged on purpose: anything already logged on a
 * device carries straight over.
 *
 * Each benefit now carries an explicit category. Insights only shows a category
 * filter for categories that actually appear on the cards in the user's wallet,
 * and that needs to be a fact about the benefit, not a guess from its name.
 */

export type BenefitCategory =
  | 'Travel' | 'Hotels' | 'Dining' | 'Rides' | 'Streaming' | 'Entertainment'
  | 'Shopping' | 'Groceries' | 'Wellness' | 'Other';

export const CATEGORY_OPTIONS: BenefitCategory[] = [
  'Travel', 'Hotels', 'Dining', 'Rides', 'Streaming', 'Entertainment',
  'Shopping', 'Groceries', 'Wellness', 'Other',
];

/**
 * Real credits do not all reset on the calendar. Quarterly credits exist, free
 * nights and anniversary miles follow the card's own anniversary, and Global
 * Entry style credits come round every four years.
 */
export type BenefitPeriod =
  | 'monthly' | 'quarterly' | 'semi-annually' | 'yearly' | 'anniversary' | 'every-4-years';

export const PERIOD_OPTIONS: { value: BenefitPeriod; label: string }[] = [
  { value: 'monthly', label: 'Every month' },
  { value: 'quarterly', label: 'Every quarter' },
  { value: 'semi-annually', label: 'Twice a year' },
  { value: 'yearly', label: 'Every calendar year' },
  { value: 'anniversary', label: 'On my card anniversary' },
  { value: 'every-4-years', label: 'Every 4 years' },
];

export interface CardBenefit {
  id: string;
  name: string;
  description: string;
  type: 'statement_credit' | 'subscription';
  period: BenefitPeriod;
  /** Dollars when unit is '$'; a number of uses (nights, visits) when 'count'. */
  maxValue: number;
  unit: '$' | 'count';
  category: BenefitCategory;
  step?: number;
  /** Added by the user rather than shipped with the app. */
  custom?: boolean;
}

/** "$10", "$9.99", or "2" for counted benefits like free nights. */
export function formatValue(v: number, unit: CardBenefit['unit']): string {
  if (unit === 'count') return String(Math.round(v));
  return '$' + (Number.isInteger(v) ? v : v.toFixed(2));
}

const SETS: Record<string, CardBenefit[]> = {
  sapphirePreferred: [
    { id: '101_hotel', name: '$50 Annual Hotel Credit', description: 'Statement credit for hotels booked through Chase Travel.', type: 'statement_credit', period: 'yearly', maxValue: 50, unit: '$', category: 'Hotels' },
    { id: '101_dashpass', name: 'DoorDash DashPass', description: 'Complimentary DashPass membership covering delivery fees.', type: 'subscription', period: 'monthly', maxValue: 9.99, unit: '$', category: 'Dining' },
  ],
  sapphireReserve: [
    { id: '107_travel', name: '$300 Annual Travel Credit', description: 'Automatic statement credit for general travel purchases.', type: 'statement_credit', period: 'yearly', maxValue: 300, unit: '$', category: 'Travel' },
    { id: '107_dashpass', name: 'DoorDash DashPass', description: 'Complimentary DashPass membership covering delivery fees.', type: 'subscription', period: 'monthly', maxValue: 9.99, unit: '$', category: 'Dining' },
    { id: '107_doordash_credit', name: '$5 Monthly DoorDash Credit', description: 'Monthly statement credit added to your DoorDash account.', type: 'statement_credit', period: 'monthly', maxValue: 5, unit: '$', category: 'Dining' },
  ],
  amexGold: [
    { id: '102_dining', name: '$120 Dining Credit ($10/mo)', description: 'Statement credit spent at Grubhub, Cheesecake Factory, Resy, etc.', type: 'statement_credit', period: 'monthly', maxValue: 10, unit: '$', category: 'Dining' },
    { id: '102_uber', name: '$120 Uber Cash ($10/mo)', description: 'Monthly Uber Cash added to your Uber account for rides or eats.', type: 'statement_credit', period: 'monthly', maxValue: 10, unit: '$', category: 'Rides' },
    { id: '102_dunkin', name: "$84 Dunkin' Credit ($7/mo)", description: "Monthly statement credit spent at Dunkin' locations.", type: 'statement_credit', period: 'monthly', maxValue: 7, unit: '$', category: 'Dining' },
    { id: '102_resy', name: '$100 Resy Credit ($50 semi-annually)', description: 'Semi-annual statement credit for Resy dining.', type: 'statement_credit', period: 'semi-annually', maxValue: 50, unit: '$', category: 'Dining' },
  ],
  amexPlatinum: [
    { id: '110_hotel', name: '$200 Fine Hotels + Resorts Credit', description: 'Prepaid FHR hotel statement credit booked via Amex Travel.', type: 'statement_credit', period: 'yearly', maxValue: 200, unit: '$', category: 'Hotels' },
    { id: '110_airline', name: '$200 Airline Fee Credit', description: 'Statement credit for airline incidental fees.', type: 'statement_credit', period: 'yearly', maxValue: 200, unit: '$', category: 'Travel' },
    { id: '110_uber', name: '$200 Uber Cash ($15/mo, $35 Dec)', description: 'Monthly Uber Cash added for U.S. rides and Uber Eats.', type: 'statement_credit', period: 'monthly', maxValue: 15, unit: '$', category: 'Rides' },
    { id: '110_digital', name: '$240 Digital Entertainment Credit ($20/mo)', description: 'Statement credit for Disney+, Peacock, NYTimes, etc.', type: 'statement_credit', period: 'monthly', maxValue: 20, unit: '$', category: 'Streaming' },
    { id: '110_clear', name: '$189 CLEAR Plus Credit', description: 'Statement credit for annual CLEAR Plus membership.', type: 'statement_credit', period: 'yearly', maxValue: 189, unit: '$', category: 'Travel' },
    { id: '110_walmart', name: 'Walmart+ Membership Credit ($12.95/mo)', description: 'Statement credit covering full Walmart+ membership cost.', type: 'subscription', period: 'monthly', maxValue: 12.95, unit: '$', category: 'Shopping' },
    { id: '110_saks', name: '$100 Saks Credit ($50 semi-annually)', description: 'Semi-annual statement credit for Saks purchases.', type: 'statement_credit', period: 'semi-annually', maxValue: 50, unit: '$', category: 'Shopping' },
  ],
  ventureX: [
    { id: '106_travel', name: '$300 Annual Travel Credit', description: 'Statement credit for travel booked via Capital One Travel.', type: 'statement_credit', period: 'yearly', maxValue: 300, unit: '$', category: 'Travel' },
    { id: '106_anniversary', name: '10,000 Anniversary Miles ($100 value)', description: 'Anniversary bonus miles awarded every year.', type: 'statement_credit', period: 'yearly', maxValue: 100, unit: '$', category: 'Travel' },
  ],
  blueCashPreferred: [
    { id: '104_disney', name: 'Disney+ Bundle Credit ($7/mo)', description: 'Monthly statement credit for Disney+ subscription bundle.', type: 'statement_credit', period: 'monthly', maxValue: 7, unit: '$', category: 'Streaming' },
    { id: '104_equinox', name: 'Equinox Credit ($10/mo)', description: 'Monthly statement credit for Equinox app/club membership.', type: 'statement_credit', period: 'monthly', maxValue: 10, unit: '$', category: 'Wellness' },
  ],
  savor: [
    { id: '108_uber_one', name: 'Uber One Membership Credit', description: 'Monthly membership fee fully covered by statement credit.', type: 'subscription', period: 'monthly', maxValue: 9.99, unit: '$', category: 'Rides' },
  ],
};

/**
 * Match by name first. The old page matched hard-coded ids 101-110, which only
 * lined up with a mock layer that no longer exists; database ids are assigned
 * by insert order and do not match. The ids stay as a fallback.
 */
export function benefitsForCard(card: { id: number; name: string; issuer?: string }): CardBenefit[] {
  const n = (card.name || '').toLowerCase();
  const i = (card.issuer || '').toLowerCase();
  const amex = i.includes('american express') || n.includes('amex') || n.includes('american express');

  if (n.includes('sapphire preferred')) return SETS.sapphirePreferred;
  if (n.includes('sapphire reserve')) return SETS.sapphireReserve;
  if (n.includes('blue cash preferred')) return SETS.blueCashPreferred;
  if (amex && n.includes('platinum')) return SETS.amexPlatinum;
  if (amex && n.includes('gold')) return SETS.amexGold;
  if (n.includes('venture x')) return SETS.ventureX;
  if (n.includes('savor')) return SETS.savor;

  switch (card.id) {
    case 101: return SETS.sapphirePreferred;
    case 107: return SETS.sapphireReserve;
    case 102: return SETS.amexGold;
    case 110: return SETS.amexPlatinum;
    case 106: return SETS.ventureX;
    case 104: return SETS.blueCashPreferred;
    case 108: return SETS.savor;
    default: return [];
  }
}

/**
 * When a benefit's current window closes. Amex semi-annual credits run Jan-Jun
 * and Jul-Dec. Returns null when the date depends on something the app does not
 * know yet, such as the card's anniversary, so it is never shown as a countdown
 * it cannot back up.
 */
export function periodEnds(period: BenefitPeriod, now = new Date()): Date | null {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (period) {
    case 'monthly': return new Date(y, m + 1, 0, 23, 59, 59);
    case 'quarterly': return new Date(y, Math.floor(m / 3) * 3 + 3, 0, 23, 59, 59);
    case 'semi-annually': return m < 6 ? new Date(y, 5, 30, 23, 59, 59) : new Date(y, 11, 31, 23, 59, 59);
    case 'yearly': return new Date(y, 11, 31, 23, 59, 59);
    default: return null;
  }
}

export function daysUntil(d: Date, now = new Date()): number {
  return Math.max(0, Math.ceil((d.getTime() - now.getTime()) / 86400000));
}

export function resetLabel(period: BenefitPeriod, daysLeft: number | null): string {
  if (period === 'anniversary') return 'resets on your card anniversary';
  if (period === 'every-4-years') return 'renews every 4 years';
  if (daysLeft === null) return '';
  return daysLeft === 0 ? 'resets today' : `resets in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------------
// Logged usage. Same keys as the old Wallet page, so nothing is lost.
// ---------------------------------------------------------------------------

const KEYS = {
  credit: 'swiperight_logged_credit_savings',
  subscription: 'swiperight_logged_subscription_savings',
  offerRedeemed: 'swiperight_logged_merchant_redeemed',
  offerSavings: 'swiperight_logged_merchant_savings',
} as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function usePersisted<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => read(key, fallback));
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  }, [key, value]);
  return [value, setValue] as const;
}

export function useBenefitLog() {
  const [credits, setCredits] = usePersisted<Record<string, number>>(KEYS.credit, {});
  const [subscriptions, setSubscriptions] = usePersisted<Record<string, boolean>>(KEYS.subscription, {});
  const [offerRedeemed, setOfferRedeemed] = usePersisted<Record<string, boolean>>(KEYS.offerRedeemed, {});
  const [offerSavings, setOfferSavings] = usePersisted<Record<string, number>>(KEYS.offerSavings, {});

  /** Dollars used against a benefit this period. */
  function used(b: CardBenefit): number {
    if (b.type === 'subscription') return subscriptions[b.id] ? b.maxValue : 0;
    return Math.min(b.maxValue, credits[b.id] || 0);
  }

  function setUsed(b: CardBenefit, dollars: number) {
    if (b.type === 'subscription') {
      setSubscriptions((p) => ({ ...p, [b.id]: dollars > 0 }));
    } else {
      setCredits((p) => ({ ...p, [b.id]: Math.max(0, Math.min(b.maxValue, dollars)) }));
    }
  }

  function markOfferUsed(offerId: number | string, saved: number) {
    setOfferRedeemed((p) => ({ ...p, [offerId]: true }));
    setOfferSavings((p) => ({ ...p, [offerId]: Math.max(0, saved) }));
  }

  function reset() {
    setCredits({});
    setSubscriptions({});
    setOfferRedeemed({});
    setOfferSavings({});
  }

  return { used, setUsed, offerRedeemed, offerSavings, markOfferUsed, reset };
}

// ---------------------------------------------------------------------------
// Credits the app does not ship, and ones that do not apply.
//
// The shipped list can never cover every card, and issuers change their
// credits more often than an app ships. So the user can add any credit to any
// card in their wallet, and hide a shipped one that no longer applies instead
// of having it inflate "left to use" forever.
// ---------------------------------------------------------------------------

const CUSTOM_KEY = 'swiperight_custom_benefits';
const HIDDEN_KEY = 'swiperight_hidden_benefits';

export interface NewBenefit {
  name: string;
  maxValue: number;
  unit: CardBenefit['unit'];
  period: BenefitPeriod;
  category: BenefitCategory;
}

export function useCustomBenefits() {
  const [byCard, setByCard] = usePersisted<Record<string, CardBenefit[]>>(CUSTOM_KEY, {});
  const [hidden, setHidden] = usePersisted<string[]>(HIDDEN_KEY, []);

  /** Shipped credits the user has not hidden, then the ones they added. */
  function benefitsFor(card: { id: number; name: string; issuer?: string }): CardBenefit[] {
    const shipped = benefitsForCard(card).filter((b) => !hidden.includes(b.id));
    return [...shipped, ...(byCard[String(card.id)] ?? [])];
  }

  function hiddenFor(card: { id: number; name: string; issuer?: string }): CardBenefit[] {
    return benefitsForCard(card).filter((b) => hidden.includes(b.id));
  }

  function add(cardId: number, b: NewBenefit) {
    const benefit: CardBenefit = {
      id: `custom_${cardId}_${Date.now().toString(36)}`,
      name: b.name.trim(),
      description: 'Added by you.',
      type: 'statement_credit',
      period: b.period,
      maxValue: Math.max(0, b.maxValue),
      unit: b.unit,
      category: b.category,
      step: b.unit === 'count' ? 1 : undefined,
      custom: true,
    };
    setByCard((p) => ({ ...p, [cardId]: [...(p[String(cardId)] ?? []), benefit] }));
  }

  function remove(cardId: number, benefitId: string) {
    setByCard((p) => ({ ...p, [cardId]: (p[String(cardId)] ?? []).filter((b) => b.id !== benefitId) }));
  }

  function hide(benefitId: string) {
    setHidden((p) => (p.includes(benefitId) ? p : [...p, benefitId]));
  }

  function restore(benefitId: string) {
    setHidden((p) => p.filter((id) => id !== benefitId));
  }

  return { benefitsFor, hiddenFor, add, remove, hide, restore };
}
