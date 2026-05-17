import { ScreenFrame } from "./ScreenFrame";

export function ChopScreen() {
  return (
    <ScreenFrame title="CHOP" subtitle="Large sample slicing area placeholder.">
      <div className="grid h-full grid-cols-[1fr_220px] gap-2">
        <div className="flex items-center justify-center border border-dashed border-[#46533b] bg-black/20 text-sm tracking-[0.2em] text-[#9cab84]">
          WAVEFORM PLACEHOLDER
        </div>
        <div className="border border-[#46533b] bg-black/20 p-3 text-sm text-[#d7e2b8]">
          PAD ASSIGNMENT PREVIEW
        </div>
      </div>
    </ScreenFrame>
  );
}
