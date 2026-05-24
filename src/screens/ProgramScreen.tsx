import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAppStore } from "../store/useAppStore";
import { ScreenFrame } from "./ScreenFrame";
import { lcdContentHeight, lcdSoftkeyHeight } from "./lcdLayout";
import { useHoldRepeat } from "../components/useHoldRepeat";
import { EditableNumber } from "../components/EditableNumber";
import { EditableText } from "../components/EditableText";

const softButtons = ["F1 ASSIGN", "F2 PARAMS", "F3 CHOKE", "F4 FILTER", "F5 FX SEND", "F6 SAVE PGM"];

export function ProgramScreen() {
  const activeProgram = useAppStore((state) => state.activeProgram);
  const selectedPad = useAppStore((state) => state.selectedPad);
  const padBank = useAppStore((state) => state.padBank);
  const currentPadMode = useAppStore((state) => state.currentPadMode);
  const padAssignments = useAppStore((state) => state.padAssignments[padBank]);
  const programView = useAppStore((state) => state.programView);
  const recordedSamples = useAppStore((state) => state.recordedSamples);
  const allPadAssignments = useAppStore((state) => state.padAssignments);
  const assignSourceToSelectedPad = useAppStore((state) => state.assignSourceToSelectedPad);
  const previewSource = useAppStore((state) => state.previewSource);
  const updateSelectedPadParam = useAppStore((state) => state.updateSelectedPadParam);
  const setSelectedPadParam = useAppStore((state) => state.setSelectedPadParam);
  const toggleSelectedPadMode = useAppStore((state) => state.toggleSelectedPadMode);
  const toggleSelectedPadVoiceMode = useAppStore((state) => state.toggleSelectedPadVoiceMode);
  const toggleSelectedPadLoop = useAppStore((state) => state.toggleSelectedPadLoop);
  const setProgramView = useAppStore((state) => state.setProgramView);
  const cycleMuteTargetMode = useAppStore((state) => state.cycleMuteTargetMode);
  const toggleMuteTargetForSelectedPad = useAppStore((state) => state.toggleMuteTargetForSelectedPad);
  const cycleSelectedPadFilterType = useAppStore((state) => state.cycleSelectedPadFilterType);
  const previousProgram = useAppStore((state) => state.previousProgram);
  const nextProgram = useAppStore((state) => state.nextProgram);
  const createProgram = useAppStore((state) => state.createProgram);
  const fxBuses = useAppStore((state) => state.fxBuses);
  const setPadFxBus = useAppStore((state) => state.setPadFxBus);
  const adjustPadFxSendLevel = useAppStore((state) => state.adjustPadFxSendLevel);
  const setPadFxSendLevel = useAppStore((state) => state.setPadFxSendLevel);
  const openFxSendWindow = useAppStore((state) => state.openFxSendWindow);
  const setCurrentProgramName = useAppStore((state) => state.setCurrentProgramName);
  const selectPad = useAppStore((state) => state.selectPad);
  const [assignOpen, setAssignOpen] = useState(false);
  const [sourceType, setSourceType] = useState<"SAMPLES" | "SLICES" | "PROGRAM POOL">("SAMPLES");
  const [sourceIndex, setSourceIndex] = useState(0);

  const selectedAssignment =
    padAssignments.find((assignment) => assignment.pad === selectedPad) ?? padAssignments[0];
  const groupMembers = padAssignments.filter(
    (assignment) =>
      selectedAssignment.chokeGroup > 0 &&
      assignment.chokeGroup === selectedAssignment.chokeGroup &&
      assignment.pad !== selectedAssignment.pad,
  );
  const sourceLists = useMemo(() => {
    const sampleNames = recordedSamples
      .filter((sample) => !/_S\d{2}$/.test(sample.name))
      .map((sample) => sample.name);
    const sliceNames = recordedSamples
      .filter((sample) => /_S\d{2}$/.test(sample.name))
      .map((sample) => sample.name);
    const poolNames = Array.from(
      new Set(
        Object.values(allPadAssignments)
          .flat()
          .map((assignment) => assignment.assignment)
          .filter((assignment) => assignment !== "---"),
      ),
    );
    return { SAMPLES: sampleNames, SLICES: sliceNames, "PROGRAM POOL": poolNames };
  }, [allPadAssignments, recordedSamples]);
  const activeSources = sourceLists[sourceType];
  const selectedSource = activeSources[sourceIndex] ?? "---";
  const assignedSourceType = /_S\d{2}$/.test(selectedAssignment.assignment) ? "SLICE" : "SAMPLE";

  return (
    <ScreenFrame title="PROGRAM" subtitle="Pad program editor">
      <div
        className="grid h-full gap-[12px]"
        style={{ gridTemplateRows: `${lcdContentHeight} ${lcdSoftkeyHeight}px` }}
      >
        <div className="relative grid min-h-0 grid-cols-[1fr_0.92fr] gap-[2.5%] overflow-hidden">
          <section className="grid min-h-0 grid-rows-[auto_1fr] gap-[3%] border border-[#46533b] bg-black/20 p-[2.8%]">
            <div className="grid grid-cols-4 text-[clamp(9px,0.72vw,11px)] tracking-[0.14em] text-[#91a477]">
              <span>PAD</span>
              <span>ASSIGNMENT</span>
              <span>MODE</span>
              <span>LVL</span>
            </div>
            <div className="grid grid-cols-4 grid-rows-4 gap-[2.2%]">
              {padAssignments.map((assignment) => (
                <button
                  key={assignment.pad}
                  type="button"
                  onClick={() => selectPad(assignment.pad)}
                  className={`grid min-h-0 grid-cols-[auto_1fr] content-center gap-x-[8px] border px-[7%] py-[5%] text-left text-[clamp(8px,0.66vw,10px)] tracking-[0.12em] ${
                    assignment.pad === selectedPad
                      ? "border-amber-300 bg-amber-200/10 text-[#f1e7c8]"
                      : "border-[#46533b] bg-black/15 text-[#d8e3b7]"
                  }`}
                >
                  <span>{assignment.pad}</span>
                  <span className="truncate">{assignment.assignment}</span>
                  <span>{assignment.mode}</span>
                  <span>{assignment.level}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-[2.4%] overflow-hidden border border-[#46533b] bg-black/20 p-[3.2%] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
            <div className="grid grid-cols-2 gap-x-[3%] gap-y-[6px] border-b border-[#46533b] pb-[2.4%]">
              <ProgramSwitcher
                value={activeProgram}
                onPrevious={previousProgram}
                onNext={nextProgram}
                onRename={setCurrentProgramName}
              />
              <Info label="PAD BANK" value={padBank} />
              <Info label="SELECTED PAD" value={selectedAssignment.pad} />
              <Info label="ASSIGNED" value={selectedAssignment.assignment} />
              <Info label="SOURCE TYPE" value={assignedSourceType} />
              <Info label="SOURCE LIST" value={`${sourceType} ${activeSources.length}`} />
            </div>

            {programView === "PARAMS" ? (
            // overflow-y-auto: the 11-field PARAMS grid overflows the parent
            // section vertically once MUTE GRP lands at the bottom (6 rows ×
            // ~2.6% padding-y each ≈ exceeds available height on smaller LCD
            // scales). Global LCD-tinted scrollbar from src/styles/index.css
            // applies automatically. min-h-0 already in place lets the grid
            // shrink to the bounded parent so overflow actually triggers.
            <div className="grid min-h-0 content-start grid-cols-2 gap-x-[4%] gap-y-[6px] overflow-y-auto">
              {currentPadMode === "STEP_INPUT" && (
                <div className="col-span-2 border border-amber-300/50 bg-amber-200/10 px-[3%] py-[2.5%] text-amber-100">
                  STEP INPUT MODE: BASE PAD {selectedAssignment.pad}
                </div>
              )}
              <Param label="MODE" value={selectedAssignment.mode} onMinus={toggleSelectedPadMode} onPlus={toggleSelectedPadMode} />
              <Param label="VOICE" value={selectedAssignment.voiceMode} onMinus={toggleSelectedPadVoiceMode} onPlus={toggleSelectedPadVoiceMode} />
              <Param label="LOOP" value={selectedAssignment.loop ? "ON" : "OFF"} onMinus={toggleSelectedPadLoop} onPlus={toggleSelectedPadLoop} />
              <Param
                label="LEVEL"
                value={selectedAssignment.level}
                onMinus={() => updateSelectedPadParam("level", -1)}
                onPlus={() => updateSelectedPadParam("level", 1)}
                editable={{ numericValue: selectedAssignment.level, min: 0, max: 127, onCommit: (v) => setSelectedPadParam("level", Math.round(v)) }}
              />
              <Param
                label="TUNE"
                value={selectedAssignment.tune}
                onMinus={() => updateSelectedPadParam("tune", -1)}
                onPlus={() => updateSelectedPadParam("tune", 1)}
                editable={{ numericValue: selectedAssignment.tune, min: -24, max: 24, allowNegative: true, onCommit: (v) => setSelectedPadParam("tune", Math.round(v)) }}
              />
              <Param
                label="FINE"
                value={selectedAssignment.fineTune}
                onMinus={() => updateSelectedPadParam("fineTune", -1)}
                onPlus={() => updateSelectedPadParam("fineTune", 1)}
                editable={{ numericValue: selectedAssignment.fineTune, min: -100, max: 100, allowNegative: true, onCommit: (v) => setSelectedPadParam("fineTune", Math.round(v)) }}
              />
              <Param
                label="PAN"
                value={formatPan(selectedAssignment.pan)}
                onMinus={() => updateSelectedPadParam("pan", -1)}
                onPlus={() => updateSelectedPadParam("pan", 1)}
                editable={{ numericValue: selectedAssignment.pan, format: formatPan, min: -50, max: 50, allowNegative: true, onCommit: (v) => setSelectedPadParam("pan", Math.round(v)) }}
              />
              <Param
                label="ATTACK"
                value={selectedAssignment.attack}
                onMinus={() => updateSelectedPadParam("attack", -1)}
                onPlus={() => updateSelectedPadParam("attack", 1)}
                editable={{ numericValue: selectedAssignment.attack, min: 0, max: 100, onCommit: (v) => setSelectedPadParam("attack", Math.round(v)) }}
              />
              <Param
                label="DECAY"
                value={selectedAssignment.decay}
                onMinus={() => updateSelectedPadParam("decay", -1)}
                onPlus={() => updateSelectedPadParam("decay", 1)}
                editable={{ numericValue: selectedAssignment.decay, min: 0, max: 100, onCommit: (v) => setSelectedPadParam("decay", Math.round(v)) }}
              />
              <Param
                label="CHOKE"
                value={selectedAssignment.chokeGroup}
                onMinus={() => updateSelectedPadParam("chokeGroup", -1)}
                onPlus={() => updateSelectedPadParam("chokeGroup", 1)}
                editable={{ numericValue: selectedAssignment.chokeGroup, min: 0, max: 8, onCommit: (v) => setSelectedPadParam("chokeGroup", Math.round(v)) }}
              />
              <Param
                label="MUTE GRP"
                value={formatMuteGroup(selectedAssignment.muteGroup)}
                onMinus={() => updateSelectedPadParam("muteGroup", -1)}
                onPlus={() => updateSelectedPadParam("muteGroup", 1)}
                editable={{
                  numericValue: selectedAssignment.muteGroup,
                  format: formatMuteGroup,
                  min: 0,
                  max: 16,
                  onCommit: (v) => setSelectedPadParam("muteGroup", Math.round(v)),
                }}
              />
            </div>
            ) : programView === "FILTER" ? (
              // Defensive overflow-y-auto — current 3 filter params fit but
              // future additions shouldn't clip silently.
              <div className="grid min-h-0 content-start gap-[8px] overflow-y-auto">
                <FilterParam
                  label="FILTER TYPE"
                  value={selectedAssignment.filterType}
                  onPrevious={() => cycleSelectedPadFilterType(-1)}
                  onNext={() => cycleSelectedPadFilterType(1)}
                />
                <FilterParam
                  label="CUTOFF"
                  value={String(selectedAssignment.filterCutoff)}
                  onPrevious={() => updateSelectedPadParam("filterCutoff", -1)}
                  onNext={() => updateSelectedPadParam("filterCutoff", 1)}
                  editable={{ numericValue: selectedAssignment.filterCutoff, min: 0, max: 100, onCommit: (v) => setSelectedPadParam("filterCutoff", Math.round(v)) }}
                />
                <FilterParam
                  label="RESONANCE"
                  value={String(selectedAssignment.filterResonance)}
                  onPrevious={() => updateSelectedPadParam("filterResonance", -1)}
                  onNext={() => updateSelectedPadParam("filterResonance", 1)}
                  editable={{ numericValue: selectedAssignment.filterResonance, min: 0, max: 100, onCommit: (v) => setSelectedPadParam("filterResonance", Math.round(v)) }}
                />
              </div>
            ) : programView === "FX" ? (
              (() => {
                const padBus = selectedAssignment.fxBus ?? 0;
                const padSend = selectedAssignment.fxSendLevel ?? 0;
                const targetBus = padBus === 0 ? null : fxBuses.find((b) => b.id === padBus);
                const sendDisabled = !targetBus || !targetBus.direct;
                const cycleBus = (dir: 1 | -1) => {
                  const next = ((padBus + dir + 5) % 5) as 0 | 1 | 2 | 3 | 4;
                  setPadFxBus(selectedAssignment.pad, next);
                };
                return (
                  // Defensive overflow-y-auto matches PARAMS / FILTER siblings.
                  <div className="grid min-h-0 content-start gap-[10px] overflow-y-auto">
                    <div className="grid grid-cols-2 gap-[8px]">
                      <Info label="SELECTED PAD" value={`${padBank}${selectedAssignment.pad.slice(1)}`} />
                      <Info label="FX BUS" value={padBus === 0 ? "OFF" : `FX${padBus}`} />
                      <Info label="MODE" value={targetBus ? (targetBus.direct ? "SEND" : "INSERT") : "---"} />
                      <Info label="SEND LEVEL" value={sendDisabled ? "---" : String(padSend)} />
                    </div>
                    <Param
                      label="FX BUS"
                      value={padBus === 0 ? "OFF" : `FX${padBus}`}
                      onMinus={() => cycleBus(-1)}
                      onPlus={() => cycleBus(1)}
                    />
                    <Param
                      label="SEND"
                      value={padBus === 0 ? "---" : padSend}
                      onMinus={() => padBus !== 0 && adjustPadFxSendLevel(selectedAssignment.pad, -1)}
                      onPlus={() => padBus !== 0 && adjustPadFxSendLevel(selectedAssignment.pad, 1)}
                      // SEND editable whenever pad is routed to any bus. In INSERT mode the
                      // engine ignores the level (signal is 100% wet through the bus), but
                      // the value is preserved so flipping the bus to SEND later restores it.
                      editable={padBus === 0 ? undefined : {
                        numericValue: padSend,
                        min: 0,
                        max: 100,
                        onCommit: (v) => setPadFxSendLevel(selectedAssignment.pad, Math.round(v)),
                      }}
                    />
                  </div>
                );
              })()
            ) : (
              <div className="grid min-h-0 content-start gap-[10px]">
                <div className="grid grid-cols-2 gap-[8px]">
                  <Info label="MUTE MODE" value={selectedAssignment.muteTargetMode} />
                  <Info label="MUTE TARGETS" value={formatMuteTargets(padBank, selectedAssignment.muteTargets)} />
                </div>
                <div className="border border-[#46533b] bg-black/15 p-[2.4%]">
                  <p className="mb-[2%] text-[#91a477]">GROUP MEMBERS</p>
                  <p className="text-[#eef6d8]">
                    {groupMembers.length > 0
                      ? groupMembers.map((member) => `${padBank}${member.pad.slice(1)}`).join(", ")
                      : "---"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-[8px]">
                  <MiniAction label="MODE" onClick={cycleMuteTargetMode} />
                  <MiniAction
                    label="CLEAR TARGETS"
                    onClick={() =>
                      selectedAssignment.muteTargets.forEach((target) =>
                        toggleMuteTargetForSelectedPad(target),
                      )
                    }
                  />
                </div>
                <p className="text-[clamp(8px,0.66vw,10px)] leading-tight text-[#91a477]">
                  In PAIR mode, press pads to add/remove up to two mute targets.
                </p>
              </div>
            )}
          </section>
          {assignOpen && (
            <section className="absolute inset-0 z-20 grid grid-cols-[0.72fr_1fr_0.88fr] gap-[12px] border border-[#91a477] bg-[#090c07]/95 p-[14px] text-[clamp(9px,0.74vw,12px)] tracking-[0.14em]">
              <AssignColumn title="SOURCE TYPE">
                {(["SAMPLES", "SLICES", "PROGRAM POOL"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setSourceType(type);
                      setSourceIndex(0);
                    }}
                    className={`text-left ${type === sourceType ? "text-amber-200" : "text-[#9cab84] hover:text-[#d8e3b7]"}`}
                  >
                    {type}
                  </button>
                ))}
              </AssignColumn>
              <AssignColumn title="AVAILABLE SOURCES" scrollable>
                {activeSources.length === 0 ? (
                  <p className="text-[#91a477]">--- EMPTY ---</p>
                ) : (
                  <AssignSourceList
                    sources={activeSources}
                    sourceIndex={sourceIndex}
                    onSelect={setSourceIndex}
                  />
                )}
              </AssignColumn>
              <AssignColumn title="TARGET">
                <Info label="BANK" value={padBank} />
                <Info label="PAD" value={selectedPad} />
                <Info label="CURRENT" value={selectedAssignment.assignment} />
                <Info label="PREVIEW" value={selectedSource} />
              </AssignColumn>
            </section>
          )}
        </div>

        <div className="grid grid-cols-6 gap-[1.4%]">
          {assignOpen ? (
            <>
              <Softkey
                label="F1 TYPE"
                onClick={() => {
                  const types = ["SAMPLES", "SLICES", "PROGRAM POOL"] as const;
                  setSourceType(types[(types.indexOf(sourceType) + 1) % types.length]);
                  setSourceIndex(0);
                }}
              />
              <Softkey label="F2 PREV" onClick={() => setSourceIndex((index) => Math.max(index - 1, 0))} />
              <Softkey label="F3 NEXT" onClick={() => setSourceIndex((index) => Math.min(index + 1, Math.max(activeSources.length - 1, 0)))} />
              <Softkey label="F4 PREVIEW" onClick={() => selectedSource !== "---" && previewSource(selectedSource)} />
              <Softkey label="F5 ASSIGN" onClick={() => selectedSource !== "---" && assignSourceToSelectedPad(selectedSource)} />
              <Softkey label="F6 EXIT" onClick={() => setAssignOpen(false)} />
            </>
          ) : softButtons.map((button) => (
            <button
              key={button}
              type="button"
              onClick={() => {
                if (button === "F1 ASSIGN") setAssignOpen(true);
                if (button === "F2 PARAMS") setProgramView("PARAMS");
                if (button === "F3 CHOKE") setProgramView("CHOKE");
                if (button === "F4 FILTER") setProgramView("FILTER");
                if (button === "F5 FX SEND") {
                  // Single source of truth: same popup as MIX screen edits pad.fxBus + fxSendLevel.
                  // Also switch program view to FX so user lands on the FX panel after closing the popup.
                  setProgramView("FX");
                  openFxSendWindow();
                }
                if (button === "F6 SAVE PGM") createProgram();
              }}
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

function AssignColumn({
  title,
  children,
  scrollable,
}: {
  title: string;
  children: ReactNode;
  scrollable?: boolean;
}) {
  if (scrollable) {
    // Two-row grid: header stays pinned, body scrolls. Used by AVAILABLE
    // SOURCES which can hold 64+ entries after a multi-bank CHOP.
    return (
      <div className="grid min-h-0 grid-rows-[auto_1fr] border border-[#46533b] bg-black/20 p-[10px]">
        <p className="border-b border-[#46533b] pb-[6px] text-[#91a477]">{title}</p>
        <div className="grid min-h-0 content-start gap-[8px] overflow-y-auto pt-[8px]">
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className="grid content-start gap-[8px] border border-[#46533b] bg-black/20 p-[10px]">
      <p className="border-b border-[#46533b] pb-[6px] text-[#91a477]">{title}</p>
      {children}
    </div>
  );
}

function AssignSourceList({
  sources,
  sourceIndex,
  onSelect,
}: {
  sources: readonly string[];
  sourceIndex: number;
  onSelect: (index: number) => void;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [sourceIndex]);
  return (
    <>
      {sources.map((source, index) => (
        <button
          key={source}
          ref={index === sourceIndex ? selectedRef : null}
          type="button"
          onClick={() => onSelect(index)}
          className={`text-left ${index === sourceIndex ? "bg-amber-200/10 text-amber-100" : "text-[#d8e3b7] hover:bg-black/30"}`}
        >
          {source}
        </button>
      ))}
    </>
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-[3px]">
      <span className="text-[#91a477]">{label}</span>
      <span className="truncate text-[#eef6d8]">{value}</span>
    </div>
  );
}

function ProgramSwitcher({
  value,
  onPrevious,
  onNext,
  onRename,
}: {
  value: string;
  onPrevious: () => void;
  onNext: () => void;
  onRename: (name: string) => void;
}) {
  return (
    <div className="grid min-w-0 gap-[3px]">
      <span className="text-[#91a477]">PROGRAM</span>
      <div className="grid grid-cols-[24px_1fr_24px] items-center gap-[4px]">
        <BracketButton label="<" onClick={onPrevious} />
        <EditableText
          value={value}
          onCommit={onRename}
          ariaLabel="PROGRAM"
          displayClassName="min-w-0 truncate text-center text-[#eef6d8]"
          editClassName="min-w-0 border border-amber-300/70 bg-black/50 px-[6px] py-[2px] text-center text-[#eef6d8] outline-none"
        />
        <BracketButton label=">" onClick={onNext} />
      </div>
    </div>
  );
}

function Param({
  label,
  value,
  onMinus,
  onPlus,
  editable,
}: {
  label: string;
  value: string | number;
  onMinus: () => void;
  onPlus: () => void;
  editable?: {
    numericValue: number;
    format?: (n: number) => string;
    min?: number;
    max?: number;
    allowDecimal?: boolean;
    allowNegative?: boolean;
    onCommit: (newValue: number) => void;
  };
}) {
  const minusHold = useHoldRepeat(onMinus);
  const plusHold = useHoldRepeat(onPlus);
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-[6px] border border-[#46533b] bg-black/15 px-[3%] py-[2.2%]">
      <span className="text-[#91a477]">{label}</span>
      <button type="button" {...minusHold} className="px-1 text-[#eef6d8]">
        -
      </button>
      {editable ? (
        <span className="min-w-[42px]">
          <EditableNumber
            value={editable.numericValue}
            format={editable.format}
            min={editable.min}
            max={editable.max}
            allowDecimal={editable.allowDecimal}
            allowNegative={editable.allowNegative}
            onCommit={editable.onCommit}
            ariaLabel={label}
          />
        </span>
      ) : (
        <span className="min-w-[42px] text-center text-[#eef6d8]">{value}</span>
      )}
      <button type="button" {...plusHold} className="px-1 text-[#eef6d8]">
        +
      </button>
    </div>
  );
}

function FilterParam({
  label,
  value,
  onPrevious,
  onNext,
  editable,
}: {
  label: string;
  value: string;
  onPrevious: () => void;
  onNext: () => void;
  editable?: {
    numericValue: number;
    format?: (n: number) => string;
    min?: number;
    max?: number;
    allowDecimal?: boolean;
    allowNegative?: boolean;
    onCommit: (newValue: number) => void;
  };
}) {
  return (
    <div className="grid grid-cols-[0.78fr_1fr] items-center gap-[10px] border border-[#46533b] bg-black/15 px-[4%] py-[3%]">
      <span className="text-[#91a477]">{label}</span>
      <div className="grid grid-cols-[24px_1fr_24px] items-center gap-[4px]">
        <BracketButton label="<" onClick={onPrevious} />
        {editable ? (
          <EditableNumber
            value={editable.numericValue}
            format={editable.format}
            min={editable.min}
            max={editable.max}
            allowDecimal={editable.allowDecimal}
            allowNegative={editable.allowNegative}
            onCommit={editable.onCommit}
            ariaLabel={label}
          />
        ) : (
          <button type="button" onClick={onNext} className="truncate text-center text-[#eef6d8]">
            {value}
          </button>
        )}
        <BracketButton label=">" onClick={onNext} />
      </div>
    </div>
  );
}

function BracketButton({ label, onClick }: { label: string; onClick: () => void }) {
  const hold = useHoldRepeat(onClick);
  return (
    <button
      type="button"
      tabIndex={-1}
      {...hold}
      className="border border-[#46533b] bg-black/30 text-center text-[#d8e3b7]"
    >
      {label}
    </button>
  );
}

function MiniAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border border-[#46533b] bg-black/25 px-2 py-2 text-center text-[clamp(8px,0.66vw,10px)] font-semibold tracking-[0.14em] text-[#d8e3b7]"
    >
      {label}
    </button>
  );
}

function formatPan(value: number) {
  if (value === 0) return "C";
  return value < 0 ? `L${Math.abs(value)}` : `R${value}`;
}

function formatChokeGroup(value: number) {
  return value === 0 ? "OFF" : String(value).padStart(2, "0");
}

// Mute Group display formatter. 0 → "OFF"; 1-16 → zero-padded ("01"..."16").
// Used by both the display value and the EditableNumber's format callback so
// the typed-input field shows the same text as the static display.
function formatMuteGroup(value: number) {
  return value === 0 ? "OFF" : String(value).padStart(2, "0");
}

function formatMuteTargets(bank: string, targets: string[]) {
  return targets.length > 0 ? targets.map((target) => `${bank}${target.slice(1)}`).join(", ") : "OFF";
}
