import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Clock, Keyboard, Mic, X } from 'lucide-react';
import SwarmOrb, { type OrbState } from '../components/SwarmOrb';
import CardStack, { type StackCard } from '../components/CardStack';
import TypingPrompts from '../components/TypingPrompts';
import VoiceSheet, { type VoicePhase } from '../components/VoiceSheet';
import { useAuth } from '../contexts/AuthContext';
import { useWallet, type WalletCard } from '../lib/wallet';
import { decide, type Decision } from '../lib/engine';
import { localDecide } from '../lib/localDecide';
import { formatValue, useBenefitLog, useCustomBenefits } from '../lib/benefits';
import { speak, useVoice } from '../lib/voice';

/**
 * Ask: the screen you open at the register.
 *
 *   the orb       is the voice button. Tap it and it grows into the listening
 *                 view, swells as you talk, and says the answer back.
 *   the line      beside it types out the kind of thing you can ask.
 *   the deck      is your wallet. Tap a card to flip it out, tap it again to
 *                 open it in Insights, tap anywhere else to put it back.
 *   the field     at the bottom is for typing instead of talking.
 *
 * With no cards yet, the deck is a set of plain placeholders and the screen
 * says to add your cards. Once cards are added, only those appear.
 */

const TEMPLATE_ID = -900;
const TEMPLATE: StackCard[] = [
  { cardId: -901, name: 'Your everyday card', issuer: '', rate: '+', on: 'Add your cards', face: 'linear-gradient(140deg,#3B3445,#1D1924)' },
  { cardId: -902, name: 'Your grocery card', issuer: '', rate: '+', face: 'linear-gradient(140deg,#443650,#221A2A)' },
  { cardId: -903, name: 'Your dining card', issuer: '', rate: '+', face: 'linear-gradient(140deg,#4E3558,#261A2C)' },
  { cardId: -904, name: 'Your gas card', issuer: '', rate: '+', face: 'linear-gradient(140deg,#583463,#2B1830)' },
];

const isTemplate = (c: StackCard | null | undefined) => !!c && c.cardId <= TEMPLATE_ID;

/** A wallet card, as the deck draws it: its best rate on the face. */
function toStack(c: WalletCard): StackCard {
  const best = [...(c.categories || [])].sort((a, b) => (b.cashbackRate || 0) - (a.cashbackRate || 0))[0];
  return {
    cardId: c.id,
    name: c.nickname || c.name,
    issuer: c.issuer,
    rate: best ? `${best.cashbackRate}%` : undefined,
    on: best?.category,
  };
}

