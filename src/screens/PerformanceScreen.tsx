import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { ScreenFrame } from "./ScreenFrame";
import { lcdContentHeight, lcdSoftkeyHeight } from "./lcdLayout";

const softButtons = ["F1 TRACK MUTE", "F2 NEXT SEQ", "F3 PAD SCENE", "F4 NOTE REPEAT", "F5 LIVE FX", "F6 JAM REC"];

export function PerformanceScreen() {
  const tracks = useAppStore((state) => state.performanceTracks);
  const sequences = useAppStore((state) => state.sequences);
  const currentSequence = useAppStore((state) => state.currentSequence);
  const queuedSequence = useAppStore((state) => state.queuedSequence);
  const queuedSequenceBarsRemaining = useAppStore((state) => state.queuedSequenceBarsRemaining);
  const trackMuteMode = useAppStore((state) => state.trackMuteMode);
  const padBank = useAppStore((state) => state.padBank);
  const bpm = useAppStore((state) => state.bpm);
  const swing = useAppStore((state) => state.swing);
  const isPlaying = useAppStore((state) => state.isPlaying);
  const performancePulse = useAppStore((state) => state.performancePulse);
  const queuePerformanceSequence = useAppStore((state) => state.queuePerformanceSequence);
  const tickPerformance = useAppStore((state) => state.tickPerformance);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = window.setInterval(() => tickPerformance(), 180);
    return () => window.clearInterval(interval);
  }, [isPlaying, tickPerformance]);

  const activeMutes = tracks.filter((track) => track.muted).map((track) => track.name);

  return (
    <ScreenFrame title="PERFORMANCE" subtitle="Live arrangement">
      <div
        className="grid h-full gap-[12px]"
        style={{ gridTemplateRows: `${lcdContentHeight} ${lcdSoftkeyHeight}px` }}
      >
        <div className="grid min-h-0 grid-cols-[1fr_1.02fr_0.88fr] gap-[2.3%] overflow-hidden">
          <section className="grid content-start gap-[8px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
            <p className="text-[#91a477]">TRACK MUTE</p>
            {tracks.map((track, index) => (
              <div
                key={track.name}
                className={`grid grid-cols-[auto_1fr_auto] items-center gap-[8px] border px-[4%] py-[3%] ${
                  track.solo
                    ? "border-amber-300 bg-amber-200/15 text-amber-100"
                    : track.muted
                    ? "border-[#46533b] bg-black/25 text-[#70805c]"
                    : "border-[#70845a] bg-[#d8e3b7]/10 text-[#eef6d8]"
                }`}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <span>{track.name}</span>
                <span className={`h-[8px] w-[8px] ${track.solo ? "bg-amber-200" : track.muted ? "bg-[#34402d]" : "bg-[#d8e3b7]"}`} />
              </div>
            ))}
          </section>

          <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
            <div className="flex items-center justify-between">
              <span className="text-[#91a477]">LIVE SEQUENCE</span>
              <span className={`h-[10px] w-[10px] ${isPlaying && performancePulse % 2 === 0 ? "bg-[#eef6d8]" : "bg-[#46533b]"}`} />
            </div>
            <div className="grid grid-cols-2 gap-[10px]">
              {sequences.map((item) => {
                const isActive = item.id === currentSequence;
                const isQueued = item.id === queuedSequence;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => queuePerformanceSequence(item.id)}
                    className={`border px-[4%] py-[8%] text-left ${
                      isActive
                        ? "border-amber-300 bg-amber-200/15 text-amber-100"
                        : isQueued
                          ? "animate-pulse border-[#91a477] bg-[#d8e3b7]/10 text-[#eef6d8]"
                          : "border-[#46533b] bg-black/15 text-[#d8e3b7]"
                    }`}
                  >
                    <span className="block">{item.name}</span>
                    <span className="mt-[4%] block text-[clamp(8px,0.66vw,10px)] text-[#91a477]">
                      {isActive ? "ACTIVE" : isQueued ? "QUEUED" : "READY"}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
            <Info label="CURRENT SEQ" value={sequences.find((item) => item.id === currentSequence)?.name ?? "---"} />
            <Info label="NEXT QUEUED" value={sequences.find((item) => item.id === queuedSequence)?.name ?? "---"} />
            <Info label="SWITCH IN" value={queuedSequence ? `${queuedSequenceBarsRemaining} BAR` : "---"} />
            <Info label="MUTE MODE" value={trackMuteMode} />
            <Info label="ACTIVE MUTES" value={activeMutes.length > 0 ? activeMutes.join(", ") : "NONE"} />
            <Info label="PAD BANK" value={padBank} />
            <Info label="BPM" value={bpm.toFixed(2)} />
            <Info label="SWING" value={`${swing}%`} />
            <div className="mt-[2%] grid grid-cols-8 gap-[4px]">
              {Array.from({ length: 16 }, (_, index) => (
                <span
                  key={index}
                  className={`h-[8px] ${
                    isPlaying && index === performancePulse ? "bg-[#eef6d8]" : "bg-[#46533b]"
                  }`}
                />
              ))}
            </div>
          </section>
        </div>

        <div className="grid grid-cols-6 gap-[1.4%]">
          {softButtons.map((button) => (
            <button
              key={button}
              type="button"
              className="border border-[#46533b] bg-black/25 px-[3%] py-[7%] text-center text-[clamp(8px,0.7vw,11px)] font-semibold tracking-[0.14em] text-[#d8e3b7]"
            >
              {button}
            </button>
          ))}
        </div>
      </div>
    </ScreenFrame>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-[4%]">
      <span className="text-[#91a477]">{label}</span>
      <span className="text-[#eef6d8]">{value}</span>
    </div>
  );
}
