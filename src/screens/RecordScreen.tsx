import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { ScreenFrame } from "./ScreenFrame";

export function RecordScreen() {
  const isSamplingArmed = useAppStore((state) => state.isSamplingArmed);
  const isSampling = useAppStore((state) => state.isSampling);
  const recordingMs = useAppStore((state) => state.recordingMs);
  const inputSource = useAppStore((state) => state.inputSource);
  const threshold = useAppStore((state) => state.threshold);
  const monitorEnabled = useAppStore((state) => state.monitorEnabled);
  const sampleLength = useAppStore((state) => state.sampleLength);
  const freeMemory = useAppStore((state) => state.freeMemory);
  const sampleName = useAppStore((state) => state.sampleName);
  const inputGain = useAppStore((state) => state.inputGain);
  const recordedSamples = useAppStore((state) => state.recordedSamples);
  const tickRecording = useAppStore((state) => state.tickRecording);
  const armSampling = useAppStore((state) => state.armSampling);
  const startSampling = useAppStore((state) => state.startSampling);
  const keepSampling = useAppStore((state) => state.keepSampling);

  useEffect(() => {
    if (!isSampling) return;
    const interval = window.setInterval(() => tickRecording(100), 100);
    return () => window.clearInterval(interval);
  }, [isSampling, tickRecording]);

  const latestWaveform = recordedSamples.at(-1)?.waveform ?? [];
  const softButtons = ["F1 SOURCE", "F2 THRESH", "F3 MONITOR", "F4 ARM", "F5 START", "F6 KEEP"];
  const samplingStatus = isSampling ? "RECORDING" : isSamplingArmed ? "ARMED" : "STOPPED";

  return (
    <ScreenFrame title="RECORD" subtitle="Sampling workstation">
      <div className="grid h-full grid-rows-[1fr_auto] gap-[3%]">
        <div className="grid grid-cols-[1fr_1.05fr] gap-[3%]">
          <section className="grid grid-cols-2 gap-[3%] border border-[#46533b] bg-black/20 p-[3%] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
            <Info label="SOURCE" value={inputSource} />
            <Info label="THRESHOLD" value={`${threshold} dB`} />
            <Info label="MONITOR" value={monitorEnabled ? "ON" : "OFF"} />
            <Info label="SAMPLE LEN" value={sampleLength} />
            <Info label="FREE MEM" value={freeMemory} />
            <Info label="SAMPLE NAME" value={sampleName} />
            <Info label="INPUT GAIN" value={`${inputGain >= 0 ? "+" : ""}${inputGain} dB`} />
            <Info label="STATUS" value={samplingStatus} />
          </section>

          <section className="grid grid-rows-[auto_1fr_auto] gap-[4%] border border-[#46533b] bg-black/20 p-[3%]">
            <div className="flex items-center justify-between text-[clamp(10px,0.8vw,13px)] tracking-[0.16em]">
              <span className="text-[#91a477]">REC STATUS</span>
              <span className={isSampling ? "text-red-300" : "text-[#eef6d8]"}>
                {isSampling ? formatMs(recordingMs) : samplingStatus}
              </span>
            </div>
            <div className="grid grid-cols-[1fr_1fr_1.4fr] gap-[4%]">
              <Meter label="L" active={isSampling} />
              <Meter label="R" active={isSampling} />
              <Waveform bars={latestWaveform} />
            </div>
            <div className="grid gap-[2%] text-[clamp(9px,0.72vw,11px)] tracking-[0.14em]">
              {recordedSamples.slice(-3).map((sample) => (
                <div key={sample.name} className="flex justify-between border-t border-[#46533b]/70 pt-[1.5%]">
                  <span>{sample.name}</span>
                  <span>{formatMs(sample.durationMs)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="grid grid-cols-6 gap-[1.4%]">
          {softButtons.map((button) => (
            <button
              key={button}
              type="button"
              onClick={() => {
                if (button === "F4 ARM") armSampling();
                if (button === "F5 START") startSampling();
                if (button === "F6 KEEP") keepSampling();
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
    <div className="grid gap-[5%]">
      <span className="text-[#91a477]">{label}</span>
      <span className="text-[#eef6d8]">{value}</span>
    </div>
  );
}

function Meter({ label, active }: { label: string; active: boolean }) {
  const [level, setLevel] = useState(0.15);
  const [peak, setPeak] = useState(0.18);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const target = active ? 0.25 + Math.random() * 0.7 : 0.08 + Math.random() * 0.16;
      setLevel(target);
      setPeak((current) => Math.max(target, current * 0.92));
    }, 120);
    return () => window.clearInterval(interval);
  }, [active]);

  return (
    <div className="grid grid-rows-[auto_1fr] gap-[6%]">
      <span className="text-[clamp(9px,0.72vw,11px)] text-[#91a477]">{label}</span>
      <div className="relative overflow-hidden border border-[#46533b] bg-black/30">
        <div className="absolute bottom-0 left-0 w-full bg-[linear-gradient(to_top,#7ea85f_0%,#d0b34d_68%,#b94a38_100%)] transition-[height] duration-100" style={{ height: `${level * 100}%` }} />
        <div className="absolute left-0 h-[2px] w-full bg-[#eef6d8]" style={{ bottom: `${peak * 100}%` }} />
      </div>
    </div>
  );
}

function Waveform({ bars }: { bars: number[] }) {
  const preview = useMemo(() => bars, [bars]);
  return (
    <div className="flex items-center gap-[1px] border border-[#46533b] bg-black/30 px-[3%]">
      {preview.length === 0 ? (
        <span className="mx-auto text-[clamp(9px,0.72vw,11px)] text-[#91a477]">NO SAMPLE</span>
      ) : (
        preview.map((value, index) => (
          <span key={index} className="block w-[2px] bg-[#d8e3b7]" style={{ height: `${value * 100}%` }} />
        ))
      )}
    </div>
  );
}

function formatMs(value: number) {
  const totalSeconds = Math.floor(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.floor(value % 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}
