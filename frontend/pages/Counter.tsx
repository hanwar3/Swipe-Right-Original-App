import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, X, Clock, ChevronRight } from 'lucide-react';
import SwarmOrb, { type OrbState } from '../components/SwarmOrb';
import CardStack, { type StackCard } from '../components/CardStack';
import { useAuth } from '../contexts/AuthContext';
import { decide, cardProfile, formatMoney, type Decision, type CardProfile } from '../lib/engine';

/**
 * The counter screen.
 *
 * There is no category grid. You are holding a wallet, so the app shows you a
 * wallet. The deck is the interface, not decoration:
 *   tap a card      it flips out of the deck and shows what that card earns
 *   tap it again    you land on its full profile, benefits and deadlines
 *   ask a question  the engine's winner is the card that flips out
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
  const navigate = useNavigate();

  const [wallet, setWallet] = useState<StackCard[]>(SAMPLE);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [picked, setPicked] = useState<CardProfile | null>(null);
  const [pickedCard, setPickedCard] = useState<StackCard | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [promptIdx, setPromptIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isSample = !user;

  // Signed in, the deck is the user's own portfolio. Signed out, it is a
  // labelled example so the screen still shows what the app does.
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
      .catch(() => setNote('Could not reach your wallet. Try again in a moment.'));
    return () => { live = false; };
  }, [user]);

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
    if (!user) { setNote('Sign in and add your cards, and I can pick from your real wallet.'); return; }
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

  /** First tap: the card flips out of the deck; load what it earns. */
  function select(card: StackCard) {
    setPickedCard(card);
    setPicked(null);
    if (!user || card.cardId < 0) return; // the sample deck has no real profile
    cardProfile(user.userId, card.cardId)
      .then((p) => setPicked(p))
      .catch(() => setNote('Could not load that card.'));
  }

  /** Second tap: the card's full profile lives in the Wallet tab. */
  function open(card: StackCard) {
    if (!user || card.cardId < 0) {
      setNote('Sign in to open a card.');
      return;
    }
    navigate(`/cards?card=${card.cardId}`);
  }

  function clear() {
    setDecision(null);
    setPicked(null);
    setPickedCard(null);
    setNote(null);
  }

  const heroReasons = decision
    ? decision.contenders.find(
        (c) => c.cardId === (decision.nudge?.overridesWinner ? decision.nudge.cardId : decision.winner?.cardId)
      )?.reasons
    : undefined;

  const showBasics = pickedCard !== null && !decision;

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-black text-[#F3EBF8]">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-4 pt-2">

        {/* orb + what it is saying */}
        <div className="flex items-center gap-3">
          <SwarmOrb size={54} count={620} state={orbState} />
          <div className="min-w-0 flex-1">
            {decision ? (
              <p className="font-serif text-[17px] leading-snug text-[#F3EBF8]">{decision.spoken}</p>
            ) : showBasics ? (
              <p className="text-[15px] font-semibold leading-snug text-[#DDD0E6]">
                {picked?.displayName ?? pickedCard?.name}
              </p>
            ) : (
              <p className="text-[15px] font-semibold leading-snug text-[#9B8FA6]">
                {busy ? 'Checking your wallet…' : 'What are you buying?'}
              </p>
            )}
          </div>
          {(decision || pickedCard) && (
            <button
              onClick={clear}
              aria-label="Clear"
              className="shrink-0 rounded-full border border-white/10 p-2 text-[#6E637A] transition-colors hover:text-[#F3EBF8]
                         focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E64BD4]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* the deck */}
        <div className="mt-2 flex flex-1 items-center justify-center">
          {wallet.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E64BD4]/30 p-6 text-center">
              <p className="text-[14px] leading-relaxed text-[#9B8FA6]">
                No cards yet. Add a few in Wallet and this becomes your deck.
              </p>
            </div>
          ) : (
            <CardStack cards={wallet} winnerIndex={winnerIndex} onSelect={select} onOpen={open} />
          )}
        </div>

        {/* what the selected card earns, and the way through to its profile */}
        {showBasics && picked && (
          <button
            onClick={() => navigate(`/cards?card=${picked.cardId}`)}
            className="mb-3 w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3.5 text-left
                       transition-colors hover:border-[#E64BD4]/40
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E64BD4]"
          >
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {picked.rates.slice(0, 4).map((r, i) => (
                <span key={i} className="text-[12.5px] text-[#AFA2B9]">
                  <b className="font-mono font-bold text-[#F58EE4]">{r.rate}%</b> {r.category}
                </span>
              ))}
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-white/[0.07] pt-2.5">
              <span className="text-[12.5px] font-semibold text-[#DDD0E6]">
                {picked.unusedBenefitCents > 0
                  ? `${formatMoney(picked.unusedBenefitCents)} in credits unused`
                  : 'Benefits and deadlines'}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#6E637A]" />
            </div>
          </button>
        )}

        {/* why the engine picked what it picked */}
        {heroReasons?.length ? (
          <ul className="mb-3 flex flex-col gap-1.5">
            {heroReasons.slice(0, 2).map((r, i) => (
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
            Example wallet. Sign in to see your own cards here.
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
