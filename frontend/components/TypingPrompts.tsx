import React, { useEffect, useState } from 'react';

/**
 * The line beside the orb.
 *
 * It opens on "What are you buying?" and then types out the kind of thing you
 * can say to the orb, so the prompt doubles as a demonstration: tap the mic and
 * ask it like this. The ghosted tail is the rest of the sentence you would say.
 */

const LINES: [string, string][] = [
  ['What are you buying?', ''],
  ["I'm at a gas station", ' and in a rush'],
  ['Dinner at a sushi place', ' tonight'],
  ['Booking a flight', ' to Denver'],
  ["Groceries at Trader Joe's", ''],
  ['Which card for Uber?', ''],
];

export default function TypingPrompts({ className = '' }: { className?: string }) {
  const [typed, setTyped] = useState(LINES[0][0]);
  const [ghost, setGhost] = useState('');

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let line = 0;
    let chars = LINES[0][0].length;
    let phase: 'hold' | 'erase' | 'type' = 'hold';
    let timer: number;

    const step = () => {
      const [head, tail] = LINES[line];
      if (phase === 'hold') {
        setGhost(tail);
        phase = 'erase';
        timer = window.setTimeout(step, line === 0 ? 2600 : 2000);
        return;
      }
      if (phase === 'erase') {
        setGhost('');
        chars = Math.max(0, chars - 2);
        setTyped(head.slice(0, chars));
        if (chars === 0) {
          line = (line + 1) % LINES.length;
          phase = 'type';
          timer = window.setTimeout(step, 260);
        } else {
          timer = window.setTimeout(step, 22);
        }
        return;
      }
      const next = LINES[line][0];
      chars++;
      setTyped(next.slice(0, chars));
      if (chars >= next.length) {
        phase = 'hold';
        timer = window.setTimeout(step, 120);
      } else {
        timer = window.setTimeout(step, 42 + Math.random() * 38);
      }
    };

    timer = window.setTimeout(step, 1400);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <span className={className} aria-live="off">
      <span className="text-[#F3EBF8]">{typed}</span>
      <span
        aria-hidden="true"
        className="mx-[2px] inline-block h-[1em] w-[2px] translate-y-[2px] bg-[#E64BD4] animate-[blink_1.05s_steps(1)_infinite] motion-reduce:animate-none"
      />
      <span className="text-[#4A4254]">{ghost}</span>
    </span>
  );
}
