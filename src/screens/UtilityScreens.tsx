import { useAppStore } from "../store/useAppStore";
import { ScreenFrame } from "./ScreenFrame";
import { lcdContentHeight, lcdSoftkeyHeight } from "./lcdLayout";
import type { ReactNode } from "react";

const shell = (children: ReactNode, softkeys: Softkey[], onExit?: () => void) => (
  <div className="grid h-full gap-[12px]" style={{ gridTemplateRows: `${lcdContentHeight} ${lcdSoftkeyHeight}px` }}>
    <div className="min-h-0 overflow-hidden">{children}</div>
    <Softkeys labels={softkeys} onExit={onExit} />
  </div>
);

export function SixteenLevelsScreen() {
  const enabled = useAppStore((s) => s.sixteenLevelsEnabled);
  const sourcePad = useAppStore((s) => s.sixteenLevelsSourcePad);
  const parameter = useAppStore((s) => s.sixteenLevelsParameter);
  const rootPad = useAppStore((s) => s.sixteenLevelsRootPad);
  const rangeMin = useAppStore((s) => s.sixteenLevelsRangeMin);
  const rangeMax = useAppStore((s) => s.sixteenLevelsRangeMax);
  const cycleSixteenLevelsParameter = useAppStore((s) => s.cycleSixteenLevelsParameter);
  const setSixteenLevelsSourcePad = useAppStore((s) => s.setSixteenLevelsSourcePad);
  const setSixteenLevelsRootPad = useAppStore((s) => s.setSixteenLevelsRootPad);
  const cycleSixteenLevelsRange = useAppStore((s) => s.cycleSixteenLevelsRange);
  const toggleSixteenLevelsEnabled = useAppStore((s) => s.toggleSixteenLevelsEnabled);
  const exit = useAppStore((s) => s.exitUtilityWorkflow);
  return (
    <ScreenFrame title="16 LEVELS" subtitle="Pad parameter spread">
      {shell(
        <div className="grid h-full grid-cols-[0.8fr_1.2fr] gap-[2.3%]">
          <Panel rows={[["SOURCE PAD", sourcePad], ["PARAMETER", parameter], ["ROOT PAD", rootPad], ["RANGE MIN", String(rangeMin)], ["RANGE MAX", String(rangeMax)], ["ACTIVE", enabled ? "ON" : "OFF"]]} />
          <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)]">
            <p className="text-[#91a477]">PREVIEW VALUES</p>
            <div className="grid grid-cols-4 gap-[8px]">
              {Array.from({ length: 16 }, (_, index) => (
                <div key={index} className="border border-[#46533b] bg-black/15 p-[8%]">
                  <span className="block">P{String(index + 1).padStart(2, "0")}</span>
                  <span className={index + 1 === Number(rootPad.slice(1)) ? "text-amber-200" : "text-[#91a477]"}>
                    {Math.round(rangeMin + (index / 15) * (rangeMax - rangeMin))}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>,
        [
          { label: "F1 PARAM", onClick: cycleSixteenLevelsParameter },
          { label: "F2 SOURCE", onClick: setSixteenLevelsSourcePad },
          { label: "F3 ROOT", onClick: setSixteenLevelsRootPad },
          { label: "F4 RANGE", onClick: cycleSixteenLevelsRange },
          { label: "F5 APPLY", onClick: toggleSixteenLevelsEnabled },
          { label: "F6 EXIT", onClick: exit },
        ],
        exit,
      )}
    </ScreenFrame>
  );
}

export function TrackMuteUtilityScreen() {
  const tracks = useAppStore((s) => s.performanceTracks);
  const mode = useAppStore((s) => s.trackMuteMode);
  const setTrackMuteMode = useAppStore((s) => s.setTrackMuteMode);
  const togglePerformanceTrack = useAppStore((s) => s.togglePerformanceTrack);
  const clearTrackMutes = useAppStore((s) => s.clearTrackMutes);
  const exit = useAppStore((s) => s.exitUtilityWorkflow);
  const soloTrack = tracks.find((track) => track.solo)?.name ?? "OFF";
  return (
    <ScreenFrame title="TRACK MUTE" subtitle="Live performance mute">
      {shell(
        <div className="grid h-full grid-cols-[1.15fr_0.7fr] gap-[2.3%]">
          <section className="grid grid-cols-4 grid-rows-4 gap-[8px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(9px,0.72vw,11px)] tracking-[0.12em]">
            {Array.from({ length: 16 }, (_, index) => {
              const track = tracks[index];
              const status = track?.solo ? "SOLO" : track?.muted ? "MUTED" : track ? "LIVE" : "---";
              return (
                <button
                  key={index}
                  type="button"
                  disabled={!track}
                  onClick={() => togglePerformanceTrack(index)}
                  className={`grid content-between border p-[8%] text-left ${
                    track?.solo
                      ? "border-amber-300 bg-amber-200/15 text-amber-100"
                      : track?.muted
                        ? "border-[#46533b] bg-black/25 text-[#70805c]"
                        : track
                          ? "border-[#70845a] bg-[#d8e3b7]/10 text-[#eef6d8]"
                          : "border-[#293225] bg-black/10 text-[#3f4b35]"
                  }`}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <span className="truncate">{track?.name ?? "EMPTY"}</span>
                  <span className="text-[#91a477]">{status}</span>
                </button>
              );
            })}
          </section>
          <Panel rows={[["MODE", mode], ["SOLO TRACK", soloTrack], ["MUTED", String(tracks.filter((track) => track.muted).length).padStart(2, "0")], ["ACTIVE", String(tracks.filter((track) => !track.muted).length).padStart(2, "0")]]} />
        </div>,
        [
          { label: "F1 MUTE", onClick: () => setTrackMuteMode("MUTE") },
          { label: "F2 SOLO", onClick: () => setTrackMuteMode("SOLO") },
          "F3 GROUP",
          { label: "F4 HOLD", onClick: () => setTrackMuteMode("HOLD") },
          { label: "F5 CLEAR", onClick: clearTrackMutes },
          { label: "F6 EXIT", onClick: exit },
        ],
        exit,
      )}
    </ScreenFrame>
  );
}

export function PadMuteUtilityScreen() {
  const bank = useAppStore((s) => s.padBank);
  const pads = useAppStore((s) => s.padMixer[bank]);
  const exit = useAppStore((s) => s.exitUtilityWorkflow);
  return <MuteScreen title="PAD MUTE" items={pads.map((p) => ({ label: p.pad, muted: p.muted }))} softkeys={["F1 MUTE","F2 SOLO","F3 GROUP","F4 HOLD","F5 CLEAR","F6 EXIT"]} onExit={exit} />;
}

export function NextSeqUtilityScreen() {
  const sequences = useAppStore((s) => s.sequences);
  const current = useAppStore((s) => s.currentSequence);
  const queued = useAppStore((s) => s.queuedSequence);
  const queuedBarsRemaining = useAppStore((s) => s.queuedSequenceBarsRemaining);
  const queuePerformanceSequence = useAppStore((s) => s.queuePerformanceSequence);
  const exit = useAppStore((s) => s.exitUtilityWorkflow);
  return (
    <ScreenFrame title="NEXT SEQ" subtitle="Live sequence queue">
      {shell(
        <div className="grid h-full grid-cols-[1.15fr_0.7fr] gap-[2.3%]">
          <section className="grid grid-cols-2 content-start gap-[10px] border border-[#46533b] bg-black/20 p-[4%]">
            {sequences.map((seq) => (
              <button
                key={seq.id}
                type="button"
                onClick={() => queuePerformanceSequence(seq.id)}
                className={`border p-[5%] text-left ${
                  seq.id === queued
                    ? "animate-pulse border-amber-300 bg-amber-200/15 text-amber-100"
                    : seq.id === current
                      ? "border-[#91a477] bg-[#d8e3b7]/10 text-[#eef6d8]"
                      : "border-[#46533b] text-[#d8e3b7]"
                }`}
              >
                <p>{seq.name}</p>
                <p className="text-[#91a477]">{seq.id === queued ? "QUEUED BAR END" : seq.id === current ? "ACTIVE" : "READY"}</p>
              </button>
            ))}
          </section>
          <Panel rows={[
            ["CURRENT", sequences.find((seq) => seq.id === current)?.name ?? "---"],
            ["QUEUED", sequences.find((seq) => seq.id === queued)?.name ?? "---"],
            ["CHANGE AT", queued ? `END OF BAR / ${String(queuedBarsRemaining).padStart(2, "0")}` : "---"],
          ]} />
        </div>,
        ["SELECT PAD","BAR END","ACTIVE","QUEUED","",{ label: "F6 EXIT", onClick: exit }],
        exit,
      )}
    </ScreenFrame>
  );
}

export function NoteRepeatUtilityScreen() {
  const data = useAppStore((s) => s.noteRepeat);
  const timingCorrect = useAppStore((s) => s.timingCorrect);
  const noteRepeatLinkToTC = useAppStore((s) => s.noteRepeatLinkToTC);
  const noteRepeatRate = useAppStore((s) => s.noteRepeatRate);
  const noteRepeatGate = useAppStore((s) => s.noteRepeatGate);
  const noteRepeatTriplet = useAppStore((s) => s.noteRepeatTriplet);
  const cycleNoteRepeatRate = useAppStore((s) => s.cycleNoteRepeatRate);
  const adjustNoteRepeatGate = useAppStore((s) => s.adjustNoteRepeatGate);
  const adjustSwing = useAppStore((s) => s.adjustSwing);
  const toggleNoteRepeatTriplet = useAppStore((s) => s.toggleNoteRepeatTriplet);
  const cycleNoteRepeatVelocityMode = useAppStore((s) => s.cycleNoteRepeatVelocityMode);
  const exit = useAppStore((s) => s.exitUtilityWorkflow);
  return (
    <ScreenFrame title="NOTE REPEAT" subtitle="Repeat timing utility">
      {shell(
        <Panel rows={[
          ["RATE", noteRepeatLinkToTC ? timingCorrect : noteRepeatRate],
          ["GATE", `${noteRepeatGate}%`],
          ["SWING LINK", noteRepeatLinkToTC ? "ON" : "OFF"],
          ["TRIPLET", noteRepeatTriplet ? "ON" : "OFF"],
          ["VELOCITY MODE", data.velocityMode],
        ]} />,
        [
          { label: "F1 RATE", onClick: cycleNoteRepeatRate },
          { label: "F2 GATE", onClick: () => adjustNoteRepeatGate(5) },
          { label: "F3 SWING", onClick: () => adjustSwing(1) },
          { label: "F4 TRIPLET", onClick: toggleNoteRepeatTriplet },
          { label: "F5 VELOCITY", onClick: cycleNoteRepeatVelocityMode },
          { label: "F6 EXIT", onClick: exit },
        ],
      )}
    </ScreenFrame>
  );
}

export function TimingCorrectUtilityScreen() {
  const timingCorrect = useAppStore((s) => s.timingCorrect);
  const swing = useAppStore((s) => s.swing);
  const quantizeStrength = useAppStore((s) => s.quantizeStrength);
  const timingApplyTo = useAppStore((s) => s.timingApplyTo);
  const noteRepeatLinkedToTc = useAppStore((s) => s.noteRepeatLinkedToTc);
  const cycleTimingCorrect = useAppStore((s) => s.cycleTimingCorrect);
  const adjustSwing = useAppStore((s) => s.adjustSwing);
  const adjustQuantizeStrength = useAppStore((s) => s.adjustQuantizeStrength);
  const cycleTimingApplyTo = useAppStore((s) => s.cycleTimingApplyTo);
  const toggleNoteRepeatLink = useAppStore((s) => s.toggleNoteRepeatLink);
  const resetTimingCorrect = useAppStore((s) => s.resetTimingCorrect);
  const exit = useAppStore((s) => s.exitUtilityWorkflow);

  return (
    <ScreenFrame title="TIMING CORRECT" subtitle="Global timing utility">
      {shell(
        <div className="grid h-full grid-cols-[1fr_0.7fr] gap-[2.3%]">
          <Panel rows={[
            ["NOTE VALUE", timingCorrect],
            ["SWING", `${swing}%`],
            ["STRENGTH", `${quantizeStrength}%`],
            ["APPLY TO", timingApplyTo],
            ["NOTE REPEAT LINK", noteRepeatLinkedToTc ? "ON" : "OFF"],
          ]} />
          <section className="grid content-start gap-[8px] border border-[#46533b] bg-black/20 p-[5%] text-[clamp(10px,0.8vw,13px)]">
            <UtilityAction label="SWING +" onClick={() => adjustSwing(1)} />
            <UtilityAction label="SWING -" onClick={() => adjustSwing(-1)} />
            <UtilityAction label="STR +" onClick={() => adjustQuantizeStrength(5)} />
            <UtilityAction label="STR -" onClick={() => adjustQuantizeStrength(-5)} />
            <UtilityAction label={noteRepeatLinkedToTc ? "UNLINK NR" : "LINK NR"} onClick={toggleNoteRepeatLink} />
          </section>
        </div>,
        [
          { label: "F1 NOTE", onClick: cycleTimingCorrect },
          { label: "F2 SWING", onClick: () => adjustSwing(1) },
          { label: "F3 STRENGTH", onClick: () => adjustQuantizeStrength(5) },
          { label: "F4 APPLY", onClick: cycleTimingApplyTo },
          { label: "F5 RESET", onClick: resetTimingCorrect },
          { label: "F6 EXIT", onClick: exit },
        ],
      )}
    </ScreenFrame>
  );
}

export function CountInUtilityScreen() {
  const metronomeEnabled = useAppStore((s) => s.metronomeEnabled);
  const metronomeDuringRecord = useAppStore((s) => s.metronomeDuringRecord);
  const metronomeCountInBars = useAppStore((s) => s.metronomeCountInBars);
  const metronomeVolume = useAppStore((s) => s.metronomeVolume);
  const timingCorrectionCountEnabled = useAppStore((s) => s.timingCorrectionCountEnabled);
  const waitPadCompatEnabled = useAppStore((s) => s.waitPadCompatEnabled);
  const transportPhase = useAppStore((s) => s.transportPhase);
  const transportCountInBeatsRemaining = useAppStore((s) => s.transportCountInBeatsRemaining);
  const toggleMetronomeEnabled = useAppStore((s) => s.toggleMetronomeEnabled);
  const toggleMetronomeDuringRecord = useAppStore((s) => s.toggleMetronomeDuringRecord);
  const adjustMetronomeCountInBars = useAppStore((s) => s.adjustMetronomeCountInBars);
  const adjustMetronomeVolume = useAppStore((s) => s.adjustMetronomeVolume);
  const toggleTimingCorrectionCount = useAppStore((s) => s.toggleTimingCorrectionCount);
  const setActiveScreen = useAppStore((s) => s.setActiveScreen);

  const exitToMain = () => setActiveScreen("MAIN");
  const activeBeat =
    transportPhase === "COUNT_IN" && transportCountInBeatsRemaining > 0
      ? (4 - ((transportCountInBeatsRemaining - 1) % 4)) % 4
      : -1;

  return (
    <ScreenFrame title="COUNT IN / METRONOME" subtitle="Transport utility">
      {shell(
        <div className="grid h-full grid-cols-[1fr_0.62fr] gap-[2.3%]">
          <Panel
            rows={[
              ["METRONOME", metronomeEnabled ? "ON" : "OFF"],
              ["DURING REC", metronomeDuringRecord ? "ON" : "OFF"],
              ["COUNT BARS", String(metronomeCountInBars)],
              ["CLICK VOL", String(metronomeVolume)],
              ["TC COUNT", timingCorrectionCountEnabled ? "ON" : "OFF"],
              ["WAIT PAD COMPAT", waitPadCompatEnabled ? "ON" : "OFF"],
            ]}
          />

          <section className="grid content-start gap-[14px] border border-[#46533b] bg-black/20 p-[6%] text-[clamp(10px,0.8vw,13px)]">
            <p className="text-[#91a477]">METRONOME</p>
            <div className="grid grid-cols-4 gap-[8px]">
              {Array.from({ length: 4 }, (_, index) => (
                <span
                  key={index}
                  className={`h-[18px] border ${
                    index === activeBeat
                      ? "animate-pulse border-[#eef6d8] bg-[#d8e3b7]"
                      : "border-[#46533b] bg-black/20"
                  }`}
                />
              ))}
            </div>
            <div className="border border-[#46533b] bg-black/15 p-[8%]">
              <p className="text-[#91a477]">STATE</p>
              <p className="mt-[6px] text-[#eef6d8]">
                {transportPhase === "COUNT_IN" ? "COUNTING" : "READY"}
              </p>
            </div>
          </section>
        </div>,
        [
          { label: "F1 COUNT", onClick: () => adjustMetronomeCountInBars(1) },
          { label: "F2 CLICK", onClick: toggleMetronomeEnabled },
          { label: "F3 VOL", onClick: () => adjustMetronomeVolume(metronomeVolume >= 100 ? -100 : 10) },
          { label: "F4 TC", onClick: toggleTimingCorrectionCount },
          { label: "F5 REC", onClick: toggleMetronomeDuringRecord },
          { label: "F6 EXIT", onClick: exitToMain },
        ],
      )}
    </ScreenFrame>
  );
}

export function GoToUtilityScreen() {
  const currentBar = useAppStore((s) => s.currentBar);
  const currentStep = useAppStore((s) => s.currentStep);
  const currentEvent = useAppStore((s) => s.currentEvent);
  const sequence = useAppStore((s) => s.sequence);
  const goToTarget = useAppStore((s) => s.goToTarget);
  const setGoToTarget = useAppStore((s) => s.setGoToTarget);
  const adjustGoToValue = useAppStore((s) => s.adjustGoToValue);
  const executeGoTo = useAppStore((s) => s.executeGoTo);
  const exit = useAppStore((s) => s.exitUtilityWorkflow);

  return (
    <ScreenFrame title="GO TO" subtitle="Locate event">
      {shell(
        <div className="grid h-full grid-cols-[1fr_0.72fr] gap-[2.3%]">
          <SelectablePanel
            active={goToTarget}
            rows={[
              ["BAR", String(currentBar).padStart(3, "0")],
              ["STEP", String(currentStep).padStart(2, "0")],
              ["EVENT", String(currentEvent).padStart(3, "0")],
              ["SEQ", `A${sequence.padStart(2, "0")}`],
            ]}
          />
          <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[5%] text-[clamp(10px,0.8vw,13px)]">
            <p className="text-[#91a477]">TARGET</p>
            <p className="text-xl tracking-[0.18em] text-[#eef6d8]">{goToTarget}</p>
            <div className="mt-[8px] grid grid-cols-2 gap-[8px]">
              <UtilityAction label="-" onClick={() => adjustGoToValue(-1)} />
              <UtilityAction label="+" onClick={() => adjustGoToValue(1)} />
            </div>
          </section>
        </div>,
        [
          { label: "F1 BAR", onClick: () => setGoToTarget("BAR") },
          { label: "F2 STEP", onClick: () => setGoToTarget("STEP") },
          { label: "F3 EVENT", onClick: () => setGoToTarget("EVENT") },
          { label: "F4 SEQ", onClick: () => setGoToTarget("SEQ") },
          { label: "F5 EXECUTE", onClick: executeGoTo },
          { label: "F6 EXIT", onClick: exit },
        ],
      )}
    </ScreenFrame>
  );
}

export function EraseUtilityScreen() {
  const eraseMode = useAppStore((s) => s.eraseMode);
  const setEraseMode = useAppStore((s) => s.setEraseMode);
  const executeErase = useAppStore((s) => s.executeErase);
  const exit = useAppStore((s) => s.exitUtilityWorkflow);

  return (
    <ScreenFrame title="ERASE" subtitle="Edit utility">
      {shell(
        <div className="grid h-full grid-cols-[1fr_0.72fr] gap-[2.3%]">
          <SelectablePanel
            active={eraseMode}
            rows={[
              ["PAD", eraseMode === "PAD" ? "ERASE PAD" : ""],
              ["TRACK", eraseMode === "TRACK" ? "ERASE TRACK" : ""],
              ["BAR", eraseMode === "BAR" ? "ERASE BAR" : ""],
              ["EVENTS", eraseMode === "EVENTS" ? "ERASE EVENTS" : ""],
              ["AUTOMATION", eraseMode === "AUTOMATION" ? "ERASE AUTOMATION" : ""],
            ]}
          />
          <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[5%] text-[clamp(10px,0.8vw,13px)]">
            <p className="text-[#91a477]">ARMED MODE</p>
            <p className="text-xl tracking-[0.18em] text-[#eef6d8]">{eraseMode}</p>
            <p className="mt-[8px] leading-relaxed text-[#aab691]">
              Future hold workflow reserved for ERASE + PAD during playback.
            </p>
          </section>
        </div>,
        [
          { label: "F1 PAD", onClick: () => setEraseMode("PAD") },
          { label: "F2 TRACK", onClick: () => setEraseMode("TRACK") },
          { label: "F3 BAR", onClick: () => setEraseMode("BAR") },
          { label: "F4 EVENTS", onClick: () => setEraseMode("EVENTS") },
          { label: "F5 EXECUTE", onClick: executeErase },
          { label: "F6 CANCEL", onClick: exit },
        ],
      )}
    </ScreenFrame>
  );
}

export function UndoUtilityScreen() {
  const undoHistory = useAppStore((s) => s.undoHistory);
  const redoHistory = useAppStore((s) => s.redoHistory);
  const lastAction = useAppStore((s) => s.lastAction);
  const undoLastAction = useAppStore((s) => s.undoLastAction);
  const redoLastAction = useAppStore((s) => s.redoLastAction);
  const clearUndoHistory = useAppStore((s) => s.clearUndoHistory);
  const exit = useAppStore((s) => s.exitUtilityWorkflow);
  const recentActions = [...undoHistory].reverse().slice(0, 4);

  return (
    <ScreenFrame title="UNDO" subtitle="Action history">
      {shell(
        <div className="grid h-full grid-cols-[0.86fr_1.14fr] gap-[2.3%]">
          <Panel
            rows={[
              ["LAST ACTION", lastAction],
              ["UNDO DEPTH", String(undoHistory.length)],
              ["REDO DEPTH", String(redoHistory.length)],
            ]}
          />
          <section className="grid content-start gap-[8px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)]">
            <p className="text-[#91a477]">RECENT OPERATIONS</p>
            {recentActions.map((action, index) => (
              <div key={`${action}-${index}`} className="grid grid-cols-[32px_1fr] border border-[#46533b] bg-black/15 px-[4%] py-[3%]">
                <span className="text-[#91a477]">{index + 1}.</span>
                <span>{action}</span>
              </div>
            ))}
          </section>
        </div>,
        [
          { label: "F1 UNDO", onClick: undoLastAction },
          { label: "F2 REDO", onClick: redoLastAction },
          { label: "F3 CLEAR", onClick: clearUndoHistory },
          { label: "—", onClick: undefined },
          { label: "—", onClick: undefined },
          { label: "F6 EXIT", onClick: exit },
        ],
      )}
    </ScreenFrame>
  );
}

export function SequenceEditUtilityScreen() {
  const sequenceName = useAppStore((s) => s.sequenceName);
  const sequenceLengthBars = useAppStore((s) => s.sequenceLengthBars);
  const timeSignature = useAppStore((s) => s.timeSignature);
  const bpm = useAppStore((s) => s.bpm);
  const createSequence = useAppStore((s) => s.createSequence);
  const duplicateCurrentSequence = useAppStore((s) => s.duplicateCurrentSequence);
  const deleteCurrentSequence = useAppStore((s) => s.deleteCurrentSequence);
  const renameCurrentSequence = useAppStore((s) => s.renameCurrentSequence);
  const exit = useAppStore((s) => s.exitUtilityWorkflow);

  return (
    <ScreenFrame title="SEQUENCE" subtitle="Sequence utility">
      {shell(
        <Panel rows={[
          ["NAME", sequenceName],
          ["BARS", String(sequenceLengthBars).padStart(3, "0")],
          ["TSIG", timeSignature],
          ["BPM", bpm.toFixed(2)],
        ]} />,
        [
          { label: "F1 NEW", onClick: createSequence },
          { label: "F2 DUP", onClick: duplicateCurrentSequence },
          { label: "F3 DELETE", onClick: deleteCurrentSequence },
          { label: "F4 RENAME", onClick: renameCurrentSequence },
          { label: "F5 SONG", onClick: undefined },
          { label: "F6 EXIT", onClick: exit },
        ],
      )}
    </ScreenFrame>
  );
}

function MuteScreen({ title, items, softkeys, onExit }: { title: string; items: { label: string; muted: boolean }[]; softkeys: string[]; onExit: () => void }) {
  return <ScreenFrame title={title} subtitle="Live mute utility">{shell(<div className="grid h-full grid-cols-4 gap-[8px] border border-[#46533b] bg-black/20 p-[4%]">{items.map((item) => <div key={item.label} className={`border p-[8%] ${item.muted ? "border-[#46533b] text-[#70805c]" : "border-[#91a477] text-[#eef6d8]"}`}>{item.label}<br /><span className="text-[#91a477]">{item.muted ? "MUTED" : "LIVE"}</span></div>)}</div>, softkeys, onExit)}</ScreenFrame>;
}

function Panel({ rows }: { rows: [string, string][] }) {
  return <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)]">{rows.map(([a,b])=><div key={a}><p className="text-[#91a477]">{a}</p><p>{b}</p></div>)}</section>;
}

