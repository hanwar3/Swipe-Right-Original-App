import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import {
  addCustomBenefit,
  benefitCatalogue,
  importLocalBenefits,
  logBenefitUsage,
  myBenefits,
  removeCustomBenefit,
  setBenefitHidden,
  type CatalogueBenefit,
  type MyBenefits,
} from './engine';

/**
 * Card credits and the usage the user has logged against them.
 *
 * The list of credits comes from the server's catalogue, which changes when an
 * issuer changes a credit (DoorDash on Sapphire Reserve went from $5 to $15 a
 * month) and when enough cardholders' own portals agree on a new value. The
 * shipped list below is only the offline fallback.
 *
 * Signed in, usage lives on the server per period, so it follows the account
 * and a monthly credit is fresh again next month. Signed out it stays in this
 * browser, under the same localStorage keys as before, now period-aware too.
 * The first time someone signs in, what this browser logged is moved over.
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
  /** The catalogue or account row this came from, when it came from the server. */
  serverId?: number;
  /** What changed most recently, e.g. "Now $15 a month (was $5)." */
  changeNote?: string;
  changedAt?: string;
}

/** "$10", "$9.99", or "2" for counted benefits like free nights. */
export function formatValue(v: number, unit: CardBenefit['unit']): string {
  if (unit === 'count') return String(Math.round(v));
  return '$' + (Number.isInteger(v) ? v : v.toFixed(2));
}

/** Shown for 60 days after a credit changes, so nobody is surprised by a new number. */
export function recentChange(b: CardBenefit, now = Date.now()): string | null {
  if (!b.changeNote || !b.changedAt) return null;
  return now - new Date(b.changedAt).getTime() < 60 * 86400000 ? b.changeNote : null;
}

const TO_SERVER: Record<BenefitPeriod, string> = {
  monthly: 'month',
  quarterly: 'quarter',
  'semi-annually': 'half',
  yearly: 'year',
  anniversary: 'anniversary',
  'every-4-years': 'four_years',
};
const FROM_SERVER: Record<string, BenefitPeriod> = {
  month: 'monthly',
  quarter: 'quarterly',
  half: 'semi-annually',
  year: 'yearly',
  anniversary: 'anniversary',
  four_years: 'every-4-years',
};

function fromServer(
  b: CatalogueBenefit,
  signedIn: boolean,
  override?: { valueCents?: number; period?: string }
): CardBenefit {
  const unit = b.unit === 'count' ? 'count' : '$';
  const raw = override?.valueCents ?? b.valueCents;
  return {
    // Signed in, ids are per row. Signed out they stay the app's old slugs,
    // which is what this browser's local log is keyed by.
    id: signedIn ? `srv_${b.id}` : b.slug,
    name: b.name,
    description: b.description ?? '',
    type: b.kind === 'subscription' ? 'subscription' : 'statement_credit',
    period: FROM_SERVER[override?.period ?? b.period] ?? 'yearly',
    maxValue: unit === 'count' ? raw : raw / 100,
    unit,
    category: (CATEGORY_OPTIONS as string[]).includes(b.category ?? '') ? (b.category as BenefitCategory) : 'Other',
    step: unit === 'count' ? 1 : undefined,
    custom: b.custom,
    serverId: b.id,
    changeNote: b.changeNote,
    changedAt: b.changedAt,
  };
}

const serverIdOf = (id: string): number | undefined => (id.startsWith('srv_') ? Number(id.slice(4)) : undefined);
const toServerValue = (b: { unit: CardBenefit['unit']; maxValue: number }, v: number) =>
  b.unit === 'count' ? Math.round(v) : Math.round(v * 100);

// ---------------------------------------------------------------------------
// The offline fallback: what shipped with the app.
// ---------------------------------------------------------------------------

