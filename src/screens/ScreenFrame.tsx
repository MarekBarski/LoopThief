import type { ReactNode } from "react";

export function ScreenFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="mb-3 border-b border-[#46533b] pb-3">
        <p className="text-[11px] uppercase tracking-[0.32em] text-[#95ad67]">Active Screen</p>
        <div className="mt-2 flex items-end justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-[0.24em] text-[#eef6d8]">{title}</h2>
          <p className="text-xs uppercase tracking-[0.18em] text-[#9cab84]">{subtitle}</p>
        </div>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