function SelectablePanel({
  active,
  rows,
}: {
  active: string;
  rows: [string, string][];
}) {
  return (
    <section className="grid content-start gap-[8px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)]">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className={`grid grid-cols-[1fr_auto] border px-[4%] py-[3%] ${
            label === active
              ? "border-[#eef6d8] bg-[#d8e3b7]/10 text-[#eef6d8]"
              : "border-[#46533b] text-[#aab691]"
          }`}
        >
          <span>{label}</span>
          <span>{value}</span>
        </div>
      ))}
    </section>
  );
}

function UtilityAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="border border-[#46533b] bg-black/25 px-[3%] py-[10%]">
      {label}
    </button>
  );
}
type Softkey =
  | string
  | {
      label: string;
      onClick?: () => void;
    };

function Softkeys({ labels, onExit }: { labels: Softkey[]; onExit?: () => void }) {
  return (
    <div className="grid grid-cols-6 gap-[1.4%]">
      {labels.map((softkey, index) => {
        const label = typeof softkey === "string" ? softkey : softkey.label;
        const onClick =
          typeof softkey === "string"
            ? label.endsWith("EXIT")
              ? onExit
              : undefined
            : softkey.onClick;

        return (
          <button
            key={index}
            type="button"
            onClick={onClick}
            className="border border-[#46533b] bg-black/25 px-[3%] py-[7%] text-[clamp(8px,0.7vw,11px)]"
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
