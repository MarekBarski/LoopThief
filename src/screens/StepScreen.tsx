import { useMemo } from "react";
import { isPadAssigned, useAppStore } from "../store/useAppStore";
import { ScreenFrame } from "./ScreenFrame";
import { lcdContentHeight, lcdSoftkeyHeight } from "./lcdLayout";

export function StepScreen() {
  const sequence = useAppStore((state) => state.sequence);
  const sequenceName = useAppStore((state) => state.sequenceName);
  const bar = useAppStore((state) => state.bar);
  const timingCorrect = useAppStore((state) => state.timingCorrect);
  const swing = useAppStore((state) => state.swing);
  const activeTrack = useAppStore((state) => state.activeTrack);
  const stepEvents = useAppStore((state) => state.stepEvents);
  const selectedEventIndex = useAppStore((state) => state.selectedEventIndex);
  const selectedEventId = useAppStore((state) => state.selectedEventId);
  const eventEditMode = useAppStore((state) => state.eventEditMode);
  const currentStepIndex = useAppStore((state) => state.currentStepIndex);
  const performanceTracks = useAppStore((state) => state.performanceTracks);
  const padAssignments = useAppStore((state) => state.padAssignments);
  const padBank = useAppStore((state) => state.padBank);
  const setEventEditMode = useAppStore((state) => state.setEventEditMode);
  const adjustSelectedEvent = useAppStore((state) => state.adjustSelectedEvent);
  const cycleSelectedEventTrack = useAppStore((state) => state.cycleSelectedEventTrack);
  const deleteSelectedEvent = useAppStore((state) => state.deleteSelectedEvent);
  const setActiveScreen = useAppStore((state) => state.setActiveScreen);

  const visibleRowCount = 16;
  const windowStart = Math.min(
    Math.max(selectedEventIndex - Math.floor(visibleRowCount / 2), 0),
    Math.max(stepEvents.length - visibleRowCount, 0),
  );
  const visibleEvents = useMemo(
    () => stepEvents.slice(windowStart, windowStart + visibleRowCount),
    [stepEvents, windowStart],
  );
  const selectedEvent = stepEvents[selectedEventIndex];

  return (
    <ScreenFrame title="STEP" subtitle="Event edit">
      <div className="grid h-full gap-[12px]" style={{ gridTemplateRows: `${lcdContentHeight} ${lcdSoftkeyHeight}px` }}>
        <div className="grid min-h-0 grid-cols-[1.22fr_0.92fr_0.72fr] gap-[2.3%] overflow-hidden">
          <section className="grid min-h-0 grid-rows-[auto_1fr] border border-[#46533b] bg-black/20">
            <div className="grid grid-cols-[1fr_0.55fr_0.42fr_0.46fr] border-b border-[#46533b] px-[3%] py-[2%] text-[clamp(8px,0.66vw,10px)] tracking-[0.16em] text-[#91a477]">
              <span>BAR.STEP.TICK</span>
              <span>PAD</span>
              <span>VEL</span>
              <span>TR</span>
            </div>
            <div className="grid content-start overflow-hidden">
              {visibleEvents.map((event, index) => {
                const absoluteIndex = windowStart + index;
                const muted = performanceTracks.find((track) => track.name === event.trackId)?.muted ?? false;
                const selected = absoluteIndex === selectedEventIndex;
                const playing = !muted && eventStepIndex(event.step) === currentStepIndex;
                const tag = event.noteRepeatGenerated ? "NR" : event.appliedParameter ? "16" : event.type;
                const assigned = isPadAssigned({ padAssignments, padBank }, event.pad);
                return (
                  <div
                    key={event.id}
                    className={`grid grid-cols-[1fr_0.55fr_0.42fr_0.46fr] px-[3%] py-[1.35%] text-[clamp(8px,0.66vw,10px)] tracking-[0.12em] ${
                      muted
                        ? "text-[#556046]"
                        : selected
                          ? "bg-amber-200/15 text-amber-100"
                          : playing
                            ? "bg-[#d8e3b7]/10 text-[#eef6d8]"
                            : "text-[#aab691]"
                    }`}
                  >
                    <span>{event.step}</span>
                    <span>{assigned ? event.pad : "UNASSIGNED PAD"}</span>
                    <span>{String(event.velocity).padStart(3, "0")}</span>
                    <span>{tag}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="grid content-start gap-[8px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(9px,0.74vw,12px)] tracking-[0.14em]">
            <p className="text-[#91a477]">SELECTED EVENT {selectedEventId ?? "---"}</p>
            <Info active={eventEditMode === "VELOCITY"} label="VELOCITY" value={selectedEvent ? String(selectedEvent.velocity) : "---"} />
            <Info active={eventEditMode === "OFFSET"} label="OFFSET" value={selectedEvent ? formatSigned(selectedEvent.timingOffset) : "---"} />
            <Info active={eventEditMode === "DURATION"} label="DURATION" value={selectedEvent ? String(selectedEvent.duration) : "---"} />
            <Info active={eventEditMode === "PROBABILITY"} label="PROBABILITY" value={selectedEvent ? `${selectedEvent.probability}%` : "---"} />
            <Info active={eventEditMode === "TRACK"} label="TRACK" value={selectedEvent?.trackId ?? "---"} onClick={() => { setEventEditMode("TRACK"); cycleSelectedEventTrack(); }} />
            <Info label="PARAM VALUE" value={selectedEvent?.parameterValue == null ? "---" : String(selectedEvent.parameterValue)} />
          </section>

          <section className="grid content-start gap-[8px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(9px,0.74vw,12px)] tracking-[0.14em]">
            <Info label="BAR" value={bar} />
            <Info label="TC" value={timingCorrect} />
            <Info label="SWING" value={`${swing}%`} />
            <Info label="TRACK" value={activeTrack} />
            <Info label="SEQ" value={`${sequence} ${sequenceName}`} />
            <Info label="TYPE" value={selectedEvent ? (selectedEvent.noteRepeatGenerated ? "NOTE REPEAT" : selectedEvent.appliedParameter ? "16 LEVELS" : selectedEvent.type) : "---"} />
            <Info label="PAD STATUS" value={selectedEvent && isPadAssigned({ padAssignments, padBank }, selectedEvent.pad) ? "ASSIGNED" : "UNASSIGNED PAD"} />
          </section>
        </div>

        <div className="grid grid-cols-6 gap-[1.4%]">
          <Softkey label="F1 VEL" onClick={() => { setEventEditMode("VELOCITY"); adjustSelectedEvent("velocity", 1); }} />
          <Softkey label="F2 OFFSET" onClick={() => { setEventEditMode("OFFSET"); adjustSelectedEvent("timingOffset", 1); }} />
          <Softkey label="F3 DUR" onClick={() => { setEventEditMode("DURATION"); adjustSelectedEvent("duration", 1); }} />
          <Softkey label="F4 PROB" onClick={() => { setEventEditMode("PROBABILITY"); adjustSelectedEvent("probability", 5); }} />
          <Softkey label="F5 DELETE" onClick={deleteSelectedEvent} />
          <Softkey label="F6 EXIT" onClick={() => setActiveScreen("MAIN")} />
        </div>
      </div>
    </ScreenFrame>
  );
}

function Info({ label, value, active = false, onClick }: { label: string; value: string; active?: boolean; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`grid grid-cols-[1fr_auto] gap-[8px] text-left ${active ? "text-amber-100" : ""}`}>
      <span className={active ? "text-amber-200" : "text-[#91a477]"}>{label}</span>
      <span>{value}</span>
    </button>
  );
}

function Softkey({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border border-[#46533b] bg-black/25 px-[3%] py-[7%] text-center text-[clamp(8px,0.7vw,11px)] font-semibold tracking-[0.14em] text-[#d8e3b7]"
    >
      {label}
    </button>
  );
}

function eventStepIndex(step: string) {
  const [eventBar, beat, tick] = step.split(".").map(Number);
  return (eventBar - 1) * 16 + (beat - 1) * 4 + Math.floor(tick / 24);
}

function formatSigned(value: number) {
  return value > 0 ? `+${value}` : String(value);
}
