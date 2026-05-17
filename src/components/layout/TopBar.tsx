export function TopBar() {
  return (
    <header className="flex items-center justify-between border-b-2 border-zinc-800 bg-[#171717] px-4 py-3">
      <div className="flex items-center gap-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.38em] text-amber-500">LoopThief</p>
          <h1 className="text-lg font-semibold tracking-[0.24em] text-zinc-100">PROJECT: UNTITLED</h1>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <StatusPill label="BPM" value="92.0" />
          <StatusPill label="SWING" value="54%" />
          <StatusPill label="CPU" value="03%" />
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <StatusPill label="AUDIO" value="READY" />
        <StatusPill label="SAVE" value="CLEAN" />
        <span className="border border-red-900 bg-red-950/80 px-3 py-1 text-xs font-semibold tracking-[0.2em] text-red-300">
          REC OFF
        </span>
      </div>
    </header>
  );
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-zinc-700 bg-zinc-950 px-3 py-1">
      <span className="mr-2 text-zinc-500">{label}</span>
      <span className="font-semibold text-zinc-100">{value}</span>
    </div>
  );
}
