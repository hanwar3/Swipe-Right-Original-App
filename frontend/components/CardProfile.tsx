import React, { useEffect, useState } from 'react';
import { ArrowLeft, Clock, Mail, Tag, TrendingUp } from 'lucide-react';
import { issuerFace } from './CardStack';
import { cardProfile, setCardIdentity, formatMoney, type CardProfile as Profile } from '../lib/engine';

interface CardProfileProps {
  userId: string;
  cardId: number;
  onBack: () => void;
}

/**
 * One card, in full: what it earns, what you have already used, and what is
 * about to disappear. This is where the deck leads, so it answers the second
 * question the app exists for, which is how to use the card you are holding.
 */
export default function CardProfileView({ userId, cardId, onBack }: CardProfileProps) {
  const [data, setData] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFour, setLastFour] = useState('');
  const [cardEmail, setCardEmail] = useState('');
  const [ownAddress, setOwnAddress] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState(false);

  async function saveIdentity(wantOwnAddress = false) {
    try {
      const r = await setCardIdentity({
        userId,
        cardId,
        lastFour: lastFour || undefined,
        cardEmail: cardEmail || undefined,
        wantOwnAddress,
      });
      if (r.address) setOwnAddress(r.address);
      setData((d) => (d ? { ...d, lastFour: r.lastFour, cardEmail: r.cardEmail } : d));
      setSavedHint(true);
      setTimeout(() => setSavedHint(false), 1800);
    } catch {
      setError('Could not save that.');
    }
  }

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    cardProfile(userId, cardId)
      .then((d) => live && setData(d))
      .catch(() => live && setError('Could not load this card just now.'));
    return () => { live = false; };
  }, [userId, cardId]);

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-6 pt-3">
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.045] px-3.5 py-2
                   text-[12.5px] font-semibold text-[#DDD0E6] transition-colors hover:border-[#E64BD4]/40
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E64BD4]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Wallet
      </button>

      {!data && !error && (
        <div className="space-y-3">
          <div className="h-[128px] animate-pulse rounded-2xl bg-white/[0.06]" />
          <div className="h-[76px] animate-pulse rounded-2xl bg-white/[0.05]" />
          <div className="h-[76px] animate-pulse rounded-2xl bg-white/[0.04]" />
        </div>
      )}

      {error && <p className="text-[14px] text-[#AFA2B9]">{error}</p>}

      {data && (
        <>
          {/* the card itself */}
          <div
            className="relative flex aspect-[1.62/1] w-full flex-col justify-between rounded-2xl border border-white/20 p-5"
            style={{ background: issuerFace(data.issuer) }}
          >
            <div
              className="pointer-events-none absolute inset-0 rounded-2xl"
              style={{ background: 'linear-gradient(168deg,rgba(255,255,255,.28),rgba(255,255,255,0) 52%)' }}
            />
            <div className="relative">
              <p className="text-[16px] font-bold tracking-tight text-white [text-shadow:0_1px_5px_rgba(0,0,0,.45)]">
                {data.displayName}
              </p>
              <p className="mt-0.5 text-[11.5px] font-semibold text-white/80 [text-shadow:0_1px_4px_rgba(0,0,0,.4)]">
                {data.issuer} · {data.network} · {data.type === 'debit' ? 'Debit' : 'Credit'}
              </p>
            </div>
            <div className="relative flex items-end justify-between">
              <p className="text-[11.5px] font-semibold text-white/80 [text-shadow:0_1px_4px_rgba(0,0,0,.4)]">
                {data.annualFeeCents > 0 ? `${formatMoney(data.annualFeeCents)} a year` : 'No annual fee'}
              </p>
              <span className="h-[20px] w-[28px] rounded-[4px] bg-[linear-gradient(140deg,rgba(255,255,255,.88),rgba(255,255,255,.45))]" />
            </div>
          </div>

          {/* headline: what is still on the table */}
          {data.unusedBenefitCents > 0 && (
            <div className="mt-4 rounded-2xl border border-[#E64BD4]/30 bg-[#E64BD4]/[0.08] px-4 py-3.5">
              <p className="font-mono text-[27px] font-bold leading-none text-[#F58EE4]">
                {formatMoney(data.unusedBenefitCents)}
              </p>
              <p className="mt-1.5 text-[13px] leading-snug text-[#DDD0E6]">
                still unused on this card
                {data.soonestExpiryDays !== undefined && (
                  <>, soonest expires in <b className="font-bold text-[#F3EBF8]">{data.soonestExpiryDays} days</b></>
                )}
              </p>
            </div>
          )}

          {/* earning */}
          {data.rates.length > 0 && (
            <section className="mt-5">
              <h3 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#6E637A]">
                <TrendingUp className="h-3 w-3" />
                Earning
              </h3>
              <div className="flex flex-col gap-1.5">
                {data.rates.slice(0, 5).map((r, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-3 border-b border-white/[0.07] pb-2 last:border-0">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold text-[#DDD0E6]">{r.category}</p>
                      {r.capRemainingCents !== undefined && (
                        <p className="mt-0.5 text-[11.5px] text-[#6E637A]">
                          {r.capRemainingCents > 0
                            ? `${formatMoney(r.capRemainingCents)} left of the cap this ${r.capPeriod || 'period'}`
                            : 'Cap used up, earning the base rate'}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 font-mono text-[16px] font-bold tabular-nums ${
                        r.capRemainingCents === 0 ? 'text-[#6E637A] line-through' : 'text-[#F58EE4]'
                      }`}
                    >
                      {r.rate}%
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* benefits and deadlines */}
          <section className="mt-6">
            <h3 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#6E637A]">
              <Clock className="h-3 w-3" />
              Benefits and deadlines
            </h3>
            {data.benefits.length === 0 ? (
              <p className="text-[13px] text-[#6E637A]">No recurring credits on this card.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {data.benefits.map((b) => {
                  const pct = b.valueCents > 0 ? Math.round((b.usedCents / b.valueCents) * 100) : 0;
                  const urgent = b.remainingCents > 0 && b.daysLeft <= 30;
                  return (
                    <div
                      key={b.benefitId}
                      className={`rounded-2xl border px-4 py-3.5 ${
                        urgent ? 'border-[#E64BD4]/35 bg-[#E64BD4]/[0.06]' : 'border-white/10 bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-[14px] font-bold tracking-tight text-[#F3EBF8]">{b.name}</p>
                        <span className="shrink-0 font-mono text-[13px] font-bold tabular-nums text-[#DDD0E6]">
                          {formatMoney(b.remainingCents)} left
                        </span>
                      </div>
                      {b.description && (
                        <p className="mt-1 text-[12px] leading-snug text-[#9B8FA6]">{b.description}</p>
                      )}
                      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,#E64BD4,#F58EE4)]"
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      <p className={`mt-2 text-[11.5px] font-semibold ${urgent ? 'text-[#F58EE4]' : 'text-[#6E637A]'}`}>
                        {formatMoney(b.usedCents)} of {formatMoney(b.valueCents)} used
                        {b.remainingCents > 0 && ` · resets in ${b.daysLeft} days`}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* merchant offers */}
          <section className="mt-6">
            <h3 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#6E637A]">
              <Tag className="h-3 w-3" />
              Merchant offers
            </h3>
            {data.offers.length === 0 ? (
              <p className="text-[13px] text-[#6E637A]">
                No live offers synced for this card yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {data.offers.slice(0, 8).map((o) => (
                  <div key={o.id} className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-[13.5px] font-bold text-[#F3EBF8]">{o.merchantName}</p>
                      {!o.isActivated && (
                        <span className="shrink-0 rounded-full bg-[#E64BD4]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#F58EE4]">
                          Activate
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[12px] leading-snug text-[#9B8FA6]">{o.offerDescription}</p>
                    {o.daysLeft !== undefined && (
                      <p className="mt-1.5 text-[11.5px] font-semibold text-[#6E637A]">
                        Ends in {o.daysLeft} days
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* how forwarded mail finds this card */}
          <section className="mt-6">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#6E637A]">
              <Mail className="h-3 w-3" />
              Offer matching
            </h3>
            <p className="mb-3 text-[12.5px] leading-relaxed text-[#9B8FA6]">
              When you forward offer emails, this is how we tell which card they belong to.
              Any one of these helps; together they make it exact.
            </p>

            <div className="flex flex-col gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold text-[#DDD0E6]">Last four digits</span>
                <input
                  value={lastFour}
                  onChange={(e) => setLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  onBlur={() => lastFour.length === 4 && saveIdentity()}
                  placeholder={data.lastFour ?? '1234'}
                  inputMode="numeric"
                  className="rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 font-mono text-[13.5px] text-[#F3EBF8]
                             placeholder:text-[#4A4453] outline-none focus:border-[#E64BD4]/60"
                />
                <span className="text-[11.5px] text-[#6E637A]">
                  Most issuer offer mail prints this. It is the strongest signal we have.
                </span>
              </label>

              <label className="mt-1 flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold text-[#DDD0E6]">
                  Email this card is registered to
                </span>
                <input
                  value={cardEmail}
                  onChange={(e) => setCardEmail(e.target.value)}
                  onBlur={() => cardEmail.includes('@') && saveIdentity()}
                  placeholder={data.cardEmail ?? 'you@example.com'}
                  inputMode="email"
                  className="rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-[13.5px] text-[#F3EBF8]
                             placeholder:text-[#4A4453] outline-none focus:border-[#E64BD4]/60"
                />
                <span className="text-[11.5px] text-[#6E637A]">
                  Only needed if this card is on a different mailbox from your others.
                </span>
              </label>

              {ownAddress ? (
                <div className="mt-1 rounded-lg border border-[#E64BD4]/25 bg-[#E64BD4]/[0.07] p-3">
                  <p className="mb-1.5 text-[11.5px] font-semibold text-[#F58EE4]">
                    Forward this card's mail here
                  </p>
                  <code className="block truncate font-mono text-[12px] text-[#F3EBF8]">
                    {ownAddress}
                  </code>
                </div>
              ) : (
                <button
                  onClick={() => saveIdentity(true)}
                  className="mt-1 self-start rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-2
                             text-[12.5px] font-semibold text-[#DDD0E6] transition-colors
                             hover:border-[#E64BD4]/50 hover:bg-[#E64BD4]/12
                             focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E64BD4]"
                >
                  Give this card its own address
                </button>
              )}

              {savedHint && (
                <p className="text-[11.5px] font-semibold text-[#4FCE8C]">Saved</p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
