import buttonActive from "../../../assets/ui/buttons/button_active.png";
import buttonIdle from "../../../assets/ui/buttons/button_idle.png";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../layout/AppShell";
import { useAppStore } from "../../store/useAppStore";
import { screens } from "../../types/navigation";

const modeButtons = [
  { label: "MAIN", y: 187 },
  { label: "RECORD", y: 345 },
  { label: "CHOP", y: 501 },
  { label: "PROGRAM", y: 658 },
  { label: "STEP", y: 814 },
  { label: "PERFORMANCE", y: 972 },
  { label: "MIX", y: 1128 },
  { label: "DISK", y: 1285 },
  { label: "SETTINGS", y: 1441 },
] as const;

export function ModeRail() {
  const activeScreen = useAppStore((state) => state.activeScreen);
  const setActiveScreen = useAppStore((state) => state.setActiveScreen);

  return (
    <>
      {modeButtons.map((button) => {
        const isActive = button.label === activeScreen;

        return (
          <button
            key={button.label}
            type="button"
            onClick={() => setActiveScreen(button.label)}
            className="absolute"
            style={{
              left: `${(102 / CANVAS_WIDTH) * 100}%`,
              top: `${(button.y / CANVAS_HEIGHT) * 100}%`,
              width: `${(215 / CANVAS_WIDTH) * 100}%`,
              height: `${(109 / CANVAS_HEIGHT) * 100}%`,
            }}
          >
            <img
              src={isActive ? buttonActive : buttonIdle}
              alt=""
              className="h-full w-full object-contain"
            />
            <span className="absolute inset-0 flex items-center justify-center px-[8%] text-center text-[clamp(7px,0.72vw,11px)] font-semibold tracking-[0.14em] text-[#e2ddcf]">
              {button.label}
            </span>
          </button>
        );
      })}
    </>
  );
}
