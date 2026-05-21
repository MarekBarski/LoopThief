import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { ScreenFrame } from "./ScreenFrame";
import { lcdContentHeight, lcdSoftkeyHeight } from "./lcdLayout";
import { EditableNumber } from "../components/EditableNumber";

export function RecordScreen() {
  const isSamplingArmed = useAppStore((state) => state.isSamplingArmed);
  const isSampling = useAppStore((state) => state.isSampling);
  const recordingMs = useAppStore((state) => state.recordingMs);
  const inputSource = useAppStore((state) => state.inputSource);
  const inputLevel = useAppStore((state) => state.inputLevel);
  const threshold = useAppStore((state) => state.threshold);
  const monitorEnabled = useAppStore((state) => state.monitorEnabled);
  const sampleLength = useAppStore((state) => state.sampleLength);
  const freeMemory = useAppStore((state) => state.freeMemory);
  const sampleName = useAppStore((state) => state.sampleName);
  const inputGain = useAppStore((state) => state.inputGain);
  const importStatus = useAppStore((state) => state.importStatus);
  const importMessage = useAppStore((state) => state.importMessage);
  const recordedSamples = useAppStore((state) => state.recordedSamples);
  const tickRecording = useAppStore((state) => state.tickRecording);
  const armSampling = useAppStore((state) => state.armSampling);
  const startSampling = useAppStore((state) => state.startSampling);
  const keepSampling = useAppStore((state) => state.keepSampling);
  const cycleInputSource = useAppStore((state) => state.cycleInputSource);
  const toggleMonitor = useAppStore((state) => state.toggleMonitor);
  const cycleThreshold = useAppStore((state) => state.cycleThreshold);
  const setThreshold = useAppStore((state) => state.setThreshold);
  const adjustInputGain = useAppStore((state) => state.adjustInputGain);
  const setInputGain = useAppStore((state) => state.setInputGain);
  const importWavFile = useAppStore((state) => state.importWavFile);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isSampling) return;
    const interval = window.setInterval(() => tickRecording(100), 100);
    return () => window.clearInterval(interval);
  }, [isSampling, tickRecording]);

  const latestWaveform = recordedSamples.at(-1)?.waveform ?? [];
  const latestSample = recordedSamples.at(-1);
  const softButtons = ["F1 SOURCE", "F2 THRESH", "F3 MONITOR", "F4 ARM", "F5 START", "F6 SAVE"];
  const samplingStatus = isSampling ? "RECORDING" : isSamplingArmed ? "ARMED" : "STOPPED";

  return (
    <ScreenFrame title="RECORD" subtitle="Sampling workstation">
      <div
        className="grid h-full min-h-0 gap-[12px]"
        style={{ gridTemplateRows: `${lcdContentHeight} ${lcdSoftkeyHeight}px` }}
      >
        <div className="grid min-h-0 grid-cols-[0.95fr_1.05fr] gap-[12px] overflow-hidden">
          <section className="grid min-h-0 grid-cols-2 content-start gap-x-[14px] gap-y-[10px] overflow-hidden border border-[#46533b] bg-black/20 p-[14px] text-[clamp(9px,0.72vw,11px)] tracking-[0.12em]">
            <Info label="SOURCE" value={inputSource} />
            <ThresholdInfo
              value={threshold}
              onCommit={(v) => setThreshold(Math.round(v))}
              onCycle={cycleThreshold}
            />
            <Info label="MONITOR" value={monitorEnabled ? "ON" : "OFF"} />
            <Info label="SAMPLE LEN" value={sampleLength} />
            <Info label="FREE MEM" value={freeMemory} />
            <Info label="SAMPLE NAME" value={sampleName} />
            <GainInfo
              value={inputGain}
              onMinus={() => adjustInputGain(-3)}
              onPlus={() => adjustInputGain(3)}
              onCommit={(v) => setInputGain(Math.round(v))}
            />
            <Info label="STATUS" value={samplingStatus} />
            <Info label="IMPORT" value={importStatus} />
            <Info label="IMPORT MSG" value={importMessage} />
          </section>

          <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-[10px] overflow-hidden border border-[#46533b] bg-black/20 p-[14px]">
            <div className="flex items-center justify-between text-[clamp(10px,0.8vw,13px)] tracking-[0.16em]">
              <span className="text-[#91a477]">REC STATUS</span>
              <span className={isSampling ? "text-red-300" : "text-[#eef6d8]"}>
                {isSampling ? formatMs(recordingMs) : samplingStatus}
              </span>
            </div>
            <div className="grid min-h-0 grid-cols-[70px_70px_minmax(0,1fr)] gap-[10px] overflow-hidden">
              <Meter label="L" active={isSampling} level={inputLevel} />
              <Meter label="R" active={isSampling} level={inputLevel} />
              <Waveform bars={latestWaveform} />
            </div>
            <div className="grid grid-cols-2 gap-[10px] border-t border-[#46533b]/70 pt-[8px] text-[clamp(9px,0.72vw,11px)] tracking-[0.14em]">
              <Info label="LAST SAMPLE" value={latestSample?.name ?? "---"} />
              <Info label="LENGTH" value={latestSample ? formatMs(latestSample.durationMs) : "--:--.---"} />
            </div>
          </section>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".wav,audio/wav,audio/x-wav"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = "";
            if (file) void importWavFile(file);
          }}
        />

        <div className="grid grid-cols-6 gap-[1.4%]">
          {softButtons.map((button) => (
            <button
              key={button}
              type="button"
              onClick={() => {
                if (button === "F1 SOURCE") cycleInputSource();
                if (button === "F2 THRESH") cycleThreshold();
                if (button === "F3 MONITOR") toggleMonitor();
                if (button === "F4 ARM") armSampling();
                if (button === "F5 START") startSampling();
                if (button === "F6 SAVE") keepSampling();
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
    <div className="grid min-w-0 gap-[4px]">
      <span className="text-[#91a477]">{label}</span>
      <span className="truncate text-[#eef6d8]">{value}</span>
    </div>
  );
}

function GainInfo({
  value,
  onMinus,
  onPlus,
  onCommit,
}: {
  value: number;
  onMinus: () => void;
  onPlus: () => void;
  onCommit: (newValue: number) => void;
}) {
  return (
    <div className="grid gap-[5%]">
      <span className="text-[#91a477]">INPUT GAIN</span>
      <span className="flex min-w-0 items-center gap-[8px] text-[#eef6d8]">
        <button type="button" tabIndex={-1} onClick={onMinus} className="border border-[#46533b] px-[6px] text-[#d8e3b7]">-</button>
        <EditableNumber
          value={value}
          format={(n) => `${n >= 0 ? "+" : ""}${n} dB`}
          min={-24}
          max={24}
          allowNegative
          onCommit={onCommit}
          ariaLabel="INPUT GAIN"
        />
        <button type="button" tabIndex={-1} onClick={onPlus} className="border border-[#46533b] px-[6px] text-[#d8e3b7]">+</button>
      </span>
    </div>
  );
}

function ThresholdInfo({
  value,
  onCommit,
  onCycle,
}: {
  value: number | "OFF";
  onCommit: (newValue: number) => void;
  onCycle: () => void;
}) {
  return (
    <div className="grid min-w-0 gap-[4px]">
      <span className="text-[#91a477]">THRESHOLD</span>
      {value === "OFF" ? (
        <button
          type="button"
          onClick={onCycle}
          className="truncate text-left text-[#eef6d8]"
          title="Click to enable threshold"
        >
          OFF
        </button>
      ) : (
        <EditableNumber
          value={value}
          format={(n) => `${n} dB`}
          min={-60}
          max={-1}
          allowNegative
          onCommit={onCommit}
          ariaLabel="THRESHOLD"
        />
      )}
    </div>
  );
}

function Meter({ label, active, level: externalLevel }: { label: string; active: boolean; level?: number }) {
  const [level, setLevel] = useState(0.15);
  const [peak, setPeak] = useState(0.18);

  useEffect(() => {
    if (externalLevel != null) {
      const target = active ? externalLevel : 0;
      setLevel(target);
      setPeak((current) => Math.max(target, current * 0.92));
      return;
    }
    const interval = window.setInterval(() => {
      const target = active ? 0.25 + Math.random() * 0.7 : 0.08 + Math.random() * 0.16;
      setLevel(target);
      setPeak((current) => Math.max(target, current * 0.92));
    }, 120);
    return () => window.clearInterval(interval);
  }, [active, externalLevel]);

  return (
    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-[6px]">
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
    <div className="flex min-h-0 min-w-0 items-center gap-[1px] overflow-hidden border border-[#46533b] bg-black/30 px-[8px]">
      {preview.length === 0 ? (
        <span className="mx-auto text-[clamp(9px,0.72vw,11px)] text-[#91a477]">NO SAMPLE</span>
      ) : (
        preview.slice(0, 160).map((value, index) => (
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
