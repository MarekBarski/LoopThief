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
      <header className="mb-4 border-b border-zinc-800 pb-4">
        <p className="text-xs uppercase tracking-[0.3em] text-amber-500">Active Screen</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[0.22em] text-zinc-100">{title}</h2>
        <p className="mt-2 text-sm text-zinc-400">{subtitle}</p>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
