import { useEffect, useRef } from "react";
import { useLayoutStore } from "../../store/useLayoutStore";
import { useAppStore } from "../../store/useAppStore";
import { isTauri } from "../../runtime/environment";

/**
 * Global keyboard mappings.
 *
 * Typing guard: any focused `<input>` / `<textarea>` / contentEditable suppresses
 * ALL global shortcuts. Per-input `onKeyDown` handlers manage Enter/Esc/Tab.
 *
 * Layout-editor (F7) lives in AppShell; its in-mode shortcuts (Ctrl+S layout save,
 * arrow nudges, etc.) live in LayoutEditorOverlay and only fire while editMode is on.
 * The check below short-circuits when editMode is active so layout-overlay binds
 * don't conflict with these globals.
 */

// MPC-standard 4×4 pad grid mapped to QWERTY rows. Top row of pad grid = top row
// of QWERTY keys (1234), bottom row = ZXCV. Matches visual on-screen pad order
// (P01 at top-left, P16 at bottom-right).
const PAD_KEYS: Record<string, number> = {
  "1": 1, "2": 2, "3": 3, "4": 4,
  q: 5, w: 6, e: 7, r: 8,
  a: 9, s: 10, d: 11, f: 12,
  z: 13, x: 14, c: 15, v: 16,
};

const BANK_KEYS: Record<string, "A" | "B" | "C" | "D"> = {
  "7": "A", "8": "B", "9": "C", "0": "D",
};

const BANK_ORDER: Array<"A" | "B" | "C" | "D"> = ["A", "B", "C", "D"];

/** Find the visible softkey button whose label starts with "Fn " and click it. */
function clickSoftkey(n: number) {
  const prefix = `F${n} `;
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
  for (const btn of buttons) {
    if (btn.disabled) continue;
    const text = (btn.textContent ?? "").trim();
    if (text.startsWith(prefix)) {
      btn.click();
      return;
    }
  }
}

/** Returns the pad ID string ("P01"..."P16") for a key press. */
function padIdForKey(key: string): string | null {
  const num = PAD_KEYS[key];
  if (!num) return null;
  return `P${String(num).padStart(2, "0")}`;
}

