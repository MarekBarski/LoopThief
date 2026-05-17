const pads = Array.from({ length: 16 }, (_, index) => `PAD ${index + 1}`);

export function PadGrid() {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Pads</p>
        <div className="flex gap-2">
          {["A", "B", "C", "D"].map((bank) => (
            <button
              key={bank}
              type="button"
              className={`h-8 w-8 rounded-lg border text-sm font-semibold ${
                bank === "A"
                  ? "border-amber-500 bg-amber-500 text-zinc-950"
                  : "border-zinc-700 bg-zinc-950 text-zinc-300"
              }`}
            >
              {bank}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {pads.map((pad, index) => (
          <button
            key={pad}
            type="button"
            className={`aspect-square rounded-2xl border p-3 text-left text-xs font-semibold tracking-[0.16em] ${
              index === 0
                ? "border-amber-500 bg-amber-500 text-zinc-950"
                : "border-zinc-700 bg-zinc-950 text-zinc-300"
            }`}
          >
            {pad}
          </button>
        ))}
      </div>
    </section>
  );
}
