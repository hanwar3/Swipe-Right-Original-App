import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Keyboard, Mic, X } from 'lucide-react';
import SwarmOrb, { type OrbState } from './SwarmOrb';

export type VoicePhase = 'listening' | 'thinking' | 'answer' | 'unsupported' | 'denied' | 'error';

interface VoiceSheetProps {
  open: boolean;
  /** Where the small orb sits, so the big one can grow out of it and shrink back. */
  originRect: DOMRect | null;
  phase: VoicePhase;
  transcript: string;
  answer?: string;
  levelRef: React.MutableRefObject<number>;
  onDone: () => void;
  onRetry: () => void;
  onType: () => void;
  onClose: () => void;
}

/**
 * Talking to the orb.
 *
 * Nothing else is on screen: the orb grows out of its place beside the prompt,
 * swells with your voice while it listens, tightens while it works, and says
 * the answer. Closing shrinks it back into the same spot, so it reads as one
 * object that came forward to listen, not a modal that opened.
 */
export default function VoiceSheet({
  open, originRect, phase, transcript, answer, levelRef, onDone, onRetry, onType, onClose,
}: VoiceSheetProps) {
  const orbRef = useRef<HTMLDivElement | null>(null);
  const [closing, setClosing] = useState(false);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  /** Transform that puts the big orb exactly over the small one. */
  function originTransform(): string | null {
    const el = orbRef.current;
    if (!el || !originRect) return null;
    const box = el.getBoundingClientRect();
    if (!box.width) return null;
    const scale = originRect.width / box.width;
    const dx = originRect.left + originRect.width / 2 - (box.left + box.width / 2);
    const dy = originRect.top + originRect.height / 2 - (box.top + box.height / 2);
    return `translate(${dx}px, ${dy}px) scale(${scale})`;
  }

  // Grow out of the small orb.
  useLayoutEffect(() => {
    if (!open) return;
    setClosing(false);
    const el = orbRef.current;
    const from = originTransform();
    if (!el || !from || reduce) return;
    el.style.transition = 'none';
    el.style.transform = from;
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.style.transition = 'transform 620ms cubic-bezier(.16,1,.3,1)';
        el.style.transform = 'none';
      })
    );
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Shrink back into it, then actually close.
  function close() {
    const el = orbRef.current;
    const to = originTransform();
    setClosing(true);
    if (!el || !to || reduce) {
      onClose();
      return;
    }
    el.style.transition = 'transform 380ms cubic-bezier(.5,0,.75,0)';
    el.style.transform = to;
    window.setTimeout(onClose, 360);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const orbState: OrbState =
    phase === 'listening' ? 'listening' : phase === 'thinking' ? 'thinking' : phase === 'answer' ? 'speaking' : 'idle';

  const unavailable = phase === 'unsupported' || phase === 'denied' || phase === 'error';

  // Rendered into <body>: the route transition animates a transform on the page
  // wrapper, which traps fixed children beneath the header and tab bar.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ask by voice"
      className={`fixed inset-0 z-[70] flex flex-col items-center bg-black/95 px-6 backdrop-blur-sm
                  transition-opacity duration-300 ${closing ? 'opacity-0' : 'opacity-100'}`}
    >
      <button
        onClick={close}
        aria-label="Close"
        className="absolute right-5 top-5 rounded-full border border-white/10 p-2.5 text-[#9B8FA6] hover:text-[#F3EBF8]
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E64BD4]"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="flex w-full max-w-sm flex-1 flex-col items-center justify-center">
        <div ref={orbRef} style={{ willChange: 'transform' }}>
          <SwarmOrb size={250} count={2400} state={orbState} levelRef={levelRef} />
        </div>

        <div className="mt-6 min-h-[92px] w-full text-center" aria-live="polite">
          {phase === 'listening' && (
            <>
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#E64BD4]">Listening</p>
              <p className="mt-2 text-[20px] font-semibold leading-snug text-[#F3EBF8]">
                {transcript || <span className="text-[#5C5468]">Try “Dinner at a sushi place”</span>}
              </p>
            </>
          )}
          {phase === 'thinking' && (
            <>
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#9B8FA6]">Checking your wallet</p>
              <p className="mt-2 text-[20px] font-semibold leading-snug text-[#DDD0E6]">{transcript}</p>
            </>
          )}
          {phase === 'answer' && (
            <p className="font-serif text-[24px] leading-snug text-[#F3EBF8]">{answer}</p>
          )}
          {phase === 'unsupported' && (
            <p className="text-[15px] leading-relaxed text-[#AFA2B9]">
              Voice isn't available in this browser. Type your question instead.
            </p>
          )}
          {phase === 'denied' && (
            <p className="text-[15px] leading-relaxed text-[#AFA2B9]">
              SwipeRight needs the microphone to listen. Allow it in your browser settings, or type instead.
            </p>
          )}
          {phase === 'error' && (
            <p className="text-[15px] leading-relaxed text-[#AFA2B9]">I didn't catch that.</p>
          )}
        </div>
      </div>

      <div className="mb-10 flex w-full max-w-sm flex-col items-center gap-3">
        {phase === 'listening' && (
          <button
            onClick={onDone}
            className="grid h-[68px] w-[68px] place-items-center rounded-full text-white
                       bg-[linear-gradient(160deg,#F06BDD,#B01FA0)] shadow-[0_10px_34px_rgba(230,75,212,.45)]
                       transition-transform active:scale-95
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-4"
            aria-label="Done speaking"
          >
            <span className="h-5 w-5 rounded-[5px] bg-white" />
          </button>
        )}
        {phase === 'error' && (
          <button
            onClick={onRetry}
            className="flex items-center gap-2 rounded-full bg-[#E64BD4] px-5 py-3 text-[14px] font-bold text-black hover:bg-[#F06BDD]"
          >
            <Mic className="h-4 w-4" /> Try again
          </button>
        )}
        {phase === 'answer' && (
          <button
            onClick={close}
            className="rounded-full bg-[#E64BD4] px-6 py-3 text-[14px] font-bold text-black hover:bg-[#F06BDD]"
          >
            Show me the card
          </button>
        )}
        {(phase === 'listening' || unavailable) && (
          <button
            onClick={onType}
            className="flex items-center gap-1.5 text-[13px] font-semibold text-[#9B8FA6] hover:text-[#F3EBF8]"
          >
            <Keyboard className="h-4 w-4" /> Type instead
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
