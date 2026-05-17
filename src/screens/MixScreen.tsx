import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { ScreenFrame } from "./ScreenFrame";
import { lcdContentHeight, lcdSoftkeyHeight } from "./lcdLayout";

const softButtons = ["F1 TRACK", "F2 PAD MIX", "F3 MUTE", "F4 SOLO", "F5 FX SEND", "F6 OUTPUT"];

export function MixScreen() {
  const mixerTracks = useAppStore((state) => state.mixerTracks);
  const padBank = useAppStore((state) => state.padBank);
  const selectedPad = useAppStore((state) => state.selectedPad);
  const channels = useAppStore((state) => state.padMixer[padBank]);
  const selectedChannel = channels.find((channel) => channel.pad === selectedPad) ?? channels[0];
  const isPlaying = useAppStore((state) => state.isPlaying);
  const updateSelectedMixerChannel = useAppStore((state) => state.updateSelectedMixerChannel);
  const toggleSelectedMixerMute = useAppStore((state) => state.toggleSelectedMixerMute);
  const toggleSelectedMixerSolo = useAppStore((state) => state.toggleSelectedMixerSolo);
  const cycleSelectedMixerOutput = useAppStore((state) => state.cycleSelectedMixerOutput);

  return (
    <ScreenFrame title="MIX" subtitle="Sampler mixer">
      <div
        className="grid h-full gap-[12px]"
        style={{ gridTemplateRows: `${lcdContentHeight} ${lcdSoftkeyHeight}px` }}
      >
        <div className="grid min-h-0 grid-cols-[0.82fr_1.35fr_0.9fr] gap-[2.3%] overflow-hidden">
          <section className="grid content-start gap-[8px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
            <p className="text-[#91a477]">TRACKS</p>
            {mixerTracks.map((track) => (
              <div key={track.name} className="grid grid-cols-[1fr_auto] gap-[8px] border border-[#46533b] bg-black/15 px-[4%] py-[3%]">
                <span>{track.name}</span>
                <span>{track.level}</span>
              </div>
            ))}
          </section>

          <section className="grid min-h-0 grid-rows-[auto_1fr] border border-[#46533b] bg-black/20">
            <div className="grid grid-cols-[0.7fr_0.7fr_0.7fr_0.7fr_0.7fr_0.75fr] border-b border-[#46533b] px-[3%] py-[2%] text-[clamp(9px,0.7vw,11px)] tracking-[0.16em] text-[#91a477]">
              <span>PAD</span>
              <span>LEVEL</span>
              <span>PAN</span>
              <span>OUT</span>
              <span>SEND</span>
              <span>METER</span>
            </div>
            <div className="grid content-start">
              {channels.map((channel) => (
                <div
                  key={channel.pad}
                  className={`grid grid-cols-[0.7fr_0.7fr_0.7fr_0.7fr_0.7fr_0.75fr] items-center px-[3%] py-[1.7%] text-[clamp(9px,0.7vw,11px)] tracking-[0.12em] ${
                    channel.pad === selectedPad ? "bg-amber-200/15 text-amber-100" : "text-[#d8e3b7]"
                  }`}
                >
                  <span>{channel.pad}</span>
                  <span>{channel.level}</span>
                  <span>{formatPan(channel.pan)}</span>
                  <span>{channel.output}</span>
                  <span>{channel.fxSend}</span>
                  <Meter active={isPlaying && !channel.muted} seed={Number(channel.pad.slice(1))} />
                </div>
              ))}
            </div>
          </section>

          <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
            <Info label="CHANNEL" value={selectedChannel.pad} />
            <Adjust
              label="LEVEL"
              value={selectedChannel.level}
              onMinus={() => updateSelectedMixerChannel("level", -1)}
              onPlus={() => updateSelectedMixerChannel("level", 1)}
            />
            <Adjust
              label="PAN"
              value={formatPan(selectedChannel.pan)}
              onMinus={() => updateSelectedMixerChannel("pan", -1)}
              onPlus={() => updateSelectedMixerChannel("pan", 1)}
            />
            <Info label="MUTE" value={selectedChannel.muted ? "ON" : "OFF"} />
            <Info label="SOLO" value={selectedChannel.solo ? "ON" : "OFF"} />
            <Adjust
              label="FX SEND"
              value={selectedChannel.fxSend}
              onMinus={() => updateSelectedMixerChannel("fxSend", -1)}
              onPlus={() => updateSelectedMixerChannel("fxSend", 1)}
            />
            <button
              type="button"
              onClick={cycleSelectedMixerOutput}
              className="grid gap-[4%] border border-[#46533b] bg-black/15 px-[4%] py-[3%] text-left"
            >
              <span className="text-[#91a477]">OUTPUT</span>
              <span className="text-[#eef6d8]">{selectedChannel.output}</span>
            </button>
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-[4%]">
      <span className="text-[#91a477]">{label}</span>
      <span className="text-[#eef6d8]">{value}</span>
    </div>
  );
}

function Adjust({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string;
  value: string | number;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-[6px] border border-[#46533b] bg-black/15 px-[4%] py-[3%]">
      <span className="text-[#91a477]">{label}</span>
      <button type="button" onClick={onMinus} className="px-1 text-[#eef6d8]">
        -
      </button>
      <span className="min-w-[42px] text-center text-[#eef6d8]">{value}</span>
      <button type="button" onClick={onPlus} className="px-1 text-[#eef6d8]">
        +
      </button>
    </div>
  );
}

function Meter({ active, seed }: { active: boolean; seed: number }) {
  const [level, setLevel] = useState(seed % 5 === 0 ? 0.18 : 0.08);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLevel(active ? 0.16 + Math.random() * 0.8 : 0.04);
    }, 140 + seed * 7);
    return () => window.clearInterval(interval);
  }, [active, seed]);

  return (
    <div className="h-[8px] border border-[#46533b] bg-black/30">
      <div className="h-full bg-[#d8e3b7]" style={{ width: `${Math.round(level * 100)}%` }} />
    </div>
  );
}

function formatPan(value: number) {
  if (value === 0) return "C";
  return value < 0 ? `L${Math.abs(value)}` : `R${value}`;
}
