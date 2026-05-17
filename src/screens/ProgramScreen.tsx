import { ScreenFrame } from "./ScreenFrame";
import { SimpleList } from "./shared";

export function ProgramScreen() {
  return (
    <ScreenFrame title="PROGRAM" subtitle="Pad/sample configuration placeholder.">
      <SimpleList items={["ASSIGNED SAMPLE", "POLY / MONO", "CHOKE GROUP", "TUNING", "ATTACK", "DECAY"]} />
    </ScreenFrame>
  );
}
