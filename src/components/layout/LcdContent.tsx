import { screensById } from "../../screens";
import { useAppStore } from "../../store/useAppStore";

export function LcdContent() {
  const activeScreen = useAppStore((state) => state.activeScreen);
  const ActiveScreen = screensById[activeScreen];

  return (
    <div className="h-full w-full overflow-hidden text-[#d8e3b7]">
      <ActiveScreen />
    </div>
  );
}
