import { memo, useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useAppStore } from "../store/useAppStore";
import { samplerEngine } from "../audio/samplerEngine";
import { ScreenFrame } from "./ScreenFrame";
import { lcdContentHeight, lcdSoftkeyHeight } from "./lcdLayout";
import { EditableNumber } from "../components/EditableNumber";

const softButtons = ["F1 MUTE", "F2 SOLO", "F3 FX SEND", "F4", "F5", "F6"];

export function MixScreen() {
  const padBank = useAppStore((state) => state.padBank);
  const selectedPad = useAppStore((state) => state.selectedPad);
  const channels = useAppStore((state) => state.padMixer[padBank]);
  const assignments = useAppStore((state) => state.padAssignments[padBank]);
  // triggeredPads no longer subscribed at screen level — Fix #4 of the
  // Session 37 audit moved per-pad flash state into ChannelStrip's own
  // per-key selector, so a single pad event no longer fans out a
  // re-render across all 16 strips + the header.
  const selectedChannel = channels.find((channel) => channel.pad === selectedPad) ?? channels[0];
  const selectedAssignment = assignments.find((a) => a.pad === selectedPad) ?? assignments[0];
  const setMixerChannelValue = useAppStore((state) => state.setMixerChannelValue);
  const toggleSelectedMixerMute = useAppStore((state) => state.toggleSelectedMixerMute);
  const toggleSelectedMixerSolo = useAppStore((state) => state.toggleSelectedMixerSolo);
  const setPadFxSendLevel = useAppStore((state) => state.setPadFxSendLevel);
  const openFxSendWindow = useAppStore((state) => state.openFxSendWindow);
  const anySolo = channels.some((channel) => channel.solo);
  const padBus = selectedAssignment?.fxBus ?? 0;
  const padSendLevel = selectedAssignment?.fxSendLevel ?? 0;

  return (
    <ScreenFrame title="MIX" subtitle={`Pad mixer / bank ${padBank}`}>
      <div className="grid h-full gap-[12px]" style={{ gridTemplateRows: `${lcdContentHeight} ${lcdSoftkeyHeight}px` }}>
        <div className="grid min-h-0 grid-rows-[auto_1fr] gap-[8px] overflow-hidden">
          <section className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] items-center gap-[10px] border border-[#46533b] bg-black/20 px-[2.2%] py-[1.4%] text-[clamp(9px,0.72vw,11px)] tracking-[0.14em]">
            <span className="text-[#91a477]">BANK {padBank} / 16 PAD CHANNELS</span>
            <span>{selectedChannel.pad}</span>
            <span className="inline-flex items-center gap-[4px]">
              <span>VOL</span>
              <EditableNumber
                value={selectedChannel.level}
                min={0}
                max={127}
                onCommit={(v) => setMixerChannelValue(selectedChannel.pad, "level", Math.round(v))}
                ariaLabel="VOL"
              />
            </span>
            <span className="inline-flex items-center gap-[4px]">
              <span>PAN</span>
              <EditableNumber
                value={selectedChannel.pan}
                format={formatPan}
                min={-50}
                max={50}
                allowNegative
                onCommit={(v) => setMixerChannelValue(selectedChannel.pad, "pan", Math.round(v))}
                ariaLabel="PAN"
              />
            </span>
            <span>FX {padBus === 0 ? "—" : `B${padBus}`}</span>
            <span className="inline-flex items-center gap-[4px]">
              <span>SND</span>
              {padBus === 0 ? (
                <span>—</span>
              ) : (
                <EditableNumber
                  value={padSendLevel}
                  min={0}
                  max={100}
                  onCommit={(v) => setPadFxSendLevel(selectedChannel.pad, Math.round(v))}
                  ariaLabel="SND"
                />
              )}
            </span>
            <span className={selectedChannel.solo ? "text-amber-100" : selectedChannel.muted ? "text-[#91a477]" : ""}>
              {selectedChannel.solo ? "SOLO" : selectedChannel.muted ? "MUTE" : selectedChannel.output}
            </span>
          </section>

          <section className="grid min-h-0 grid-cols-16 gap-[0.6%] border border-[#46533b] bg-black/20 p-[1.2%]">
            {channels.map((channel) => (
              <ChannelStrip
                key={channel.pad}
                pad={channel.pad}
                selected={channel.pad === selectedPad}
                anySolo={anySolo}
              />
            ))}
          </section>
        </div>

        <div className="grid grid-cols-6 gap-[1.4%]">
          {softButtons.map((button) => {
            const isEmpty = button === "F4" || button === "F5" || button === "F6";
            return (
              <button
                key={button}
                type="button"
                disabled={isEmpty}
                onClick={() => {
                  if (button === "F1 MUTE") toggleSelectedMixerMute();
                  if (button === "F2 SOLO") toggleSelectedMixerSolo();
                  if (button === "F3 FX SEND") openFxSendWindow();
                }}
                className={`border border-[#46533b] px-[3%] py-[7%] text-center text-[clamp(8px,0.7vw,11px)] font-semibold tracking-[0.14em] ${
                  isEmpty ? "bg-black/10 text-[#46533b]" : "bg-black/25 text-[#d8e3b7]"
                }`}
              >
                {button}
              </button>
            );
          })}
        </div>
      </div>
    </ScreenFrame>
  );
}

