import { useEffect, useState } from "react";
import { isPadVisuallyTriggered, useAppStore } from "../store/useAppStore";
import { ScreenFrame } from "./ScreenFrame";
import { lcdContentHeight, lcdSoftkeyHeight } from "./lcdLayout";

const softButtons = ["F1 BANK", "F2 PROGRAM", "F3 POLY", "F4 CHOKE", "F5 FX", "F6 PERFORM"];

export function PadPlayScreen() {
  const activeProgram = useAppStore((state) => state.activeProgram);
  const padBank = useAppStore((state) => state.padBank);
  const sequence = useAppStore((state) => state.sequence);
  const selectedPad = useAppStore((state) => state.selectedPad);
  const lastTriggeredPad = useAppStore((state) => state.lastTriggeredPad);
  const lastPadVelocity = useAppStore((state) => state.lastPadVelocity);
  const assignments = useAppStore((state) => state.padAssignments[padBank]);
  const triggeredPads = useAppStore((state) => state.triggeredPads);
  const isPlaying = useAppStore((state) => state.isPlaying);
  const selectedAssignment =
    assignments.find((assignment) => assignment.pad === lastTriggeredPad) ??
    assignments.find((assignment) => assignment.pad === selectedPad) ??
    assignments[0];
  const [meter, setMeter] = useState(0.18);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setMeter(isPlaying ? 0.18 + Math.random() * 0.72 : 0.12);
    }, 140);
    return () => window.clearInterval(interval);
  }, [isPlaying]);

  return (
    <ScreenFrame title="PAD PLAY" subtitle="Live pad performance">
      <div
        className="grid h-full gap-[12px]"
        style={{ gridTemplateRows: `${lcdContentHeight} ${lcdSoftkeyHeight}px` }}
      >
        <div className="grid min-h-0 grid-cols-[0.82fr_1fr_1fr] gap-[2.3%] overflow-hidden">
          <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
            <Info label="PROGRAM" value={activeProgram} />
            <Info label="BANK" value={padBank} />
            <Info label="POLY / MONO" value={selectedAssignment.chokeGroup > 0 ? "MONO" : "POLY"} />
            <Info label="CHOKE MODE" value={selectedAssignment.muteTargetMode} />
            <Info label="ACTIVE SEQ" value={`SEQ ${sequence}`} />
          </section>

          <section className="grid content-start gap-[12px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
            <p className="text-[#91a477]">ACTIVE PAD</p>
            <div className="border border-[#46533b] bg-black/15 p-[5%]">
              <p className="text-[clamp(17px,1.35vw,24px)] font-semibold tracking-[0.16em] text-[#eef6d8]">
                {selectedAssignment.assignment}
              </p>
            </div>
            <Info label="PAD" value={lastTriggeredPad} />
            <Info label="VELOCITY" value={String(lastPadVelocity)} />
            <Info label="SLICE" value={selectedAssignment.assignment} />
            <Info label="PLAY MODE" value={selectedAssignment.mode} />
            <div className="grid gap-[5%]">
              <span className="text-[#91a477]">LEVEL</span>
              <div className="h-[12px] border border-[#46533b] bg-black/30">
                <div className="h-full bg-[#d8e3b7]" style={{ width: `${Math.round(meter * 100)}%` }} />
              </div>
            </div>
          </section>

          <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
            <p className="text-[#91a477]">PAD OVERVIEW</p>
            <div className="grid grid-cols-4 gap-[8px]">
              {assignments.map((assignment) => {
                const active = isPadVisuallyTriggered(triggeredPads, padBank, assignment.pad);
                const muted = assignment.muteTargetMode !== "OFF" || assignment.chokeGroup > 0;
                return (
                  <div
                    key={assignment.pad}
                    className={`grid gap-[4px] border px-[8%] py-[7%] ${
                      active
                        ? "border-amber-300 bg-amber-200/15 text-amber-100"
                        : muted
                          ? "border-[#46533b] bg-black/25 text-[#70805c]"
                          : "border-[#46533b] bg-black/15 text-[#d8e3b7]"
                    }`}
                  >
                    <span>{assignment.pad}</span>
                    <span className="text-[clamp(8px,0.66vw,10px)] text-[#91a477]">
                      {assignment.chokeGroup > 0 ? `G${String(assignment.chokeGroup).padStart(2, "0")}` : "--"}
                    </span>
                  </div>
                );
              })}
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
