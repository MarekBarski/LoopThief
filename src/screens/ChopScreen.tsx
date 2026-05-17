import { ScreenFrame } from "./ScreenFrame";

export function ChopScreen() {
  return (
    <ScreenFrame title="CHOP" subtitle="Large sample slicing area placeholder.">
      <div className="grid h-full grid-cols-[1fr_220px] gap-4">
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/70 text-sm tracking-[0.2em] text-zinc-500">
          WAVEFORM PLACEHOLDER
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-300">
          PAD ASSIGNMENT PREVIEW
        </div>
      </div>
    </ScreenFrame>
  );
}
