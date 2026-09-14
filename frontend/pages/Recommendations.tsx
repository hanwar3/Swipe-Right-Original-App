import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronDown, Clock, Plus, RotateCcw, Tag, X } from 'lucide-react';
import backend from '~backend/client';
import { issuerFace } from '../components/CardStack';
import OfferInboxView from '../components/OfferInbox';
import OfferMatching from '../components/OfferMatching';
import { useAuth } from '../contexts/AuthContext';
import { useWallet, type WalletCard } from '../lib/wallet';
import {
  CATEGORY_OPTIONS,
  PERIOD_OPTIONS,
  daysUntil,
  formatValue,
  periodEnds,
  resetLabel,
  useBenefitLog,
  useCustomBenefits,
  type BenefitCategory,
  type CardBenefit,
  type NewBenefit,
} from '../lib/benefits';

/**
 * Insights: what the cards in YOUR wallet are doing for you.
 *
 * Built to hold a real wallet, not two cards. Wallets carry credits in many
 * categories, credits the app does not know about, and credits that are not
 * dollars (free nights, lounge visits) or do not reset on the calendar. So:
 *
 *   filters     only the categories your cards actually have, ordered by how
 *               much is left to use in each, with that amount on the chip
 *   deadlines   dated credits first, soonest first; undated ones never pretend
 *               to have a countdown
 *   cards       collapse once a wallet grows past two, each header summarising
 *               what is left on that card
 *   your own    any credit can be added to any card, and a shipped one that no
 *               longer applies can be hidden rather than inflating the totals
 */

const URGENT_DAYS = 14;
const DEADLINES_PREVIEW = 4;

interface Row {
  card: WalletCard;
  benefit: CardBenefit;
  used: number;
  left: number;
  /** Null when the reset depends on something unknown, like the card anniversary. */
  daysLeft: number | null;
}

