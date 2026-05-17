import { useEffect } from "react";
import { useLayoutStore } from "../../store/useLayoutStore";
import { useAppStore } from "../../store/useAppStore";

const padKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "q", "w", "e", "r", "a", "s", "d"];

export function KeyboardShortcuts() {
  const togglePlay = useAppStore((state) => state.togglePlay);
  const toggleRecording = useAppStore((state) => state.toggleRecording);
  const tapTempo = useAppStore((state) => state.tapTempo);
  const triggerPad = useAppStore((state) => state.triggerPad);
  const nextPadBank = useAppStore((state) => state.nextPadBank);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        Boolean(target?.isContentEditable);

      if (isTyping || useLayoutStore.getState().editMode) return;

      const key = event.key.toLowerCase();
      if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      }
      if (key === "r") toggleRecording();
      if (key === "t") tapTempo();
      if (event.key === "Tab") {
        event.preventDefault();
        nextPadBank();
      }

      const padIndex = padKeys.indexOf(key);
      if (padIndex !== -1) {
        triggerPad(`P${String(padIndex + 1).padStart(2, "0")}`);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [nextPadBank, tapTempo, togglePlay, toggleRecording, triggerPad]);

  return null;
}