export default function Counter() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const owned = useWallet();
  const log = useBenefitLog();
  const custom = useCustomBenefits();

  const [decision, setDecision] = useState<Decision | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voicePhase, setVoicePhase] = useState<VoicePhase>('listening');
  const [voiceAnswer, setVoiceAnswer] = useState('');
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);
  const orbButtonRef = useRef<HTMLButtonElement | null>(null);
  const deckBoxRef = useRef<HTMLDivElement | null>(null);
  const [deckHeight, setDeckHeight] = useState<number | undefined>(undefined);

  // The deck gets whatever height is left between the prompt and the typing
  // field, and packs its cards to fit, so nothing below it is ever pushed off.
  useLayoutEffect(() => {
    const el = deckBoxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setDeckHeight(Math.floor(entry.contentRect.height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const hasCards = owned.cards.length > 0;
  const deck = useMemo(
    () => (hasCards ? owned.cards.slice(0, 6).map(toStack).reverse() : TEMPLATE),
    [hasCards, owned.cards]
  );

  const winnerIndex = useMemo(() => {
    if (!decision?.winner) return null;
    const target = decision.nudge?.overridesWinner ? decision.nudge.cardId : decision.winner.cardId;
    const i = deck.findIndex((c) => c.cardId === target);
    return i >= 0 ? i : null;
  }, [decision, deck]);

  const orbState: OrbState = busy ? 'thinking' : decision?.nudge ? 'alert' : decision ? 'speaking' : 'idle';

  /** One answer path for typing and talking. Null means there is nothing to ask yet. */
  async function answer(question: string): Promise<Decision | null> {
    if (!hasCards) {
      setNote(owned.mode === 'signed-out'
        ? 'Sign in and add your cards, and I can pick the right one.'
        : 'Add your cards in Wallet first, and I can pick the right one.');
      return null;
    }
    if (owned.mode === 'device') return localDecide(owned.cards, question);
    if (!user) return null;
    return decide(user.userId, question);
  }

  async function ask(text: string) {
    const q = text.trim();
    if (!q) return;
    setBusy(true);
    setNote(null);
    try {
      const d = await answer(q);
      if (d) {
        setDecision(d);
        setDraft('');
        inputRef.current?.blur();
      }
    } catch {
      setNote('Could not reach your wallet just now.');
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------------------------ voice
  const voice = useVoice(async (said) => {
    setVoicePhase('thinking');
    try {
      const d = await answer(said);
      if (!d) {
        setVoiceOpen(false);
        return;
      }
      setDecision(d);
      setVoiceAnswer(d.spoken);
      setVoicePhase('answer');
      speak(d.spoken);
    } catch {
      setVoicePhase('error');
    }
  });

  // Recognition that ends without hearing anything, or cannot run at all.
  useEffect(() => {
    if (!voiceOpen) return;
    if (voice.state === 'unsupported' || voice.state === 'denied' || voice.state === 'error') {
      setVoicePhase(voice.state);
    } else if (voice.state === 'idle' && voicePhase === 'listening') {
      setVoicePhase('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.state]);

  function openVoice() {
    const canvas = orbButtonRef.current?.querySelector('canvas');
    setOriginRect(canvas ? canvas.getBoundingClientRect() : null);
    setSelectedIndex(null);
    setVoiceAnswer('');
    setVoicePhase('listening');
    setVoiceOpen(true);
    voice.start();
  }

  function closeVoice() {
    voice.cancel();
    window.speechSynthesis?.cancel();
    setVoiceOpen(false);
  }

  // -------------------------------------------------------------- selection
  function onSelectedChange(i: number | null) {
    setSelectedIndex(i);
    // Putting the card back returns the whole screen to its resting state.
    if (i === null) {
      setDecision(null);
      setNote(null);
    }
  }

  function open(card: StackCard) {
    if (isTemplate(card)) {
      navigate('/cards');
      return;
    }
    navigate(`/recommendations?card=${card.cardId}`);
  }

  const selectedCard = selectedIndex !== null ? deck[selectedIndex] : null;
  const selectedWalletCard =
    selectedCard && !isTemplate(selectedCard) ? owned.cards.find((c) => c.id === selectedCard.cardId) : undefined;

  const basics = useMemo(() => {
    if (!selectedWalletCard) return null;
    const rates = [...(selectedWalletCard.categories || [])]
      .sort((a, b) => (b.cashbackRate || 0) - (a.cashbackRate || 0))
      .slice(0, 4);
    const benefits = custom.benefitsFor(selectedWalletCard);
    const dollarsLeft = benefits
      .filter((b) => b.unit === '$')
      .reduce((sum, b) => sum + Math.max(0, b.maxValue - log.used(b)), 0);
    return { rates, credits: benefits.length, dollarsLeft };
  }, [selectedWalletCard, custom, log]);

  const heroReasons = decision
    ? decision.contenders.find(
        (c) => c.cardId === (decision.nudge?.overridesWinner ? decision.nudge.cardId : decision.winner?.cardId)
      )?.reasons
    : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-black text-[#F3EBF8]">
      <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-5 pb-4 pt-3">

        {/* the orb is the voice button; the line beside it shows what to ask */}
        <div className="flex items-center gap-3.5">
          <button
            ref={orbButtonRef}
            onClick={openVoice}
            aria-label="Ask by voice"
            className="relative shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E64BD4] focus-visible:outline-offset-4"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-2 rounded-full bg-[#E64BD4]/30 blur-lg animate-[orbhalo_3s_ease-in-out_infinite] motion-reduce:animate-none"
            />
            <SwarmOrb size={68} count={760} state={orbState} />
            <span
              aria-hidden="true"
              className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full
                         bg-[linear-gradient(160deg,#F06BDD,#B01FA0)] shadow-[0_4px_14px_rgba(230,75,212,.5)] ring-[3px] ring-black"
            >
              <Mic className="h-3.5 w-3.5 text-white" />
            </span>
          </button>

          <div className="min-w-0 flex-1">
            {decision ? (
              <p className="font-serif text-[18px] leading-snug text-[#F3EBF8]">{decision.spoken}</p>
            ) : busy ? (
              <p className="text-[17px] font-semibold text-[#9B8FA6]">Checking your wallet…</p>
            ) : selectedCard && !isTemplate(selectedCard) ? (
              <p className="text-[17px] font-semibold leading-snug text-[#F3EBF8]">{selectedCard.name}</p>
            ) : (
              <button onClick={openVoice} className="block w-full text-left" tabIndex={-1} aria-hidden="true">
                <span className="block min-h-[50px] text-[18px] font-semibold leading-snug">
                  <TypingPrompts />
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-[11.5px] font-medium text-[#6E637A]">
                  <Mic className="h-3 w-3" /> Tap the orb and ask
                </span>
              </button>
            )}
          </div>

          {(decision || selectedIndex !== null) && (
            <button
              onClick={() => onSelectedChange(null)}
              aria-label="Clear"
              className="shrink-0 rounded-full border border-white/10 p-2 text-[#6E637A] transition-colors hover:text-[#F3EBF8]
                         focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E64BD4]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* the deck */}
        <div ref={deckBoxRef} className="mt-1 flex min-h-0 flex-1 items-center justify-center">
          <CardStack
            cards={deck}
            fitHeight={deckHeight}
            winnerIndex={winnerIndex}
            selected={selectedIndex}
            onSelectedChange={onSelectedChange}
            onOpen={open}
            openLabel={hasCards ? 'Tap to open' : 'Tap to add yours'}
          />
        </div>

        {/* no cards yet: say so plainly */}
        {!hasCards && (
          <div className="mb-3 flex items-center gap-3 rounded-2xl border border-[#E64BD4]/30 bg-[#E64BD4]/[0.07] px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] font-bold tracking-tight text-[#F3EBF8]">Add your cards</p>
              <p className="mt-0.5 text-[12px] leading-snug text-[#AFA2B9]">
                {owned.mode === 'signed-out'
                  ? 'These are placeholders. Sign in and pick the cards you carry.'
                  : 'These are placeholders. Pick the cards you carry.'}
              </p>
            </div>
            <Link
              to="/cards"
              className="shrink-0 rounded-full bg-[#E64BD4] px-4 py-2 text-[13px] font-bold text-black hover:bg-[#F06BDD]"
            >
              Add cards
            </Link>
          </div>
        )}

        {/* what the flipped card earns, and the way into its insights */}
        {basics && selectedWalletCard && !decision && (
          <button
            data-keep-selection
            onClick={() => navigate(`/recommendations?card=${selectedWalletCard.id}`)}
            className="mb-3 w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3.5 text-left
                       transition-colors hover:border-[#E64BD4]/40
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E64BD4]"
          >
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {basics.rates.map((r, i) => (
                <span key={i} className="text-[12.5px] text-[#AFA2B9]">
                  <b className="font-mono font-bold text-[#F58EE4]">{r.cashbackRate}%</b> {r.category}
                </span>
              ))}
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-white/[0.07] pt-2.5">
              <span className="text-[12.5px] font-semibold text-[#DDD0E6]">
                {basics.credits > 0
                  ? `${formatValue(Math.round(basics.dollarsLeft), '$')} in credits left`
                  : 'Insights for this card'}
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

        {note && <p className="mb-3 text-center text-[12.5px] text-[#AFA2B9]">{note}</p>}

        {/* typing, for when talking is not an option */}
        <form
          onSubmit={(e) => { e.preventDefault(); ask(draft); }}
          className="mt-auto flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] py-1.5 pl-4 pr-1.5
                     focus-within:border-[#E64BD4]/50"
        >
          <Keyboard className="h-4 w-4 shrink-0 text-[#6E637A]" aria-hidden="true" />
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Or type it: dinner, gas, Uber"
            aria-label="Type what you are buying"
            className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-[#F3EBF8] placeholder:text-[#5C5468] outline-none"
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
      </div>

      <VoiceSheet
        open={voiceOpen}
        originRect={originRect}
        phase={voicePhase}
        transcript={voice.transcript}
        answer={voiceAnswer}
        levelRef={voice.levelRef}
        onDone={voice.stop}
        onRetry={() => { setVoicePhase('listening'); voice.start(); }}
        onType={() => { closeVoice(); window.setTimeout(() => inputRef.current?.focus(), 80); }}
        onClose={closeVoice}
      />
    </div>
  );
}
