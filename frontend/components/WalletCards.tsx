import React from 'react';
import { ChevronRight, Wallet as WalletIcon } from 'lucide-react';
import { issuerFace } from './CardStack';
import type { UserCard } from '~backend/cards/portfolio';

interface WalletCardsProps {
  cards: UserCard[];
  loading?: boolean;
  onOpen: (cardId: number) => void;
  onBrowse: () => void;
}

/**
 * The wallet as a readable list.
 *
 * The Ask screen shows the deck in perspective, because there you are picking
 * one card in a hurry. Here you are reading, so the cards lie flat and face
 * you, one per row, each a way into that card's profile. Same card faces,
 * different job.
 */
export default function WalletCards({ cards, loading, onOpen, onBrowse }: WalletCardsProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[104px] animate-pulse rounded-2xl bg-white/[0.06]" />
        ))}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#E64BD4]/25 px-6 py-12 text-center">
        <WalletIcon className="mx-auto mb-3 h-9 w-9 text-[#4A4453]" />
        <h3 className="text-[16px] font-bold tracking-tight text-[#F3EBF8]">Your wallet is empty</h3>
        <p className="mx-auto mt-1.5 max-w-[38ch] text-[13.5px] leading-relaxed text-[#9B8FA6]">
          Add the cards you actually carry. That is what the deck on the Ask screen
          picks from.
        </p>
        <button
          onClick={onBrowse}
          className="mt-5 rounded-full bg-[#E64BD4] px-5 py-2.5 text-[13.5px] font-bold text-black
                     transition-colors hover:bg-[#F06BDD]
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          Browse cards
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {cards.map((uc) => {
        const best = [...(uc.card.categories || [])].sort(
          (a, b) => (b.cashbackRate || 0) - (a.cashbackRate || 0)
        )[0];
        return (
          <button
            key={uc.id}
            onClick={() => onOpen(uc.card.id)}
            className="group relative flex items-stretch gap-4 overflow-hidden rounded-2xl border border-white/10
                       bg-white/[0.035] p-3 text-left transition-colors
                       hover:border-[#E64BD4]/40 hover:bg-white/[0.06]
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E64BD4] focus-visible:outline-offset-2"
          >
            {/* the card face, small but real */}
            <span
              className="relative flex aspect-[1.62/1] w-[108px] shrink-0 flex-col justify-end rounded-lg border border-white/20 p-2"
              style={{ background: issuerFace(uc.card.issuer) }}
            >
              <span
                className="pointer-events-none absolute inset-0 rounded-lg"
                style={{ background: 'linear-gradient(168deg,rgba(255,255,255,.30),rgba(255,255,255,0) 54%)' }}
              />
              <span className="relative h-[11px] w-[16px] rounded-[2px] bg-[linear-gradient(140deg,rgba(255,255,255,.88),rgba(255,255,255,.45))]" />
            </span>

            <span className="flex min-w-0 flex-1 flex-col justify-center gap-1">
              <span className="truncate text-[14.5px] font-bold tracking-tight text-[#F3EBF8]">
                {uc.nickname || uc.card.name}
              </span>
              <span className="truncate text-[12px] font-medium text-[#9B8FA6]">
                {uc.card.issuer} · {uc.card.network}
                {uc.card.type === 'debit' ? ' · Debit' : ''}
              </span>
              {best && (
                <span className="mt-0.5 text-[12.5px] text-[#AFA2B9]">
                  <b className="font-mono font-bold text-[#F58EE4]">{best.cashbackRate}%</b>{' '}
                  {best.category}
                </span>
              )}
            </span>

            <span className="flex shrink-0 items-center pr-1">
              <ChevronRight className="h-4 w-4 text-[#4A4453] transition-colors group-hover:text-[#E64BD4]" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
