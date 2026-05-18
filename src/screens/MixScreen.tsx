import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useAppStore } from "../store/useAppStore";
import { ScreenFrame } from "./ScreenFrame";
import { lcdContentHeight, lcdSoftkeyHeight } from "./lcdLayout";

const softButtons = ["F1 PAD MIX", "F2 BANK", "F3 MUTE", "F4 SOLO", "F5 FX SEND", "F6 OUTPUT"];

export function MixScreen() {
  const padBank = useAppStore((state) => state.padBank);
  const selectedPad = useAppStore((state) => state.selectedPad);
  const channels = useAppStore((state) => state.padMixer[padBank]);
  const triggeredPads = useAppStore((state) => state.triggeredPads);
  const isPlaying = useAppStore((state) => state.isPlaying);
  const selectedChannel = channels.find((channel) => channel.pad === selectedPad) ?? channels[0];
  const selectMixerPad = useAppStore((state) => state.selectMixerPad);
  const setMixerChannelValue = useAppStore((state) => state.setMixerChannelValue);
  const toggleSelectedMixerMute = useAppStore((state) => state.toggleSelectedMixerMute);
  const toggleSelectedMixerSolo = useAppStore((state) => state.toggleSelectedMixerSolo);
  const toggleMixerChannelMute = useAppStore((state) => state.toggleMixerChannelMute);
  const toggleMixerChannelSolo = useAppStore((state) => state.toggleMixerChannelSolo);
  const cycleSelectedMixerOutput = useAppStore((state) => state.cycleSelectedMixerOutput);
  const anySolo = channels.some((channel) => channel.solo);

  return (
    <ScreenFrame title="MIX" subtitle={`Pad mixer / bank ${padBank}`}>
      <div className="grid h-full gap-[12px]" style={{ gridTemplateRows: `${lcdContentHeight} ${lcdSoftkeyHeight}px` }}>
        <div className="grid min-h-0 grid-rows-[auto_1fr] gap-[8px] overflow-hidden">
          <section className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-[10px] border border-[#46533b] bg-black/20 px-[2.2%] py-[1.4%] text-[clamp(9px,0.72vw,11px)] tracking-[0.14em]">
            <span className="text-[#91a477]">BANK {padBank} / 16 PAD CHANNELS</span>
            <span>{selectedChannel.pad}</span>
            <span>VOL {selectedChannel.level}</span>
            <span>PAN {formatPan(selectedChannel.pan)}</span>
            <span>SEND {selectedChannel.fxSend}</span>
            <span className={selectedChannel.solo ? "text-amber-100" : selectedChannel.muted ? "text-[#91a477]" : ""}>
              {selectedChannel.solo ? "SOLO" : selectedChannel.muted ? "MUTE" : selectedChannel.output}
            </span>
          </section>

          <section className="grid min-h-0 grid-cols-16 gap-[0.6%] border border-[#46533b] bg-black/20 p-[1.2%]">
            {channels.map((channel) => {
              const audible = !channel.muted && (!anySolo || channel.solo);
              return (
                <ChannelStrip
                  key={channel.pad}
                  channel={channel}
                  selected={channel.pad === selectedPad}
                  audible={audible}
                  meterActive={audible && (isPlaying || Boolean(triggeredPads[channel.pad]))}
                  onSelect={() => selectMixerPad(channel.pad)}
                  onLevel={(value) => setMixerChannelValue(channel.pad, "level", value)}
                  onPan={(value) => setMixerChannelValue(channel.pad, "pan", value)}
                  onFxSend={(value) => setMixerChannelValue(channel.pad, "fxSend", value)}
                  onMute={() => toggleMixerChannelMute(channel.pad)}
                  onSolo={() => toggleMixerChannelSolo(channel.pad)}
                />
              );
            })}
          </section>
        </div>

        <div className="grid grid-cols-6 gap-[1.4%]">
          {softButtons.map((button) => (
            <button
              key={button}
              type="button"
              onClick={() => {
                if (button === "F3 MUTE") toggleSelectedMixerMute();
                if (button === "F4 SOLO") toggleSelectedMixerSolo();
                if (button === "F6 OUTPUT") cycleSelectedMixerOutput();
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

type Channel = {
  pad: string;
  level: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  fxSend: number;
};

function ChannelStrip({
  channel,
  selected,
  audible,
  meterActive,
  onSelect,
  onLevel,
  onPan,
  onFxSend,
  onMute,
  onSolo,
}: {
  channel: Channel;
  selected: boolean;
  audible: boolean;
  meterActive: boolean;
  onSelect: () => void;
  onLevel: (value: number) => void;
  onPan: (value: number) => void;
  onFxSend: (value: number) => void;
  onMute: () => void;
  onSolo: () => void;
}) {
  return (
    <div
      onPointerDown={onSelect}
      className={`grid min-h-0 grid-rows-[auto_auto_1fr_auto_auto_auto] gap-[4px] border px-[3px] py-[4px] text-center text-[clamp(7px,0.56vw,9px)] tracking-[0.08em] ${
        selected ? "border-amber-100 bg-amber-100/10 text-amber-100" : "border-[#46533b] text-[#d8e3b7]"
      } ${audible ? "" : "opacity-45"}`}
    >
      <span>{channel.pad.slice(1)}</span>
      <PanKnob value={channel.pan} onChange={onPan} />
      <Fader value={channel.level} onChange={onLevel} />
      <FxSend value={channel.fxSend} onChange={onFxSend} />
      <Meter active={meterActive} seed={Number(channel.pad.slice(1))} />
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
}

function Fader({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div
      onPointerDown={(event) => beginVerticalDrag(event, value, onChange, 0, 127)}
      className="relative mx-auto h-full min-h-[86px] w-[14px] cursor-ns-resize border border-[#46533b] bg-black/35"
    >
      <div className="absolute inset-x-[3px] bottom-0 bg-[#91a477]" style={{ height: `${(value / 127) * 100}%` }} />
      <div
        className="absolute left-[-3px] right-[-3px] h-[5px] bg-[#eef6d8]"
        style={{ bottom: `calc(${(value / 127) * 100}% - 2px)` }}
      />
    </div>
  );
}

function PanKnob({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div
      onPointerDown={(event) => beginHorizontalDrag(event, value, onChange, -50, 50)}
      className="grid cursor-ew-resize gap-[2px]"
    >
      <div className="relative mx-auto h-[15px] w-[15px] rounded-full border border-[#46533b]">
        <span
          className="absolute left-1/2 top-1/2 h-[6px] w-px origin-bottom bg-[#eef6d8]"
          style={{ transform: `translate(-50%, -100%) rotate(${value * 1.35}deg)` }}
        />
      </div>
      <span>{formatPan(value)}</span>
    </div>
  );
}

function FxSend({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <button
      type="button"
      onPointerDown={(event) => beginHorizontalDrag(event, value, onChange, 0, 100)}
      className="cursor-ew-resize border border-[#46533b] bg-black/20 px-[1px]"
    >
      {value}
    </button>
  );
}

function Meter({ active, seed }: { active: boolean; seed: number }) {
  const [level, setLevel] = useState(0.04);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLevel(active ? 0.18 + Math.random() * 0.78 : 0.04);
    }, 140 + seed * 5);
    return () => window.clearInterval(interval);
  }, [active, seed]);

  return (
    <div className="h-[5px] border border-[#46533b] bg-black/30">
      <div className="h-full bg-[#d8e3b7]" style={{ width: `${Math.round(level * 100)}%` }} />
    </div>
  );
}

function beginVerticalDrag(
  event: ReactPointerEvent,
  initialValue: number,
  onChange: (value: number) => void,
  min: number,
  max: number,
) {
  event.preventDefault();
  event.stopPropagation();
  const startY = event.clientY;
  const move = (moveEvent: PointerEvent) => {
    const delta = startY - moveEvent.clientY;
    onChange(Math.round(clamp(initialValue + delta * 1.2, min, max)));
  };
  bindDrag(move);
}

function beginHorizontalDrag(
  event: ReactPointerEvent,
  initialValue: number,
  onChange: (value: number) => void,
  min: number,
  max: number,
) {
  event.preventDefault();
  event.stopPropagation();
  const startX = event.clientX;
  const move = (moveEvent: PointerEvent) => {
    const delta = moveEvent.clientX - startX;
    onChange(Math.round(clamp(initialValue + delta * 0.7, min, max)));
  };
  bindDrag(move);
}

function bindDrag(move: (event: PointerEvent) => void) {
  const end = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end, { once: true });
}

function formatPan(value: number) {
  if (value === 0) return "C";
  return value < 0 ? `L${Math.abs(value)}` : `R${value}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
