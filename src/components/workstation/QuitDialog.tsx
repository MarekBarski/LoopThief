import { useEffect, useRef } from "react";
import { useAppStore } from "../../store/useAppStore";

export function QuitDialog() {
  const quitDialogOpen = useAppStore((state) => state.quitDialogOpen);
  const quitStep = useAppStore((state) => state.quitStep);
  const quitStatus = useAppStore((state) => state.quitStatus);
  const quitErrorMessage = useAppStore((state) => state.quitErrorMessage);
  const quitSaveFilename = useAppStore((state) => state.quitSaveFilename);
  const cancelAppQuit = useAppStore((state) => state.cancelAppQuit);
  const confirmAppQuit = useAppStore((state) => state.confirmAppQuit);
  const beginSaveAndQuit = useAppStore((state) => state.beginSaveAndQuit);
  const backToQuitConfirm = useAppStore((state) => state.backToQuitConfirm);
  const setQuitSaveFilename = useAppStore((state) => state.setQuitSaveFilename);
  const saveAsAndQuit = useAppStore((state) => state.saveAsAndQuit);

  const primaryRef = useRef<HTMLButtonElement>(null);
  const filenameInputRef = useRef<HTMLInputElement>(null);

  // Capture-phase keyboard handler — wins over the global Escape switch in
  // KeyboardShortcuts.tsx which closes utility popups.
  useEffect(() => {
    if (!quitDialogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (quitStep === "SAVE_FORM") {
          backToQuitConfirm();
        } else {
          cancelAppQuit();
        }
        return;
      }
      if (event.key === "Enter") {
        // Only auto-confirm from the CONFIRM stage. In SAVE_FORM the input
        // owns Enter so the user can submit the filename naturally.
        if (quitStep === "CONFIRM" && document.activeElement?.tagName !== "INPUT") {
          event.preventDefault();
          event.stopPropagation();
          beginSaveAndQuit();
          return;
        }
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [quitDialogOpen, quitStep, cancelAppQuit, beginSaveAndQuit, backToQuitConfirm]);

  useEffect(() => {
    if (!quitDialogOpen) return;
    if (quitStep === "CONFIRM") {
      primaryRef.current?.focus();
    } else if (quitStep === "SAVE_FORM") {
      filenameInputRef.current?.focus();
      filenameInputRef.current?.select();
    }
  }, [quitDialogOpen, quitStep]);

  if (!quitDialogOpen) return null;

  const isSaving = quitStatus === "SAVING";
  const isError = quitStatus === "ERROR";

  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-black/65 p-[5%]">
      {quitStep === "CONFIRM" ? (
        <section className="w-[min(480px,80%)] border border-[#91a477] bg-[#0a0d08] p-[20px] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em] shadow-[0_0_24px_rgba(0,0,0,0.7)]">
          <p className="mb-[8px] text-[#eef6d8]">QUIT LOOPTHIEF?</p>
          <p className="mb-[16px] text-[10px] text-[#91a477]">
            Unsaved changes will be lost.
          </p>
          {isError && (
            <p className="mb-[12px] text-[10px] text-red-300">{quitErrorMessage}</p>
          )}
          <div className="grid grid-cols-3 gap-[8px]">
            <button
              type="button"
              ref={primaryRef}
              onClick={beginSaveAndQuit}
              disabled={isSaving}
              className="border border-amber-300 bg-amber-200/10 px-[10px] py-[10px] text-amber-100 hover:bg-amber-200/20 disabled:opacity-50"
            >
              SAVE & QUIT
            </button>
            <button
              type="button"
              onClick={() => void confirmAppQuit()}
              disabled={isSaving}
              className="border border-[#91a477] bg-black/30 px-[10px] py-[10px] text-[#eef6d8] hover:border-amber-300 disabled:opacity-50"
            >
              YES
            </button>
            <button
              type="button"
              onClick={cancelAppQuit}
              disabled={isSaving}
              className="border border-[#46533b] bg-black/25 px-[10px] py-[10px] text-[#d8e3b7] hover:border-amber-300 disabled:opacity-50"
            >
              NO
            </button>
          </div>
          <p className="mt-[12px] text-[9px] text-[#46533b] tracking-[0.18em]">
            Enter = SAVE & QUIT · Esc = NO
          </p>
        </section>
      ) : (
        <section className="w-[min(480px,80%)] border border-[#91a477] bg-[#0a0d08] p-[20px] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em] shadow-[0_0_24px_rgba(0,0,0,0.7)]">
          <p className="mb-[12px] text-[#eef6d8]">SAVE PROJECT BEFORE QUIT</p>
          <label className="mb-[14px] grid grid-cols-[1fr_1.6fr] items-center gap-[10px]">
            <span className="text-[#91a477]">FILENAME</span>
            <input
              ref={filenameInputRef}
              type="text"
              value={quitSaveFilename}
              onChange={(event) => setQuitSaveFilename(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void saveAsAndQuit(quitSaveFilename);
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  backToQuitConfirm();
                }
              }}
              disabled={isSaving}
              className="min-w-0 border border-[#46533b] bg-black/40 px-[6px] py-[3px] text-[#eef6d8] outline-none focus:border-amber-300"
            />
          </label>
          {isError && (
            <p className="mb-[10px] text-[10px] text-red-300">{quitErrorMessage}</p>
          )}
          <div className="grid grid-cols-2 gap-[8px]">
            <button
              type="button"
              onClick={() => void saveAsAndQuit(quitSaveFilename)}
              disabled={isSaving}
              className="border border-amber-300 bg-amber-200/10 px-[10px] py-[10px] text-amber-100 hover:bg-amber-200/20 disabled:opacity-50"
            >
              {isSaving ? "SAVING…" : "SAVE & QUIT"}
            </button>
            <button
              type="button"
              onClick={backToQuitConfirm}
              disabled={isSaving}
              className="border border-[#46533b] bg-black/25 px-[10px] py-[10px] text-[#d8e3b7] hover:border-amber-300 disabled:opacity-50"
            >
              CANCEL
            </button>
          </div>
          <p className="mt-[12px] text-[9px] text-[#46533b] tracking-[0.18em]">
            Enter = SAVE · Esc = CANCEL
          </p>
        </section>
      )}
    </div>
  );
}
