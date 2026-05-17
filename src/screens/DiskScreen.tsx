import { ScreenFrame } from "./ScreenFrame";
import { SimpleList } from "./shared";

export function DiskScreen() {
  return (
    <ScreenFrame title="DISK" subtitle="Project management placeholder.">
      <SimpleList items={["SAVE PROJECT", "LOAD PROJECT", "EXPORT WAV", "EXPORT STEMS", "COLLECT SAMPLES"]} />
    </ScreenFrame>
  );
}
