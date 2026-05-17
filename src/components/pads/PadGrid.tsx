const pads = Array.from({ length: 16 }, (_, index) => `PAD ${index + 1}`);

export function PadGrid() {
  return (
    <section className="border-2 border-zinc-800 bg-[#151515] p-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.32em] text-zinc-500">Pads</p>
        <div className="flex gap-2">
          {["A", "B", "C", "D"].map((bank) => (
            <button
              key={bank}
              type="button"
              className={`h-8 w-8 border text-sm font-semibold ${
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
            className={`aspect-square border p-3 text-left text-xs font-semibold tracking-[0.18em] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${
              index === 0
                ? "border-amber-500 bg-[linear-gradient(180deg,#d5a13d_0%,#9f6b11_100%)] text-zinc-950"
                : "border-zinc-700 bg-[linear-gradient(180deg,#202020_0%,#090909_100%)] text-zinc-300"
            }`}
          >
            {pad}
          </button>
        ))}
      </div>
    </section>
  );
}
