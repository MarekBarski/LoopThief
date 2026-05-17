import { useAppStore } from "../../store/useAppStore";

export function TopBar() {
  const sequence = useAppStore((state) => state.sequence);
  const bpm = useAppStore((state) => state.bpm);
  const swing = useAppStore((state) => state.swing);
  const isSequenceRecording = useAppStore((state) => state.isSequenceRecording);
  const statusItems = [`SEQ ${sequence}`, `BPM ${bpm.toFixed(2)}`, "TC 1/16", `SWING ${swing}%`, "MEM", "AUDIO READY"];

  return (
    <header className="flex h-full w-full items-center justify-between border border-black/60 bg-black/35 px-[1.4%] text-[clamp(10px,0.9vw,14px)] font-semibold uppercase tracking-[0.18em] text-[#d6d0c2] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
      <div className="flex items-center gap-[1.1vw]">
        {statusItems.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>

      <div className="flex items-center gap-[0.5vw] text-[#dfd5c6]">
        <span className={`h-[0.72vw] w-[0.72vw] min-h-[8px] min-w-[8px] ${isSequenceRecording ? "bg-red-500" : "bg-red-900"} shadow-[0_0_6px_rgba(220,38,38,0.55)]`} />
        <span>{isSequenceRecording ? "SEQ REC" : "REC OFF"}</span>
      </div>
    </header>
  );
}
