import { writeAutosave } from "./autosaveDb";

// Interval-based autosave.
//
// Previously this scheduler ran a 10 s debounce on every `projectVersion`
// change. The current SETTINGS panel exposes `AUTO SAVE` (on/off) and
// `INTERVAL SEC`, so we run a fixed-interval write loop driven by those
// values. Activity-aware skip (playback / record / sampling) is handled by
// the `shouldSkip` callback so the host can decide what counts as "busy".
//
// Lifecycle: start / stop / restart from App.tsx based on settings changes.
// Manual flush still available for save-on-quit scenarios.

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let inflight = false;

async function runOnce(
  produceBlob: () => Promise<Blob>,
  shouldSkip: () => boolean,
): Promise<void> {
  if (inflight) return;
  if (shouldSkip()) return;
  inflight = true;
  try {
    const blob = await produceBlob();
    await writeAutosave(blob);
  } catch (error) {
    console.warn("[loopthief] autosave failed", error);
  } finally {
    inflight = false;
  }
}

export function startAutosaveInterval(
  produceBlob: () => Promise<Blob>,
  intervalSec: number,
  shouldSkip: () => boolean,
): void {
  stopAutosaveInterval();
  const ms = Math.max(15, intervalSec) * 1000;
  intervalHandle = setInterval(() => {
    void runOnce(produceBlob, shouldSkip);
  }, ms);
}

export function stopAutosaveInterval(): void {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

export function isAutosaveRunning(): boolean {
  return intervalHandle !== null;
}

export function flushAutosave(produceBlob: () => Promise<Blob>): Promise<void> {
  return produceBlob().then((blob) => writeAutosave(blob));
}
