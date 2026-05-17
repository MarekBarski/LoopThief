import { useAppStore } from "../../store/useAppStore";
import { screens } from "../../types/navigation";

export function ModeRail() {
  const activeScreen = useAppStore((state) => state.activeScreen);
  const setActiveScreen = useAppStore((state) => state.setActiveScreen);

  return (
    <nav className="flex flex-col gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
      <p className="px-2 pb-2 text-xs uppercase tracking-[0.3em] text-zinc-500">Modes</p>
      {screens.map((screen) => {
        const isActive = screen === activeScreen;

        return (
          <button
            key={screen}
            type="button"
            onClick={() => setActiveScreen(screen)}
            className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold tracking-[0.18em] transition ${
              isActive
                ? "border-amber-500 bg-amber-500 text-zinc-950"
                : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-900"
            }`}
          >
            {screen}
          </button>
        );
      })}
    </nav>
  );
}
