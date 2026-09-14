import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Talking to the orb.
 *
 * Speech recognition turns what you say into a question. A separate analyser
 * on the microphone measures how loud you are, and the orb reads that level so
 * it visibly responds while you speak; that is what makes it feel like the
 * thing you are talking to rather than a spinner with a mic icon.
 *
 * Replies are spoken with the browser's own voice for now. ElevenLabs needs a
 * server-side proxy so its key never reaches the browser, which is not built.
 */

export type VoiceState = 'idle' | 'listening' | 'unsupported' | 'denied' | 'error';

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function recognitionCtor(): (new () => Recognition) | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function voiceSupported(): boolean {
  return typeof window !== 'undefined' && !!recognitionCtor();
}

export function useVoice(onFinal: (text: string) => void) {
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  /** 0..1, updated every frame while listening. Read it, do not render from it. */
  const levelRef = useRef(0);

  const recRef = useRef<Recognition | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const finalRef = useRef('');
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const releaseMic = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    levelRef.current = 0;
  }, []);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* already stopped */ }
  }, []);

  const cancel = useCallback(() => {
    finalRef.current = '';
    try { recRef.current?.abort(); } catch { /* already stopped */ }
    releaseMic();
    setState('idle');
  }, [releaseMic]);

  const start = useCallback(async () => {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setState('unsupported');
      return;
    }
    setTranscript('');
    finalRef.current = '';

    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalRef.current += text;
        else interim += text;
      }
      setTranscript((finalRef.current + interim).trim());
    };
    rec.onerror = (e: any) => {
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed' || e?.error === 'audio-capture') {
        setState('denied');
      } else if (e?.error !== 'no-speech' && e?.error !== 'aborted') {
        setState('error');
      }
    };
    rec.onend = () => {
      recRef.current = null;
      releaseMic();
      const said = finalRef.current.trim();
      setState((s) => (s === 'listening' ? 'idle' : s));
      if (said) onFinalRef.current(said);
    };

    try {
      rec.start();
      setState('listening');
    } catch {
      recRef.current = null;
      setState('error');
      return;
    }

    // The level meter runs beside recognition, never in front of it. A
    // permission request that stalls must not leave the orb listening to
    // nothing, which is what happened when the meter was awaited first.
    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((stream) => {
        if (!recRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const ctx = new AudioContext();
        ctxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / buf.length);
          // Speech sits roughly between 0.02 and 0.25 RMS; stretch that to 0..1.
          const target = Math.min(1, Math.max(0, (rms - 0.015) * 5));
          levelRef.current += (target - levelRef.current) * 0.35;
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      })
      .catch((err: any) => {
        if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
          setState('denied');
          try { recRef.current?.abort(); } catch { /* already stopped */ }
          releaseMic();
        }
      });
  }, [releaseMic]);

  useEffect(() => () => {
    try { recRef.current?.abort(); } catch { /* noop */ }
    releaseMic();
    window.speechSynthesis?.cancel();
  }, [releaseMic]);

  return { state, transcript, levelRef, start, stop, cancel };
}

/** Say the answer out loud. Resolves when speech ends, or at once if it cannot speak. */
export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth || !text) return resolve();
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[*_#`]/g, ''));
    u.rate = 1.03;
    u.pitch = 1;
    const preferred = synth.getVoices().find((v) => /en[-_]US/i.test(v.lang) && /natural|samantha|google|aria|jenny/i.test(v.name));
    if (preferred) u.voice = preferred;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    synth.speak(u);
  });
}
