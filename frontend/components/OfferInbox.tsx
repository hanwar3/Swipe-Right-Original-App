import React, { useEffect, useState } from 'react';
import { Check, Copy, Inbox, RefreshCw, Tag } from 'lucide-react';
import { issuerFace } from './CardStack';
import {
  offerInbox,
  pendingOffers,
  attributeOffer,
  type OfferInbox as Inbox2,
  type PendingOffer,
} from '../lib/engine';
import type { UserCard } from '~backend/cards/portfolio';

interface OfferInboxProps {
  userId: string;
  cards: UserCard[];
}

/**
 * Offers arrive by forwarded email, so this screen has two jobs: hand over the
 * address to forward to, and clear up the offers we could not place.
 *
 * The second half matters more than it looks. One account often sits over cards
 * registered to different mailboxes, and a wallet can hold two cards from one
 * issuer, so some mail is genuinely ambiguous. Rather than guess, we hold the
 * offer and ask once. The answer teaches us that card's last four, and the
 * question stops being asked.
 */
export default function OfferInboxView({ userId, cards }: OfferInboxProps) {
  const [inbox, setInbox] = useState<Inbox2 | null>(null);
  const [pending, setPending] = useState<PendingOffer[]>([]);
  const [copied, setCopied] = useState(false);
  const [assigning, setAssigning] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [i, p] = await Promise.all([offerInbox(userId), pendingOffers(userId)]);
      setInbox(i);
      setPending(p.offers);
    } catch {
      setError('Could not reach the offers inbox.');
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId]);

  async function copy() {
    if (!inbox) return;
    try {
      await navigator.clipboard.writeText(inbox.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Could not copy. Select the address and copy it by hand.');
    }
  }

  async function place(offerId: number, cardId: number) {
    setAssigning(offerId);
    try {
      await attributeOffer(userId, offerId, cardId);
      setPending((p) => p.filter((o) => o.id !== offerId));
    } catch {
      setError('Could not save that. Try again.');
    } finally {
      setAssigning(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-[13px] text-[#F58EE4]">{error}</p>}

      {/* the address */}
      <section>
        <h3 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#6E637A]">
          <Inbox className="h-3 w-3" />
          Forward your offer emails here
        </h3>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-black/40 px-3 py-2.5 font-mono text-[12.5px] text-[#F3EBF8]">
              {inbox ? inbox.address : 'Loading…'}
            </code>
            <button
              onClick={copy}
              disabled={!inbox}
              aria-label="Copy address"
              className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-lg bg-[#E64BD4] text-black
                         transition-colors hover:bg-[#F06BDD] disabled:opacity-40
                         focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>

          <p className="mt-3 text-[12.5px] leading-relaxed text-[#9B8FA6]">
            Amex, Chase and Bank of America all email you when new targeted offers land.
            Forward those here and they turn into offers the app can use. Your cards can
            be registered to different mailboxes; set up a forwarding rule in each one and
            it all arrives in the same place.
          </p>

          {inbox && inbox.receivedCount > 0 && (
            <p className="mt-2.5 border-t border-white/[0.07] pt-2.5 text-[12px] text-[#6E637A]">
              {inbox.receivedCount} email{inbox.receivedCount === 1 ? '' : 's'} received
              {inbox.lastReceivedAt &&
                `, last on ${new Date(inbox.lastReceivedAt).toLocaleDateString()}`}
            </p>
          )}
        </div>
      </section>

      {/* offers we could not place */}
      {pending.length > 0 && (
        <section>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#E64BD4]">
            <Tag className="h-3 w-3" />
            {pending.length} offer{pending.length === 1 ? '' : 's'} need a card
          </h3>
          <p className="mb-3 text-[12.5px] leading-relaxed text-[#9B8FA6]">
            The email did not say which card these belong to. Tell us once and the
            same card will place itself from then on.
          </p>

          <div className="flex flex-col gap-2.5">
            {pending.map((o) => {
              const likely = o.issuer
                ? cards.filter((c) =>
                    c.card.issuer.toLowerCase().includes(o.issuer!.toLowerCase().split(' ')[0])
                  )
                : cards;
              const choices = likely.length > 0 ? likely : cards;

              return (
                <div key={o.id} className="rounded-2xl border border-[#E64BD4]/25 bg-white/[0.04] p-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-[14px] font-bold tracking-tight text-[#F3EBF8]">
                      {o.merchantName}
                    </p>
                    {o.lastFour && (
                      <span className="shrink-0 font-mono text-[11.5px] text-[#6E637A]">
                        ····{o.lastFour}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[12.5px] leading-snug text-[#AFA2B9]">
                    {o.offerDescription}
                    {o.issuer && <span className="text-[#6E637A]"> · {o.issuer}</span>}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {choices.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => place(o.id, c.card.id)}
                        disabled={assigning === o.id}
                        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] py-1.5 pl-1.5 pr-3.5
                                   text-[12.5px] font-semibold text-[#DDD0E6] transition-colors
                                   hover:border-[#E64BD4]/50 hover:bg-[#E64BD4]/12 disabled:opacity-40
                                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E64BD4]"
                      >
                        <span
                          className="h-5 w-8 shrink-0 rounded-[3px] border border-white/20"
                          style={{ background: issuerFace(c.card.issuer) }}
                        />
                        <span className="max-w-[140px] truncate">{c.nickname || c.card.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* what has come in */}
      {inbox && inbox.recent.length > 0 && (
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <h3 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#6E637A]">
              Recent emails
            </h3>
            <button
              onClick={load}
              aria-label="Refresh"
              className="rounded-full p-1.5 text-[#6E637A] transition-colors hover:text-[#F3EBF8]
                         focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E64BD4]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-col">
            {inbox.recent.map((r) => (
              <div
                key={r.id}
                className="flex items-baseline justify-between gap-3 border-b border-white/[0.06] py-2.5 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-[#DDD0E6]">
                    {r.subject || r.issuer || 'Email'}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-[#6E637A]">
                    {new Date(r.createdAt).toLocaleDateString()}
                    {r.issuer && ` · ${r.issuer}`}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-[11.5px] font-semibold ${
                    r.status === 'ok'
                      ? 'text-[#4FCE8C]'
                      : r.status === 'pending'
                        ? 'text-[#F58EE4]'
                        : 'text-[#6E637A]'
                  }`}
                >
                  {r.status === 'ok'
                    ? `${r.offersWritten} added`
                    : r.status === 'pending'
                      ? `${r.offersFound} need a card`
                      : 'nothing found'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
