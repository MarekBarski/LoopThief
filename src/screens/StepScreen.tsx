import { useEffect, useMemo } from "react";
import { useAppStore } from "../store/useAppStore";
import { ScreenFrame } from "./ScreenFrame";
import { lcdContentHeight, lcdSoftkeyHeight } from "./lcdLayout";

const softButtons = ["F1 INSERT", "F2 DELETE", "F3 COPY", "F4 NUDGE", "F5 VELOCITY", "F6 GO TO"];

export function StepScreen() {
  const sequence = useAppStore((state) => state.sequence);
  const bar = useAppStore((state) => state.bar);
  const tcValue = useAppStore((state) => state.tcValue);
  const activeTrack = useAppStore((state) => state.activeTrack);
  const selectedPad = useAppStore((state) => state.selectedPad);
  const stepEvents = useAppStore((state) => state.stepEvents);
  const padBank = useAppStore((state) => state.padBank);
  const padAssignments = useAppStore((state) => state.padAssignments[padBank]);
  const selectedStepEventIndex = useAppStore((state) => state.selectedStepEventIndex);
  const currentStepIndex = useAppStore((state) => state.currentStepIndex);
  const isPlaying = useAppStore((state) => state.isPlaying);
  const tickStepPlayback = useAppStore((state) => state.tickStepPlayback);

  const windowStart = Math.min(
    Math.max(selectedStepEventIndex - 8, 0),
    Math.max(stepEvents.length - 18, 0),
  );
  const visibleEvents = useMemo(
    () => stepEvents.slice(windowStart, windowStart + 18),
    [stepEvents, windowStart],
  );
  const selectedEvent = stepEvents[selectedStepEventIndex] ?? stepEvents[0];
  const assignmentByPad = new Map(padAssignments.map((assignment) => [assignment.pad, assignment.assignment]));
  const getAssignedName = (pad: string) => assignmentByPad.get(pad) ?? "---";

  useEffect(() => {
    if (!isPlaying) return;
    const interval = window.setInterval(() => tickStepPlayback(), 180);
    return () => window.clearInterval(interval);
  }, [isPlaying, tickStepPlayback]);

  return (
    <ScreenFrame title="STEP" subtitle="MPC-style step edit">
      <div
        className="grid h-full gap-[12px]"
        style={{ gridTemplateRows: `${lcdContentHeight} ${lcdSoftkeyHeight}px` }}
      >
        <div className="grid min-h-0 grid-cols-[0.8fr_1.45fr_0.9fr] gap-[2.3%] overflow-hidden">
          <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
            <Info label="SEQ" value={sequence} />
            <Info label="BAR" value={bar} />
            <Info label="STEP/TICK" value={formatCurrentStep(currentStepIndex)} />
            <Info label="TC" value={tcValue} />
            <Info label="TRACK" value={activeTrack} />
            <Info label="SELECTED PAD" value={selectedPad} />
            <Info label="PAD BANK" value={padBank} />
          </section>

          <section className="grid min-h-0 grid-rows-[auto_1fr] border border-[#46533b] bg-black/20">
            <div className="grid grid-cols-[1fr_0.7fr_0.55fr_0.55fr_0.7fr] border-b border-[#46533b] px-[3%] py-[2%] text-[clamp(9px,0.7vw,11px)] tracking-[0.16em] text-[#91a477]">
              <span>STEP</span>
              <span>ASSIGN</span>
              <span>VEL</span>
              <span>LEN</span>
              <span>TYPE</span>
            </div>
            <div className="grid content-start overflow-hidden">
              {visibleEvents.map((event, index) => {
                const absoluteIndex = windowStart + index;
                const isSelected = absoluteIndex === selectedStepEventIndex;
                const isCurrentStep = eventStepIndex(event.step) === currentStepIndex;
                const isSelectedPad = event.pad === selectedPad;
                return (
                  <div
                    key={`${event.step}-${event.pad}-${index}`}
                    className={`grid grid-cols-[1fr_0.7fr_0.55fr_0.55fr_0.7fr] px-[3%] py-[1.6%] text-[clamp(9px,0.7vw,11px)] tracking-[0.12em] ${
                      isSelected
                        ? "bg-amber-200/15 text-amber-100"
                        : isCurrentStep
                          ? "bg-[#d8e3b7]/10 text-[#eef6d8]"
                          : isSelectedPad
                            ? "text-[#eef6d8]"
                            : "text-[#aab691]"
                    }`}
                  >
                    <span>{event.step}</span>
                    <span className="truncate">{getAssignedName(event.pad)}</span>
                    <span>{event.velocity}</span>
                    <span>{event.length}</span>
                    <span>{event.type}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
            <Info label="EVENT" value={selectedEvent.step} />
            <Info label="PAD" value={selectedEvent.pad} />
            <Info label="ASSIGNED" value={getAssignedName(selectedEvent.pad)} />
            <Info label="VELOCITY" value={String(selectedEvent.velocity)} />
            <Info label="DURATION" value={String(selectedEvent.length)} />
            <Info label="TIMING OFS" value={formatSigned(selectedEvent.timingOffset)} />
            <Info label="PROBABILITY" value={`${selectedEvent.probability}%`} />
            <Info label="VARIATION" value={selectedEvent.variation} />
            <Info label="MUTE" value={selectedEvent.muted ? "ON" : "OFF"} />
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

function eventStepIndex(step: string) {
  const [bar, beat, tick] = step.split(".").map(Number);
  return ((bar - 1) * 16 + (beat - 1) * 4 + Math.floor(tick / 24)) % 64;
}

function formatCurrentStep(index: number) {
  const bar = Math.floor(index / 16) + 1;
  const local = index % 16;
  const beat = Math.floor(local / 4) + 1;
  const tick = (local % 4) * 24;
  return `${String(bar).padStart(3, "0")}.${beat}.${String(tick).padStart(2, "0")}`;
}

function formatSigned(value: number) {
  return value > 0 ? `+${value}` : String(value);
}
