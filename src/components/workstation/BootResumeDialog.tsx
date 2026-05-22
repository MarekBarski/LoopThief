import { useEffect, useRef } from "react";
import { useAppStore } from "../../store/useAppStore";

export function BootResumeDialog() {
  const bootResumeOpen = useAppStore((state) => state.bootResumeOpen);
  const bootResumeStatus = useAppStore((state) => state.bootResumeStatus);
  const bootResumeMessage = useAppStore((state) => state.bootResumeMessage);
  const acceptBootResume = useAppStore((state) => state.acceptBootResume);
  const dismissBootResume = useAppStore((state) => state.dismissBootResume);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!bootResumeOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        void dismissBootResume();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        void acceptBootResume();
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [bootResumeOpen, acceptBootResume, dismissBootResume]);

  useEffect(() => {
    if (bootResumeOpen) primaryRef.current?.focus();
  }, [bootResumeOpen]);

  if (!bootResumeOpen) return null;

  const isLoading = bootResumeStatus === "LOADING";
  const isError = bootResumeStatus === "ERROR";

  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-black/65 p-[5%]">
      <section className="w-[min(520px,80%)] border border-[#91a477] bg-[#0a0d08] p-[20px] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em] shadow-[0_0_24px_rgba(0,0,0,0.7)]">
        <p className="mb-[8px] text-[#eef6d8]">AUTOSAVE FOUND</p>
        <p className="mb-[16px] text-[10px] text-[#91a477]">
          A previous session left an autosaved project. Resume it, or discard and
          start blank?
        </p>
        {isError && (
          <p className="mb-[12px] text-[10px] text-red-300">{bootResumeMessage}</p>
        )}
        {isLoading && (
          <p className="mb-[12px] text-[10px] text-[#d8e3b7]">{bootResumeMessage}</p>
        )}
        <div className="grid grid-cols-2 gap-[8px]">
          <button
            type="button"
            ref={primaryRef}
            onClick={() => void acceptBootResume()}
            disabled={isLoading}
            className="border border-amber-300 bg-amber-200/10 px-[10px] py-[10px] text-amber-100 hover:bg-amber-200/20 disabled:opacity-50"
          >
            {isLoading ? "RESTORING…" : "RESUME"}
          </button>
          <button
            type="button"
            onClick={() => void dismissBootResume()}
            disabled={isLoading}
            className="border border-[#46533b] bg-black/25 px-[10px] py-[10px] text-[#d8e3b7] hover:border-amber-300 disabled:opacity-50"
          >
            DISCARD
          </button>
        </div>
        <p className="mt-[12px] text-[9px] text-[#46533b] tracking-[0.18em]">
          Enter = RESUME · Esc = DISCARD
        </p>
      </section>
    </div>
  );
}
