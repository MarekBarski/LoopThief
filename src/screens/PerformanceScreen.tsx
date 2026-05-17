import { ScreenFrame } from "./ScreenFrame";
import { SimpleList } from "./shared";

export function PerformanceScreen() {
  return (
    <ScreenFrame title="PERFORMANCE" subtitle="Live control placeholder.">
      <SimpleList items={["TRACK MUTE", "PAD MUTE", "NEXT SEQUENCE", "SCENE SWITCH", "LIVE RESAMPLE"]} />
    </ScreenFrame>
  );
}
