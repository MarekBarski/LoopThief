import { useMemo } from "react";
import { isPadAssigned, useAppStore } from "../store/useAppStore";
import { ScreenFrame } from "./ScreenFrame";
import { lcdContentHeight, lcdSoftkeyHeight } from "./lcdLayout";
import { useHoldRepeat } from "../components/useHoldRepeat";

const noop = () => {};

export function StepScreen() {
  const sequence = useAppStore((state) => state.sequence);
  const sequenceName = useAppStore((state) => state.sequenceName);
  const bar = useAppStore((state) => state.bar);
  const timingCorrect = useAppStore((state) => state.timingCorrect);
  const swing = useAppStore((state) => state.swing);
  const activeTrack = useAppStore((state) => state.activeTrack);
  const currentTrackId = useAppStore((state) => state.currentTrackId);
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
  const selectStepEvent = useAppStore((state) => state.selectStepEvent);
  const cycleStepTrack = useAppStore((state) => state.cycleStepTrack);
  const previousStepEvent = useAppStore((state) => state.previousStepEvent);
  const nextStepEvent = useAppStore((state) => state.nextStepEvent);
  const stepBackward = useAppStore((state) => state.stepBackward);
  const stepForward = useAppStore((state) => state.stepForward);
  const barBackward = useAppStore((state) => state.barBackward);
  const barForward = useAppStore((state) => state.barForward);
  const currentBar = useAppStore((state) => state.currentBar);
  const currentStep = useAppStore((state) => state.currentStep);
  const deleteSelectedEvent = useAppStore((state) => state.deleteSelectedEvent);
  const toggleEventMuted = useAppStore((state) => state.toggleEventMuted);
  const armAddEvent = useAppStore((state) => state.armAddEvent);
  const createStepEventForPad = useAppStore((state) => state.createStepEventForPad);
  const addEventArmed = useAppStore((state) => state.addEventArmed);
  const cycleSelectedEventAppliedParameter = useAppStore((state) => state.cycleSelectedEventAppliedParameter);
  const adjustSelectedEventAppliedValue = useAppStore((state) => state.adjustSelectedEventAppliedValue);
  const setActiveScreen = useAppStore((state) => state.setActiveScreen);
  const sequences = useAppStore((state) => state.sequences);
  const currentSequence = useAppStore((state) => state.currentSequence);

  const currentSequenceObj = sequences.find((s) => s.id === currentSequence);
  const currentBarTs = (() => {
    if (!currentSequenceObj) return null;
    const changes = currentSequenceObj.timeSignatureChanges ?? [];
    let resolved = changes[0];
    const idx = Math.max(0, currentBar - 1);
    for (const c of changes) {
      if (c && c.fromBar <= idx) resolved = c;
      else break;
    }
    return resolved ? `${resolved.num}/${resolved.den}` : null;
  })();
  const barLabel = currentBarTs
    ? `${bar}   ${currentBarTs}`
    : bar;

  const trackEvents = useMemo(
    () => stepEvents.filter((event) => event.trackId === currentTrackId),
    [currentTrackId, stepEvents],
  );
  const selectedTrackEventIndex = Math.max(
    trackEvents.findIndex((event) => event.id === selectedEventId),
    0,
  );
  const visibleRowCount = 16;
  const windowStart = Math.min(
    Math.max(selectedTrackEventIndex - Math.floor(visibleRowCount / 2), 0),
    Math.max(trackEvents.length - visibleRowCount, 0),
  );
  const visibleEvents = useMemo(
    () => trackEvents.slice(windowStart, windowStart + visibleRowCount),
    [trackEvents, windowStart],
  );
  const selectedEvent = stepEvents[selectedEventIndex];

  return (
    <ScreenFrame title="STEP" subtitle="Event edit">
      <div className="grid h-full gap-[12px]" style={{ gridTemplateRows: `${lcdContentHeight} ${lcdSoftkeyHeight}px` }}>
        <div className="grid min-h-0 grid-cols-[1.22fr_0.92fr_0.72fr] gap-[2.3%] overflow-hidden">
          <section className="grid min-h-0 grid-rows-[auto_auto_1fr] border border-[#46533b] bg-black/20">
            <button
              type="button"
              onClick={armAddEvent}
              className={`border-b border-[#46533b] px-[3%] py-[2%] text-left text-[clamp(8px,0.66vw,10px)] tracking-[0.16em] hover:bg-black/40 ${
                addEventArmed ? "bg-amber-200/20 text-amber-100" : "bg-black/30 text-[#d8e3b7]"
              }`}
            >
              {addEventArmed ? "ARMED — SELECT PAD (click again to cancel)" : "+ ADD EVENT — choose pad"}
            </button>
            {addEventArmed && (
              <div className="grid grid-cols-4 gap-[4px] border-b border-[#46533b] bg-black/30 p-[3%]">
                {Array.from({ length: 16 }, (_, index) => {
                  const padNumber = index + 1;
                  const padId = `P${String(padNumber).padStart(2, "0")}`;
                  return (
                    <button
                      key={padId}
                      type="button"
                      onClick={() => createStepEventForPad(padId)}
                      className="border border-[#46533b] bg-black/20 px-[6%] py-[12%] text-center text-[clamp(8px,0.66vw,10px)] text-[#d8e3b7] hover:bg-amber-200/15"
                    >
                      {padId}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="grid grid-cols-[1fr_0.55fr_0.42fr_0.32fr_0.28fr] border-b border-[#46533b] px-[3%] py-[2%] text-[clamp(8px,0.66vw,10px)] tracking-[0.16em] text-[#91a477]">
              <span>BAR.STEP.TICK</span>
              <span>PAD</span>
              <span>VEL</span>
              <span>TR</span>
              <span>M</span>
            </div>
            <div className="grid content-start overflow-hidden">
              {visibleEvents.map((event) => {
                const trackMuted = performanceTracks.find((track) => track.name === event.trackId || track.id === event.trackId)?.muted ?? false;
                const eventMuted = event.muted === true;
                const dimmed = trackMuted || eventMuted;
                const selected = event.id === selectedEventId;
                const playing = !dimmed && eventStepIndex(event.step) === currentStepIndex;
                const tag = event.noteRepeatGenerated ? "NR" : event.appliedParameter ? "16" : event.type;
                const eventBank = event.padBank ?? "A";
                const eventPadNumber = event.padNumber ?? (Number(event.pad.replace(/^P/, "")) || 1);
                const eventPad = `P${String(eventPadNumber).padStart(2, "0")}`;
                const assigned = isPadAssigned({ padAssignments, padBank: eventBank }, eventPad);
                return (
                  <div
                    key={event.id}
                    className={`grid grid-cols-[1fr_0.55fr_0.42fr_0.32fr_0.28fr] items-center px-[3%] py-[1.35%] text-[clamp(8px,0.66vw,10px)] tracking-[0.12em] ${
                      dimmed
                        ? "text-[#556046]"
                        : selected
                          ? "bg-amber-200/15 text-amber-100"
                          : playing
                            ? "bg-[#d8e3b7]/10 text-[#eef6d8]"
                            : "text-[#aab691]"
                    }`}
                  >
                    <button type="button" onClick={() => selectStepEvent(event.id)} className="text-left">{event.step}</button>
                    <button type="button" onClick={() => selectStepEvent(event.id)} className="text-left">{assigned ? `${eventBank}${String(eventPadNumber).padStart(2, "0")}` : "UNASSIGNED PAD"}</button>
                    <button type="button" onClick={() => selectStepEvent(event.id)} className="text-left">{String(event.velocity).padStart(3, "0")}</button>
                    <button type="button" onClick={() => selectStepEvent(event.id)} className="text-left">{tag}</button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleEventMuted(event.id); }}
                      className={`text-center ${eventMuted ? "text-amber-200" : "text-[#46533b] hover:text-[#91a477]"}`}
                    >
                      {eventMuted ? "M" : "·"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="grid content-start gap-[8px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(9px,0.74vw,12px)] tracking-[0.14em]">
            <p className="text-[#91a477]">SELECTED EVENT {selectedEventId ?? "---"}</p>
            <StepNav label="EVENT" value={selectedEvent ? String(selectedTrackEventIndex + 1).padStart(3, "0") : "---"} onPrevious={previousStepEvent} onNext={nextStepEvent} />
            <StepNav label="TRACK" value={activeTrack} onPrevious={() => cycleStepTrack(-1)} onNext={() => cycleStepTrack(1)} />
            <StepNav label="BAR" value={String(currentBar).padStart(3, "0")} onPrevious={barBackward} onNext={barForward} />
            <StepNav label="STEP" value={String(currentStep).padStart(2, "0")} onPrevious={stepBackward} onNext={stepForward} />
            <EditableValue
              active={eventEditMode === "VELOCITY"}
              label="VELOCITY"
              value={selectedEvent ? String(selectedEvent.velocity) : "---"}
              onPrevious={selectedEvent ? () => { setEventEditMode("VELOCITY"); adjustSelectedEvent("velocity", -1); } : undefined}
              onNext={selectedEvent ? () => { setEventEditMode("VELOCITY"); adjustSelectedEvent("velocity", 1); } : undefined}
            />
            <EditableValue
              active={eventEditMode === "OFFSET"}
              label="OFFSET"
              value={selectedEvent ? formatSigned(selectedEvent.timingOffset) : "---"}
              onPrevious={selectedEvent ? () => { setEventEditMode("OFFSET"); adjustSelectedEvent("timingOffset", -1); } : undefined}
              onNext={selectedEvent ? () => { setEventEditMode("OFFSET"); adjustSelectedEvent("timingOffset", 1); } : undefined}
            />
            <EditableValue
              active={eventEditMode === "DURATION"}
              label="DURATION"
              value={selectedEvent ? (selectedEvent.duration === 0 ? "FULL" : String(selectedEvent.duration)) : "---"}
              onPrevious={selectedEvent ? () => { setEventEditMode("DURATION"); adjustSelectedEvent("duration", -1); } : undefined}
              onNext={selectedEvent ? () => { setEventEditMode("DURATION"); adjustSelectedEvent("duration", 1); } : undefined}
            />
            <EditableValue
              active={eventEditMode === "PROBABILITY"}
              label="PROBABILITY"
              value={selectedEvent ? `${selectedEvent.probability}%` : "---"}
              onPrevious={selectedEvent ? () => { setEventEditMode("PROBABILITY"); adjustSelectedEvent("probability", -5); } : undefined}
              onNext={selectedEvent ? () => { setEventEditMode("PROBABILITY"); adjustSelectedEvent("probability", 5); } : undefined}
            />
            <EditableValue
              label="PARAM TYPE"
              value={selectedEvent?.appliedParameter ?? "NONE"}
              onPrevious={selectedEvent ? () => cycleSelectedEventAppliedParameter(-1) : undefined}
              onNext={selectedEvent ? () => cycleSelectedEventAppliedParameter(1) : undefined}
            />
            <EditableValue
              label="PARAM VALUE"
              value={formatParamValue(selectedEvent)}
              onPrevious={selectedEvent?.appliedParameter ? () => adjustSelectedEventAppliedValue(-1) : undefined}
              onNext={selectedEvent?.appliedParameter ? () => adjustSelectedEventAppliedValue(1) : undefined}
            />
          </section>

          <section className="grid content-start gap-[8px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(9px,0.74vw,12px)] tracking-[0.14em]">
            <Info label="BAR" value={barLabel} />
            <Info label="TC" value={timingCorrect} />
            <Info label="SWING" value={`${swing}%`} />
            <Info label="TRACK" value={activeTrack} />
            <Info label="SEQ" value={`${sequence} ${sequenceName}`} />
            <Info label="TYPE" value={selectedEvent ? (selectedEvent.noteRepeatGenerated ? "NOTE REPEAT" : selectedEvent.appliedParameter ? "16 LEVELS" : selectedEvent.type) : "---"} />
            <Info label="PAD STATUS" value={selectedEvent && isPadAssigned({ padAssignments, padBank: selectedEvent.padBank ?? "A" }, formatEventPad(selectedEvent)) ? "ASSIGNED" : "UNASSIGNED PAD"} />
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

function EditableValue({
  label,
  value,
  active = false,
  onPrevious,
  onNext,
}: {
  label: string;
  value: string;
  active?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const prevHold = useHoldRepeat(onPrevious ?? noop);
  const nextHold = useHoldRepeat(onNext ?? noop);
  return (
    <div className={`grid grid-cols-[1fr_1.4fr] items-center gap-[8px] ${active ? "text-amber-100" : ""}`}>
      <span className={active ? "text-amber-200" : "text-[#91a477]"}>{label}</span>
      <div className="grid grid-cols-[22px_1fr_22px] items-center gap-[4px]">
        <button type="button" {...prevHold} disabled={!onPrevious} className="border border-[#46533b] bg-black/30 text-center text-[#d8e3b7] disabled:opacity-40">
          &lt;
        </button>
        <span className="text-center">{value}</span>
        <button type="button" {...nextHold} disabled={!onNext} className="border border-[#46533b] bg-black/30 text-center text-[#d8e3b7] disabled:opacity-40">
          &gt;
        </button>
      </div>
    </div>
  );
}

function StepNav({
  label,
  value,
  onPrevious,
  onNext,
}: {
  label: string;
  value: string;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const prevHold = useHoldRepeat(onPrevious);
  const nextHold = useHoldRepeat(onNext);
  return (
    <div className="grid grid-cols-[1fr_1.4fr] items-center gap-[8px]">
      <span className="text-[#91a477]">{label}</span>
      <div className="grid grid-cols-[22px_1fr_22px] items-center gap-[4px]">
        <button type="button" {...prevHold} className="border border-[#46533b] bg-black/30 text-center text-[#d8e3b7]">
          &lt;
        </button>
        <button type="button" onClick={onNext} className="truncate text-center text-[#eef6d8]">
          {value}
        </button>
        <button type="button" {...nextHold} className="border border-[#46533b] bg-black/30 text-center text-[#d8e3b7]">
          &gt;
        </button>
      </div>
    </div>
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

function formatEventPad(event: { pad: string; padNumber?: number }) {
  const padNumber = event.padNumber ?? (Number(event.pad.replace(/^P/, "")) || 1);
  return `P${String(padNumber).padStart(2, "0")}`;
}

function formatSigned(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function formatParamValue(event: { appliedParameter?: string; parameterValue?: number; appliedValue?: number } | undefined): string {
  if (!event) return "---";
  const value = event.parameterValue ?? event.appliedValue;
  if (value == null) return "---";
  if (event.appliedParameter === "TUNE") return formatSigned(value);
  return String(value);
}
