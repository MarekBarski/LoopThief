import buttonActive from "../../../assets/ui/buttons/button_active.png";
import buttonIdle from "../../../assets/ui/buttons/button_idle.png";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../layout/AppShell";

const buttons = [
  { label: "WAIT PAD", left: 455, top: 1019, width: 202, height: 81 },
  { label: "COUNT IN", left: 760, top: 1019, width: 202, height: 81 },
  { label: "TAP TEMPO", left: 1364, top: 1089, width: 279, height: 103 },
  { label: "REC", left: 443, top: 1452, width: 216, height: 95, active: true },
  { label: "OVERDUB", left: 679, top: 1452, width: 216, height: 95 },
  { label: "STOP", left: 925, top: 1452, width: 216, height: 95 },
  { label: "PLAY", left: 1160, top: 1452, width: 216, height: 95 },
  { label: "PLAY START", left: 1402, top: 1452, width: 223, height: 95 },
] as const;

export function TransportStrip() {
  return (
    <>
      {buttons.map((button) => (
        <button
          key={button.label}
          type="button"
          className="absolute"
          style={{
            left: `${(button.left / CANVAS_WIDTH) * 100}%`,
            top: `${(button.top / CANVAS_HEIGHT) * 100}%`,
            width: `${(button.width / CANVAS_WIDTH) * 100}%`,
            height: `${(button.height / CANVAS_HEIGHT) * 100}%`,
          }}
        >
          <img
            src={"active" in button && button.active ? buttonActive : buttonIdle}
            alt=""
            className="h-full w-full object-contain"
          />
          <span className="absolute inset-0 flex items-center justify-center px-3 text-center text-[12px] font-semibold tracking-[0.12em] text-[#e5ddcf]">
            {button.label}
          </span>
        </button>
      ))}
    </>
  );
}
