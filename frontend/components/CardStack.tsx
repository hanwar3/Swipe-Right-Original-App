import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface StackCard {
  cardId: number;
  name: string;
  issuer: string;
  rate?: string;
  on?: string;
}

interface CardStackProps {
  cards: StackCard[];
  /** Index the engine picked. Lights that card and holds it forward. */
  winnerIndex?: number | null;
  onPick?: (card: StackCard, index: number) => void;
  compact?: boolean;
}

/** Issuer-tinted faces. The app renders CSS faces rather than hotlinking bank art. */
export function issuerFace(issuer: string): string {
  const i = (issuer || '').toLowerCase();
  if (i.includes('chase')) return 'linear-gradient(140deg,#2E5BC8,#12275C)';
  if (i.includes('american express') || i.includes('amex')) return 'linear-gradient(140deg,#E0C069,#8E6F26)';
  if (i.includes('citi')) return 'linear-gradient(140deg,#4C5C70,#161D26)';
  if (i.includes('wells')) return 'linear-gradient(140deg,#C82A20,#6D0E08)';
  if (i.includes('discover')) return 'linear-gradient(140deg,#F6853A,#B8410F)';
  if (i.includes('capital one')) return 'linear-gradient(140deg,#1E6C9E,#0A2C43)';
  if (i.includes('bank of america')) return 'linear-gradient(140deg,#C22440,#5E0F1D)';
  return 'linear-gradient(140deg,#5A5266,#26222C)';
}

/**
 * The wallet, as slabs seen from just below.
 *
 * Cards keep their slot. Touching one lifts it and the lift falls off through
 * its neighbours, so the stack reads as a single wave rather than a row of
 * separate hover states. When the engine picks a winner, that card is the one
 * that lights up: the answer and the object are the same thing.
 */
export default function CardStack({ cards, winnerIndex = null, onPick, compact = false }: CardStackProps) {
  const [focus, setFocus] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const active = winnerIndex ?? focus;
  const step = compact ? 62 : 78;

  // Touch devices have no pointer, so the wave runs itself until a card is picked.
  useEffect(() => {
    if (reduce || winnerIndex !== null) return;
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(hover: none)').matches) return;
    const el = stageRef.current;
    if (!el) return;

    let i = 0;
    let timer: number | null = null;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting && timer === null) {
            timer = window.setInterval(() => {
              setFocus(i);
              i = (i + 1) % Math.max(1, cards.length);
            }, 1600);
          } else if (!en.isIntersecting && timer !== null) {
            window.clearInterval(timer);
            timer = null;
            setFocus(null);
          }
        });
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => {
      if (timer !== null) window.clearInterval(timer);
      io.disconnect();
    };
  }, [cards.length, reduce, winnerIndex]);

  const styleFor = useCallback(
    (i: number): React.CSSProperties => {
      const n = Math.max(1, cards.length);
      const depth = n > 1 ? (n - 1 - i) / (n - 1) : 0; // 0 front, 1 back
      const d = active === null ? 99 : Math.abs(i - active);
      const pull = active === null ? 0 : Math.max(0, 1 - d / 2.3);
      const ease = pull * pull * (3 - 2 * pull); // smoothstep

      const y = -i * step - ease * 22;
      const z = -depth * 120 + ease * 60;
      const sc = 1 - depth * 0.055 + ease * 0.045;
      const br = active === null ? 1 - depth * 0.14 : 0.5 + ease * 0.62 - depth * 0.07;
      const sa = active === null ? 1 : 0.72 + ease * 0.4;

      return {
        transform: `translate3d(-50%, ${y}px, ${z}px) rotateX(70deg) scale(${sc})`,
        filter: `brightness(${br}) saturate(${sa})`,
        zIndex: n - i,
        ['--face' as any]: issuerFace(cards[i].issuer),
        ['--glow' as any]: (0.3 + ease * 0.55).toFixed(3),
      };
    },
    [active, cards, step]
  );

  return (
    <div
      className="w-full"
      style={{ perspective: '1000px', perspectiveOrigin: '50% 34%' }}
    >
      <div
        ref={stageRef}
        role="list"
        aria-label="Your wallet"
        className="relative mx-auto"
        style={{
          height: (cards.length - 1) * step + (compact ? 150 : 190),
          maxWidth: 400,
          transformStyle: 'preserve-3d',
        }}
      >
        {cards.map((c, i) => (
          <button
            key={c.cardId ?? i}
            role="listitem"
            onClick={() => onPick?.(c, i)}
            onPointerEnter={() => !reduce && winnerIndex === null && setFocus(i)}
            onFocus={() => winnerIndex === null && setFocus(i)}
            className="stackcard absolute left-1/2 bottom-0 flex flex-col justify-between rounded-[13px] px-4 py-3.5 text-left
                       border border-white/20 cursor-pointer
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E64BD4] focus-visible:outline-offset-4"
            style={{
              width: compact ? 'min(300px, 80vw)' : 'min(330px, 84vw)',
              aspectRatio: '1.62 / 1',
              background: 'var(--face)',
              transformStyle: 'preserve-3d',
              willChange: 'transform, filter',
              transition: reduce
                ? 'none'
                : 'transform .55s cubic-bezier(.19,1,.22,1), filter .4s ease',
              ...styleFor(i),
            }}
          >
            <span className="text-[13px] font-bold tracking-tight text-white/95 [text-shadow:0_1px_4px_rgba(0,0,0,.45)]">
              {c.name}
            </span>
            <span className="flex items-end justify-between">
              <span>
                {c.rate && (
                  <span className="block font-mono text-[22px] font-bold leading-none text-white [text-shadow:0_2px_9px_rgba(0,0,0,.5)]">
                    {c.rate}
                  </span>
                )}
                {c.on && (
                  <span className="mt-1 block text-[11px] font-semibold text-white/85 [text-shadow:0_1px_4px_rgba(0,0,0,.45)]">
                    {c.on}
                  </span>
                )}
              </span>
              <span className="h-[18px] w-[25px] rounded-[4px] bg-[linear-gradient(140deg,rgba(255,255,255,.88),rgba(255,255,255,.45))] shadow-[inset_0_0_0_1px_rgba(0,0,0,.16)]" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
