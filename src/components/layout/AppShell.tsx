import { MascotPanel } from "../mascot/MascotPanel";
import { ModeRail } from "../navigation/ModeRail";
import { PadGrid } from "../pads/PadGrid";
import { TransportStrip } from "../transport/TransportStrip";
import { ScreenViewport } from "./ScreenViewport";
import { TopBar } from "./TopBar";

export function AppShell() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#211d19_0%,_#111111_40%,_#080808_100%)] p-3 text-zinc-100">
      <section className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[1600px] flex-col overflow-hidden border-2 border-zinc-800 bg-[#101010] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03),0_24px_70px_rgba(0,0,0,0.7)]">
        <TopBar />

        <div className="grid flex-1 grid-cols-[148px_minmax(0,1fr)] gap-3 p-3">
          <ModeRail />

          <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_400px] gap-3">
            <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_180px] gap-3">
              <ScreenViewport />
              <MascotPanel />
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_430px] gap-3">
              <TransportStrip />
              <PadGrid />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
