import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent } from "react";

const INITIAL_DELAY_MS = 400;
const PHASE_1_MS = 200;
const PHASE_1_DURATION_MS = 1000;
const PHASE_2_MS = 100;
const PHASE_2_DURATION_MS = 3000;
const PHASE_3_MS = 25;

export function useHoldRepeat(action: () => void) {
  const timeoutRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const actionRef = useRef(action);

  useEffect(() => {
    actionRef.current = action;
  }, [action]);

  const stop = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => stop, [stop]);

  const tick = useCallback(() => {
    actionRef.current();
    const elapsed = performance.now() - startedAtRef.current;
    const next =
      elapsed < PHASE_1_DURATION_MS
        ? PHASE_1_MS
        : elapsed < PHASE_1_DURATION_MS + PHASE_2_DURATION_MS
          ? PHASE_2_MS
          : PHASE_3_MS;
    timeoutRef.current = window.setTimeout(tick, next);
  }, []);

  const onPointerDown = useCallback(
    (_event: PointerEvent<HTMLElement>) => {
      actionRef.current();
      startedAtRef.current = performance.now();
      timeoutRef.current = window.setTimeout(tick, INITIAL_DELAY_MS);
    },
    [tick],
  );

  return {
    onPointerDown,
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
  };
}
