import { useState } from "react";
import { ScreenFrame } from "./ScreenFrame";
import { useAppStore } from "../store/useAppStore";
import { useHoldRepeat } from "../components/useHoldRepeat";

const softButtons = ["F1 TC", "F2 SEQ", "F3 TRACK", "F4 PROGRAM", "F5 SONG", "F6 WINDOW"] as const;

export function MainScreen() {
  const sequence = useAppStore((state) => state.sequence);
  const sequenceName = useAppStore((state) => state.sequenceName);
  const sequenceLengthBars = useAppStore((state) => state.sequenceLengthBars);
  const timeSignature = useAppStore((state) => state.timeSignature);
  const bar = useAppStore((state) => state.bar);
  const bpm = useAppStore((state) => state.bpm);
  const swing = useAppStore((state) => state.swing);
  const timingCorrect = useAppStore((state) => state.timingCorrect);
  const activeTrack = useAppStore((state) => state.activeTrack);
  const activeProgram = useAppStore((state) => state.activeProgram);
  const isPlaying = useAppStore((state) => state.isPlaying);
  const isSequenceRecording = useAppStore((state) => state.isSequenceRecording);
  const overdubEnabled = useAppStore((state) => state.overdubEnabled);
  const transportPhase = useAppStore((state) => state.transportPhase);
  const transportAnnouncement = useAppStore((state) => state.transportAnnouncement);
  const metronomeEnabled = useAppStore((state) => state.metronomeEnabled);
  const metronomeDuringRecord = useAppStore((state) => state.metronomeDuringRecord);
  const metronomeCountInBars = useAppStore((state) => state.metronomeCountInBars);
  const previousSequence = useAppStore((state) => state.previousSequence);
  const nextSequence = useAppStore((state) => state.nextSequence);
  const previousTrack = useAppStore((state) => state.previousTrack);
  const nextTrack = useAppStore((state) => state.nextTrack);
  const previousProgram = useAppStore((state) => state.previousProgram);
  const nextProgram = useAppStore((state) => state.nextProgram);
  const adjustSequenceLengthBars = useAppStore((state) => state.adjustSequenceLengthBars);
  const cycleTimeSignature = useAppStore((state) => state.cycleTimeSignature);
  const adjustBpm = useAppStore((state) => state.adjustBpm);
  const adjustSwing = useAppStore((state) => state.adjustSwing);
  const cycleTimingCorrect = useAppStore((state) => state.cycleTimingCorrect);
  const setCurrentSequenceName = useAppStore((state) => state.setCurrentSequenceName);
  const setCurrentTrackName = useAppStore((state) => state.setCurrentTrackName);
  const setCurrentProgramName = useAppStore((state) => state.setCurrentProgramName);
  const openUtilityWorkflow = useAppStore((state) => state.openUtilityWorkflow);
  const setActiveScreen = useAppStore((state) => state.setActiveScreen);

  const status =
    transportPhase === "COUNT_IN"
      ? "COUNT IN"
      : isSequenceRecording
        ? overdubEnabled
          ? "OVERDUB"
          : "REC"
        : isPlaying
          ? "PLAY"
          : "STOP";
  const clickStatus = metronomeEnabled
    ? `CLICK ${metronomeDuringRecord ? "REC" : "COUNT"} ${metronomeCountInBars}BAR`
    : "CLICK OFF";

  return (
    <ScreenFrame title="MAIN" subtitle="MPC-style sequence control">
      <div className="grid h-full grid-rows-[minmax(0,1fr)_44px] gap-[3%] pb-[1%]">
        <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-[3%] border border-[#46533b] bg-black/20 p-[2.6%]">
          <div className="grid grid-cols-[1fr_1.08fr] gap-[4%]">
            <div className="grid gap-[8px]">
              <EditableRow label="SEQ" value={sequenceName} onPrevious={previousSequence} onNext={nextSequence} onRename={setCurrentSequenceName} />
              <EditableRow
                label="TRACK"
                value={activeTrack.replace(/^\d+\s+/, "")}
                onPrevious={previousTrack}
                onNext={nextTrack}
                onRename={setCurrentTrackName}
              />
              <EditableRow label="PROGRAM" value={activeProgram} onPrevious={previousProgram} onNext={nextProgram} onRename={setCurrentProgramName} />
            </div>

            <div className="grid grid-cols-2 gap-x-[5%] gap-y-[8px]">
              <ValueRow label="BARS" value={String(sequenceLengthBars).padStart(3, "0")} onPrevious={() => adjustSequenceLengthBars(-1)} onNext={() => adjustSequenceLengthBars(1)} />
              <ValueRow label="TIME SIG" value={timeSignature} onPrevious={() => cycleTimeSignature(-1)} onNext={() => cycleTimeSignature(1)} />
              <ValueRow label="BPM" value={bpm.toFixed(1)} onPrevious={() => adjustBpm(-1)} onNext={() => adjustBpm(1)} />
              <ValueRow label="SWING" value={String(swing)} onPrevious={() => adjustSwing(-1)} onNext={() => adjustSwing(1)} />
              <ValueRow label="TC" value={timingCorrect} onPrevious={cycleTimingCorrect} onNext={cycleTimingCorrect} />
            </div>
            {timeSignature !== "4/4" && (
              <p className="text-[clamp(8px,0.6vw,10px)] text-amber-300">
                {timeSignature} partially supported — count-in and accent only. Full step grid in future update.
              </p>
            )}
          </div>

          <div className="grid min-h-0 grid-cols-[1fr_0.42fr] items-center gap-[4%] border-t border-[#46533b] pt-[3%]">
            <div>
              <p className="text-[clamp(9px,0.72vw,11px)] tracking-[0.18em] text-[#91a477]">POSITION</p>
              <p className="mt-[4px] font-mono text-[clamp(22px,2.6vw,48px)] leading-none tracking-[0.06em] text-[#d8e3b7]">
                {bar}
              </p>
            </div>
            <div className="grid gap-[10px] text-[clamp(10px,0.8vw,13px)] tracking-[0.16em]">
              <StatusBox label="TRANSPORT" value={status} active={isPlaying || isSequenceRecording || transportPhase === "COUNT_IN"} />
              <StatusBox label="METRO" value={transportAnnouncement || clickStatus} active={metronomeEnabled} />
            </div>
          </div>
        </section>

        <div className="grid grid-cols-6 gap-[1.4%] pt-[0.8%]">
          {softButtons.map((button) => (
            <button
              key={button}
              type="button"
              onClick={() => {
                if (button === "F1 TC") openUtilityWorkflow("TIMING_CORRECT");
                if (button === "F2 SEQ") openUtilityWorkflow("SEQUENCE_EDIT");
                if (button === "F3 TRACK") openUtilityWorkflow("UTILITY_TRACK_MUTE");
                if (button === "F4 PROGRAM") setActiveScreen("PROGRAM");
                if (button === "F5 SONG") openUtilityWorkflow("SONG");
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

function ValueRow({
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
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-[8px] text-[clamp(9px,0.72vw,12px)] tracking-[0.14em]">
      <span className="text-[#91a477]">{label}</span>
      <BracketValue value={value} onPrevious={onPrevious} onNext={onNext} />
    </div>
  );
}

function EditableRow({
  label,
  value,
  onPrevious,
  onNext,
  onRename,
}: {
  label: string;
  value: string;
  onPrevious: () => void;
  onNext: () => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const startEditing = () => {
    setDraft(value);
    setEditing(true);
  };
  const commit = () => {
    onRename(draft);
    setEditing(false);
  };

  return (
    <div className="grid grid-cols-[76px_1fr] items-center gap-[10px] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
      <button type="button" onClick={startEditing} className="text-left text-[#91a477]">
        {label}
      </button>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") setEditing(false);
          }}
          className="min-w-0 border border-[#70845a] bg-black/50 px-[6px] py-[3px] text-[#eef6d8] outline-none"
        />
      ) : (
        <BracketValue value={value} onPrevious={onPrevious} onNext={onNext} onValueClick={startEditing} />
      )}
    </div>
  );
}

function BracketValue({
  value,
  onPrevious,
  onNext,
  onValueClick,
}: {
  value: string;
  onPrevious: () => void;
  onNext: () => void;
  onValueClick?: () => void;
}) {
  return (
    <div className="grid grid-cols-[24px_1fr_24px] items-center gap-[4px]">
      <StepButton label="<" onClick={onPrevious} />
      <button type="button" onClick={onValueClick} className="truncate text-center text-[#eef6d8]">
        {value}
      </button>
      <StepButton label=">" onClick={onNext} />
    </div>
  );
}

function StatusBox({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div className={`border px-[8%] py-[7%] ${active ? "border-amber-300 bg-amber-200/10" : "border-[#46533b] bg-black/20"}`}>
      <p className="text-[#91a477]">{label}</p>
      <p className={active ? "text-amber-100" : "text-[#eef6d8]"}>{value}</p>
    </div>
  );
}

function StepButton({ label, onClick }: { label: string; onClick: () => void }) {
  const hold = useHoldRepeat(onClick);
  return (
    <button type="button" {...hold} className="border border-[#46533b] bg-black/30 text-center text-[#d8e3b7]">
      {label}
    </button>
  );
}
