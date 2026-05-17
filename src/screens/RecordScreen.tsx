import { ScreenFrame } from "./ScreenFrame";

export function RecordScreen() {
  return (
    <ScreenFrame title="RECORD" subtitle="Fast capture workspace placeholder.">
      <div className="grid h-full grid-cols-3 gap-4">
        {["SOURCE", "GAIN", "THRESHOLD", "MONITOR", "NORMALIZE", "RECALL BUFFER"].map((item) => (
          <div key={item} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm tracking-[0.18em] text-zinc-300">
            {item}
          </div>
        ))}
      </div>
    </ScreenFrame>
  );
}
