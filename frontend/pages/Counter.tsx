import React, { useEffect, useRef, useState } from 'react';
import { Mic, ArrowLeft, Clock, TrendingUp } from 'lucide-react';
import SwarmOrb, { type OrbState } from '../components/SwarmOrb';
import { useAuth } from '../contexts/AuthContext';
import { decide, formatMoney, type Decision } from '../lib/engine';

/**
 * The counter screen. This is the whole app.
 *
 * Someone is standing at a register with a queue behind them. One tap has to
 * produce one answer. Everything else in SwipeRight exists to make this screen
 * correct.
 */

const CATEGORIES = [
  { key: 'gas', label: 'Gas' },
  { key: 'groceries', label: 'Groceries' },
  { key: 'dining', label: 'Dining' },
  { key: 'travel', label: 'Travel' },
  { key: 'online', label: 'Online' },
  { key: 'drugstores', label: 'Pharmacy' },
  { key: 'streaming', label: 'Streaming' },
  { key: 'all', label: 'Everything else' },
];

const PROMPTS: [string, string][] = [
  ["I'm at a gas station", ' and I’m in a rush'],
  ['Which card for groceries', ' at Trader Joe’s?'],
  ['About to book a flight', ' — anything expiring?'],
  ['Just tapped at CVS', ' — did I pick right?'],
];

function TypingPrompt() {
  const [typed, setTyped] = useState('');
  const [ghost, setGhost] = useState('');

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setTyped(PROMPTS[0][0]);
      setGhost(PROMPTS[0][1]);
      return;
    }
    let li = 0;
    let ci = 0;
    let holding = false;
    let timer: number;

    const step = () => {
      const [head, tail] = PROMPTS[li];
      if (!holding) {
        ci++;
        setTyped(head.slice(0, ci));
        setGhost(ci >= head.length ? tail : '');
        if (ci >= head.length) {
          holding = true;
          timer = window.setTimeout(step, 2200);
          return;
        }
        timer = window.setTimeout(step, 46 + Math.random() * 42);
      } else {
        holding = false;
        ci = 0;
        li = (li + 1) % PROMPTS.length;
        setTyped('');
        setGhost('');
        timer = window.setTimeout(step, 400);
      }
    };
    timer = window.setTimeout(step, 500);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <p className="text-[19px] font-semibold leading-snug tracking-tight min-h-[52px] text-[#F3EBF8]">
      {typed}
      <span className="inline-block w-[2px] h-[17px] bg-[#E64BD4] align-[-2px] mx-[2px] animate-[blink_1.05s_steps(1)_infinite] motion-reduce:animate-none" />
      <span className="text-[#43394C]">{ghost}</span>
    </p>
  );
}

