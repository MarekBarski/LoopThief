import { ScreenFrame } from "./ScreenFrame";
import { SimpleList } from "./shared";

export function MixScreen() {
  return (
    <ScreenFrame title="MIX" subtitle="Minimal mixer placeholder.">
      <SimpleList items={["VOLUME", "PAN", "FX SEND", "MUTE", "SOLO"]} />
    </ScreenFrame>
  );
}
