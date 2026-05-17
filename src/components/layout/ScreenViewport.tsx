import { screensById } from "../../screens";
import { useAppStore } from "../../store/useAppStore";

export function ScreenViewport() {
  const activeScreen = useAppStore((state) => state.activeScreen);
  const ActiveScreen = screensById[activeScreen];

  return (
    <section className="min-h-0 rounded-2xl border border-zinc-800 bg-black/40 p-4 shadow-inner shadow-black/50">
      <ActiveScreen />
    </section>
  );
}
