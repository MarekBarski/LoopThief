import { useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { ScreenFrame } from "./ScreenFrame";
import { lcdSoftkeyHeight } from "./lcdLayout";
import { EditableNumber } from "../components/EditableNumber";

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
  const setSongStepRepeats = useAppStore((state) => state.setSongStepRepeats);
  const setSongStepBars = useAppStore((state) => state.setSongStepBars);
  const setSongTotalBars = useAppStore((state) => state.setSongTotalBars);
  const exportSongToWav = useAppStore((state) => state.exportSongToWav);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportName, setExportName] = useState("song_export");
  const [exportStatus, setExportStatus] = useState<"idle" | "rendering" | "done" | "error">("idle");
  const [exportMessage, setExportMessage] = useState("");

  const handleExport = async () => {
    setExportStatus("rendering");
    setExportMessage("Rendering…");
    const result = await exportSongToWav(exportName);
    if (result.ok) {
      setExportStatus("done");
      setExportMessage(`Exported ${result.filename}`);
    } else {
      setExportStatus("error");
      setExportMessage(result.reason);
    }
  };

  const closeExport = () => {
    setExportOpen(false);
    setExportStatus("idle");
    setExportMessage("");
  };

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
      <div className="relative flex h-full min-h-0 flex-col gap-[12px]">
        <div
          className="grid min-h-0 flex-1 grid-cols-[1.08fr_0.82fr_0.9fr] gap-[2.3%] overflow-hidden"
          style={{ gridTemplateRows: "minmax(0, 1fr)" }}
        >
          <section className="grid min-h-0 grid-rows-[auto_1fr] border border-[#46533b] bg-black/20">
            <div className="grid grid-cols-[0.55fr_1fr_0.8fr_0.65fr] border-b border-[#46533b] px-[4%] py-[3%] text-[clamp(9px,0.7vw,11px)] text-[#91a477]">
              <span>STEP</span><span>SEQ</span><span>REPEATS</span><span>BARS</span>
            </div>
            <div className="grid content-start min-h-0 overflow-y-auto">
              {songSteps.map((step, index) => {
                const sequence = sequences.find((item) => item.id === step.sequenceId);
                const active = index === selectedSongStepIndex;
                const playing = index === currentSongStepIndex;
                const stepBars = (sequence?.lengthBars ?? 0) * step.repeats;
                return (
                  <div
                    key={`${step.sequenceId}-${index}`}
                    onPointerDown={() => useAppStore.setState({ selectedSongStepIndex: index })}
                    className={`grid grid-cols-[0.55fr_1fr_0.8fr_0.65fr] items-center px-[4%] py-[3%] text-left text-[clamp(9px,0.72vw,11px)] ${
                      active ? "bg-amber-200/15 text-amber-100" : playing ? "bg-[#d8e3b7]/10 text-[#eef6d8]" : "text-[#aab691]"
                    }`}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <span>{sequence?.name ?? "---"}</span>
                    <EditableNumber
                      value={step.repeats}
                      format={(n) => String(n).padStart(2, "0")}
                      min={1}
                      max={99}
                      onCommit={(v) => setSongStepRepeats(index, Math.round(v))}
                      ariaLabel={`REPEATS step ${index + 1}`}
                    />
                    <EditableNumber
                      value={stepBars}
                      format={(n) => String(n).padStart(3, "0")}
                      min={1}
                      max={999}
                      onCommit={(v) => setSongStepBars(index, Math.round(v))}
                      ariaLabel={`BARS step ${index + 1}`}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          <section className="grid min-h-0 content-start gap-[10px] overflow-y-auto border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)]">
            <div className="grid gap-[4%]">
              <span className="text-[#91a477]">TOTAL BARS</span>
              <EditableNumber
                value={totalBars}
                format={(n) => String(n).padStart(3, "0")}
                min={1}
                max={999}
                onCommit={(v) => setSongTotalBars(Math.round(v))}
                ariaLabel="TOTAL BARS"
              />
            </div>
            <Info label="SONG POS" value={`${String(currentSongStepIndex + 1).padStart(2, "0")}.${String(currentSongRepeat).padStart(2, "0")}`} />
            <Info label="CURRENT SEQ" value={currentSequence?.name ?? "---"} />
            <Info label="NEXT SEQ" value={nextSequence?.name ?? "---"} />
            <Info label="LIVE TRACKS" value={`${String(liveTrackCount).padStart(2, "0")}/${String(performanceTracks.length).padStart(2, "0")}`} />
          </section>

          <section className="grid min-h-0 content-start gap-[10px] overflow-y-auto border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)]">
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
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              className="mt-[6px] border border-amber-300 bg-amber-200/10 px-[6%] py-[8%] text-center text-[clamp(10px,0.86vw,13px)] font-semibold tracking-[0.18em] text-amber-100 hover:bg-amber-200/20"
            >
              WAV
            </button>
          </section>
        </div>

        <div
          className="grid flex-none grid-cols-6 gap-[1.4%]"
          style={{ height: lcdSoftkeyHeight }}
        >
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
        {exportOpen && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-black/55 p-[5%]">
            <section className="w-[min(440px,80%)] border border-[#91a477] bg-[#0a0d08] p-[18px] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em] shadow-[0_0_20px_rgba(0,0,0,0.6)]">
              <p className="mb-[12px] text-[#eef6d8]">EXPORT SONG TO WAV</p>
              <label className="grid grid-cols-[1fr_1.4fr] items-center gap-[10px]">
                <span className="text-[#91a477]">FILENAME</span>
                <input
                  type="text"
                  value={exportName}
                  onChange={(event) => setExportName(event.target.value)}
                  disabled={exportStatus === "rendering"}
                  className="min-w-0 border border-[#46533b] bg-black/40 px-[6px] py-[3px] text-[#eef6d8] outline-none focus:border-amber-300"
                />
              </label>
              <p className="mt-[10px] text-[10px] text-[#91a477]">
                48 kHz · 16-bit · stereo · 3 s tail · master volume applied. FX bus
                rendering not in MVP scope (deferred).
              </p>
              {exportMessage && (
                <p
                  className={`mt-[10px] text-[10px] ${
                    exportStatus === "error" ? "text-red-300" : exportStatus === "done" ? "text-amber-200" : "text-[#d8e3b7]"
                  }`}
                >
                  {exportMessage}
                </p>
              )}
              <div className="mt-[14px] grid grid-cols-2 gap-[10px]">
                <button
                  type="button"
                  onClick={() => void handleExport()}
                  disabled={exportStatus === "rendering"}
                  className="border border-amber-300 bg-amber-200/10 px-[10px] py-[8px] text-amber-100 hover:bg-amber-200/20 disabled:opacity-50"
                >
                  {exportStatus === "rendering" ? "RENDERING…" : "DO IT"}
                </button>
                <button
                  type="button"
                  onClick={closeExport}
                  className="border border-[#46533b] bg-black/25 px-[10px] py-[8px] text-[#d8e3b7] hover:border-amber-300"
                >
                  {exportStatus === "done" ? "CLOSE" : "CANCEL"}
                </button>
              </div>
            </section>
          </div>
        )}
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
