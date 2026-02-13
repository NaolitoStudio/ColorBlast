import { useEffect, useRef } from 'react';

export type AnimationFrameInfo = {
  now: number;
  deltaMs: number;
  elapsedMs: number;
};

type UseAnimationFrameOptions = {
  active?: boolean;
  resetKey?: string | number | boolean | null;
  maxDeltaMs?: number;
};

const DEFAULT_MAX_DELTA_MS = 64;

/**
 * Runs a stable requestAnimationFrame loop and provides delta/elapsed time.
 * Delta is clamped to avoid giant jumps after tab switches or frame drops.
 */
export const useAnimationFrame = (
  onFrame: (frame: AnimationFrameInfo) => void,
  options: UseAnimationFrameOptions = {}
) => {
  const {
    active = true,
    resetKey,
    maxDeltaMs = DEFAULT_MAX_DELTA_MS
  } = options;
  const callbackRef = useRef(onFrame);

  callbackRef.current = onFrame;

  useEffect(() => {
    if (!active) return;

    let rafId = 0;
    const clampMax = Math.max(1, maxDeltaMs);
    const start = performance.now();
    let previous = start;

    const frame = (now: number) => {
      const rawDelta = now - previous;
      previous = now;

      const deltaMs = Math.max(0, Math.min(rawDelta, clampMax));
      callbackRef.current({
        now,
        deltaMs,
        elapsedMs: now - start
      });

      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(rafId);
  }, [active, maxDeltaMs, resetKey]);
};