export function KeyboardShortcuts() {
  // Set of currently-held pad keys; used to dedup OS key-repeat keydown events
  // so triggerPad is called once per physical press, not 30×/sec while held.
  const heldPadKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    const store = useAppStore;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        Boolean(target?.isContentEditable);

      // Layout editor mode owns its own shortcuts; skip globals.
      if (useLayoutStore.getState().editMode) return;
      // Input-focused: per-field onKeyDown handles Enter/Esc/Tab; globals skip.
      if (isTyping) return;

      const key = event.key.toLowerCase();
      const isMeta = event.ctrlKey || event.metaKey;

      // ============================================================
      // Edit (kept from Phase A)
      // ============================================================
      if (isMeta && key === "z" && !event.shiftKey) {
        event.preventDefault();
        store.getState().undoLastAction();
        return;
      }
      if (isMeta && key === "z" && event.shiftKey) {
        event.preventDefault();
        store.getState().redoLastAction();
        return;
      }
      if (isMeta && key === "y") {
        event.preventDefault();
        store.getState().redoLastAction();
        return;
      }

      // ============================================================
      // Ctrl+S: save current project. In Tauri the in-LCD FileBrowser
      // owns the destination + filename UX. In browser dev the legacy
      // saveProjectFile path triggers the HTML download anchor.
      // ============================================================
      if (isMeta && key === "s") {
        event.preventDefault();
        if (isTauri()) {
          void store.getState().openFileBrowser("SAVE_PROJECT");
        } else {
          void store.getState().saveProjectFile("untitled");
        }
        return;
      }

      // ============================================================
      // Ctrl+Q: open QUIT dialog. Cross-platform convention. Alt+F4 is
      // intercepted by Tauri's CloseRequested handler in Rust (see
      // src-tauri/src/lib.rs) which emits "close-requested" → JS
      // listener below also opens the dialog. So all three paths
      // (QUIT button, Ctrl+Q, Alt+F4 / title-bar X) converge.
      // ============================================================
      if (isMeta && key === "q") {
        event.preventDefault();
        store.getState().requestAppQuit();
        return;
      }

      // ============================================================
      // F11: toggle fullscreen (Tauri only). Browser has its own native
      // F11 fullscreen — let the OS/browser handle it there.
      // ============================================================
      if (event.key === "F11" && !event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
        if (isTauri()) {
          event.preventDefault();
          void (async () => {
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            const win = getCurrentWindow();
            const isFullscreen = await win.isFullscreen();
            await win.setFullscreen(!isFullscreen);
          })();
        }
        return;
      }

      // ============================================================
      // F-keys: softkey passthrough on active screen.
      // F7 is layout-editor (handled in AppShell). F1–F6 click the
      // softkey whose label starts with "Fn ".
      //
      // Modifier guard: F-key + Alt/Ctrl/Shift/Meta is NOT a softkey
      // press — it's a system shortcut (e.g. Alt+F4 = OS close). Skip
      // softkey processing so the OS / Tauri intercept can handle it.
      // ============================================================
      if (event.key === "F1" || event.key === "F2" || event.key === "F3" ||
          event.key === "F4" || event.key === "F5" || event.key === "F6") {
        if (event.altKey || event.ctrlKey || event.shiftKey || event.metaKey) {
          return;
        }
        event.preventDefault();
        clickSoftkey(Number(event.key.slice(1)));
        return;
      }

      // ============================================================
      // Dialogs / modals (screen-aware).
      // ============================================================
      if (event.key === "Escape") {
        const state = store.getState();
        switch (state.activeScreen) {
          case "FX_SEND_WINDOW":
            event.preventDefault(); state.closeFxSendWindow(); return;
          case "TIME_SIG_WINDOW":
            event.preventDefault(); state.closeTimeSigWindow(); return;
          case "SAMPLE_EDIT_WINDOW":
            event.preventDefault(); state.closeSampleEditWindow(); return;
          case "SAMPLE_KEEP_RETRY":
            event.preventDefault(); state.retryEditedSample(); return;
          case "BAR_EDITOR":
            event.preventDefault(); state.closeBarEditor(); return;
          case "COUNT_IN":
          case "GO_TO":
          case "ERASE":
          case "UNDO":
          case "SEQUENCE_EDIT":
          case "TIMING_CORRECT":
          case "UTILITY_16_LEVELS":
          case "UTILITY_TRACK_MUTE":
          case "UTILITY_PAD_MUTE":
          case "UTILITY_NEXT_SEQ":
          case "UTILITY_NOTE_REPEAT":
            event.preventDefault(); state.exitUtilityWorkflow(); return;
          default:
            return;
        }
      }

      if (event.key === "Enter") {
        // Synthesize F5 click — convention is F5 = DO IT / KEEP / confirm on
        // every popup that has a confirm action. Pure click → screen's own
        // handler runs (e.g., applySampleEdit, changeBarTimeSignature, etc.).
        event.preventDefault();
        clickSoftkey(5);
        return;
      }

      if (event.key === "Delete") {
        const state = store.getState();
        if (state.activeScreen === "STEP" && state.selectedEventId) {
          event.preventDefault();
          state.deleteSelectedEvent();
        }
        return;
      }

      // ============================================================
      // Banks (7890 direct, Tab cycle).
      // ============================================================
      if (event.key === "Tab") {
        event.preventDefault();
        const state = store.getState();
        const idx = BANK_ORDER.indexOf(state.padBank);
        const delta = event.shiftKey ? -1 : 1;
        const next = BANK_ORDER[(idx + delta + BANK_ORDER.length) % BANK_ORDER.length];
        state.setPadBank(next);
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey && BANK_KEYS[key]) {
        event.preventDefault();
        store.getState().setPadBank(BANK_KEYS[key]);
        return;
      }

      // ============================================================
      // Transport.
      // ============================================================
      if (event.code === "Space") {
        event.preventDefault();
        if (event.shiftKey) {
          store.getState().requestTransportStart("REC");
        } else {
          store.getState().togglePlay();
        }
        return;
      }

      // ============================================================
      // Tracks (M / O). S is reserved for pad P10 (Marek's decision —
      // no keyboard shortcut for solo; mouse only via MIX screen).
      // M = mute current track. O = overdub toggle.
      // M temporarily sets trackMuteMode to "MUTE" then calls
      // togglePerformanceTrack for the current track's index.
      // ============================================================
      if (key === "m" && !isMeta && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        const state = store.getState();
        const idx = state.performanceTracks.findIndex((t) => t.id === state.currentTrackId);
        if (idx >= 0) {
          state.setTrackMuteMode("MUTE");
          state.togglePerformanceTrack(idx);
        }
        return;
      }
      if (key === "o" && !isMeta && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        store.getState().toggleOverdub();
        return;
      }

      // ============================================================
      // Pads. PAD_KEYS["s"] = P10 → wins (solo has no keyboard binding).
      // ============================================================
      const padId = padIdForKey(key);
      if (padId) {
        if (heldPadKeys.current.has(key)) return; // dedup OS key-repeat
        event.preventDefault();
        heldPadKeys.current.add(key);
        const state = store.getState();
        // Pad ID is bank-relative ("P01"). triggerPad already resolves bank.
        state.triggerPad(padId);
        return;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      // Pad release. Layout-edit + typing checks NOT required for keyup —
      // we just want to clear the held-key set + call releasePad.
      const key = event.key.toLowerCase();
      if (heldPadKeys.current.has(key)) {
        heldPadKeys.current.delete(key);
        const padId = padIdForKey(key);
        if (padId) {
          useAppStore.getState().releasePad(padId);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // ============================================================
  // Tauri "close-requested" event — fired by Rust's CloseRequested
  // handler (prevent_close + emit) when the user clicks title-bar X
  // or hits Alt+F4. JS converges to the same QUIT dialog as Ctrl+Q
  // and the on-canvas QUIT button.
  // ============================================================
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const off = await listen("close-requested", () => {
        useAppStore.getState().requestAppQuit();
      });
      if (cancelled) off();
      else unlisten = off;
    })();
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  return null;
}
