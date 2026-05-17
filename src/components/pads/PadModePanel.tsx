import buttonActive from "../../../assets/ui/buttons/button_active.png";
import buttonIdle from "../../../assets/ui/buttons/button_idle.png";

const buttons = [
  { label: "PAD PLAY", left: 28, top: 48, width: 108, height: 45, active: true },
  { label: "TRACK MUTE", left: 185, top: 48, width: 120, height: 45 },
  { label: "16 LEVELS", left: 28, top: 106, width: 108, height: 45 },
  { label: "PAD MUTE", left: 185, top: 106, width: 120, height: 45 },
  { label: "FULL LEVEL", left: 28, top: 165, width: 108, height: 45 },
  { label: "NEXT SEQ", left: 185, top: 165, width: 120, height: 45 },
  { label: "NOTE REPEAT", left: 28, top: 224, width: 108, height: 45 },
  { label: "STEP INPUT", left: 185, top: 224, width: 120, height: 45 },
] as const;

export function PadModePanel() {
  return (
    <section className="relative h-full w-full">
      <p className="absolute left-0 top-0 text-[12px] uppercase tracking-[0.24em] text-zinc-400">
        PAD MODE: <span className="text-amber-400">PAD PLAY</span>
      </p>

      {buttons.map((button) => (
        <button
          key={button.label}
          type="button"
          className="absolute"
          style={{
            left: `${(button.left / 300) * 100}%`,
            top: `${(button.top / 272) * 100}%`,
            width: `${(button.width / 300) * 100}%`,
            height: `${(button.height / 272) * 100}%`,
          }}
        >
          <img
            src={"active" in button && button.active ? buttonActive : buttonIdle}
            alt=""
            className="h-full w-full object-contain"
          />
          <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-[8px] font-semibold tracking-[0.08em] text-[#e4dccf]">
            {button.label}
          </span>
        </button>
      ))}
    </section>
  );
}