export default function Recommendations() {
  const { user } = useAuth();
  const wallet = useWallet();
  const log = useBenefitLog();
  const custom = useCustomBenefits();
  const [searchParams, setSearchParams] = useSearchParams();

  const [category, setCategory] = useState<BenefitCategory | null>(null);
  const [allDeadlines, setAllDeadlines] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [addingTo, setAddingTo] = useState<number | null>(null);

  const focusId = Number(searchParams.get('card')) || null;

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const card of wallet.cards) {
      for (const benefit of custom.benefitsFor(card)) {
        const used = log.used(benefit);
        const ends = periodEnds(benefit.period);
        out.push({
          card,
          benefit,
          used,
          left: Math.max(0, benefit.maxValue - used),
          daysLeft: ends ? daysUntil(ends) : null,
        });
      }
    }
    return out;
  }, [wallet.cards, log, custom]);

  const inFocus = (r: Row) => !focusId || r.card.id === focusId;
  const inCategory = (r: Row) => !category || r.benefit.category === category;

  // Filter chips: categories present on these cards, most money left first.
  const chips = useMemo(() => {
    const totals = new Map<BenefitCategory, { dollars: number; credits: number }>();
    rows.filter(inFocus).forEach((r) => {
      const t = totals.get(r.benefit.category) ?? { dollars: 0, credits: 0 };
      if (r.benefit.unit === '$') t.dollars += r.left;
      t.credits += 1;
      totals.set(r.benefit.category, t);
    });
    return Array.from(totals.entries())
      .map(([name, t]) => ({ name, ...t }))
      .sort((a, b) => b.dollars - a.dollars || b.credits - a.credits);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, focusId]);

  const visible = rows.filter((r) => inFocus(r) && inCategory(r));
  const dollarsLeft = visible.filter((r) => r.benefit.unit === '$').reduce((s, r) => s + r.left, 0);
  const dated = visible
    .filter((r) => r.left > 0 && r.daysLeft !== null)
    .sort((a, b) => (a.daysLeft as number) - (b.daysLeft as number));
  const urgent = dated.filter((r) => (r.daysLeft as number) <= URGENT_DAYS);

  const { data: offerData } = useQuery({
    queryKey: ['offers', user?.userId],
    queryFn: () => backend.cards.getUserMerchantOffers({ userId: user!.userId }),
    enabled: wallet.mode === 'account',
    retry: 0,
  });
  const walletIds = new Set(wallet.cards.map((c) => c.id));
  const offers = (offerData?.offers ?? []).filter(
    (o) => walletIds.has(o.cardId) && !o.isUsed && !log.offerRedeemed[o.id] && (!focusId || o.cardId === focusId)
  );

  const cardsShown = wallet.cards.filter((c) => !focusId || c.id === focusId);
  const focusCard = focusId ? wallet.cards.find((c) => c.id === focusId) : undefined;
  const isOpen = (cardId: number) => expanded[cardId] ?? (!!focusId || wallet.cards.length <= 2);

  // ---------------------------------------------------------------- empty
  if (!wallet.isLoading && wallet.cards.length === 0) {
    return (
      <div className="mx-auto w-full max-w-md px-5 pb-8 pt-4">
        <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-[#F3EBF8]">Insights</h1>
        <div className="mt-6 rounded-2xl border border-dashed border-[#E64BD4]/25 px-6 py-10 text-center">
          <p className="text-[15px] font-bold text-[#F3EBF8]">
            {wallet.mode === 'signed-out' ? 'Sign in to see your insights' : 'Your wallet is empty'}
          </p>
          <p className="mx-auto mt-1.5 max-w-[34ch] text-[13px] leading-relaxed text-[#9B8FA6]">
            Insights track the credits, deadlines and offers on the cards you carry. Add your cards in Wallet first.
          </p>
          <Link to="/cards" className="mt-5 inline-block rounded-full bg-[#E64BD4] px-5 py-2.5 text-[13.5px] font-bold text-black hover:bg-[#F06BDD]">
            Go to Wallet
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-8 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-[#F3EBF8]">
            {focusCard ? focusCard.nickname || focusCard.name : 'Insights'}
          </h1>
          <p className="mt-1 text-[13px] text-[#9B8FA6]">
            {focusCard
              ? 'Credits, deadlines and offers on this card.'
              : `Across the ${wallet.cards.length} card${wallet.cards.length === 1 ? '' : 's'} in your wallet.`}
          </p>
        </div>
        {focusCard && (
          <button
            onClick={() => setSearchParams({})}
            className="mt-1 flex shrink-0 items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-[12px] font-semibold text-[#DDD0E6] hover:border-[#E64BD4]/40"
          >
            <X className="h-3.5 w-3.5" /> All cards
          </button>
        )}
      </div>

      {/* the numbers that matter */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-[#E64BD4]/30 bg-[#E64BD4]/[0.08] px-3 py-3">
          <p className="font-mono text-[20px] font-bold leading-none text-[#F58EE4]">{formatValue(Math.round(dollarsLeft), '$')}</p>
          <p className="mt-1.5 text-[11px] leading-tight text-[#DDD0E6]">left to use</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
          <p className={`font-mono text-[20px] font-bold leading-none ${urgent.length ? 'text-[#F58EE4]' : 'text-[#F3EBF8]'}`}>{urgent.length}</p>
          <p className="mt-1.5 text-[11px] leading-tight text-[#9B8FA6]">expiring within {URGENT_DAYS} days</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
          <p className="font-mono text-[20px] font-bold leading-none text-[#F3EBF8]">{wallet.mode === 'account' ? offers.length : '–'}</p>
          <p className="mt-1.5 text-[11px] leading-tight text-[#9B8FA6]">merchant offers</p>
        </div>
      </div>

      {/* categories your cards actually have, most left first */}
      {chips.length > 1 && (
        <div className="-mx-5 mt-4 flex gap-1.5 overflow-x-auto px-5 pb-1" role="group" aria-label="Filter by category">
          <Chip on={category === null} onClick={() => setCategory(null)} label="All" />
          {chips.map((c) => (
            <Chip
              key={c.name}
              on={category === c.name}
              onClick={() => setCategory(category === c.name ? null : c.name)}
              label={c.name}
              value={c.dollars > 0 ? formatValue(Math.round(c.dollars), '$') : `${c.credits}`}
            />
          ))}
        </div>
      )}

      {/* dated credits, soonest first */}
      {dated.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#6E637A]">
            <Clock className="h-3 w-3" /> Use it before it resets
          </h2>
          <div className="flex flex-col">
            {(allDeadlines ? dated : dated.slice(0, DEADLINES_PREVIEW)).map((r) => (
              <div key={`${r.card.id}-${r.benefit.id}`} className="flex items-center gap-3 border-b border-white/[0.06] py-2.5 last:border-0">
                <span className="h-5 w-8 shrink-0 rounded-[3px] border border-white/20" style={{ background: issuerFace(r.card.issuer) }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-[#F3EBF8]">{r.benefit.name}</p>
                  <p className="truncate text-[11.5px] text-[#6E637A]">{r.card.nickname || r.card.name}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-[13px] font-bold text-[#DDD0E6]">
                    {formatValue(r.left, r.benefit.unit)}{r.benefit.unit === 'count' ? ' left' : ''}
                  </p>
                  <p className={`text-[11px] font-semibold ${(r.daysLeft as number) <= URGENT_DAYS ? 'text-[#F58EE4]' : 'text-[#6E637A]'}`}>
                    {r.daysLeft === 0 ? 'today' : `${r.daysLeft}d left`}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {dated.length > DEADLINES_PREVIEW && (
            <button onClick={() => setAllDeadlines((v) => !v)} className="mt-2 text-[12px] font-semibold text-[#E64BD4] hover:text-[#F58EE4]">
              {allDeadlines ? 'Show fewer' : `Show all ${dated.length}`}
            </button>
          )}
        </section>
      )}

      {/* each card */}
      {cardsShown.map((card) => {
        const cardRows = rows.filter((r) => r.card.id === card.id && inCategory(r));
        const allCardRows = rows.filter((r) => r.card.id === card.id);
        const hidden = custom.hiddenFor(card);
        if (category && cardRows.length === 0) return null;
        const open = isOpen(card.id);
        const cardDollars = allCardRows.filter((r) => r.benefit.unit === '$').reduce((s, r) => s + r.left, 0);

        return (
          <section key={card.id} className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.02]">
            <button
              onClick={() => setExpanded((p) => ({ ...p, [card.id]: !open }))}
              aria-expanded={open}
              className="flex w-full items-center gap-3 px-3.5 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E64BD4] rounded-2xl"
            >
              <span className="relative h-[34px] w-[54px] shrink-0 overflow-hidden rounded-md border border-white/20" style={{ background: issuerFace(card.issuer) }}>
                <span className="absolute inset-0" style={{ background: 'linear-gradient(165deg,rgba(255,255,255,.28),rgba(255,255,255,0) 55%)' }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold tracking-tight text-[#F3EBF8]">{card.nickname || card.name}</span>
                <span className="block text-[11.5px] text-[#6E637A]">
                  {allCardRows.length === 0
                    ? 'No credits tracked yet'
                    : `${formatValue(Math.round(cardDollars), '$')} left · ${allCardRows.length} credit${allCardRows.length === 1 ? '' : 's'}`}
                </span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-[#6E637A] transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
              <div className="flex flex-col gap-2.5 px-3.5 pb-3.5">
                {cardRows.length === 0 && (
                  <p className="text-[12.5px] text-[#6E637A]">
                    {category ? `No ${category.toLowerCase()} credits on this card.` : 'No credits tracked for this card yet. Add one below.'}
                  </p>
                )}

                {cardRows.map((r) => (
                  <BenefitRow
                    key={r.benefit.id}
                    row={r}
                    onUse={(v) => log.setUsed(r.benefit, v)}
                    onRemove={() => (r.benefit.custom ? custom.remove(card.id, r.benefit.id) : custom.hide(r.benefit.id))}
                  />
                ))}

                {hidden.length > 0 && (
                  <details className="text-[12px] text-[#6E637A]">
                    <summary className="cursor-pointer select-none font-semibold hover:text-[#DDD0E6]">
                      {hidden.length} hidden credit{hidden.length === 1 ? '' : 's'}
                    </summary>
                    <div className="mt-2 flex flex-col gap-1.5">
                      {hidden.map((b) => (
                        <div key={b.id} className="flex items-center justify-between gap-3">
                          <span className="truncate">{b.name}</span>
                          <button onClick={() => custom.restore(b.id)} className="shrink-0 font-semibold text-[#E64BD4] hover:text-[#F58EE4]">Show</button>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {addingTo === card.id ? (
                  <AddCreditForm
                    onCancel={() => setAddingTo(null)}
                    onAdd={(b) => { custom.add(card.id, b); setAddingTo(null); }}
                  />
                ) : (
                  <button
                    onClick={() => setAddingTo(card.id)}
                    className="flex items-center gap-1.5 self-start rounded-full border border-dashed border-white/15 px-3 py-1.5 text-[12px] font-semibold text-[#DDD0E6] hover:border-[#E64BD4]/50"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add a credit this card has
                  </button>
                )}
              </div>
            )}
          </section>
        );
      })}

      {focusCard && wallet.mode === 'account' && user && focusCard.id > 0 && (
        <OfferMatching userId={user.userId} cardId={focusCard.id} />
      )}

      {/* merchant offers */}
      <section className="mt-8">
        <h2 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#6E637A]">
          <Tag className="h-3 w-3" /> Merchant offers
        </h2>
        {wallet.mode !== 'account' ? (
          <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[12.5px] leading-relaxed text-[#6E637A]">
            Offers arrive when you forward your issuers' offer emails to SwipeRight. That needs a connection to your account.
          </p>
        ) : (
          <>
            {offers.length > 0 && (
              <div className="mb-5 flex flex-col gap-2">
                {offers.map((o) => (
                  <div key={o.id} className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-[13.5px] font-bold text-[#F3EBF8]">{o.merchantName}</p>
                      <span className="shrink-0 text-[11.5px] text-[#6E637A]">{o.cardName}</span>
                    </div>
                    <p className="mt-1 text-[12px] leading-snug text-[#9B8FA6]">{o.offerDescription}</p>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-[11.5px] font-semibold text-[#6E637A]">
                        {o.endDate ? `Ends ${o.endDate}` : 'No end date'}
                        {!o.isActivated && ' · needs activating'}
                      </span>
                      <button
                        onClick={() => log.markOfferUsed(o.id, (o.cashbackAmount ?? 0) / 100)}
                        className="rounded-full border border-white/10 px-2.5 py-1 text-[11.5px] font-semibold text-[#DDD0E6] hover:border-[#E64BD4]/40"
                      >
                        Mark used
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {user && (
              <OfferInboxView
                userId={user.userId}
                cards={wallet.cards.map((c) => ({
                  id: c.portfolioId ?? c.id,
                  card: c,
                  nickname: c.nickname,
                  currentBalance: 0,
                  isActive: true,
                  addedAt: '',
                }))}
              />
            )}
          </>
        )}
      </section>

      <button
        onClick={() => { if (confirm('Clear everything you have logged as used?')) log.reset(); }}
        className="mt-8 flex items-center gap-1.5 text-[12px] font-semibold text-[#6E637A] hover:text-[#DDD0E6]"
      >
        <RotateCcw className="h-3.5 w-3.5" /> Reset logged usage
      </button>
    </div>
  );
}

function Chip({ on, onClick, label, value }: { on: boolean; onClick: () => void; label: string; value?: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`flex shrink-0 items-baseline gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors
        ${on ? 'border-[#E64BD4] bg-[#E64BD4] text-black' : 'border-white/10 text-[#DDD0E6] hover:border-[#E64BD4]/40'}
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E64BD4]`}
    >
      {label}
      {value && <span className={`font-mono text-[11px] ${on ? 'text-black/70' : 'text-[#6E637A]'}`}>{value}</span>}
    </button>
  );
}

function BenefitRow({ row: r, onUse, onRemove }: { row: Row; onUse: (v: number) => void; onRemove: () => void }) {
  const b = r.benefit;
  const pct = b.maxValue > 0 ? Math.min(100, Math.round((r.used / b.maxValue) * 100)) : 0;
  const urgent = r.left > 0 && r.daysLeft !== null && r.daysLeft <= URGENT_DAYS;
  const isSub = b.type === 'subscription';
  const step = b.step ?? (b.unit === 'count' ? 1 : b.maxValue > 50 ? 5 : 1);

  return (
    <div className={`rounded-2xl border px-4 py-3.5 ${urgent ? 'border-[#E64BD4]/35 bg-[#E64BD4]/[0.06]' : 'border-white/10 bg-white/[0.04]'}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13.5px] font-bold tracking-tight text-[#F3EBF8]">{b.name}</p>
        <span className="shrink-0 font-mono text-[12.5px] font-bold text-[#DDD0E6]">
          {isSub ? (r.used > 0 ? 'claimed' : 'unclaimed') : `${formatValue(r.left, b.unit)} left`}
        </span>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-[#9B8FA6]">
        <span className="font-semibold text-[#6E637A]">{b.category}</span> · {b.description}
      </p>

      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-[linear-gradient(90deg,#E64BD4,#F58EE4)]" style={{ width: `${pct}%` }} />
      </div>
      <p className={`mt-1.5 text-[11.5px] font-semibold ${urgent ? 'text-[#F58EE4]' : 'text-[#6E637A]'}`}>
        {formatValue(r.used, b.unit)} of {formatValue(b.maxValue, b.unit)} used
        {resetLabel(b.period, r.daysLeft) && ` · ${resetLabel(b.period, r.daysLeft)}`}
      </p>

      <div className="mt-2.5 flex items-center gap-2.5">
        {isSub ? (
          <label className="flex flex-1 items-center gap-2 text-[12.5px] text-[#DDD0E6]">
            <input type="checkbox" checked={r.used > 0} onChange={(e) => onUse(e.target.checked ? b.maxValue : 0)} className="accent-[#E64BD4]" />
            Claimed this period
          </label>
        ) : (
          <>
            <input
              type="range"
              min={0}
              max={b.maxValue}
              step={step}
              value={r.used}
              onChange={(e) => onUse(Number(e.target.value))}
              aria-label={`Amount used of ${b.name}`}
              className="min-w-0 flex-1 accent-[#E64BD4]"
            />
            <button
              onClick={() => onUse(r.used >= b.maxValue ? 0 : b.maxValue)}
              className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[11.5px] font-semibold text-[#DDD0E6] hover:border-[#E64BD4]/40"
            >
              {r.used >= b.maxValue ? 'Undo' : 'Used all'}
            </button>
          </>
        )}
        <button
          onClick={onRemove}
          className="shrink-0 text-[11.5px] font-semibold text-[#6E637A] hover:text-[#FF8A8A]"
          title={b.custom ? 'Remove this credit' : "Hide a credit this card doesn't have"}
        >
          {b.custom ? 'Remove' : 'Hide'}
        </button>
      </div>
    </div>
  );
}

function AddCreditForm({ onAdd, onCancel }: { onAdd: (b: NewBenefit) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<CardBenefit['unit']>('$');
  const [period, setPeriod] = useState<NewBenefit['period']>('yearly');
  const [category, setCategory] = useState<BenefitCategory>('Travel');

  const value = Number(amount);
  const valid = name.trim().length > 1 && value > 0;
  const field = 'rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-[13.5px] text-[#F3EBF8] placeholder:text-[#4A4453] outline-none focus:border-[#E64BD4]/60';

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (valid) onAdd({ name, maxValue: value, unit, period, category }); }}
      className="flex flex-col gap-2.5 rounded-2xl border border-[#E64BD4]/25 bg-black/30 p-3.5"
    >
      <p className="text-[13px] font-bold text-[#F3EBF8]">Add a credit</p>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold text-[#DDD0E6]">What is it called?</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lounge visits, Global Entry credit" className={field} />
      </label>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-[#DDD0E6]">{unit === '$' ? 'Worth (dollars)' : 'How many'}</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder={unit === '$' ? '100' : '2'} className={field} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-[#DDD0E6]">Counted in</span>
          <select value={unit} onChange={(e) => setUnit(e.target.value as CardBenefit['unit'])} className={field}>
            <option value="$">Dollars</option>
            <option value="count">Uses</option>
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-[#DDD0E6]">Resets</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value as NewBenefit['period'])} className={field}>
            {PERIOD_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-[#DDD0E6]">Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as BenefitCategory)} className={field}>
            {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <button type="submit" disabled={!valid} className="rounded-full bg-[#E64BD4] px-4 py-2 text-[13px] font-bold text-black hover:bg-[#F06BDD] disabled:opacity-40">
          Add credit
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-2 text-[12.5px] font-semibold text-[#9B8FA6] hover:text-[#F3EBF8]">
          Cancel
        </button>
      </div>
    </form>
  );
}
