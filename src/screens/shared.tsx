export function SimpleList({ items }: { items: string[] }) {
  return (
    <div className="grid h-full grid-cols-2 gap-2">
      {items.map((item) => (
        <div key={item} className="border border-[#46533b] bg-black/20 p-3 text-sm tracking-[0.18em] text-[#d7e2b8]">
          {item}
        </div>
      ))}
    </div>
  );
}
