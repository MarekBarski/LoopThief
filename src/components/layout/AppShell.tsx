import { MascotPanel } from "../mascot/MascotPanel";
import { ModeRail } from "../navigation/ModeRail";
import { PadGrid } from "../pads/PadGrid";
import { TransportStrip } from "../transport/TransportStrip";
import { ScreenViewport } from "./ScreenViewport";
import { TopBar } from "./TopBar";

export function AppShell() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#27211d_0%,_#111111_48%,_#090909_100%)] p-4 text-zinc-100">
      <section className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1600px] flex-col overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950/90 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_30px_90px_rgba(0,0,0,0.65)]">
        <TopBar />

        <div className="grid flex-1 grid-cols-[160px_minmax(0,1fr)] gap-4 p-4">
          <ModeRail />

          <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_220px] gap-4">
            <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_260px] gap-4">
              <ScreenViewport />
              <MascotPanel />
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_420px] gap-4">
              <TransportStrip />
              <PadGrid />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