// memo'd + self-subscribing. Parent passes only primitive props
// (pad, selected, anySolo) so React.memo's default shallow compare skips
// re-render unless one of those three actually changes. All channel /
// assignment / triggered data is read via per-key selectors INSIDE the
// strip — Zustand's Object.is comparator gates each selector
// independently, so a level change on pad 7 doesn't ripple into pad 5.
const ChannelStrip = memo(function ChannelStrip({
  pad,
  selected,
  anySolo,
}: {
  pad: string;
  selected: boolean;
  anySolo: boolean;
}) {
  const channel = useAppStore((s) =>
    s.padMixer[s.padBank].find((c) => c.pad === pad),
  );
  const fxBus = useAppStore(
    (s) =>
      (s.padAssignments[s.padBank].find((a) => a.pad === pad)?.fxBus ?? 0) as
        | 0
        | 1
        | 2
        | 3
        | 4,
  );
  const fxSendLevel = useAppStore(
    (s) => s.padAssignments[s.padBank].find((a) => a.pad === pad)?.fxSendLevel ?? 0,
  );
  const meterActive = useAppStore((s) =>
    Boolean(s.triggeredPads[`${s.padBank}:${pad}`]),
  );

  if (!channel) return null;

  const audible = !channel.muted && (!anySolo || channel.solo);
  const meterLevel = audible ? channel.level / 127 : 0;

  // L1 lag fix preserved from Session 36 — direct samplerEngine writes
  // during drag, store commit on release. See that session's SESSION_LOG
  // entry for the full rationale and tradeoffs. `channel.pan` / `channel.level`
  // closure-captured at render time; if values change mid-drag the existing
  // drag instance keeps using its captured snapshot until release, then
  // the next drag picks up fresh values.
  const directAudioLevel = (level: number) => {
    const s = useAppStore.getState();
    const key = s.currentProgramId
      ? `${s.currentProgramId}:${s.padBank}:${pad}`
      : `${s.padBank}:${pad}`;
    samplerEngine.updateChannelMix(key, {
      gain: level / 100,
      pan: channel.pan / 64,
      audible,
    });
  };
  const directAudioPan = (pan: number) => {
    const s = useAppStore.getState();
    const key = s.currentProgramId
      ? `${s.currentProgramId}:${s.padBank}:${pad}`
      : `${s.padBank}:${pad}`;
    samplerEngine.updateChannelMix(key, {
      gain: channel.level / 100,
      pan: pan / 64,
      audible,
    });
  };

  // Action dispatchers — read fresh state per call, no subscriptions.
  const onSelect = () => useAppStore.getState().selectMixerPad(pad);
  const onLevel = (v: number) =>
    useAppStore.getState().setMixerChannelValue(pad, "level", v);
  const onPan = (v: number) =>
    useAppStore.getState().setMixerChannelValue(pad, "pan", v);
  const onFxBusCycle = () => {
    const s = useAppStore.getState();
    const current = s.padAssignments[s.padBank].find((a) => a.pad === pad)?.fxBus ?? 0;
    const next = ((current + 1) % 5) as 0 | 1 | 2 | 3 | 4;
    s.setPadFxBus(pad, next);
  };
  const onSendCommit = (v: number) =>
    useAppStore.getState().setPadFxSendLevel(pad, v);
  const onMute = () => useAppStore.getState().toggleMixerChannelMute(pad);
  const onSolo = () => useAppStore.getState().toggleMixerChannelSolo(pad);

  return (
    <div
      onPointerDown={onSelect}
      className={`grid min-h-0 grid-rows-[auto_auto_1fr_auto_auto_auto_auto_auto] gap-[3px] border px-[3px] py-[4px] text-center text-[clamp(7px,0.56vw,9px)] tracking-[0.08em] ${
        selected ? "border-amber-100 bg-amber-100/10 text-amber-100" : "border-[#46533b] text-[#d8e3b7]"
      } ${audible ? "" : "opacity-45"}`}
    >
      <span>{pad.slice(1)}</span>
      <PanKnob value={channel.pan} onChange={onPan} onDragAudio={directAudioPan} />
      <Fader value={channel.level} onChange={onLevel} onDragAudio={directAudioLevel} />
      <div
        onPointerDown={(event) => event.stopPropagation()}
        className="grid place-items-center"
      >
        <EditableNumber
          value={channel.level}
          min={0}
          max={127}
          onCommit={(v) => onLevel(Math.round(v))}
          ariaLabel="LEVEL"
          className="w-full border-0 bg-transparent text-center text-[#eef6d8] outline-none"
        />
      </div>
      <button
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onFxBusCycle}
        title="Click to cycle FX bus (OF/1/2/3/4)"
        className="border border-[#46533b] bg-black/20 px-[1px]"
      >
        {fxBus === 0 ? "OF" : `B${fxBus}`}
      </button>
      <div
        onPointerDown={(event) => event.stopPropagation()}
        className="grid grid-cols-[auto_1fr] items-center gap-[2px]"
      >
        <span className="text-[#91a477]">S</span>
        {fxBus === 0 ? (
          <span className="text-[#91a477]">—</span>
        ) : (
          <EditableNumber
            value={fxSendLevel}
            min={0}
            max={100}
            onCommit={(v) => onSendCommit(Math.round(v))}
            ariaLabel="SEND"
            className="w-full border-0 bg-transparent text-center text-[#eef6d8] outline-none"
          />
        )}
      </div>
      <Meter active={meterActive} level={meterLevel} />

      <div className="grid grid-cols-2 gap-[2px]">
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onMute}
          className={`border border-[#46533b] ${channel.muted ? "bg-[#d8e3b7] text-black" : "bg-black/20"}`}
        >
          M
        </button>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onSolo}
          className={`border border-[#46533b] ${channel.solo ? "bg-amber-100 text-black" : "bg-black/20"}`}
        >
          S
        </button>
      </div>
    </div>
  );
});

