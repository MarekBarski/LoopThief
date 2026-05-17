export function MascotPanel() {
  return (
    <aside className="flex flex-col border-2 border-zinc-800 bg-[#151515] p-2">
      <p className="text-[11px] uppercase tracking-[0.32em] text-zinc-500">Mascot</p>

      <div className="mt-2 flex flex-1 flex-col items-center justify-center border border-dashed border-zinc-700 bg-zinc-950/80 p-2 text-center">
        <div className="mb-2 flex h-14 w-14 items-center justify-center border border-zinc-700 bg-zinc-900 text-xl">
          ◉_◉
        </div>
        <p className="text-[11px] font-semibold tracking-[0.18em] text-zinc-200">THIEF IDLE</p>
      </div>
    </aside>
  );
}
