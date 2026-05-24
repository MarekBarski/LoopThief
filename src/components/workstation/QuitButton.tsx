import buttonQuit from "../../../assets/ui/buttons/button_quit.png";
import { useAppStore } from "../../store/useAppStore";
import { useLayoutStore } from "../../store/useLayoutStore";
import { isTauri } from "../../runtime/environment";

// Defensive fallback if the `quit-button` entry is missing from
// layout.json. Values match the original CSS-positioned offsets (top-right
// corner, inset 30px, 70×70 in the 2527×1610 canvas). The F7 layout editor
// writes back to layout.json via the Vite dev middleware, so any reposition
// Marek saves becomes the shipped default.
const OFFSET_PX = 30;
const SIZE_PX = 70;
const FALLBACK_RECT = {
  x: 2527 - OFFSET_PX - SIZE_PX,
  y: OFFSET_PX,
  w: SIZE_PX,
  h: SIZE_PX,
};

export function QuitButton() {
  const requestAppQuit = useAppStore((state) => state.requestAppQuit);
  const isPlaying = useAppStore((state) => state.isPlaying);
  const isSequenceRecording = useAppStore((state) => state.isSequenceRecording);
  const overdubEnabled = useAppStore((state) => state.overdubEnabled);
  const isSampling = useAppStore((state) => state.isSampling);
  const isSamplingArmed = useAppStore((state) => state.isSamplingArmed);
  const rect = useLayoutStore((state) =>
    state.elements.find((element) => element.id === "quit-button"),
  );

  const { x, y, w, h } = rect ?? FALLBACK_RECT;

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
      style={{ left: x, top: y, width: w, height: h }}
    >
      <img src={buttonQuit} alt="Quit" className="h-full w-full object-contain" />
    </button>
  );
}
