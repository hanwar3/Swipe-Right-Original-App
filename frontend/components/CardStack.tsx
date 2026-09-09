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
  /** First tap: the card flips out of the deck to face you. */
  onSelect?: (card: StackCard, index: number) => void;
  /** Second tap on the card already facing you: open its profile. */
  onOpen?: (card: StackCard, index: number) => void;
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
 * Three states, and the deck is the interface in all of them:
 *   resting   cards hold their slot, a pointer near one lifts it and the lift
 *             falls off through its neighbours, so the stack reads as a wave
 *   selected  the tapped card flips up out of the deck to face you and the
 *             rest sink back, which is where the card basics get read
 *   open      tapping the card already facing you opens its full profile
 *
 * When the engine answers a question, the winning card is put into the
 * selected state, so the answer and the object are the same thing.
 */
export default function CardStack({
  cards,
  winnerIndex = null,
  onSelect,
  onOpen,
  compact = false,
}: CardStackProps) {
  const [hover, setHover] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const step = compact ? 62 : 78;

  // The engine's answer selects a card, same as a tap would.
  useEffect(() => {
    if (winnerIndex !== null) setSelected(winnerIndex);
  }, [winnerIndex]);

  // Deck changes (sign in, portfolio edit) drop any stale selection.
  useEffect(() => {
    setSelected(null);
    setHover(null);
  }, [cards]);

  const wave = selected === null ? hover : null;

  // Touch devices have no pointer, so the wave runs itself until a card is picked.
  useEffect(() => {
    if (reduce || selected !== null) return;
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
              setHover(i);
              i = (i + 1) % Math.max(1, cards.length);
            }, 1600);
          } else if (!en.isIntersecting && timer !== null) {
            window.clearInterval(timer);
            timer = null;
            setHover(null);
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
  }, [cards.length, reduce, selected]);

  function tap(card: StackCard, i: number) {
    if (selected === i) {
      onOpen?.(card, i);
    } else {
      setSelected(i);
      setHover(null);
      onSelect?.(card, i);
    }
  }

  const styleFor = useCallback(
    (i: number): React.CSSProperties => {
      const n = Math.max(1, cards.length);
      const depth = n > 1 ? (n - 1 - i) / (n - 1) : 0; // 0 front, 1 back
      const face = issuerFace(cards[i].issuer);

      // Selected: this card flips up out of the deck to face the reader.
      // Centred in the stage rather than lifted off the bottom edge, and the
      // z-push is small so perspective does not blow it past the frame.
      const stageH = (n - 1) * step + (compact ? 150 : 190);
      const cardH = (compact ? 300 : 330) / 1.62;
      const centre = -(stageH / 2 - cardH / 2);
      if (selected === i) {
        return {
          transform: `translate3d(-50%, ${centre.toFixed(0)}px, 40px) rotateX(7deg) scale(1)`,
          filter: 'brightness(1.14) saturate(1.08)',
          zIndex: 100,
          ['--face' as any]: face,
          ['--glow' as any]: '0.95',
        };
      }

      // Something else is selected: sink back and dim, out of the way.
      if (selected !== null) {
        const below = i < selected;
        return {
          transform: `translate3d(-50%, ${-i * step + (below ? 40 : -34)}px, ${-90 - depth * 90}px) rotateX(74deg) scale(${0.92 - depth * 0.04})`,
          filter: `brightness(${0.3 - depth * 0.05}) saturate(0.55)`,
          zIndex: n - i,
          ['--face' as any]: face,
          ['--glow' as any]: '0.08',
        };
      }

      // Resting: the wave.
      const d = wave === null ? 99 : Math.abs(i - wave);
      const pull = wave === null ? 0 : Math.max(0, 1 - d / 2.3);
      const ease = pull * pull * (3 - 2 * pull); // smoothstep

      const y = -i * step - ease * 22;
      const z = -depth * 120 + ease * 60;
      const sc = 1 - depth * 0.055 + ease * 0.045;
      const br = wave === null ? 1 - depth * 0.14 : 0.5 + ease * 0.62 - depth * 0.07;
      const sa = wave === null ? 1 : 0.72 + ease * 0.4;

      return {
        transform: `translate3d(-50%, ${y}px, ${z}px) rotateX(70deg) scale(${sc})`,
        filter: `brightness(${br}) saturate(${sa})`,
        zIndex: n - i,
        ['--face' as any]: face,
        ['--glow' as any]: (0.3 + ease * 0.55).toFixed(3),
      };
    },
    [cards, selected, step, wave]
  );

  return (
    <div className="w-full" style={{ perspective: '1000px', perspectiveOrigin: '50% 34%' }}>
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
        {cards.map((c, i) => {
          const isSel = selected === i;
          return (
            <button
              key={c.cardId ?? i}
              role="listitem"
              aria-pressed={isSel}
              aria-label={isSel ? `${c.name}, selected. Activate again to open` : c.name}
              onClick={() => tap(c, i)}
              onPointerEnter={() => !reduce && selected === null && setHover(i)}
              onFocus={() => selected === null && setHover(i)}
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
                  : 'transform .58s cubic-bezier(.19,1,.22,1), filter .42s ease',
                ...styleFor(i),
              }}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="text-[13px] font-bold tracking-tight text-white/95 [text-shadow:0_1px_4px_rgba(0,0,0,.45)]">
                  {c.name}
                </span>
                {isSel && (
                  <span className="shrink-0 rounded-full bg-black/35 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-white/90">
                    Tap to open
                  </span>
                )}
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
          );
        })}
      </div>
    </div>
  );
}