export default function Counter() {
  const { user } = useAuth();
  const [view, setView] = useState<'ask' | 'answer'>('ask');
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [asked, setAsked] = useState('');
  const [error, setError] = useState<string | null>(null);
  const liveRef = useRef<HTMLDivElement | null>(null);

  const orbState: OrbState = busy
    ? 'thinking'
    : decision?.nudge
      ? 'alert'
      : view === 'answer'
        ? 'speaking'
        : 'idle';

  async function pick(categoryKey: string, label: string) {
    if (!user) {
      setError('Sign in and add your cards, and I can tell you exactly which one to pull out.');
      setAsked(label);
      setDecision(null);
      setView('answer');
      return;
    }
    setBusy(true);
    setError(null);
    setAsked(label);
    setView('answer');
    try {
      const d = await decide(user.userId, categoryKey);
      setDecision(d);
    } catch (e: any) {
      setDecision(null);
      setError(
        "I couldn't reach your portfolio just now. Check your connection and try again."
      );
    } finally {
      setBusy(false);
    }
  }

  const winner = decision?.winner;
  const runnerUp = decision?.runnerUp;
  const nudge = decision?.nudge;
  const useInstead =
    nudge?.overridesWinner && nudge.cardId
      ? decision?.contenders.find((c) => c.cardId === nudge.cardId)
      : undefined;
  const hero = useInstead ?? winner;

  return (
    <div className="flex-1 flex flex-col bg-black text-[#F3EBF8]">
      {/* ---------------- ASK ---------------- */}
      {view === 'ask' && (
        <div className="flex-1 flex flex-col px-5 pt-4 pb-6 max-w-md mx-auto w-full">
          <div className="flex justify-center">
            <SwarmOrb size={196} count={1800} state={orbState} />
          </div>

          <div className="mt-1">
            <TypingPrompt />
          </div>

          <div className="grid grid-cols-2 gap-2.5 mt-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => pick(c.key, c.label)}
                className="min-h-[64px] rounded-2xl bg-white/[0.045] border border-[#E64BD4]/25 text-[#DDD0E6] text-[15px] font-semibold px-4 py-3 text-left
                           transition-colors hover:bg-[#E64BD4]/15 hover:border-[#E64BD4] active:bg-[#E64BD4]/25
                           focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E64BD4] focus-visible:outline-offset-2"
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="mt-auto pt-6 flex flex-col items-center gap-2">
            <button
              aria-label="Hold to speak"
              className="w-[62px] h-[62px] rounded-full grid place-items-center text-white
                         bg-[linear-gradient(160deg,#F06BDD,#B01FA0)] shadow-[0_8px_28px_rgba(230,75,212,0.42)]
                         active:scale-95 transition-transform
                         focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F3EBF8] focus-visible:outline-offset-3"
            >
              <Mic className="h-6 w-6" />
            </button>
            <p className="text-[11.5px] font-semibold tracking-wide text-[#6E637A]">Hold to speak</p>
          </div>
        </div>
      )}

      {/* ---------------- ANSWER ---------------- */}
      {view === 'answer' && (
        <div className="flex-1 flex flex-col px-5 pt-4 pb-6 max-w-md mx-auto w-full">
          <div className="flex items-center gap-3">
            <SwarmOrb size={48} count={520} state={orbState} />
            <button
              onClick={() => {
                setView('ask');
                setError(null);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[12.5px] font-semibold
                         bg-white/[0.045] border border-[#E64BD4]/25 text-[#DDD0E6]
                         hover:bg-[#E64BD4]/15 transition-colors
                         focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E64BD4] focus-visible:outline-offset-2"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
          </div>

          {asked && (
            <div className="ml-auto mt-5 max-w-[78%] rounded-[20px_20px_5px_20px] px-3.5 py-2.5
                            bg-[#E64BD4]/[0.17] border border-[#E64BD4]/30 text-[13.5px] font-medium text-[#F0DEEE]">
              {asked}
            </div>
          )}

          <div ref={liveRef} aria-live="polite" className="contents">
            {busy && (
              <div className="mt-4 rounded-[20px_20px_20px_5px] px-4 py-4 bg-white/5 border border-[#E64BD4]/20">
                <p className="text-[15px] text-[#9B8FA6]">Checking your wallet…</p>
              </div>
            )}

            {!busy && error && (
              <div className="mt-4 rounded-[20px_20px_20px_5px] px-4 py-4 bg-white/5 border border-[#E64BD4]/20">
                <p className="text-[15px] leading-relaxed text-[#DDD0E6]">{error}</p>
              </div>
            )}

            {!busy && !error && decision && (
              <>
                <div className="mt-3.5 rounded-[20px_20px_20px_5px] px-4 py-4 bg-white/5 border border-[#E64BD4]/20">
                  <p className="font-serif text-[21px] leading-snug text-[#F3EBF8]">
                    {decision.spoken}
                  </p>
                </div>

                {hero && (
                  <div className="mt-3 rounded-2xl p-3.5 bg-white/5 border border-[#E64BD4]/20 flex items-center gap-3">
                    <div
                      className="w-[54px] h-[34px] rounded-md shrink-0"
                      style={{ background: cardFace(hero.issuer) }}
                    />
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-bold tracking-tight truncate">
                        {hero.displayName}
                      </h3>
                      <p className="text-[12px] font-medium text-[#9B8FA6] truncate">
                        {hero.issuer} · {hero.network}
                      </p>
                    </div>
                    <div className="ml-auto font-mono text-[21px] font-extrabold text-[#F58EE4] tabular-nums">
                      {hero.effectiveRate}%
                    </div>
                  </div>
                )}

                {hero?.reasons?.length ? (
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {hero.reasons.slice(0, 3).map((r, i) => (
                      <li key={i} className="flex gap-2 text-[13px] leading-snug text-[#AFA2B9]">
                        <TrendingUp className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[#E64BD4]" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {nudge && (
                  <div className="mt-3 rounded-2xl px-3.5 py-3 bg-white/[0.035] border border-dashed border-[#E64BD4]/30">
                    <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#E64BD4] mb-1.5">
                      <Clock className="h-3 w-3" />
                      {nudge.headline}
                    </p>
                    <p className="text-[12.5px] leading-snug text-[#AFA2B9]">{nudge.detail}</p>
                  </div>
                )}

                {runnerUp && runnerUp.cardId !== hero?.cardId && (
                  <div className="mt-3 flex items-baseline justify-between gap-3 pt-3 border-t border-white/10">
                    <span className="text-[13px] text-[#6E637A]">
                      Next best: {runnerUp.displayName}
                    </span>
                    <span className="font-mono text-[13px] font-bold tabular-nums text-[#6E637A]">
                      {runnerUp.effectiveRate}%
                    </span>
                  </div>
                )}

                {decision.contenders.length === 0 && (
                  <p className="mt-4 text-[14px] text-[#9B8FA6]">
                    Nothing in your wallet earns on this one. Adding a flat-rate card would
                    cover the gap.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Issuer-tinted card face. The app renders CSS faces rather than hotlinking bank images. */
function cardFace(issuer: string): string {
  const i = (issuer || '').toLowerCase();
  if (i.includes('chase')) return 'linear-gradient(135deg,#1C3F94,#0E2359)';
  if (i.includes('american express') || i.includes('amex')) return 'linear-gradient(135deg,#D4AF52,#9A7B2E)';
  if (i.includes('citi')) return 'linear-gradient(135deg,#3B4A5A,#1B242E)';
  if (i.includes('wells')) return 'linear-gradient(135deg,#B32017,#7A120C)';
  if (i.includes('discover')) return 'linear-gradient(135deg,#F26E21,#C4471A)';
  if (i.includes('capital one')) return 'linear-gradient(135deg,#124A6F,#0A2C43)';
  if (i.includes('bank of america')) return 'linear-gradient(135deg,#9B1B30,#5E0F1D)';
  return 'linear-gradient(135deg,#4A4453,#26222C)';
}
