const transportButtons = ["REC", "OVERDUB", "STOP", "PLAY", "PLAY START"];
const performanceButtons = ["NOTE REPEAT", "FULL LEVEL", "16 LEVELS", "ERASE"];

export function TransportStrip() {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Transport</p>
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
            className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-4 text-sm font-semibold tracking-[0.15em] text-zinc-200"
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
            className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-xs font-semibold tracking-[0.15em] text-zinc-300"
          >
            {button}
          </button>
        ))}
        <button
          type="button"
          className="rounded-xl border border-amber-700 bg-amber-950/70 px-3 py-3 text-xs font-semibold tracking-[0.15em] text-amber-300"
        >
          RECALL 25s
        </button>
      </div>
    </section>
  );
}