const SETS: Record<string, CardBenefit[]> = {
  sapphirePreferred: [
    { id: '101_hotel', name: 'Hotel credit', description: 'Statement credit for hotels booked through Chase Travel.', type: 'statement_credit', period: 'yearly', maxValue: 50, unit: '$', category: 'Hotels' },
    { id: '101_dashpass', name: 'DoorDash DashPass', description: 'Complimentary DashPass membership covering delivery fees.', type: 'subscription', period: 'monthly', maxValue: 9.99, unit: '$', category: 'Dining' },
  ],
  sapphireReserve: [
    { id: '107_travel', name: 'Travel credit', description: 'Automatic statement credit for travel purchases.', type: 'statement_credit', period: 'yearly', maxValue: 300, unit: '$', category: 'Travel' },
    { id: '107_dashpass', name: 'DoorDash DashPass', description: 'Complimentary DashPass membership covering delivery fees.', type: 'subscription', period: 'monthly', maxValue: 9.99, unit: '$', category: 'Dining' },
    { id: '107_doordash_credit', name: 'DoorDash credit', description: 'Monthly DoorDash promo added to your DoorDash account.', type: 'statement_credit', period: 'monthly', maxValue: 15, unit: '$', category: 'Dining' },
  ],
  amexGold: [
    { id: '102_dining', name: 'Dining credit', description: 'Statement credit at Grubhub, The Cheesecake Factory, Five Guys and other eligible dining.', type: 'statement_credit', period: 'monthly', maxValue: 10, unit: '$', category: 'Dining' },
    { id: '102_uber', name: 'Uber Cash', description: 'Monthly Uber Cash for U.S. rides or Uber Eats.', type: 'statement_credit', period: 'monthly', maxValue: 10, unit: '$', category: 'Rides' },
    { id: '102_dunkin', name: "Dunkin' credit", description: "Monthly statement credit at U.S. Dunkin' locations.", type: 'statement_credit', period: 'monthly', maxValue: 7, unit: '$', category: 'Dining' },
    { id: '102_resy', name: 'Resy credit', description: 'Statement credit at U.S. Resy restaurants, twice a year.', type: 'statement_credit', period: 'semi-annually', maxValue: 50, unit: '$', category: 'Dining' },
  ],
  amexPlatinum: [
    { id: '110_hotel', name: 'Fine Hotels + Resorts credit', description: 'Prepaid FHR or Hotel Collection stays booked through Amex Travel.', type: 'statement_credit', period: 'yearly', maxValue: 200, unit: '$', category: 'Hotels' },
    { id: '110_airline', name: 'Airline fee credit', description: 'Incidental fees with your selected airline.', type: 'statement_credit', period: 'yearly', maxValue: 200, unit: '$', category: 'Travel' },
    { id: '110_uber', name: 'Uber Cash', description: 'Monthly Uber Cash for U.S. rides and Uber Eats ($35 in December).', type: 'statement_credit', period: 'monthly', maxValue: 15, unit: '$', category: 'Rides' },
    { id: '110_digital', name: 'Digital entertainment credit', description: 'Disney+, Peacock, The New York Times and other eligible subscriptions.', type: 'statement_credit', period: 'monthly', maxValue: 20, unit: '$', category: 'Streaming' },
    { id: '110_clear', name: 'CLEAR Plus credit', description: 'Statement credit for a CLEAR Plus membership.', type: 'statement_credit', period: 'yearly', maxValue: 189, unit: '$', category: 'Travel' },
    { id: '110_walmart', name: 'Walmart+ membership', description: 'Statement credit covering a monthly Walmart+ membership.', type: 'subscription', period: 'monthly', maxValue: 12.95, unit: '$', category: 'Shopping' },
    { id: '110_saks', name: 'Saks credit', description: 'Statement credit at Saks Fifth Avenue, twice a year.', type: 'statement_credit', period: 'semi-annually', maxValue: 50, unit: '$', category: 'Shopping' },
  ],
  ventureX: [
    { id: '106_travel', name: 'Travel credit', description: 'Statement credit for bookings through Capital One Travel.', type: 'statement_credit', period: 'yearly', maxValue: 300, unit: '$', category: 'Travel' },
    { id: '106_anniversary', name: 'Anniversary miles', description: '10,000 bonus miles each account anniversary, about $100 in travel.', type: 'statement_credit', period: 'anniversary', maxValue: 100, unit: '$', category: 'Travel' },
  ],
  blueCashPreferred: [
    { id: '104_disney', name: 'Disney Bundle credit', description: 'Monthly statement credit toward a Disney Bundle subscription.', type: 'statement_credit', period: 'monthly', maxValue: 7, unit: '$', category: 'Streaming' },
    { id: '104_equinox', name: 'Equinox credit', description: 'Monthly statement credit for Equinox+ or club membership.', type: 'statement_credit', period: 'monthly', maxValue: 10, unit: '$', category: 'Wellness' },
  ],
  savor: [
    { id: '108_uber_one', name: 'Uber One membership', description: 'Monthly Uber One membership fee covered by statement credit.', type: 'subscription', period: 'monthly', maxValue: 9.99, unit: '$', category: 'Rides' },
  ],
};

