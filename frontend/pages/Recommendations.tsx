import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Clock, RotateCcw, Tag, X } from 'lucide-react';
import backend from '~backend/client';
import { issuerFace } from '../components/CardStack';
import OfferInboxView from '../components/OfferInbox';
import OfferMatching from '../components/OfferMatching';
import { useAuth } from '../contexts/AuthContext';
import { useWallet, type WalletCard } from '../lib/wallet';
import {
  benefitsForCard,
  daysUntil,
  periodEnds,
  useBenefitLog,
  type BenefitCategory,
  type CardBenefit,
} from '../lib/benefits';

/**
 * Insights: what the cards in YOUR wallet are doing for you.
 *
 * Only portfolio cards appear here. For each one: the credits it carries, how
 * much of each you have used, what is left, when it resets, and the offers
 * waiting on it. Category filters are built from the benefits your cards
 * actually have, so a category only shows up if one of your cards earns a
 * credit in it.
 */

const URGENT_DAYS = 14;

function money(n: number): string {
  return '$' + (Number.isInteger(n) ? n : n.toFixed(2));
}

interface Row {
  card: WalletCard;
  benefit: CardBenefit;
  used: number;
  left: number;
  daysLeft: number;
}

export default function Recommendations() {
  const { user } = useAuth();
  const wallet = useWallet();
  const log = useBenefitLog();
  const [searchParams, setSearchParams] = useSearchParams();
  const [category, setCategory] = useState<BenefitCategory | null>(null);

  const focusId = Number(searchParams.get('card')) || null;

  // Every benefit on every card in the wallet, with what has been used.
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const card of wallet.cards) {
      for (const benefit of benefitsForCard(card)) {
        const used = log.used(benefit);
        out.push({
          card,
          benefit,
          used,
          left: Math.max(0, benefit.maxValue - used),
          daysLeft: daysUntil(periodEnds(benefit.period)),
        });
      }
    }
    return out;
  }, [wallet.cards, log]);

  // Categories come from the wallet's own benefits, never from a fixed list.
  const categories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.benefit.category))).sort(),
    [rows]
  );

  const inScope = (r: Row) =>
    (!category || r.benefit.category === category) && (!focusId || r.card.id === focusId);

  const visible = rows.filter(inScope);
  const unused = visible.reduce((s, r) => s + r.left, 0);
  const deadlines = visible.filter((r) => r.left > 0).sort((a, b) => a.daysLeft - b.daysLeft);
  const urgent = deadlines.filter((r) => r.daysLeft <= URGENT_DAYS);

  // Offers only exist once the account is reachable; they arrive by email.
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
            Insights track the credits, deadlines and offers on the cards you carry. Add your
            cards in Wallet first.
          </p>
          <Link
            to="/cards"
            className="mt-5 inline-block rounded-full bg-[#E64BD4] px-5 py-2.5 text-[13.5px] font-bold text-black hover:bg-[#F06BDD]"
          >
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
          <p className="font-mono text-[20px] font-bold leading-none text-[#F58EE4]">{money(Math.round(unused))}</p>
          <p className="mt-1.5 text-[11px] leading-tight text-[#DDD0E6]">left to use this period</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
          <p className={`font-mono text-[20px] font-bold leading-none ${urgent.length ? 'text-[#F58EE4]' : 'text-[#F3EBF8]'}`}>
            {urgent.length}
          </p>
          <p className="mt-1.5 text-[11px] leading-tight text-[#9B8FA6]">expiring within {URGENT_DAYS} days</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
          <p className="font-mono text-[20px] font-bold leading-none text-[#F3EBF8]">
            {wallet.mode === 'account' ? offers.length : '–'}
          </p>
          <p className="mt-1.5 text-[11px] leading-tight text-[#9B8FA6]">merchant offers</p>
        </div>
      </div>

      {/* categories your cards actually have */}
      {categories.length > 1 && (
        <div className="-mx-5 mt-4 flex gap-1.5 overflow-x-auto px-5 pb-1">
          {categories.map((c) => {
            const on = category === c;
            return (
              <button
                key={c}
                onClick={() => setCategory(on ? null : c)}
                aria-pressed={on}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors
                  ${on ? 'border-[#E64BD4] bg-[#E64BD4] text-black' : 'border-white/10 text-[#DDD0E6] hover:border-[#E64BD4]/40'}
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E64BD4]`}
              >
                {c}
              </button>
            );
          })}
        </div>
      )}

      {/* deadlines, soonest first */}
      {deadlines.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#6E637A]">
            <Clock className="h-3 w-3" /> Use it before it resets
          </h2>
          <div className="flex flex-col">
            {deadlines.slice(0, 6).map((r) => (
              <div key={r.benefit.id} className="flex items-center gap-3 border-b border-white/[0.06] py-2.5 last:border-0">
                <span className="h-5 w-8 shrink-0 rounded-[3px] border border-white/20" style={{ background: issuerFace(r.card.issuer) }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-[#F3EBF8]">{r.benefit.name}</p>
                  <p className="truncate text-[11.5px] text-[#6E637A]">{r.card.nickname || r.card.name}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-[13px] font-bold text-[#DDD0E6]">{money(r.left)}</p>
                  <p className={`text-[11px] font-semibold ${r.daysLeft <= URGENT_DAYS ? 'text-[#F58EE4]' : 'text-[#6E637A]'}`}>
                    {r.daysLeft === 0 ? 'today' : `${r.daysLeft}d left`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* each card, and its credits */}
      {cardsShown.map((card) => {
        const cardRows = rows.filter((r) => r.card.id === card.id && (!category || r.benefit.category === category));
        if (category && cardRows.length === 0) return null;
        return (
          <section key={card.id} className="mt-6">
            <div className="mb-3 flex items-center gap-3">
              <span className="relative h-[34px] w-[54px] shrink-0 overflow-hidden rounded-md border border-white/20" style={{ background: issuerFace(card.issuer) }}>
                <span className="absolute inset-0" style={{ background: 'linear-gradient(165deg,rgba(255,255,255,.28),rgba(255,255,255,0) 55%)' }} />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-[15px] font-bold tracking-tight text-[#F3EBF8]">{card.nickname || card.name}</h2>
                <p className="text-[11.5px] text-[#6E637A]">
                  {card.issuer}{card.annualFee ? ` · ${money(Math.round(card.annualFee / 100))} a year` : ''}
                </p>
              </div>
            </div>

            {cardRows.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[12.5px] text-[#6E637A]">
                No credits tracked for this card yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {cardRows.map((r) => {
                  const pct = Math.min(100, Math.round((r.used / r.benefit.maxValue) * 100));
                  const urgentRow = r.left > 0 && r.daysLeft <= URGENT_DAYS;
                  const isSub = r.benefit.type === 'subscription';
                  return (
                    <div
                      key={r.benefit.id}
                      className={`rounded-2xl border px-4 py-3.5 ${urgentRow ? 'border-[#E64BD4]/35 bg-[#E64BD4]/[0.06]' : 'border-white/10 bg-white/[0.04]'}`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-[13.5px] font-bold tracking-tight text-[#F3EBF8]">{r.benefit.name}</p>
                        <span className="shrink-0 font-mono text-[12.5px] font-bold text-[#DDD0E6]">
                          {isSub ? (r.used > 0 ? 'claimed' : 'unclaimed') : `${money(r.left)} left`}
                        </span>
                      </div>
                      <p className="mt-1 text-[12px] leading-snug text-[#9B8FA6]">{r.benefit.description}</p>

                      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-[linear-gradient(90deg,#E64BD4,#F58EE4)]" style={{ width: `${pct}%` }} />
                      </div>
                      <p className={`mt-1.5 text-[11.5px] font-semibold ${urgentRow ? 'text-[#F58EE4]' : 'text-[#6E637A]'}`}>
                        {money(r.used)} of {money(r.benefit.maxValue)} used · resets in {r.daysLeft} day{r.daysLeft === 1 ? '' : 's'}
                      </p>

                      {/* log what you have used */}
                      {isSub ? (
                        <label className="mt-2.5 flex items-center gap-2 text-[12.5px] text-[#DDD0E6]">
                          <input
                            type="checkbox"
                            checked={r.used > 0}
                            onChange={(e) => log.setUsed(r.benefit, e.target.checked ? r.benefit.maxValue : 0)}
                            className="accent-[#E64BD4]"
                          />
                          Claimed this {r.benefit.period === 'monthly' ? 'month' : 'period'}
                        </label>
                      ) : (
                        <div className="mt-2.5 flex items-center gap-2.5">
                          <input
                            type="range"
                            min={0}
                            max={r.benefit.maxValue}
                            step={r.benefit.step ?? (r.benefit.maxValue > 50 ? 5 : 1)}
                            value={r.used}
                            onChange={(e) => log.setUsed(r.benefit, Number(e.target.value))}
                            aria-label={`Amount used of ${r.benefit.name}`}
                            className="min-w-0 flex-1 accent-[#E64BD4]"
                          />
                          <button
                            onClick={() => log.setUsed(r.benefit, r.used >= r.benefit.maxValue ? 0 : r.benefit.maxValue)}
                            className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[11.5px] font-semibold text-[#DDD0E6] hover:border-[#E64BD4]/40"
                          >
                            {r.used >= r.benefit.maxValue ? 'Undo' : 'Used all'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
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
            Offers arrive when you forward your issuers' offer emails to SwipeRight. That needs a
            connection to your account.
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
