import padActive from "../../../assets/ui/pads/pad_active.png";
import padIdle from "../../../assets/ui/pads/pad_idle.png";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../layout/AppShell";

const pads = [
  { label: "P01", left: 1776, top: 670, width: 190, height: 159, active: true },
  { label: "P02", left: 2021, top: 670, width: 190, height: 159 },
  { label: "P03", left: 2267, top: 670, width: 190, height: 159 },
  { label: "P04", left: 2512, top: 670, width: 190, height: 159 },
  { label: "P05", left: 1776, top: 895, width: 190, height: 159 },
  { label: "P06", left: 2021, top: 895, width: 190, height: 159 },
  { label: "P07", left: 2267, top: 895, width: 190, height: 159 },
  { label: "P08", left: 2512, top: 895, width: 190, height: 159 },
  { label: "P09", left: 1776, top: 1124, width: 190, height: 159 },
  { label: "P10", left: 2021, top: 1124, width: 190, height: 159 },
  { label: "P11", left: 2267, top: 1124, width: 190, height: 159 },
  { label: "P12", left: 2512, top: 1124, width: 190, height: 159 },
  { label: "P13", left: 1776, top: 1353, width: 190, height: 159 },
  { label: "P14", left: 2021, top: 1353, width: 190, height: 159 },
  { label: "P15", left: 2267, top: 1353, width: 190, height: 159 },
  { label: "P16", left: 2512, top: 1353, width: 190, height: 159 },
] as const;

export function PadGrid() {
  return (
    <>
      <div
        className="absolute flex items-center justify-between text-[16px] uppercase tracking-[0.24em] text-zinc-400"
        style={{
          left: `${(2176 / CANVAS_WIDTH) * 100}%`,
          top: `${(598 / CANVAS_HEIGHT) * 100}%`,
          width: `${(251 / CANVAS_WIDTH) * 100}%`,
          height: `${(45 / CANVAS_HEIGHT) * 100}%`,
        }}
      >
        {["A", "B", "C", "D"].map((bank) => (
          <span key={bank} className={bank === "A" ? "text-amber-400" : ""}>
            {bank}
          </span>
        ))}
      </div>

      {pads.map((pad) => (
        <button
          key={pad.label}
          type="button"
          className="absolute"
          style={{
            left: `${(pad.left / CANVAS_WIDTH) * 100}%`,
            top: `${(pad.top / CANVAS_HEIGHT) * 100}%`,
            width: `${(pad.width / CANVAS_WIDTH) * 100}%`,
            height: `${(pad.height / CANVAS_HEIGHT) * 100}%`,
          }}
        >
          <img
            src={"active" in pad && pad.active ? padActive : padIdle}
            alt=""
            className="h-full w-full object-contain"
          />
          <span className="absolute bottom-[8%] left-[9%] text-[10px] font-semibold tracking-[0.14em] text-[#ddd6c8]">
            {pad.label}
          </span>
        </button>
      ))}
    </>
  );
}
