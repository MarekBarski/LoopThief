import { useAppStore } from "../store/useAppStore";
import { ScreenFrame } from "./ScreenFrame";
import { lcdContentHeight, lcdSoftkeyHeight } from "./lcdLayout";

const softButtons = ["F1 INSERT", "F2 DELETE", "F3 REPEAT", "F4 MOVE", "F5 CONVERT", "F6 EXIT"];

export function SongScreen() {
  const songSteps = useAppStore((state) => state.songSteps);
  const sequences = useAppStore((state) => state.sequences);
  const selectedSongStepIndex = useAppStore((state) => state.selectedSongStepIndex);
  const currentSongStepIndex = useAppStore((state) => state.currentSongStepIndex);
  const currentSongRepeat = useAppStore((state) => state.currentSongRepeat);
  const insertSongStep = useAppStore((state) => state.insertSongStep);
  const deleteSelectedSongStep = useAppStore((state) => state.deleteSelectedSongStep);
  const adjustSelectedSongRepeats = useAppStore((state) => state.adjustSelectedSongRepeats);
  const moveSelectedSongStep = useAppStore((state) => state.moveSelectedSongStep);
  const cycleSelectedSongSequence = useAppStore((state) => state.cycleSelectedSongSequence);
  const cycleSelectedSongSequenceBack = useAppStore((state) => state.cycleSelectedSongSequenceBack);
  const convertSongToSequence = useAppStore((state) => state.convertSongToSequence);
  const setActiveScreen = useAppStore((state) => state.setActiveScreen);
  const performanceTracks = useAppStore((state) => state.performanceTracks);

  const selectedStep = songSteps[selectedSongStepIndex] ?? songSteps[0];
  const currentStep = songSteps[currentSongStepIndex] ?? songSteps[0];
  const totalBars = songSteps.reduce((sum, step) => {
    const sequence = sequences.find((item) => item.id === step.sequenceId);
    return sum + (sequence?.lengthBars ?? 0) * step.repeats;
  }, 0);
  const currentSequence = sequences.find((sequence) => sequence.id === currentStep.sequenceId);
  const nextStep = songSteps[(currentSongStepIndex + 1) % songSteps.length];
  const nextSequence = sequences.find((sequence) => sequence.id === nextStep?.sequenceId);
  const liveTrackCount = performanceTracks.filter((track) => !track.muted).length;

  return (
    <ScreenFrame title="SONG" subtitle="MPC-style song mode">
      <div className="grid h-full gap-[12px]" style={{ gridTemplateRows: `${lcdContentHeight} ${lcdSoftkeyHeight}px` }}>
        <div className="grid min-h-0 grid-cols-[1.08fr_0.82fr_0.9fr] gap-[2.3%] overflow-hidden">
          <section className="grid min-h-0 grid-rows-[auto_1fr] border border-[#46533b] bg-black/20">
            <div className="grid grid-cols-[0.55fr_1fr_0.8fr_0.65fr] border-b border-[#46533b] px-[4%] py-[3%] text-[clamp(9px,0.7vw,11px)] text-[#91a477]">
              <span>STEP</span><span>SEQ</span><span>REPEATS</span><span>BARS</span>
            </div>
            <div className="grid content-start">
              {songSteps.map((step, index) => {
                const sequence = sequences.find((item) => item.id === step.sequenceId);
                const active = index === selectedSongStepIndex;
                const playing = index === currentSongStepIndex;
                return (
                  <button
                    key={`${step.sequenceId}-${index}`}
                    type="button"
                    className={`grid grid-cols-[0.55fr_1fr_0.8fr_0.65fr] px-[4%] py-[3%] text-left text-[clamp(9px,0.72vw,11px)] ${
                      active ? "bg-amber-200/15 text-amber-100" : playing ? "bg-[#d8e3b7]/10 text-[#eef6d8]" : "text-[#aab691]"
                    }`}
                    onClick={() => useAppStore.setState({ selectedSongStepIndex: index })}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <span>{sequence?.name ?? "---"}</span>
                    <span>{String(step.repeats).padStart(2, "0")}</span>
                    <span>{String((sequence?.lengthBars ?? 0) * step.repeats).padStart(3, "0")}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)]">
            <Info label="TOTAL BARS" value={String(totalBars).padStart(3, "0")} />
            <Info label="SONG POS" value={`${String(currentSongStepIndex + 1).padStart(2, "0")}.${String(currentSongRepeat).padStart(2, "0")}`} />
            <Info label="CURRENT SEQ" value={currentSequence?.name ?? "---"} />
            <Info label="NEXT SEQ" value={nextSequence?.name ?? "---"} />
            <Info label="LIVE TRACKS" value={`${String(liveTrackCount).padStart(2, "0")}/${String(performanceTracks.length).padStart(2, "0")}`} />
          </section>

          <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)]">
            <Info label="SELECTED STEP" value={String(selectedSongStepIndex + 1).padStart(2, "0")} />
            <Info label="SEQUENCE" value={sequences.find((item) => item.id === selectedStep.sequenceId)?.name ?? "---"} />
            <Info label="REPEATS" value={String(selectedStep.repeats).padStart(2, "0")} />
            <div className="grid grid-cols-2 gap-[8px] pt-[4px]">
              <Action label="SEQ +" onClick={cycleSelectedSongSequence} />
              <Action label="SEQ -" onClick={cycleSelectedSongSequenceBack} />
              <Action label="REP +" onClick={() => adjustSelectedSongRepeats(1)} />
              <Action label="REP -" onClick={() => adjustSelectedSongRepeats(-1)} />
              <Action label="UP" onClick={() => moveSelectedSongStep(-1)} />
              <Action label="DOWN" onClick={() => moveSelectedSongStep(1)} />
            </div>
          </section>
        </div>

        <div className="grid grid-cols-6 gap-[1.4%]">
          {softButtons.map((button) => (
            <button
              key={button}
              type="button"
              onClick={() => {
                if (button === "F1 INSERT") insertSongStep();
                if (button === "F2 DELETE") deleteSelectedSongStep();
                if (button === "F3 REPEAT") adjustSelectedSongRepeats(1);
                if (button === "F4 MOVE") moveSelectedSongStep(1);
                if (button === "F5 CONVERT") convertSongToSequence();
                if (button === "F6 EXIT") setActiveScreen("MAIN");
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-[4%]">
      <span className="text-[#91a477]">{label}</span>
      <span className="text-[#eef6d8]">{value}</span>
    </div>
  );
}

function Action({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="border border-[#46533b] bg-black/25 px-[3%] py-[8%]">
      {label}
    </button>
  );
}
