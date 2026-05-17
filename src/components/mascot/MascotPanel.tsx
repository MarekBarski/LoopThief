export function MascotPanel() {
  return (
    <aside className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Mascot</p>

      <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/80 p-4 text-center">
        <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-4xl">
          ◉_◉
        </div>
        <p className="text-sm font-semibold tracking-[0.18em] text-zinc-200">THIEF IDLE</p>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Placeholder area for the subtle mascot states described in the design bible.
        </p>
      </div>
    </aside>
  );
}
