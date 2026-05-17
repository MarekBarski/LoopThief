export function SimpleList({ items }: { items: string[] }) {
  return (
    <div className="grid h-full grid-cols-2 gap-4">
      {items.map((item) => (
        <div key={item} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm tracking-[0.18em] text-zinc-300">
          {item}
        </div>
      ))}
    </div>
  );
}
