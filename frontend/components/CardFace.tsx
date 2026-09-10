import React from 'react';
import {
  Plane, UtensilsCrossed, ShoppingCart, Fuel, Tv, Pill, ShoppingBag,
  Hotel, Train, Ticket, Building2, Zap, Circle,
} from 'lucide-react';
import { issuerFace } from './CardStack';
import type { CardCategory } from '~backend/cards/list';

interface CardFaceProps {
  name: string;
  issuer: string;
  network?: string;
  annualFeeCents?: number;
  categories?: CardCategory[];
  type?: string;
  /** Marks a card the user already holds. */
  owned?: boolean;
  onClick?: () => void;
}

/**
 * A credit card as a readable object.
 *
 * The point is that the face carries the DATA, not just the branding. Issuer
 * tint tells you whose it is at a glance, the multiplier row tells you what it
 * earns without opening anything, and the strip along the bottom carries the
 * two numbers that decide whether it is worth holding. You should be able to
 * compare two cards by looking at them.
 */

const CATEGORY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  travel: Plane,
  flights: Plane,
  hotels: Hotel,
  transit: Train,
  dining: UtensilsCrossed,
  groceries: ShoppingCart,
  gas: Fuel,
  streaming: Tv,
  entertainment: Ticket,
  drugstores: Pill,
  online: ShoppingBag,
  wholesale: Building2,
  department: ShoppingBag,
  utilities: Zap,
  all: Circle,
};

/** Same normalisation the engine uses, so the icons match the ranking. */
function keyOf(category: string): string {
  const c = (category || '').toLowerCase();
  if (c.includes('restaurant') || c.includes('dining')) return 'dining';
  if (c.includes('gas')) return 'gas';
  if (c.includes('grocer') || c.includes('supermarket')) return 'groceries';
  if (c.includes('flight')) return 'flights';
  if (c.includes('hotel')) return 'hotels';
  if (c.includes('travel')) return 'travel';
  if (c.includes('transit')) return 'transit';
  if (c.includes('stream')) return 'streaming';
  if (c.includes('entertain')) return 'entertainment';
  if (c.includes('drug') || c.includes('pharmac')) return 'drugstores';
  if (c.includes('online') || c.includes('amazon')) return 'online';
  if (c.includes('wholesale')) return 'wholesale';
  if (c.includes('department')) return 'department';
  if (c.includes('utilit')) return 'utilities';
  return 'all';
}

function money(cents?: number): string {
  if (!cents) return 'No fee';
  return '$' + Math.round(cents / 100);
}

export default function CardFace({
  name, issuer, network, annualFeeCents, categories = [], type, owned, onClick,
}: CardFaceProps) {
  // Highest-earning categories first, flat "all purchases" last: that is the
  // order someone reads a card in.
  const shown = [...categories]
    .sort((a, b) => (b.cashbackRate || 0) - (a.cashbackRate || 0))
    .filter((c, i, arr) => arr.findIndex((x) => keyOf(x.category) === keyOf(c.category)) === i)
    .slice(0, 5);

  const best = shown[0];
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      onClick={onClick}
      className={`relative flex aspect-[1.58/1] w-full flex-col justify-between overflow-hidden rounded-xl
                  border p-3 text-left transition-transform
                  ${owned ? 'border-[#E64BD4]/60' : 'border-white/15'}
                  ${onClick ? 'cursor-pointer hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E64BD4] focus-visible:outline-offset-2' : ''}`}
      style={{ background: issuerFace(issuer) }}
    >
      {/* sheen */}
      <span
        className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(165deg,rgba(255,255,255,.26),rgba(255,255,255,0) 55%)' }}
      />

      <span className="relative flex items-start justify-between gap-2">
        <span className="text-[12.5px] font-bold leading-tight tracking-tight text-white [text-shadow:0_1px_4px_rgba(0,0,0,.5)]">
          {name}
        </span>
        {owned && (
          <span className="shrink-0 rounded-full bg-black/40 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider text-white/90">
            Yours
          </span>
        )}
      </span>

      {/* what it earns, read straight off the face */}
      {shown.length > 0 && (
        <span className="relative flex items-end gap-2.5">
          {shown.map((c, i) => {
            const Icon = CATEGORY_ICON[keyOf(c.category)] ?? Circle;
            return (
              <span key={i} className="flex flex-col items-center gap-0.5" title={c.category}>
                <Icon className="h-3 w-3 text-white/75" />
                <span className="font-mono text-[11px] font-bold leading-none text-white [text-shadow:0_1px_3px_rgba(0,0,0,.5)]">
                  {c.cashbackRate}
                  <span className="text-[8px]">%</span>
                </span>
              </span>
            );
          })}
        </span>
      )}

      {/* the two numbers that decide whether it is worth holding.
          Network is deliberately not here: the issuer tint already says whose
          card it is, and squeezing it in truncated both halves of the strip. */}
      <span className="relative -mx-3 -mb-3 mt-2 flex items-center justify-between gap-2 bg-black/35 px-3 py-1.5">
        <span className="flex shrink-0 items-baseline gap-1 whitespace-nowrap">
          <span className="font-mono text-[11px] font-bold text-white">{money(annualFeeCents)}</span>
          {annualFeeCents ? (
            <span className="text-[8.5px] font-semibold uppercase tracking-wider text-white/55">/yr</span>
          ) : null}
        </span>
        <span className="shrink-0 whitespace-nowrap text-[8.5px] font-semibold uppercase tracking-wider text-white/55">
          {type === 'debit' ? 'Debit' : best ? `best ${best.cashbackRate}%` : network || 'Credit'}
        </span>
      </span>
    </Tag>
  );
}
