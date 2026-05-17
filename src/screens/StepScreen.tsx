import { ScreenFrame } from "./ScreenFrame";

export function StepScreen() {
  return (
    <ScreenFrame title="STEP" subtitle="Tracker-inspired sequencing placeholder.">
      <div className="overflow-hidden border border-[#46533b] bg-black/20">
        {["NOTE", "VELOCITY", "FX", "CHANCE", "MICROSHIFT", "SWING"].map((column) => (
          <div key={column} className="grid grid-cols-[160px_1fr] border-b border-[#46533b] last:border-b-0">
            <span className="bg-black/25 px-4 py-3 text-sm tracking-[0.18em] text-[#9cab84]">{column}</span>
            <span className="px-4 py-3 text-sm text-[#667252]">—</span>
          </div>
        ))}
      </div>
    </ScreenFrame>
  );
}
