import { useAppStore } from "../../store/useAppStore";
import { screens } from "../../types/navigation";

export function ModeRail() {
  const activeScreen = useAppStore((state) => state.activeScreen);
  const setActiveScreen = useAppStore((state) => state.setActiveScreen);

  return (
    <nav className="flex flex-col gap-2 border-2 border-zinc-800 bg-[#151515] p-2">
      <p className="px-1 pb-1 text-[11px] uppercase tracking-[0.32em] text-zinc-500">Modes</p>
      {screens.map((screen) => {
        const isActive = screen === activeScreen;

        return (
          <button
            key={screen}
            type="button"
            onClick={() => setActiveScreen(screen)}
            className={`min-h-11 border px-3 py-2 text-left text-[12px] font-semibold tracking-[0.2em] transition ${
              isActive
                ? "border-amber-500 bg-amber-500 text-zinc-950 shadow-[inset_0_-2px_0_rgba(0,0,0,0.25)]"
                : "border-zinc-700 bg-[#0a0a0a] text-zinc-300 hover:border-zinc-500 hover:bg-[#111111]"
            }`}
          >
            {screen}
          </button>
        );
      })}
    </nav>
  );
}