function Fader({
  value,
  onChange,
  onDragAudio,
}: {
  value: number;
  onChange: (value: number) => void;
  onDragAudio?: (value: number) => void;
}) {
  // L1 lag fix — local drag state. Display follows the cursor; only the
  // pointerup commits to the store via onChange. Direct audio is driven
  // by onDragAudio at each pointermove. See ChannelStrip comment for full
  // rationale.
  const [dragValue, setDragValue] = useState<number | null>(null);
  const displayValue = dragValue ?? value;
  return (
    <div
      onPointerDown={(event) =>
        beginVerticalDrag(
          event,
          displayValue,
          (v) => {
            setDragValue(v);
            onDragAudio?.(v);
          },
          0,
          127,
          (finalValue) => {
            onChange(finalValue);
            setDragValue(null);
          },
        )
      }
      className="relative mx-auto h-full min-h-[86px] w-[14px] cursor-ns-resize border border-[#46533b] bg-black/35"
    >
      <div className="absolute inset-x-[3px] bottom-0 bg-[#91a477]" style={{ height: `${(displayValue / 127) * 100}%` }} />
      <div
        className="absolute left-[-3px] right-[-3px] h-[5px] bg-[#eef6d8]"
        style={{ bottom: `calc(${(displayValue / 127) * 100}% - 2px)` }}
      />
    </div>
  );
}

