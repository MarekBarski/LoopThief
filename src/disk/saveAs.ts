import { isTauri } from "../runtime/environment";

export type SaveOptions = {
  /** Default filename WITHOUT extension. */
  defaultName: string;
  /** File extension WITHOUT leading dot, e.g. "lthief", "wav". */
  extension: string;
  /** Human-readable filter name shown in the OS dialog, e.g. "WAV Audio". */
  filterName: string;
  /** MIME type used by the browser anchor-download path. */
  mimeType?: string;
};

export type SaveResult =
  | { ok: true; path: string }
  | { ok: false; reason: "cancelled" | string };

/**
 * Write a Blob to disk with a user-chosen path.
 *
 * Tauri: opens a native Save As… dialog through the custom Rust command
 * `save_file_dialog` (defined in `src-tauri/src/lib.rs`). The command uses
 * the `native-dialog` crate instead of tauri-plugin-dialog's `save()` —
 * Marek's diagnostic round measured 2-3 s lag on every rfd-backed save call
 * in release builds, while native-dialog opens instantly. The file write
 * still goes through `@tauri-apps/plugin-fs.writeFile`.
 *
 * Browser: falls back to the legacy anchor-download flow (file lands in
 * the browser's default download location). Browsers don't expose the
 * actual filesystem path so the returned `path` is just the filename.
 *
 * Timing logs remain in place — easy to remove once we're confident the
 * native-dialog swap is the permanent fix.
 */
export async function saveBlobAsync(blob: Blob, options: SaveOptions): Promise<SaveResult> {
  const filename = `${options.defaultName}.${options.extension}`;

  if (isTauri()) {
    const label = `[saveBlobAsync] ${filename}`;
    console.group(label);
    const t0 = performance.now();
    try {
      // Resolve absolute path to user's Documents folder + filename so the
      // dialog opens in a predictable location.
      let defaultPath = filename;
      try {
        const { documentDir, join } = await import("@tauri-apps/api/path");
        const baseDir = await documentDir();
        defaultPath = await join(baseDir, filename);
      } catch (pathErr) {
        console.warn("path resolution failed, using filename-only:", pathErr);
      }
      const tPath = performance.now();
      console.log("path resolution:", (tPath - t0).toFixed(1), "ms", `→ ${defaultPath}`);

      // Invoke the custom save dialog backend (native-dialog crate, see
      // src-tauri/src/lib.rs `save_file_dialog`). Returns the chosen
      // absolute path, or null if the user cancelled.
      const { invoke } = await import("@tauri-apps/api/core");
      const tInvokeReady = performance.now();
      console.log("invoke import:", (tInvokeReady - tPath).toFixed(1), "ms");

      const path = await invoke<string | null>("save_file_dialog", {
        defaultPath,
        filters: [{ name: options.filterName, extensions: [options.extension] }],
      });
      const t2 = performance.now();
      console.log("native dialog open:", (t2 - tInvokeReady).toFixed(1), "ms");

      if (!path) {
        console.log("(cancelled by user)");
        console.groupEnd();
        return { ok: false, reason: "cancelled" };
      }

      const { writeFile } = await import("@tauri-apps/plugin-fs");
      const t3 = performance.now();
      console.log("fs import:", (t3 - t2).toFixed(1), "ms");

      const bytes = new Uint8Array(await blob.arrayBuffer());
      const t4 = performance.now();
      console.log("blob → bytes:", (t4 - t3).toFixed(1), "ms", `(${bytes.byteLength} bytes)`);

      await writeFile(path, bytes);
      const t5 = performance.now();
      console.log("fs.writeFile:", (t5 - t4).toFixed(1), "ms");

      console.log("TOTAL:", (t5 - t0).toFixed(1), "ms");
      console.groupEnd();
      return { ok: true, path };
    } catch (err) {
      console.warn("save failed:", err);
      console.groupEnd();
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Browser: anchor download. URL.revokeObjectURL on a short delay so the
  // browser has time to start the download before the blob URL is released.
  try {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { ok: true, path: filename };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "Download failed",
    };
  }
}
