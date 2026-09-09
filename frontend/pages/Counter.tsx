import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, X, Clock } from 'lucide-react';
import SwarmOrb, { type OrbState } from '../components/SwarmOrb';
import CardStack, { type StackCard } from '../components/CardStack';
import { useAuth } from '../contexts/AuthContext';
import { decide, type Decision } from '../lib/engine';

/**
 * The counter screen.
 *
 * There is no category grid. You are holding a wallet, so the app shows you a
 * wallet: your cards as slabs you can run a finger across. Ask a question and
 * the answer is not a new screen, it is the stack picking one card and lighting
 * it. The object and the answer are the same thing.
 */

/** Shown before sign-in so the screen is never an empty shell. Clearly labelled. */
const SAMPLE: StackCard[] = [
  { cardId: -1, name: 'Wells Fargo Active Cash', issuer: 'Wells Fargo', rate: '2%', on: 'Everything' },
  { cardId: -2, name: 'Citi Double Cash', issuer: 'Citi', rate: '2%', on: 'Everything' },
  { cardId: -3, name: 'Discover it', issuer: 'Discover', rate: '5%', on: 'Rotating, gas' },
  { cardId: -4, name: 'American Express Gold', issuer: 'American Express', rate: '4x', on: 'Dining, groceries' },
  { cardId: -5, name: 'Chase Sapphire Preferred', issuer: 'Chase', rate: '5x', on: 'Travel via portal' },
];

const PROMPTS = ['I’m at a gas station', 'Booking a flight', 'Groceries at Trader Joe’s', 'Dinner out'];

export default function Counter() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<StackCard[]>(SAMPLE);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [promptIdx, setPromptIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isSample = !user;

  // Resting state: rank the whole wallet on "everything" so the stack shows
  // real cards and real flat rates before any question is asked.
  useEffect(() => {
    if (!user) { setWallet(SAMPLE); return; }
    let live = true;
    decide(user.userId, 'all')
      .then((d) => {
        if (!live) return;
        const cards = d.contenders.map((c) => ({
          cardId: c.cardId,
          name: c.displayName,
          issuer: c.issuer,
          rate: `${c.effectiveRate}%`,
          on: 'Everything',
        }));
        setWallet(cards.length ? cards.slice(0, 6).reverse() : []);
      })
      .catch(() => setNote('Could not reach your wallet. Pull down to retry.'));
    return () => { live = false; };
  }, [user]);

  // Cycle the placeholder so the ask field suggests what it accepts.
  useEffect(() => {
    const t = setInterval(() => setPromptIdx((i) => (i + 1) % PROMPTS.length), 3200);
    return () => clearInterval(t);
  }, []);

  const winnerIndex = useMemo(() => {
    if (!decision?.winner) return null;
    const nudged = decision.nudge?.overridesWinner ? decision.nudge.cardId : undefined;
    const target = nudged ?? decision.winner.cardId;
    const i = wallet.findIndex((c) => c.cardId === target);
    return i >= 0 ? i : null;
  }, [decision, wallet]);

  const orbState: OrbState = busy ? 'thinking' : decision?.nudge ? 'alert' : decision ? 'speaking' : 'idle';

  async function ask(text: string) {
    const q = text.trim();
    if (!q) return;
    if (!user) {
      setNote('Sign in and add your cards, and I can pick from your real wallet.');
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const d = await decide(user.userId, q);
      setDecision(d);
      setAsking(false);
      setDraft('');
    } catch {
      setNote('Could not reach your wallet just now.');
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setDecision(null);
    setNote(null);
  }

  const hero = decision
    ? decision.contenders.find((c) => c.cardId === (decision.nudge?.overridesWinner ? decision.nudge.cardId : decision.winner?.cardId))
    : undefined;

  return (
    <div className="flex-1 flex flex-col bg-black text-[#F3EBF8] overflow-hidden">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-4 pt-2">

        {/* orb + question */}
        <div className="flex items-center gap-3">
          <SwarmOrb size={54} count={620} state={orbState} />
          <div className="min-w-0 flex-1">
            {decision ? (
              <p className="font-serif text-[17px] leading-snug text-[#F3EBF8]">{decision.spoken}</p>
            ) : (
              <p className="text-[15px] font-semibold leading-snug text-[#9B8FA6]">
                {busy ? 'Checking your wallet…' : 'What are you buying?'}
              </p>
            )}
          </div>
          {decision && (
            <button
              onClick={clear}
              aria-label="Clear answer"
              className="shrink-0 rounded-full border border-white/10 p-2 text-[#6E637A] transition-colors hover:text-[#F3EBF8]
                         focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E64BD4]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* the wallet */}
        <div className="mt-2 flex flex-1 items-center justify-center">
          {wallet.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-dashed border-[#E64BD4]/30 p-6 text-center">
              <p className="text-[14px] leading-relaxed text-[#9B8FA6]">
                No cards yet. Add a few in Wallet and this becomes your deck.
              </p>
            </div>
          ) : (
            <CardStack
              cards={wallet}
              winnerIndex={winnerIndex}
              onPick={(c) => user && ask(c.on || 'all')}
            />
          )}
        </div>

        {/* why it won */}
        {hero?.reasons?.length ? (
          <ul className="mb-3 flex flex-col gap-1.5">
            {hero.reasons.slice(0, 2).map((r, i) => (
              <li key={i} className="text-[12.5px] leading-snug text-[#AFA2B9]">{r}</li>
            ))}
          </ul>
        ) : null}

        {decision?.nudge && (
          <div className="mb-3 rounded-2xl border border-dashed border-[#E64BD4]/30 bg-white/[0.035] px-3.5 py-3">
            <p className="mb-1 flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-[#E64BD4]">
              <Clock className="h-3 w-3" />
              {decision.nudge.headline}
            </p>
            <p className="text-[12.5px] leading-snug text-[#AFA2B9]">{decision.nudge.detail}</p>
          </div>
        )}

        {isSample && !note && (
          <p className="mb-3 text-center text-[11.5px] font-medium text-[#6E637A]">
            Example wallet. Sign in to use your own cards.
          </p>
        )}
        {note && <p className="mb-3 text-center text-[12.5px] text-[#AFA2B9]">{note}</p>}

        {/* ask */}
        <div className="mt-auto">
          {asking ? (
            <form
              onSubmit={(e) => { e.preventDefault(); ask(draft); }}
              className="flex items-center gap-2 rounded-full border border-[#E64BD4]/30 bg-white/[0.05] py-1.5 pl-4 pr-1.5"
            >
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={PROMPTS[promptIdx]}
                aria-label="What are you buying?"
                className="min-w-0 flex-1 bg-transparent text-[15px] text-[#F3EBF8] placeholder:text-[#5C5468] outline-none"
              />
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                className="shrink-0 rounded-full bg-[#E64BD4] px-4 py-2 text-[13px] font-bold text-black
                           disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                Ask
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setAsking(true); setTimeout(() => inputRef.current?.focus(), 40); }}
                className="min-h-[52px] flex-1 rounded-full border border-white/10 bg-white/[0.045] px-5 text-left text-[15px] font-medium text-[#6E637A]
                           transition-colors hover:border-[#E64BD4]/40
                           focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E64BD4]"
              >
                {PROMPTS[promptIdx]}
              </button>
              <button
                aria-label="Hold to speak"
                className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full text-white
                           bg-[linear-gradient(160deg,#F06BDD,#B01FA0)] shadow-[0_8px_24px_rgba(230,75,212,.38)]
                           transition-transform active:scale-95
                           focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
              >
                <Mic className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
