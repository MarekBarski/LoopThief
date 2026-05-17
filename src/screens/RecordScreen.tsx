import { ScreenFrame } from "./ScreenFrame";

export function RecordScreen() {
  return (
    <ScreenFrame title="RECORD" subtitle="Fast capture workspace placeholder.">
      <div className="grid h-full grid-cols-3 gap-2">
        {["SOURCE", "GAIN", "THRESHOLD", "MONITOR", "NORMALIZE", "RECALL BUFFER"].map((item) => (
          <div key={item} className="border border-[#46533b] bg-black/20 p-3 text-sm tracking-[0.18em] text-[#d7e2b8]">
            {item}
          </div>
        ))}
      </div>
    </ScreenFrame>
  );
}
