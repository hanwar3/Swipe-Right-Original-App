import React, { useEffect, useRef } from 'react';

export type OrbState = 'idle' | 'thinking' | 'speaking' | 'alert';

interface SwarmOrbProps {
  size?: number;
  count?: number;
  state?: OrbState;
  className?: string;
}

/**
 * SwipeRight's one piece of identity.
 *
 * Points sit on a Fibonacci sphere (even spacing, no polar clumping) and are
 * pushed in and out by three sine fields drifting at different rates, which is
 * what makes it read as a swarm rather than a spinning ball. Additive blending
 * lets the silhouette glow where points stack up.
 *
 * The state prop is the point of the thing: it replaces every spinner and
 * status indicator in the app. Loose when idle, contracted while the engine
 * runs, pulsing while it speaks, flaring when something is about to expire.
 */

// tuning per state: [deformation, spin, hue mix, pulse]
const STATES: Record<OrbState, { deform: number; spin: number; warm: number; pulse: number }> = {
  idle: { deform: 1.0, spin: 0.3, warm: 0.0, pulse: 0.0 },
  thinking: { deform: 0.45, spin: 1.15, warm: 0.15, pulse: 0.0 },
  speaking: { deform: 0.85, spin: 0.42, warm: 0.1, pulse: 1.0 },
  alert: { deform: 1.25, spin: 0.55, warm: 1.0, pulse: 0.45 },
};

export default function SwarmOrb({
  size = 212,
  count = 1800,
  state = 'idle',
  className = '',
}: SwarmOrbProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<OrbState>(state);
  const eased = useRef({ deform: 1, spin: 0.3, warm: 0, pulse: 0 });

  // Keep the animation loop reading the latest state without restarting it.
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const R = Math.min(W, H) * 0.3;

    // Fibonacci sphere
    const pts = new Float32Array(count * 3);
    const ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = ga * i;
      pts[i * 3] = Math.cos(th) * r;
      pts[i * 3 + 1] = y;
      pts[i * 3 + 2] = Math.sin(th) * r;
    }

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    let raf = 0;
    let spinPhase = 0;
    let last = performance.now();
    let visible = true;

    const onVisibility = () => {
      visible = document.visibilityState === 'visible';
      if (visible && !reduce && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    function draw(t: number, dt: number) {
      const target = STATES[stateRef.current] ?? STATES.idle;
      // Ease between states so transitions feel physical, not switched.
      const k = Math.min(1, dt * 2.6);
      const e = eased.current;
      e.deform += (target.deform - e.deform) * k;
      e.spin += (target.spin - e.spin) * k;
      e.warm += (target.warm - e.warm) * k;
      e.pulse += (target.pulse - e.pulse) * k;

      spinPhase += e.spin * dt;

      const breathe = 1 + e.pulse * 0.055 * Math.sin(t * 7.5);

      ctx!.clearRect(0, 0, W, H);

      const glowA = 0.17 + e.warm * 0.1 + e.pulse * 0.05;
      const g = ctx!.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.52);
      g.addColorStop(0, `rgba(214,58,190,${glowA})`);
      g.addColorStop(0.5, `rgba(214,58,190,${glowA * 0.32})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx!.fillStyle = g;
      ctx!.fillRect(0, 0, W, H);

      ctx!.globalCompositeOperation = 'lighter';

      const cY = Math.cos(spinPhase);
      const sY = Math.sin(spinPhase);
      const rx = Math.sin(t * 0.23) * 0.42;
      const cX = Math.cos(rx);
      const sX = Math.sin(rx);
      const amp = e.deform;

      for (let i = 0; i < count; i++) {
        const px = pts[i * 3];
        const py = pts[i * 3 + 1];
        const pz = pts[i * 3 + 2];

        const d =
          (1 +
            0.19 * amp * Math.sin(2.2 * px + t * 1.05) * Math.cos(1.8 * py - t * 0.78) +
            0.12 * amp * Math.sin(2.9 * pz + t * 1.35) +
            0.07 * amp * Math.cos(3.7 * py + t * 0.55)) *
          breathe;

        const X = px * d;
        const Y = py * d;
        const Z = pz * d;
        const x1 = X * cY - Z * sY;
        const z1 = X * sY + Z * cY;
        const y1 = Y * cX - z1 * sX;
        const z2 = Y * sX + z1 * cX;

        const per = 1 / (2.55 - z2 * 0.7);
        const sx = cx + x1 * R * per * 2.45;
        const sy = cy + y1 * R * per * 2.45;

        let dep = (z2 + 1.3) / 2.6;
        if (dep < 0) dep = 0;
        else if (dep > 1) dep = 1;

        let edge = 1 - Math.abs(z2) / 1.25;
        if (edge < 0) edge = 0;

        let lit = x1 * 0.46 + y1 * 0.5 + 0.28;
        if (lit < 0) lit = 0;
        else if (lit > 1) lit = 1;

        // warm pushes the whole cloud toward magenta, not just the rim
        const m = Math.min(1, Math.pow(edge, 1.5) * lit + e.warm * 0.45);

        const rr = (243 + (232 - 243) * m) | 0;
        const gg = (236 + (58 - 236) * m) | 0;
        const bb = (252 + (206 - 252) * m) | 0;

        let a = (0.1 + dep * 0.34) * (0.45 + 0.55 * edge) + m * 0.3;
        if (a > 0.92) a = 0.92;
        else if (a < 0.012) a = 0.012;

        const s = (0.62 + dep * 0.95) * dpr;
        ctx!.fillStyle = `rgba(${rr},${gg},${bb},${a.toFixed(3)})`;
        ctx!.fillRect(sx, sy, s, s);
      }

      ctx!.globalCompositeOperation = 'source-over';
    }

    function loop(now: number) {
      if (!visible) {
        raf = 0;
        return; // stop burning battery behind another tab
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      draw(now / 1000, dt);
      raf = requestAnimationFrame(loop);
    }

    if (reduce) {
      eased.current = { ...STATES[state] };
      draw(0.8, 1);
    } else {
      raf = requestAnimationFrame(loop);
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // Rebuilding the point cloud is only needed when geometry changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, count]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={className}
      style={{ width: size, height: size, display: 'block' }}
    />
  );
}