function PanKnob({
  value,
  onChange,
  onDragAudio,
}: {
  value: number;
  onChange: (value: number) => void;
  onDragAudio?: (value: number) => void;
}) {
  const [dragValue, setDragValue] = useState<number | null>(null);
  const displayValue = dragValue ?? value;
  return (
    <div
      onPointerDown={(event) =>
        beginHorizontalDrag(
          event,
          displayValue,
          (v) => {
            setDragValue(v);
            onDragAudio?.(v);
          },
          -50,
          50,
          (finalValue) => {
            onChange(finalValue);
            setDragValue(null);
          },
        )
      }
      className="grid cursor-ew-resize gap-[2px]"
    >
      <div className="relative mx-auto h-[15px] w-[15px] rounded-full border border-[#46533b]">
        <span
          className="absolute left-1/2 top-1/2 h-[6px] w-px origin-bottom bg-[#eef6d8]"
          style={{ transform: `translate(-50%, -100%) rotate(${displayValue * 1.35}deg)` }}
        />
      </div>
      <span>{formatPan(displayValue)}</span>
    </div>
  );
}

function Meter({ active, level: targetLevel }: { active: boolean; level: number }) {
  const [level, setLevel] = useState(0.04);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLevel((current) => {
        const target = active ? Math.max(0.08, targetLevel) : 0;
        return current + (target - current) * (active ? 0.42 : 0.22);
      });
    }, 80);
    return () => window.clearInterval(interval);
  }, [active, targetLevel]);

  return (
    <div className="h-[5px] border border-[#46533b] bg-black/30">
      <div className="h-full bg-[#d8e3b7] transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
    </div>
  );
}

function beginVerticalDrag(
  event: ReactPointerEvent,
  initialValue: number,
  onMove: (value: number) => void,
  min: number,
  max: number,
  onEnd?: (finalValue: number) => void,
) {
  event.preventDefault();
  event.stopPropagation();
  const startY = event.clientY;
  // Track the most-recent dragged value in the closure so onEnd can pass
  // it to the caller (commit-on-release). Without this, onEnd would only
  // know the initialValue.
  let lastValue = initialValue;
  const move = (moveEvent: PointerEvent) => {
    const delta = startY - moveEvent.clientY;
    lastValue = Math.round(clamp(initialValue + delta * 1.2, min, max));
    onMove(lastValue);
  };
  bindDrag(move, () => onEnd?.(lastValue));
}

function beginHorizontalDrag(
  event: ReactPointerEvent,
  initialValue: number,
  onMove: (value: number) => void,
  min: number,
  max: number,
  onEnd?: (finalValue: number) => void,
) {
  event.preventDefault();
  event.stopPropagation();
  const startX = event.clientX;
  let lastValue = initialValue;
  const move = (moveEvent: PointerEvent) => {
    const delta = moveEvent.clientX - startX;
    lastValue = Math.round(clamp(initialValue + delta * 0.7, min, max));
    onMove(lastValue);
  };
  bindDrag(move, () => onEnd?.(lastValue));
}

function bindDrag(move: (event: PointerEvent) => void, onEnd?: () => void) {
  const end = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    onEnd?.();
  };
  window.addEventListener("pointermove", move);
  // Window-bound pointerup fires for releases anywhere on screen — including
  // the case "user drags off the component then releases", so we don't need
  // a separate pointerleave handler. pointerup is the canonical "drag ended"
  // signal.
  window.addEventListener("pointerup", end, { once: true });
}

function formatPan(value: number) {
  if (value === 0) return "C";
  return value < 0 ? `L${Math.abs(value)}` : `R${value}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
