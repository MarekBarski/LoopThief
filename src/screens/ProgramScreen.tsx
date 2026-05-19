import { useMemo, useState, type ReactNode } from "react";
import { useAppStore } from "../store/useAppStore";
import { ScreenFrame } from "./ScreenFrame";
import { lcdContentHeight, lcdSoftkeyHeight } from "./lcdLayout";

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
  const toggleSelectedPadMode = useAppStore((state) => state.toggleSelectedPadMode);
  const toggleSelectedPadVoiceMode = useAppStore((state) => state.toggleSelectedPadVoiceMode);
  const setProgramView = useAppStore((state) => state.setProgramView);
  const cycleMuteTargetMode = useAppStore((state) => state.cycleMuteTargetMode);
  const toggleMuteTargetForSelectedPad = useAppStore((state) => state.toggleMuteTargetForSelectedPad);
  const createProgram = useAppStore((state) => state.createProgram);
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
                <div
                  key={assignment.pad}
                  className={`grid min-h-0 grid-cols-[auto_1fr] content-center gap-x-[8px] border px-[7%] py-[5%] text-[clamp(8px,0.66vw,10px)] tracking-[0.12em] ${
                    assignment.pad === selectedPad
                      ? "border-amber-300 bg-amber-200/10 text-[#f1e7c8]"
                      : "border-[#46533b] bg-black/15 text-[#d8e3b7]"
                  }`}
                >
                  <span>{assignment.pad}</span>
                  <span className="truncate">{assignment.assignment}</span>
                  <span>{assignment.mode}</span>
                  <span>{assignment.level}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-[3%] overflow-hidden border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
            <div className="grid grid-cols-2 gap-[3%] border-b border-[#46533b] pb-[3%]">
              <Info label="PROGRAM" value={activeProgram} />
              <Info label="PAD BANK" value={padBank} />
              <Info label="SELECTED PAD" value={selectedAssignment.pad} />
              <Info label="ASSIGNED" value={selectedAssignment.assignment} />
              <Info label="SOURCE TYPE" value={assignedSourceType} />
              <Info label="SOURCE LIST" value={`${sourceType} ${activeSources.length}`} />
              <Info label="PLAY MODE" value={selectedAssignment.mode} />
              <Info label="POLY / MONO" value={selectedAssignment.voiceMode} />
              <Info label="CHOKE GROUP" value={formatChokeGroup(selectedAssignment.chokeGroup)} />
              <Info label="MUTE TARGETS" value={formatMuteTargets(padBank, selectedAssignment.muteTargets)} />
            </div>

            <div>
              {currentPadMode === "STEP_INPUT" && (
                <div className="border border-amber-300/50 bg-amber-200/10 px-[3%] py-[2.5%] text-amber-100">
                  STEP INPUT MODE: BASE PAD {selectedAssignment.pad}
                </div>
              )}
            </div>

            {programView === "PARAMS" ? (
            <div className="grid content-start grid-cols-2 gap-x-[5%] gap-y-[3%]">
              <Param label="MODE" value={selectedAssignment.mode} onMinus={toggleSelectedPadMode} onPlus={toggleSelectedPadMode} />
              <Param label="VOICE" value={selectedAssignment.voiceMode} onMinus={toggleSelectedPadVoiceMode} onPlus={toggleSelectedPadVoiceMode} />
              <Param
                label="LEVEL"
                value={selectedAssignment.level}
                onMinus={() => updateSelectedPadParam("level", -1)}
                onPlus={() => updateSelectedPadParam("level", 1)}
              />
              <Param
                label="TUNE"
                value={selectedAssignment.tune}
                onMinus={() => updateSelectedPadParam("tune", -1)}
                onPlus={() => updateSelectedPadParam("tune", 1)}
              />
              <Param
                label="PAN"
                value={formatPan(selectedAssignment.pan)}
                onMinus={() => updateSelectedPadParam("pan", -1)}
                onPlus={() => updateSelectedPadParam("pan", 1)}
              />
              <Param
                label="ATTACK"
                value={selectedAssignment.attack}
                onMinus={() => updateSelectedPadParam("attack", -1)}
                onPlus={() => updateSelectedPadParam("attack", 1)}
              />
              <Param
                label="DECAY"
                value={selectedAssignment.decay}
                onMinus={() => updateSelectedPadParam("decay", -1)}
                onPlus={() => updateSelectedPadParam("decay", 1)}
              />
              <Param
                label="CHOKE"
                value={selectedAssignment.chokeGroup}
                onMinus={() => updateSelectedPadParam("chokeGroup", -1)}
                onPlus={() => updateSelectedPadParam("chokeGroup", 1)}
              />
            </div>
            ) : (
              <div className="grid min-h-0 content-start gap-[10px]">
                <div className="grid grid-cols-2 gap-[8px]">
                  <Info label="SELECTED PAD" value={`${padBank}${selectedAssignment.pad.slice(1)}`} />
                  <Info label="MUTE MODE" value={selectedAssignment.muteTargetMode} />
                  <Info label="CHOKE GROUP" value={formatChokeGroup(selectedAssignment.chokeGroup)} />
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
                  In PAIR mode, press hardware pads to add/remove up to two mute targets.
                </p>
              </div>
            )}
          </section>
          {assignOpen && (
            <section className="absolute inset-0 z-20 grid grid-cols-[0.72fr_1fr_0.88fr] gap-[12px] border border-[#91a477] bg-[#090c07]/95 p-[14px] text-[clamp(9px,0.74vw,12px)] tracking-[0.14em]">
              <AssignColumn title="SOURCE TYPE">
                {(["SAMPLES", "SLICES", "PROGRAM POOL"] as const).map((type) => (
                  <p key={type} className={type === sourceType ? "text-amber-200" : "text-[#9cab84]"}>
                    {type}
                  </p>
                ))}
              </AssignColumn>
              <AssignColumn title="AVAILABLE SOURCES">
                {activeSources.length === 0 ? (
                  <p className="text-[#91a477]">--- EMPTY ---</p>
                ) : (
                  activeSources.map((source, index) => (
                    <p key={source} className={index === sourceIndex ? "bg-amber-200/10 text-amber-100" : "text-[#d8e3b7]"}>
                      {source}
                    </p>
                  ))
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

function AssignColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-[8px] border border-[#46533b] bg-black/20 p-[10px]">
      <p className="border-b border-[#46533b] pb-[6px] text-[#91a477]">{title}</p>
      {children}
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-[4%]">
      <span className="text-[#91a477]">{label}</span>
      <span className="truncate text-[#eef6d8]">{value}</span>
    </div>
  );
}

function Param({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string;
  value: string | number;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-[6px] border border-[#46533b] bg-black/15 px-[4%] py-[3%]">
      <span className="text-[#91a477]">{label}</span>
      <button type="button" onClick={onMinus} className="px-1 text-[#eef6d8]">
        -
      </button>
      <span className="min-w-[42px] text-center text-[#eef6d8]">{value}</span>
      <button type="button" onClick={onPlus} className="px-1 text-[#eef6d8]">
        +
      </button>
    </div>
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

function formatMuteTargets(bank: string, targets: string[]) {
  return targets.length > 0 ? targets.map((target) => `${bank}${target.slice(1)}`).join(", ") : "OFF";
}
