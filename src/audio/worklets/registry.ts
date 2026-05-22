// AudioWorklet module registry.
//
// Tracks which worklet processors have been loaded into which AudioContexts
// so we don't call `audioWorklet.addModule` twice for the same processor on
// the same context (the API tolerates it but it's wasted work).
//
// `BaseAudioContext` is the supertype shared by online AudioContext and
// OfflineAudioContext — both support audioWorklet. The OfflineAudioContext
// used for WAV export (Session 22.U) gets its own ephemeral registry entry
// via WeakMap; once it's garbage-collected the entry vanishes.
//
// Worklet processor source files are plain .js (not .ts) — they're loaded
// directly by the browser's audio worklet scope, which doesn't have TS
// compilation available. Vite's `?url` import gives us the runtime URL of
// the file (hashed in production builds) without putting it through the
// main TS compile step.

const loaded = new WeakMap<BaseAudioContext, Set<string>>();

/**
 * Load a worklet processor onto a context, if not already loaded.
 * Resolves when the module is registered and `new AudioWorkletNode(ctx, name)`
 * would succeed.
 */
export async function ensureWorklet(
  context: BaseAudioContext,
  processorName: string,
  moduleUrl: string,
): Promise<void> {
  let set = loaded.get(context);
  if (!set) {
    set = new Set();
    loaded.set(context, set);
  }
  if (set.has(processorName)) return;
  await context.audioWorklet.addModule(moduleUrl);
  set.add(processorName);
}

/**
 * Quick check — does the calling code expect a worklet that hasn't been
 * loaded yet? Effects use this to fall back to a passthrough + console
 * warning instead of throwing when the engine wasn't preloaded.
 */
export function isWorkletLoaded(context: BaseAudioContext, processorName: string): boolean {
  return loaded.get(context)?.has(processorName) ?? false;
}