/** Offline fallback only: match a card to the shipped list by name. */
export function benefitsForCard(card: { id: number; name: string; issuer?: string }): CardBenefit[] {
  const n = (card.name || '').toLowerCase();
  if (n.includes('sapphire preferred')) return SETS.sapphirePreferred;
  if (n.includes('sapphire reserve')) return SETS.sapphireReserve;
  if (n.includes('blue cash preferred')) return SETS.blueCashPreferred;
  // Exact product names, so Delta's Platinum and Gold cards don't inherit these.
  if (/^(american express|amex) platinum/.test(n) || n.startsWith('the platinum card')) return SETS.amexPlatinum;
  if (/^(american express|amex) gold/.test(n)) return SETS.amexGold;
  if (n.includes('venture x')) return SETS.ventureX;
  if (n.includes('savor')) return SETS.savor;
  return [];
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
// Storage
// ---------------------------------------------------------------------------

const KEYS = {
  credit: 'swiperight_logged_credit_savings',
  subscription: 'swiperight_logged_subscription_savings',
  /** When each logged entry's period ends, so last month's use doesn't count now. */
  period: 'swiperight_logged_benefit_periods',
  offerRedeemed: 'swiperight_logged_merchant_redeemed',
  offerSavings: 'swiperight_logged_merchant_savings',
  catalogue: 'swiperight_benefit_catalogue_v1',
} as const;
const CUSTOM_KEY = 'swiperight_custom_benefits';
const HIDDEN_KEY = 'swiperight_hidden_benefits';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

function usePersisted<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => read(key, fallback));
  useEffect(() => { write(key, value); }, [key, value]);
  return [value, setValue] as const;
}

/** The shared catalogue, cached in this browser so it renders before the network answers. */
export function useBenefitCatalogue() {
  const query = useQuery({
    queryKey: ['benefit-catalogue'],
    queryFn: async () => (await benefitCatalogue()).benefits,
    staleTime: 30 * 60_000,
    initialData: () => read<CatalogueBenefit[] | undefined>(KEYS.catalogue, undefined),
    initialDataUpdatedAt: 0,
  });
  useEffect(() => {
    if (query.data && query.isFetchedAfterMount) write(KEYS.catalogue, query.data);
  }, [query.data, query.isFetchedAfterMount]);
  const byCard = useMemo(() => {
    const m = new Map<number, CatalogueBenefit[]>();
    for (const b of query.data ?? []) m.set(b.cardId, [...(m.get(b.cardId) ?? []), b]);
    return m;
  }, [query.data]);
  return { loaded: !!query.data, byCard };
}

function useMine() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['my-benefits', user?.userId],
    queryFn: myBenefits,
    enabled: !!user,
    staleTime: 60_000,
  });
  return { user, query, key: ['my-benefits', user?.userId] as const };
}

let importing = false;

/** Moves what this browser logged before sign-in onto the account, once. */
function useLocalImport(userId: string | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!userId || importing) return;
    const flag = `swiperight_benefits_imported_${userId}`;
    if (read<boolean>(flag, false)) return;

    const credits = read<Record<string, number>>(KEYS.credit, {});
    const subs = read<Record<string, boolean>>(KEYS.subscription, {});
    const custom = read<Record<string, CardBenefit[]>>(CUSTOM_KEY, {});
    const hidden = read<string[]>(HIDDEN_KEY, []);
    const payload = {
      credits: Object.entries(credits)
        .filter(([id, v]) => !id.startsWith('custom_') && v > 0)
        .map(([slug, dollars]) => ({ slug, usedCents: Math.round(dollars * 100) })),
      subscriptions: Object.entries(subs).filter(([, on]) => on).map(([slug, active]) => ({ slug, active })),
      hidden,
      custom: Object.entries(custom).flatMap(([cardId, list]) =>
        list.map((b) => ({
          cardId: Number(cardId),
          name: b.name,
          valueCents: toServerValue(b, b.maxValue),
          unit: b.unit === 'count' ? 'count' : 'usd',
          period: TO_SERVER[b.period] ?? 'year',
          category: b.category,
        }))
      ),
    };
    if (!payload.credits.length && !payload.subscriptions.length && !payload.hidden.length && !payload.custom.length) {
      write(flag, true);
      return;
    }
    importing = true;
    importLocalBenefits(payload)
      .then(() => {
        write(flag, true);
        queryClient.invalidateQueries({ queryKey: ['my-benefits', userId] });
      })
      .catch(() => { /* try again next visit */ })
      .finally(() => { importing = false; });
  }, [userId, queryClient]);
}

