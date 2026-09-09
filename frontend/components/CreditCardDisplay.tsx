import { motion } from 'framer-motion';
import { CreditCard as CreditCardIcon } from 'lucide-react';

export interface CardData {
  id: string | number;
  issuer: string;
  name: string;
  network: string;
  cashbackRate?: number;
  cashbackCategory?: string;
}

const issuerAccent: Record<string, { glow: string; ring: string; chip: string }> = {
  chase:        { glow: 'from-blue-500/20',   ring: 'ring-blue-400/20',   chip: 'bg-blue-400/30' },
  amex:         { glow: 'from-amber-500/20',  ring: 'ring-amber-400/20', chip: 'bg-amber-400/30' },
  'american express': { glow: 'from-amber-500/20', ring: 'ring-amber-400/20', chip: 'bg-amber-400/30' },
  citi:         { glow: 'from-cyan-500/20',   ring: 'ring-cyan-400/20',   chip: 'bg-cyan-400/30' },
  'capital one':{ glow: 'from-slate-400/20',  ring: 'ring-slate-300/20',  chip: 'bg-slate-300/30' },
  discover:     { glow: 'from-orange-500/20', ring: 'ring-orange-400/20', chip: 'bg-orange-400/30' },
  'bank of america': { glow: 'from-red-500/20', ring: 'ring-red-400/20', chip: 'bg-red-400/30' },
  default:      { glow: 'from-teal-500/20',   ring: 'ring-teal-400/20',   chip: 'bg-teal-400/30' },
};

function getAccent(issuer: string) {
  const key = issuer.toLowerCase();
  return issuerAccent[key] || issuerAccent.default;
}

export function CreditCardDisplay({
  card,
  className = '',
}: {
  card: CardData;
  className?: string;
}) {
  const accent = getAccent(card.issuer);

  return (
    <div
      className={`relative aspect-[1.586/1] w-[260px] shrink-0 rounded-[1.75rem] p-5
        bg-gradient-to-br from-[#1c1c1e] to-[#0c0c0d] ring-1 ${accent.ring}
        overflow-hidden ${className}`}
    >
      {/* Issuer accent glow */}
      <div className={`absolute -top-12 -right-12 h-40 w-40 rounded-full bg-gradient-to-br ${accent.glow} to-transparent blur-2xl pointer-events-none`} />
      {/* Sheen */}
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.03] to-white/[0.06] pointer-events-none" />

      <div className="relative z-10 flex h-full flex-col justify-between">
        {/* Top row */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/40">
              {card.issuer}
            </p>
            <p className="mt-0.5 text-[15px] font-bold tracking-tight text-white">
              {card.name}
            </p>
          </div>
          {/* Chip */}
          <div className={`h-8 w-10 rounded-md ${accent.chip} backdrop-blur-sm`} />
        </div>

        {/* Bottom row */}
        <div className="flex items-end justify-between">
          <div>
            {card.cashbackRate !== undefined && (
              <>
                <p className="text-[9px] uppercase tracking-wider text-white/30">
                  {card.cashbackCategory || 'Best rate'}
                </p>
                <div className="mt-1 inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 backdrop-blur-sm">
                  <span className="text-[11px] font-bold text-white">
                    {card.cashbackRate}% cashback
                  </span>
                </div>
              </>
            )}
          </div>
          <div className="text-right">
            <CreditCardIcon className="ml-auto h-5 w-5 text-white/20" />
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">
              {card.network}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
