import { ScreenFrame } from "./ScreenFrame";

export function StepScreen() {
  return (
    <ScreenFrame title="STEP" subtitle="Tracker-inspired sequencing placeholder.">
      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/70">
        {["NOTE", "VELOCITY", "FX", "CHANCE", "MICROSHIFT", "SWING"].map((column) => (
          <div key={column} className="grid grid-cols-[160px_1fr] border-b border-zinc-800 last:border-b-0">
            <span className="bg-zinc-900 px-4 py-3 text-sm tracking-[0.18em] text-zinc-400">{column}</span>
            <span className="px-4 py-3 text-sm text-zinc-600">—</span>
          </div>
        ))}
      </div>
    </ScreenFrame>
  );
}
