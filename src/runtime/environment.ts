/**
 * Runtime environment detection.
 *
 * Tauri injects `window.__TAURI_INTERNALS__` (Tauri 2.x) and historically
 * `window.__TAURI__` (Tauri 1.x). We check both so the same build works
 * across versions if Marek upgrades or downgrades the shell.
 *
 * In Tauri, `tauri.conf.json` enforces window.minWidth/minHeight as a hard
 * floor — the user physically cannot shrink below 1280×720. The browser
 * build has no such guarantee, so it shows a viewport warning instead.
 */

declare global {
  interface Window {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.__TAURI__) || Boolean(window.__TAURI_INTERNALS__);
}

export function isBrowser(): boolean {
  return !isTauri() && typeof window !== "undefined";
}
