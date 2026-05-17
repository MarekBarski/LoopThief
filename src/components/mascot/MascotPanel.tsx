import thiefIdle from "../../../assets/ui/mascot/thief_idle.png";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../layout/AppShell";

export function MascotPanel() {
  return (
    <img
      src={thiefIdle}
      alt="LoopThief mascot"
      className="absolute h-auto object-contain"
      style={{
        left: `${(1040 / CANVAS_WIDTH) * 100}%`,
        top: `${(1060 / CANVAS_HEIGHT) * 100}%`,
        width: `${(260 / CANVAS_WIDTH) * 100}%`,
      }}
    />
  );
}
