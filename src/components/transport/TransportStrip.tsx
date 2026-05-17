const transportButtons = ["REC", "OVERDUB", "STOP", "PLAY", "PLAY START"];
const performanceButtons = ["NOTE REPEAT", "FULL LEVEL", "16 LEVELS", "ERASE"];

export function TransportStrip() {
  return (
    <section className="border-2 border-zinc-800 bg-[#151515] p-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.32em] text-zinc-500">Transport</p>
        <div className="flex gap-2 text-xs text-zinc-400">
          <span>TIMING CORRECT: 1/16</span>
          <span>·</span>
          <span>SWING: 54%</span>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {transportButtons.map((button) => (
          <button
            key={button}
            type="button"
            className="min-h-14 border border-zinc-700 bg-[linear-gradient(180deg,#1d1d1d_0%,#0b0b0b_100%)] px-2 py-3 text-center text-[12px] font-semibold leading-tight tracking-[0.14em] text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          >
            {button}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-5 gap-2">
        {performanceButtons.map((button) => (
          <button
            key={button}
            type="button"
            className="min-h-12 border border-zinc-700 bg-[linear-gradient(180deg,#181818_0%,#0a0a0a_100%)] px-2 py-2 text-center text-[11px] font-semibold leading-tight tracking-[0.12em] text-zinc-300"
          >
            {button}
          </button>
        ))}
        <button
          type="button"
          className="min-h-12 border border-amber-700 bg-[linear-gradient(180deg,#33220d_0%,#1a1208_100%)] px-2 py-2 text-center text-[11px] font-semibold leading-tight tracking-[0.12em] text-amber-300"
        >
          RECALL 25s
        </button>
      </div>
    </section>
  );
}
