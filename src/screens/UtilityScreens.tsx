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
  const data = useAppStore((s) => s.sixteenLevels);
  const exit = useAppStore((s) => s.exitUtilityWorkflow);
  return (
    <ScreenFrame title="16 LEVELS" subtitle="Pad parameter spread">
      {shell(
        <div className="grid h-full grid-cols-[0.8fr_1.2fr] gap-[2.3%]">
          <Panel rows={[["SOURCE PAD", data.sourcePad], ["PARAMETER", data.parameter], ["RANGE", String(data.range)], ["ROOT PAD", data.rootPad]]} />
          <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)]">
            <p className="text-[#91a477]">PREVIEW VALUES</p>
            <div className="grid grid-cols-4 gap-[8px]">
              {Array.from({ length: 16 }, (_, index) => (
                <div key={index} className="border border-[#46533b] bg-black/15 p-[8%]">
                  <span className="block">P{String(index + 1).padStart(2, "0")}</span>
                  <span className="text-[#91a477]">{Math.round((index / 15) * data.range)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>,
        ["F1 PARAM", "F2 RANGE", "F3 ROOT", "F4 SPREAD", "F5 APPLY", "F6 EXIT"],
        exit,
      )}
    </ScreenFrame>
  );
}

export function TrackMuteUtilityScreen() {
  const tracks = useAppStore((s) => s.performanceTracks);
  const exit = useAppStore((s) => s.exitUtilityWorkflow);
  return <MuteScreen title="TRACK MUTE" items={tracks.map((t) => ({ label: t.name, muted: t.muted }))} softkeys={["F1 MUTE","F2 SOLO","F3 GROUP","F4 HOLD","F5 CLEAR","F6 EXIT"]} onExit={exit} />;
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
  const exit = useAppStore((s) => s.exitUtilityWorkflow);
  return (
    <ScreenFrame title="NEXT SEQ" subtitle="Live sequence queue">
      {shell(
        <div className="grid h-full grid-cols-2 gap-[10px] border border-[#46533b] bg-black/20 p-[4%]">
          {sequences.map((seq) => (
            <div key={seq.id} className={`border p-[5%] ${seq.id === queued ? "border-amber-300 text-amber-100" : seq.id === current ? "border-[#91a477]" : "border-[#46533b]"}`}>
              <p>{seq.name}</p><p className="text-[#91a477]">{seq.id === queued ? "QUEUED" : seq.id === current ? "ACTIVE" : "READY"}</p>
            </div>
          ))}
        </div>,
        ["F1 QUEUE","F2 CHAIN","F3 HOLD","F4 DUP","F5 BPM","F6 EXIT"],
        exit,
      )}
    </ScreenFrame>
  );
}

export function NoteRepeatUtilityScreen() {
  const data = useAppStore((s) => s.noteRepeat);
  const exit = useAppStore((s) => s.exitUtilityWorkflow);
  return (
    <ScreenFrame title="NOTE REPEAT" subtitle="Repeat timing utility">
      {shell(<Panel rows={[["REPEAT RATE", data.rate],["GATE", `${data.gate}%`],["SWING", `${data.swing}%`],["VELOCITY MODE", data.velocityMode],["TIMING CORRECTION", data.timingCorrection]]} />, ["F1 RATE","F2 GATE","F3 SWING","F4 TC","F5 MODE","F6 EXIT"], exit)}
    </ScreenFrame>
  );
}

export function CountInUtilityScreen() {
  const countInMode = useAppStore((s) => s.countInMode);
  const countInClickDuring = useAppStore((s) => s.countInClickDuring);
  const countInClickVolume = useAppStore((s) => s.countInClickVolume);
  const timingCorrectionCountEnabled = useAppStore((s) => s.timingCorrectionCountEnabled);
  const waitPadCompatEnabled = useAppStore((s) => s.waitPadCompatEnabled);
  const transportPhase = useAppStore((s) => s.transportPhase);
  const transportCountInBeatsRemaining = useAppStore((s) => s.transportCountInBeatsRemaining);
  const setCountInMode = useAppStore((s) => s.setCountInMode);
  const cycleCountInClickDuring = useAppStore((s) => s.cycleCountInClickDuring);
  const adjustCountInClickVolume = useAppStore((s) => s.adjustCountInClickVolume);
  const toggleTimingCorrectionCount = useAppStore((s) => s.toggleTimingCorrectionCount);
  const toggleWaitPadCompat = useAppStore((s) => s.toggleWaitPadCompat);
  const setActiveScreen = useAppStore((s) => s.setActiveScreen);

  const nextCountInMode = () => {
    const modes = ["OFF", "1 BAR", "2 BAR", "4 BAR"] as const;
    setCountInMode(modes[(modes.indexOf(countInMode) + 1) % modes.length]);
  };

  const cycleClickVolume = () => {
    adjustCountInClickVolume(countInClickVolume >= 100 ? -100 : 10);
  };

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
              ["COUNT IN", countInMode],
              ["CLICK DURING", countInClickDuring],
              ["CLICK VOL", String(countInClickVolume)],
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
          { label: "F1 COUNT", onClick: nextCountInMode },
          { label: "F2 CLICK", onClick: cycleCountInClickDuring },
          { label: "F3 VOL", onClick: cycleClickVolume },
          { label: "F4 TC", onClick: toggleTimingCorrectionCount },
          { label: "F5 WAIT", onClick: toggleWaitPadCompat },
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
          { label: "F4", onClick: undefined },
          { label: "F5", onClick: undefined },
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
      {labels.map((softkey) => {
        const label = typeof softkey === "string" ? softkey : softkey.label;
        const onClick =
          typeof softkey === "string"
            ? label.endsWith("EXIT")
              ? onExit
              : undefined
            : softkey.onClick;

        return (
          <button
            key={label}
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
