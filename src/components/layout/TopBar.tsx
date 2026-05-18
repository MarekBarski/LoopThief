import { useAppStore } from "../../store/useAppStore";

export function TopBar() {
  const sequence = useAppStore((state) => state.sequence);
  const bpm = useAppStore((state) => state.bpm);
  const swing = useAppStore((state) => state.swing);
  const timingCorrect = useAppStore((state) => state.timingCorrect);
  const eraseHoldActive = useAppStore((state) => state.eraseHoldActive);
  const lastEraseMessage = useAppStore((state) => state.lastEraseMessage);
  const lastErasedCount = useAppStore((state) => state.lastErasedCount);
  const noteRepeatEnabled = useAppStore((state) => state.noteRepeatEnabled);
  const noteRepeatRate = useAppStore((state) => state.noteRepeatRate);
  const sixteenLevelsEnabled = useAppStore((state) => state.sixteenLevelsEnabled);
  const sixteenLevelsParameter = useAppStore((state) => state.sixteenLevelsParameter);
  const lastTriggeredPad = useAppStore((state) => state.lastTriggeredPad);
  const lastSixteenLevelsValue = useAppStore((state) => state.lastSixteenLevelsValue);
  const lastPerformanceMessage = useAppStore((state) => state.lastPerformanceMessage);
  const isSequenceRecording = useAppStore((state) => state.isSequenceRecording);
  const audioStatus = useAppStore((state) => state.audioStatus);
  const lastAudioMessage = useAppStore((state) => state.lastAudioMessage);
  const statusItems = [
    `SEQ ${sequence}`,
    `BPM ${bpm.toFixed(2)}`,
    `TC ${timingCorrect}`,
    `SWING ${swing}%`,
    "MEM",
    audioStatus === "ERROR" ? "AUDIO ERROR" : audioStatus === "READY" ? "AUDIO READY" : "AUDIO IDLE",
  ];

  return (
    <header className="flex h-full w-full items-center justify-between border border-black/60 bg-black/35 px-[1.4%] text-[clamp(10px,0.9vw,14px)] font-semibold uppercase tracking-[0.18em] text-[#d6d0c2] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
      <div className="flex items-center gap-[1.1vw]">
        {statusItems.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>

      <div className="flex items-center gap-[0.5vw] text-[#dfd5c6]">
        {lastEraseMessage && (
          <span className="text-amber-200">
            {eraseHoldActive ? lastEraseMessage : `${lastEraseMessage} · ERASED EVENTS: ${lastErasedCount}`}
          </span>
        )}
        {lastPerformanceMessage && <span className="text-amber-200">{lastPerformanceMessage}</span>}
        {lastAudioMessage && <span className="text-amber-200">{lastAudioMessage}</span>}
        {noteRepeatEnabled && <span className="text-amber-200">NR {noteRepeatRate}</span>}
        {sixteenLevelsEnabled && (
          <span className="text-amber-200">
            16LV {lastTriggeredPad} {sixteenLevelsParameter} {sixteenLevelsParameter === "TUNE" && lastSixteenLevelsValue > 0 ? `+${lastSixteenLevelsValue}` : lastSixteenLevelsValue}
          </span>
        )}
        <span className={`h-[0.72vw] w-[0.72vw] min-h-[8px] min-w-[8px] ${isSequenceRecording ? "bg-red-500" : "bg-red-900"} shadow-[0_0_6px_rgba(220,38,38,0.55)]`} />
        <span>{isSequenceRecording ? "SEQ REC" : "REC OFF"}</span>
      </div>
    </header>
  );
}
