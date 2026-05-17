export function TopBar() {
  return (
    <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/70 px-5 py-4">
      <div className="flex items-center gap-6">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-amber-500">LoopThief</p>
          <h1 className="text-xl font-semibold tracking-[0.2em] text-zinc-100">PROJECT: UNTITLED</h1>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <StatusPill label="BPM" value="92.0" />
          <StatusPill label="SWING" value="54%" />
          <StatusPill label="CPU" value="03%" />
        </div>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <StatusPill label="AUDIO" value="READY" />
        <StatusPill label="SAVE" value="CLEAN" />
        <span className="rounded-full border border-red-900 bg-red-950/80 px-3 py-1 text-xs font-semibold tracking-[0.2em] text-red-300">
          REC OFF
        </span>
      </div>
    </header>
  );
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1">
      <span className="mr-2 text-zinc-500">{label}</span>
      <span className="font-semibold text-zinc-100">{value}</span>
    </div>
  );
}