// ---------------------------------------------------------------------------
// Logged usage
// ---------------------------------------------------------------------------

export function useBenefitLog() {
  const { user, query, key } = useMine();
  const queryClient = useQueryClient();
  useLocalImport(user?.userId);

  const [credits, setCredits] = usePersisted<Record<string, number>>(KEYS.credit, {});
  const [subscriptions, setSubscriptions] = usePersisted<Record<string, boolean>>(KEYS.subscription, {});
  const [periods, setPeriods] = usePersisted<Record<string, string>>(KEYS.period, {});
  const [offerRedeemed, setOfferRedeemed] = usePersisted<Record<string, boolean>>(KEYS.offerRedeemed, {});
  const [offerSavings, setOfferSavings] = usePersisted<Record<string, number>>(KEYS.offerSavings, {});

  // Server usage, plus what was just tapped and is still on its way.
  const [pending, setPending] = useState<Record<number, number>>({});
  const timers = useRef<Record<number, number>>({});
  const usage = useMemo(
    () => new Map((query.data?.usage ?? []).map((u) => [u.benefitId, u.usedCents])),
    [query.data]
  );

  /** Entries logged before periods were tracked count as current. */
  const current = (id: string) => {
    const end = periods[id];
    return !end || new Date(end).getTime() >= Date.now();
  };

  /** Dollars (or uses) used against a benefit this period. */
  function used(b: CardBenefit): number {
    if (user && b.serverId !== undefined) {
      const raw = pending[b.serverId] ?? usage.get(b.serverId) ?? 0;
      return Math.min(b.maxValue, b.unit === 'count' ? raw : raw / 100);
    }
    if (b.type === 'subscription') return subscriptions[b.id] && current(b.id) ? b.maxValue : 0;
    return current(b.id) ? Math.min(b.maxValue, credits[b.id] || 0) : 0;
  }

  function setUsed(b: CardBenefit, value: number) {
    const v = Math.max(0, Math.min(b.maxValue, value));
    if (user && b.serverId !== undefined) {
      const id = b.serverId;
      const amount = toServerValue(b, b.type === 'subscription' ? (v > 0 ? b.maxValue : 0) : v);
      setPending((p) => ({ ...p, [id]: amount }));
      // A slider fires on every step; send the value it settles on.
      window.clearTimeout(timers.current[id]);
      timers.current[id] = window.setTimeout(() => {
        logBenefitUsage(id, amount)
          .then((res) => {
            queryClient.setQueryData<MyBenefits>(key, (old) =>
              old
                ? {
                    ...old,
                    usage: [
                      ...old.usage.filter((u) => u.benefitId !== id),
                      { benefitId: id, usedCents: res.usedCents, source: 'manual', periodEnd: res.periodEnd },
                    ],
                  }
                : old
            );
          })
          .catch(() => { /* the server value shows again below */ })
          .finally(() => setPending(({ [id]: _, ...rest }) => rest));
      }, 450);
      return;
    }
    const end = periodEnds(b.period);
    setPeriods((p) => ({ ...p, [b.id]: end ? end.toISOString() : '' }));
    if (b.type === 'subscription') {
      setSubscriptions((p) => ({ ...p, [b.id]: v > 0 }));
    } else {
      setCredits((p) => ({ ...p, [b.id]: v }));
    }
  }

  function markOfferUsed(offerId: number | string, saved: number) {
    setOfferRedeemed((p) => ({ ...p, [offerId]: true }));
    setOfferSavings((p) => ({ ...p, [offerId]: Math.max(0, saved) }));
  }

  function reset() {
    setCredits({});
    setSubscriptions({});
    setPeriods({});
    setOfferRedeemed({});
    setOfferSavings({});
  }

  return { used, setUsed, offerRedeemed, offerSavings, markOfferUsed, reset };
}

