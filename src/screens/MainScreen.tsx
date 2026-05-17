import type { ReactNode } from "react";
import { ScreenFrame } from "./ScreenFrame";

export function MainScreen() {
  return (
    <ScreenFrame title="MAIN" subtitle="Sequence hub and current project overview.">
      <div className="grid h-full grid-cols-[1.25fr_0.75fr] gap-2">
        <Panel title="TRACKS">
          {["DRUMS", "BASS", "TEXTURE", "RESAMPLE"].map((track, index) => (
            <div key={track} className="flex items-center justify-between border-b border-zinc-800 py-3 last:border-b-0">
              <span>{track}</span>
              <span className="text-zinc-500">{index === 0 ? "ACTIVE" : "EMPTY"}</span>
            </div>
          ))}
        </Panel>
        <Panel title="CURRENT SEQUENCE">
          <div className="grid gap-3 text-sm text-zinc-300">
            <p>SEQ 01 · 4 BARS</p>
            <p>PROGRAM: KIT A</p>
            <p>SAMPLES: 00</p>
            <p>PAD: A01</p>
          </div>
        </Panel>
      </div>
    </ScreenFrame>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border border-[#46533b] bg-black/20 p-3">
      <p className="mb-3 text-[11px] uppercase tracking-[0.3em] text-[#9cab84]">{title}</p>
      {children}
    </section>
  );
}
