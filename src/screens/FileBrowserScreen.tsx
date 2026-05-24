import { useEffect, useRef } from "react";
import { useAppStore, type FsEntry, type FileBrowserMode } from "../store/useAppStore";
import { ScreenFrame } from "./ScreenFrame";
import { lcdContentHeight, lcdSoftkeyHeight } from "./lcdLayout";

// In-LCD file browser.
//
// Renders inside the LCD viewport like every other screen — Sacred Zone rule:
// no separate window, no floating panel. The user opens FileBrowser by
// dispatching `openFileBrowser(mode)`; the screen swaps to "FILE_BROWSER"
// and stashes the previous screen so F3 CANCEL can route back without the
// caller needing to remember.
//
// Sub-phase B (landed): visual rendering + navigation + F4 REFRESH.
// Sub-phase C (this code): F1 OPEN / SAVE handlers, F2 PREVIEW toggle,
//   F2 NEW FOLDER overlay, filename input in save modes, overwrite
//   confirmation overlay.
// Sub-phase D (deferred): migrate the existing HTML file inputs +
//   saveBlobAsync call sites + remove .lthief-all / .lthief-seq formats.
export function FileBrowserScreen() {
  const mode = useAppStore((s) => s.fileBrowserMode);
  const path = useAppStore((s) => s.fileBrowserPath);
  const locations = useAppStore((s) => s.fileBrowserLocations);
  const entries = useAppStore((s) => s.fileBrowserEntries);
  const selectedIndex = useAppStore((s) => s.fileBrowserSelectedIndex);
  const loading = useAppStore((s) => s.fileBrowserLoading);
  const error = useAppStore((s) => s.fileBrowserError);
  const previewEnabled = useAppStore((s) => s.fileBrowserPreviewEnabled);
  const saveFilename = useAppStore((s) => s.fileBrowserSaveFilename);
  const newFolderOpen = useAppStore((s) => s.fileBrowserNewFolderOpen);
  const newFolderName = useAppStore((s) => s.fileBrowserNewFolderName);
  const overwritePath = useAppStore((s) => s.fileBrowserOverwritePath);
  const closeFileBrowser = useAppStore((s) => s.closeFileBrowser);
  const selectIndex = useAppStore((s) => s.fileBrowserSelectIndex);
  const navigateInto = useAppStore((s) => s.fileBrowserNavigateInto);
  const navigateUp = useAppStore((s) => s.fileBrowserNavigateUp);
  const navigateToLocation = useAppStore((s) => s.fileBrowserNavigateToLocation);
  const refreshLocations = useAppStore((s) => s.fileBrowserRefreshLocations);
  const openSelected = useAppStore((s) => s.fileBrowserOpenSelected);
  const togglePreview = useAppStore((s) => s.fileBrowserTogglePreview);
  const previewEntry = useAppStore((s) => s.fileBrowserPreviewEntry);
  const setSaveFilename = useAppStore((s) => s.fileBrowserSetSaveFilename);
  const saveAction = useAppStore((s) => s.fileBrowserSave);
  const openNewFolder = useAppStore((s) => s.fileBrowserOpenNewFolder);
  const setNewFolderName = useAppStore((s) => s.fileBrowserSetNewFolderName);
  const confirmNewFolder = useAppStore((s) => s.fileBrowserConfirmNewFolder);
  const cancelNewFolder = useAppStore((s) => s.fileBrowserCancelNewFolder);
  const confirmOverwrite = useAppStore((s) => s.fileBrowserConfirmOverwrite);
  const cancelOverwrite = useAppStore((s) => s.fileBrowserCancelOverwrite);

  const isSaveMode = mode === "SAVE_SAMPLE" || mode === "SAVE_PROJECT" || mode === "SAVE_MIXDOWN_WAV";
  const isLoadSample = mode === "LOAD_SAMPLE";
  const extension = mode === "SAVE_PROJECT" || mode === "LOAD_PROJECT" ? "lthief" : "wav";

  // Auto-scroll the highlighted row into view as arrow keys / programmatic
  // selection move the index. Same pattern as the ASSIGN screen (Session 31).
  const selectedRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Keyboard nav at window level. Suspended while a modal overlay (new
  // folder, overwrite) is open or the filename input is focused — the
  // overlay/input owns Enter/Esc semantics in those cases.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        Boolean(target?.isContentEditable);
      if (isTyping) return;
      if (newFolderOpen || overwritePath) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        selectIndex(selectedIndex + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        selectIndex(selectedIndex - 1);
      } else if (event.key === "Enter") {
        const entry = entries[selectedIndex];
        if (entry?.isDir) {
          event.preventDefault();
          void navigateInto(entry);
        } else if (entry && (mode === "LOAD_SAMPLE" || mode === "LOAD_PROJECT")) {
          event.preventDefault();
          void openSelected();
        }
      } else if (event.key === "Backspace") {
        event.preventDefault();
        void navigateUp();
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeFileBrowser();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    entries,
    selectedIndex,
    mode,
    newFolderOpen,
    overwritePath,
    selectIndex,
    navigateInto,
    navigateUp,
    openSelected,
    closeFileBrowser,
  ]);

  const title = mode ? TITLE_FOR_MODE[mode] : "FILE BROWSER";
  const truncatedPath = truncatePath(path, 56);
  const hasParent = computeParentPathClientSide(path) !== null;
  const selectedEntry = entries[selectedIndex];

  // Trigger preview on keyboard-driven selection change in LOAD_SAMPLE mode
  // (mouse clicks fire previewEntry directly via the row onClick handler).
  useEffect(() => {
    if (!isLoadSample || !previewEnabled || !selectedEntry || selectedEntry.isDir) return;
    void previewEntry(selectedEntry);
    // Intentionally depends on selectedIndex only — re-firing when entries
    // change would cause unexpected previews after navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, isLoadSample, previewEnabled]);

  return (
    <ScreenFrame title={title} subtitle={truncatedPath}>
      <div
        className="relative grid h-full gap-[12px]"
        style={{ gridTemplateRows: `${lcdContentHeight} ${lcdSoftkeyHeight}px` }}
      >
        <div className="grid min-h-0 grid-cols-[0.22fr_1fr] gap-[2.3%] overflow-hidden">
          {/* LOCATIONS sidebar */}
          <section className="grid min-h-0 grid-rows-[auto_1fr] border border-[#46533b] bg-black/20">
            <div className="border-b border-[#46533b] px-[6%] py-[4%] text-[clamp(9px,0.7vw,11px)] tracking-[0.16em] text-[#91a477]">
              LOCATIONS
            </div>
            <div className="grid min-h-0 content-start gap-[4px] overflow-y-auto p-[4%] text-[clamp(10px,0.78vw,12px)] tracking-[0.14em]">
              {locations.length === 0 ? (
                <p className="text-[#91a477]">—</p>
              ) : (
                locations.map((location) => (
                  <button
                    key={location.path}
                    type="button"
                    onClick={() => void navigateToLocation(location.path)}
                    className={`text-left ${
                      path === location.path
                        ? "bg-amber-200/15 text-amber-100"
                        : "text-[#d8e3b7] hover:bg-black/30"
                    }`}
                  >
                    {location.label}
                  </button>
                ))
              )}
            </div>
          </section>

          {/* FOLDER CONTENTS list */}
          <section className="grid min-h-0 grid-rows-[auto_1fr_auto] border border-[#46533b] bg-black/20">
            <div className="grid grid-cols-[1fr_auto_auto] gap-[3%] border-b border-[#46533b] px-[2%] py-[2%] text-[clamp(8px,0.66vw,10px)] tracking-[0.16em] text-[#91a477]">
              <span>NAME</span>
              <span>{mode === "LOAD_PROJECT" || mode === "SAVE_PROJECT" ? "MODIFIED" : "DURATION"}</span>
              <span>SIZE</span>
            </div>
            <div className="grid min-h-0 content-start overflow-y-auto text-[clamp(9px,0.74vw,11px)] tracking-[0.12em]">
              {error && (
                <div className="px-[3%] py-[5%] text-red-300">ERROR: {error}</div>
              )}
              {loading && !error && (
                <div className="px-[3%] py-[5%] text-[#91a477]">LOADING...</div>
              )}
              {!loading && !error && (
                <>
                  {hasParent && (
                    <button
                      type="button"
                      onClick={() => void navigateUp()}
                      className="grid grid-cols-[1fr_auto_auto] gap-[3%] px-[2%] py-[1.5%] text-left text-[#d8e3b7] hover:bg-black/30"
                    >
                      <span>..</span>
                      <span />
                      <span />
                    </button>
                  )}
                  {entries.length === 0 ? (
                    <div className="px-[3%] py-[5%] text-[#91a477]">--- EMPTY ---</div>
                  ) : (
                    entries.map((entry, index) => {
                      const isSelected = index === selectedIndex;
                      const onClick = () => {
                        if (entry.isDir) {
                          void navigateInto(entry);
                        } else {
                          selectIndex(index);
                          // Mouse-click preview for LOAD_SAMPLE mode.
                          // Keyboard nav handles its own preview via the
                          // selectedIndex useEffect above.
                          if (isLoadSample && previewEnabled) {
                            void previewEntry(entry);
                          }
                        }
                      };
                      return (
                        <button
                          key={entry.path}
                          ref={isSelected ? selectedRef : null}
                          type="button"
                          onClick={onClick}
                          onDoubleClick={() => {
                            if (entry.isDir) {
                              void navigateInto(entry);
                            } else if (mode === "LOAD_SAMPLE" || mode === "LOAD_PROJECT") {
                              void openSelected();
                            }
                          }}
                          className={`grid grid-cols-[1fr_auto_auto] gap-[3%] px-[2%] py-[1.5%] text-left ${
                            isSelected
                              ? "bg-amber-200/15 text-amber-100"
                              : "text-[#d8e3b7] hover:bg-black/30"
                          }`}
                        >
                          <span className="truncate">
                            {entry.isDir ? `${entry.name}/` : entry.name}
                          </span>
                          <span className="text-[#9cab84]">
                            {entry.isDir
                              ? ""
                              : mode === "LOAD_PROJECT" || mode === "SAVE_PROJECT"
                                ? formatModified(entry.modified)
                                : formatDuration(entry.durationMs)}
                          </span>
                          <span className="text-[#9cab84]">
                            {entry.isDir ? "" : formatSize(entry.sizeBytes)}
                          </span>
                        </button>
                      );
                    })
                  )}
                </>
              )}
            </div>
            <div className="grid gap-[6px] border-t border-[#46533b] px-[2%] py-[1.5%] text-[clamp(9px,0.7vw,11px)] tracking-[0.14em] text-[#91a477]">
              {/* SAVE_* modes get a filename input here. LOAD_* modes show
                  the selected entry name + (LOAD_SAMPLE only) preview status. */}
              {isSaveMode ? (
                <label className="grid grid-cols-[auto_1fr_auto] items-center gap-[10px]">
                  <span>FILENAME:</span>
                  <input
                    type="text"
                    value={saveFilename}
                    onChange={(event) => setSaveFilename(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void saveAction();
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        (event.target as HTMLInputElement).blur();
                      }
                    }}
                    className="min-w-0 border border-[#46533b] bg-black/40 px-[6px] py-[3px] text-[#eef6d8] outline-none focus:border-amber-300"
                  />
                  <span className="text-[#9cab84]">.{extension}</span>
                </label>
              ) : (
                <div className="grid grid-cols-[auto_1fr] gap-[10px]">
                  <span>SELECTED:</span>
                  <span className="truncate text-[#eef6d8]">
                    {selectedEntry?.name ?? "—"}
                  </span>
                </div>
              )}
              {isLoadSample && (
                <div className="grid grid-cols-[auto_1fr] gap-[10px]">
                  <span>PREVIEW:</span>
                  <span className="text-[#eef6d8]">
                    {previewEnabled ? "ON" : "OFF"}
                  </span>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Softkey row — mode-aware wiring. */}
        <div className="grid grid-cols-6 gap-[1.4%]">
          {SOFTKEY_LABELS_FOR_MODE(mode).map((label, index) => {
            const onClick = () => {
              if (label === "F1 OPEN") void openSelected();
              else if (label === "F1 SAVE") void saveAction();
              else if (label === "F2 PREVIEW") togglePreview();
              else if (label === "F2 NEW FOLDER") openNewFolder();
              else if (label === "F2 CANCEL") closeFileBrowser();
              else if (label === "F3 CANCEL") closeFileBrowser();
              else if (label === "F4 REFRESH") void refreshLocations();
            };
            const isLive = label !== "";
            return (
              <button
                key={`${label}-${index}`}
                type="button"
                onClick={onClick}
                disabled={!isLive}
                className="border border-[#46533b] bg-black/25 px-[3%] py-[7%] text-center text-[clamp(8px,0.7vw,11px)] font-semibold tracking-[0.14em] text-[#d8e3b7] disabled:opacity-40"
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* New-folder overlay. Modal-ish: blocks softkey + keyboard nav. */}
        {newFolderOpen && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-black/65 p-[5%]">
            <section className="w-[min(480px,90%)] border border-[#91a477] bg-[#0a0d08] p-[18px] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em] shadow-[0_0_20px_rgba(0,0,0,0.7)]">
              <p className="mb-[10px] text-[#eef6d8]">NEW FOLDER NAME</p>
              <input
                type="text"
                autoFocus
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void confirmNewFolder();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    cancelNewFolder();
                  }
                }}
                placeholder="folder name"
                className="mb-[14px] w-full border border-[#46533b] bg-black/40 px-[8px] py-[5px] text-[#eef6d8] outline-none focus:border-amber-300"
              />
              <div className="grid grid-cols-2 gap-[10px]">
                <button
                  type="button"
                  onClick={() => void confirmNewFolder()}
                  className="border border-amber-300 bg-amber-200/10 px-[10px] py-[8px] text-amber-100 hover:bg-amber-200/20"
                >
                  CREATE
                </button>
                <button
                  type="button"
                  onClick={cancelNewFolder}
                  className="border border-[#46533b] bg-black/25 px-[10px] py-[8px] text-[#d8e3b7] hover:border-amber-300"
                >
                  CANCEL
                </button>
              </div>
              <p className="mt-[10px] text-[9px] text-[#46533b] tracking-[0.18em]">
                Enter = CREATE · Esc = CANCEL
              </p>
            </section>
          </div>
        )}

        {/* Overwrite-confirmation overlay. Activated when fileBrowserSave
            finds an existing file at the target path. */}
        {overwritePath && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-black/65 p-[5%]">
            <section className="w-[min(520px,90%)] border border-[#91a477] bg-[#0a0d08] p-[18px] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em] shadow-[0_0_20px_rgba(0,0,0,0.7)]">
              <p className="mb-[8px] text-[#eef6d8]">FILE EXISTS</p>
              <p className="mb-[14px] truncate text-[10px] text-[#91a477]">
                {overwritePath}
              </p>
              <div className="grid grid-cols-2 gap-[10px]">
                <button
                  type="button"
                  onClick={() => void confirmOverwrite()}
                  className="border border-amber-300 bg-amber-200/10 px-[10px] py-[8px] text-amber-100 hover:bg-amber-200/20"
                >
                  F1 OVERWRITE
                </button>
                <button
                  type="button"
                  onClick={cancelOverwrite}
                  className="border border-[#46533b] bg-black/25 px-[10px] py-[8px] text-[#d8e3b7] hover:border-amber-300"
                >
                  F3 CANCEL
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </ScreenFrame>
  );
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

const TITLE_FOR_MODE: Record<FileBrowserMode, string> = {
  LOAD_SAMPLE: "LOAD SAMPLE",
  LOAD_PROJECT: "LOAD PROJECT",
  SAVE_SAMPLE: "SAVE SAMPLE",
  SAVE_PROJECT: "SAVE PROJECT",
  SAVE_MIXDOWN_WAV: "SAVE MIXDOWN",
};

function SOFTKEY_LABELS_FOR_MODE(mode: FileBrowserMode | null): string[] {
  if (!mode) return ["", "", "F3 CANCEL", "F4 REFRESH", "", ""];
  switch (mode) {
    case "LOAD_SAMPLE":
      return ["F1 OPEN", "F2 PREVIEW", "F3 CANCEL", "F4 REFRESH", "", ""];
    case "LOAD_PROJECT":
      return ["F1 OPEN", "F2 CANCEL", "", "F4 REFRESH", "", ""];
    case "SAVE_SAMPLE":
    case "SAVE_PROJECT":
    case "SAVE_MIXDOWN_WAV":
      return ["F1 SAVE", "F2 NEW FOLDER", "F3 CANCEL", "F4 REFRESH", "", ""];
  }
}

function formatSize(bytes: number | undefined): string {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return "";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.floor(ms % 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function formatModified(iso: string | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function truncatePath(path: string, max: number): string {
  if (path.length <= max) return path;
  return `...${path.slice(-(max - 3))}`;
}

function computeParentPathClientSide(path: string): string | null {
  if (!path) return null;
  if (/^[A-Za-z]:[\\/]?$/.test(path)) return null;
  if (path === "/") return null;
  const trimmed = path.replace(/[\\/]+$/, "");
  const lastSlash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (lastSlash <= 0) return null;
  return trimmed.slice(0, lastSlash);
}

export type { FsEntry };
