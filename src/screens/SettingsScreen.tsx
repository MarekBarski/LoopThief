import { ScreenFrame } from "./ScreenFrame";
import { SimpleList } from "./shared";

export function SettingsScreen() {
  return (
    <ScreenFrame title="SETTINGS" subtitle="Application settings placeholder.">
      <SimpleList items={["AUDIO DEVICE", "LATENCY", "SAMPLE RATE", "THEME", "AUTOSAVE", "SHORTCUTS"]} />
    </ScreenFrame>
  );
}