// ---------------------------------------------------------------------------
// Credits the catalogue does not list, and ones that do not apply.
//
// The catalogue can never cover every card, and issuers change their credits
// more often than an app ships. So the user can add any credit to any card in
// their wallet, and hide a listed one that no longer applies instead of having
// it inflate "left to use" forever.
// ---------------------------------------------------------------------------

export interface NewBenefit {
  name: string;
  maxValue: number;
  unit: CardBenefit['unit'];
  period: BenefitPeriod;
  category: BenefitCategory;
}

export function useCustomBenefits() {
  const { user, query, key } = useMine();
  const queryClient = useQueryClient();
  const catalogue = useBenefitCatalogue();
  const [byCard, setByCard] = usePersisted<Record<string, CardBenefit[]>>(CUSTOM_KEY, {});
  const [hidden, setHidden] = usePersisted<string[]>(HIDDEN_KEY, []);
  const signedIn = !!user;

  const overrides = useMemo(
    () => new Map((query.data?.overrides ?? []).map((o) => [o.benefitId, o])),
    [query.data]
  );
  const hiddenIds = useMemo(() => new Set(query.data?.hidden ?? []), [query.data]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  /** The catalogue's credits for this card, with this user's portal values applied. */
  function listed(card: { id: number; name: string; issuer?: string }): CardBenefit[] {
    if (!catalogue.loaded) return benefitsForCard(card);
    return (catalogue.byCard.get(card.id) ?? [])
      .filter((b) => !b.custom)
      .map((b) => fromServer(b, signedIn, overrides.get(b.id)));
  }

  const isHidden = (b: CardBenefit) =>
    signedIn ? b.serverId !== undefined && hiddenIds.has(b.serverId) : hidden.includes(b.id);

  /** Listed credits the user has not hidden, then the ones they added. */
  function benefitsFor(card: { id: number; name: string; issuer?: string }): CardBenefit[] {
    const own = signedIn
      ? (query.data?.custom ?? []).filter((b) => b.cardId === card.id).map((b) => fromServer(b, true))
      : byCard[String(card.id)] ?? [];
    return [...listed(card).filter((b) => !isHidden(b)), ...own];
  }

  function hiddenFor(card: { id: number; name: string; issuer?: string }): CardBenefit[] {
    return listed(card).filter(isHidden);
  }

  async function add(cardId: number, b: NewBenefit) {
    if (signedIn) {
      await addCustomBenefit({
        cardId,
        name: b.name.trim(),
        valueCents: toServerValue(b, Math.max(0, b.maxValue)),
        unit: b.unit === 'count' ? 'count' : 'usd',
        period: TO_SERVER[b.period],
        category: b.category,
      });
      await refresh();
      return;
    }
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

  async function remove(cardId: number, benefitId: string) {
    const serverId = serverIdOf(benefitId);
    if (signedIn && serverId !== undefined) {
      await removeCustomBenefit(serverId);
      await refresh();
      return;
    }
    setByCard((p) => ({ ...p, [cardId]: (p[String(cardId)] ?? []).filter((b) => b.id !== benefitId) }));
  }

  async function setVisibility(benefitId: string, hide: boolean) {
    const serverId = serverIdOf(benefitId);
    if (signedIn && serverId !== undefined) {
      queryClient.setQueryData<MyBenefits>(key, (old) =>
        old
          ? { ...old, hidden: hide ? [...old.hidden, serverId] : old.hidden.filter((h) => h !== serverId) }
          : old
      );
      try {
        await setBenefitHidden(serverId, hide);
      } finally {
        await refresh();
      }
      return;
    }
    setHidden((p) => (hide ? (p.includes(benefitId) ? p : [...p, benefitId]) : p.filter((id) => id !== benefitId)));
  }

  const hide = (benefitId: string) => setVisibility(benefitId, true);
  const restore = (benefitId: string) => setVisibility(benefitId, false);

  return { benefitsFor, hiddenFor, add, remove, hide, restore };
}
