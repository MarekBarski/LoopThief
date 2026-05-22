import buttonQuit from "../../../assets/ui/buttons/button_quit.png";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../layout/AppShell";
import { useAppStore } from "../../store/useAppStore";
import { isTauri } from "../../runtime/environment";

const SIZE_PX = 70;
const OFFSET_PX = 30;

export function QuitButton() {
  const requestAppQuit = useAppStore((state) => state.requestAppQuit);
  const isPlaying = useAppStore((state) => state.isPlaying);
  const isSequenceRecording = useAppStore((state) => state.isSequenceRecording);
  const overdubEnabled = useAppStore((state) => state.overdubEnabled);
  const isSampling = useAppStore((state) => state.isSampling);
  const isSamplingArmed = useAppStore((state) => state.isSamplingArmed);

  const inTauri = isTauri();
  const transportBlocked =
    isPlaying || isSequenceRecording || overdubEnabled || isSampling || isSamplingArmed;
  const disabled = !inTauri || transportBlocked;

  const title = transportBlocked
    ? "Stop recording/playback first"
    : inTauri
      ? "Quit LoopThief"
      : "Available in desktop app only";

  return (
    <button
      type="button"
      onClick={requestAppQuit}
      disabled={disabled}
      title={title}
      className="absolute z-40 transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        top: `${(OFFSET_PX / CANVAS_HEIGHT) * 100}%`,
        right: `${(OFFSET_PX / CANVAS_WIDTH) * 100}%`,
        width: `${(SIZE_PX / CANVAS_WIDTH) * 100}%`,
        height: `${(SIZE_PX / CANVAS_HEIGHT) * 100}%`,
      }}
    >
      <img src={buttonQuit} alt="Quit" className="h-full w-full object-contain" />
    </button>
  );
}
