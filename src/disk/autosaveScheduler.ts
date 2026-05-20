import { writeAutosave } from "./autosaveDb";

const DEBOUNCE_MS = 10_000;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let idleHandle: number | null = null;
let inflight = false;

function scheduleIdle(callback: () => void) {
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (typeof ric === "function") {
    idleHandle = ric(callback, { timeout: 2000 });
    return;
  }
  idleHandle = window.setTimeout(callback, 50) as unknown as number;
}

function cancelIdle() {
  if (idleHandle === null) return;
  const cic = (window as unknown as { cancelIdleCallback?: (handle: number) => void }).cancelIdleCallback;
  if (typeof cic === "function") {
    cic(idleHandle);
  } else {
    window.clearTimeout(idleHandle);
  }
  idleHandle = null;
}

export function scheduleAutosave(produceBlob: () => Promise<Blob>) {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  cancelIdle();
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    scheduleIdle(() => {
      idleHandle = null;
      if (inflight) return;
      inflight = true;
      produceBlob()
        .then((blob) => writeAutosave(blob))
        .catch((error) => {
          console.warn("[loopthief] autosave failed", error);
        })
        .finally(() => {
          inflight = false;
        });
    });
  }, DEBOUNCE_MS);
}

export function flushAutosave(produceBlob: () => Promise<Blob>): Promise<void> {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  cancelIdle();
  return produceBlob().then((blob) => writeAutosave(blob));
}
