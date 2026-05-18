import { useEffect, useMemo } from "react";
import { useAppStore } from "../store/useAppStore";
import { ScreenFrame } from "./ScreenFrame";

const softButtons = ["F1 SAMPLE", "F2 ZOOM", "F3 SLICE", "F4 ADD", "F5 DELETE", "F6 ASSIGN"];

export function ChopScreen() {
  const recordedSamples = useAppStore((state) => state.recordedSamples);
  const chopSelectedSampleIndex = useAppStore((state) => state.chopSelectedSampleIndex);
  const chopMarkers = useAppStore((state) => state.chopMarkers);
  const selectedSlice = useAppStore((state) => state.selectedSlice);
  const chopCursor = useAppStore((state) => state.chopCursor);
  const bpm = useAppStore((state) => state.bpm);
  const normalizeEnabled = useAppStore((state) => state.normalizeEnabled);
  const selectedPad = useAppStore((state) => state.selectedPad);
  const padBank = useAppStore((state) => state.padBank);
  const selectedPadAssignment = useAppStore(
    (state) => state.padAssignments[state.padBank].find((pad) => pad.pad === state.selectedPad)?.assignment ?? "---",
  );
  const isPlaying = useAppStore((state) => state.isPlaying);
  const tickChopPlayback = useAppStore((state) => state.tickChopPlayback);
  const nextSlice = useAppStore((state) => state.nextSlice);
  const previousSlice = useAppStore((state) => state.previousSlice);
  const moveSelectedMarker = useAppStore((state) => state.moveSelectedMarker);
  const addSlice = useAppStore((state) => state.addSlice);
  const removeSlice = useAppStore((state) => state.removeSlice);
  const assignCurrentSliceToSelectedPad = useAppStore((state) => state.assignCurrentSliceToSelectedPad);

  const sample = recordedSamples[chopSelectedSampleIndex] ?? recordedSamples.at(-1);
  const waveform = useMemo(() => sample?.waveform ?? [], [sample]);
  const selectedStart = chopMarkers[selectedSlice - 1] ?? 0;
  const selectedEnd = chopMarkers[selectedSlice] ?? 1;

  useEffect(() => {
    if (!isPlaying) return;
    const interval = window.setInterval(() => tickChopPlayback(0.01), 50);
    return () => window.clearInterval(interval);
  }, [isPlaying, tickChopPlayback]);

  return (
    <ScreenFrame title="CHOP" subtitle="Sample slicing">
      <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] gap-[2.5%]">
        <div className="grid grid-cols-[1fr_auto] gap-[3%] border border-[#46533b] bg-black/20 px-[2.5%] py-[1.7%] text-[clamp(10px,0.82vw,13px)] tracking-[0.14em]">
          <div className="grid grid-cols-4 gap-[3%]">
            <Info label="SAMPLE" value={sample?.name ?? "NO SAMPLE"} />
            <Info label="LENGTH" value={sample ? formatMs(sample.durationMs) : "--:--.---"} />
            <Info label="SLICES" value={String(chopMarkers.length).padStart(2, "0")} />
            <Info label="CURRENT" value={String(selectedSlice).padStart(2, "0")} />
          </div>
          <div className="grid grid-cols-3 gap-[16px]">
            <Info label="START" value={formatPercent(selectedStart)} />
            <Info label="END" value={formatPercent(selectedEnd)} />
            <Info label="BPM EST" value={sample ? bpm.toFixed(2) : "--.--"} />
          </div>
        </div>

        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_180px] gap-[2.5%]">
          <section className="relative min-h-0 overflow-hidden border border-[#46533b] bg-black/25">
            {waveform.length === 0 ? (
              <div className="flex h-full items-center justify-center text-[clamp(10px,0.8vw,13px)] tracking-[0.18em] text-[#91a477]">
                RECORD A SAMPLE TO BEGIN CHOPPING
              </div>
            ) : (
              <>
                <div className="absolute inset-[5%_2.5%_11%] flex items-center gap-[2px]">
                  {waveform.concat(waveform).map((value, index) => (
                    <span
                      key={index}
                      className="block min-w-[2px] flex-1 bg-[#d8e3b7]"
                      style={{ height: `${18 + value * 72}%`, opacity: index % 2 === 0 ? 0.98 : 0.78 }}
                    />
                  ))}
                </div>

                <div
                  className="absolute inset-y-[4%] w-[2px] bg-[#eef6d8] shadow-[0_0_8px_rgba(238,246,216,0.55)]"
                  style={{ left: `${chopCursor * 100}%` }}
                />

                {chopMarkers.map((marker, index) => (
                  <div key={`${marker}-${index}`} className="absolute inset-y-0" style={{ left: `${marker * 100}%` }}>
                    <div
                      className={`h-full w-[2px] ${
                        index + 1 === selectedSlice ? "bg-amber-300" : "bg-[#7f9560]"
                      }`}
                    />
                    <span
                      className={`absolute left-2 top-[4%] text-[clamp(8px,0.68vw,10px)] tracking-[0.14em] ${
                        index + 1 === selectedSlice ? "text-amber-200" : "text-[#9cab84]"
                      }`}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                ))}

                <div className="absolute inset-x-[2.5%] bottom-[3%] flex justify-between text-[clamp(8px,0.68vw,10px)] tracking-[0.18em] text-[#91a477]">
                  <span>0%</span>
                  <span>25%</span>
                  <span>50%</span>
                  <span>75%</span>
                  <span>100%</span>
                </div>
              </>
            )}
          </section>

          <aside className="grid content-start gap-[7%] border border-[#46533b] bg-black/20 p-[7%] text-[clamp(10px,0.78vw,12px)] tracking-[0.14em]">
            <Info label="NORMALIZE" value={normalizeEnabled ? "ON" : "OFF"} />
            <Info label="CURSOR" value={formatPercent(chopCursor)} />
            <Info label="TARGET PAD" value={`${padBank}:${selectedPad}`} />
            <Info label="ASSIGNED" value={selectedPadAssignment} />
            <div className="grid grid-cols-2 gap-[8px]">
              <MiniButton label="PREV" onClick={previousSlice} />
              <MiniButton label="NEXT" onClick={nextSlice} />
              <MiniButton label="MARK -" onClick={() => moveSelectedMarker(-0.01)} />
              <MiniButton label="MARK +" onClick={() => moveSelectedMarker(0.01)} />
            </div>
          </aside>
        </div>

        <div className="grid grid-cols-6 gap-[1.4%]">
          {softButtons.map((button) => (
            <button
              key={button}
              type="button"
              onClick={() => {
                if (button === "F4 ADD") addSlice();
                if (button === "F5 DELETE") removeSlice();
                if (button === "F6 ASSIGN") assignCurrentSliceToSelectedPad();
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

function MiniButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border border-[#46533b] bg-black/25 px-2 py-2 text-center text-[clamp(8px,0.66vw,10px)] font-semibold tracking-[0.14em] text-[#d8e3b7]"
    >
      {label}
    </button>
  );
}

function formatMs(value: number) {
  const totalSeconds = Math.floor(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.floor(value % 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function formatPercent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}
