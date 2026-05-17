import { screensById } from "../../screens";
import { useAppStore } from "../../store/useAppStore";

export function ScreenViewport() {
  const activeScreen = useAppStore((state) => state.activeScreen);
  const ActiveScreen = screensById[activeScreen];

  return (
    <section className="min-h-0 border-4 border-[#262626] bg-[#050805] p-2 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.03),inset_0_0_36px_rgba(0,0,0,0.85)]">
      <div className="h-full min-h-0 border border-[#3f4b35] bg-[linear-gradient(180deg,#162012_0%,#10170d_100%)] p-3 text-[#d7e2b8] shadow-[inset_0_0_26px_rgba(0,0,0,0.7)]">
        <ActiveScreen />
      </div>
    </section>
  );
}
