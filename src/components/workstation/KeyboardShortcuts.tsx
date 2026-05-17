import { useEffect } from "react";
import { useLayoutStore } from "../../store/useLayoutStore";
import { useAppStore } from "../../store/useAppStore";

const padKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "q", "w", "e", "r", "a", "s", "d"];

export function KeyboardShortcuts() {
  const togglePlay = useAppStore((state) => state.togglePlay);
  const toggleSequenceRecording = useAppStore((state) => state.toggleSequenceRecording);
  const tapTempo = useAppStore((state) => state.tapTempo);
  const triggerPad = useAppStore((state) => state.triggerPad);
  const nextPadBank = useAppStore((state) => state.nextPadBank);
  const nextStepEvent = useAppStore((state) => state.nextStepEvent);
  const previousStepEvent = useAppStore((state) => state.previousStepEvent);
  const nextDiskItem = useAppStore((state) => state.nextDiskItem);
  const previousDiskItem = useAppStore((state) => state.previousDiskItem);

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
      if (key === "r") toggleSequenceRecording();
      if (key === "t") tapTempo();
      if (event.key === "Tab") {
        event.preventDefault();
        nextPadBank();
      }
      if (useAppStore.getState().activeScreen === "STEP") {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          nextStepEvent();
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          previousStepEvent();
        }
      }
      if (useAppStore.getState().activeScreen === "DISK") {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          nextDiskItem();
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          previousDiskItem();
        }
      }

      const padIndex = padKeys.indexOf(key);
      if (padIndex !== -1) {
        triggerPad(`P${String(padIndex + 1).padStart(2, "0")}`);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [nextDiskItem, nextPadBank, nextStepEvent, previousDiskItem, previousStepEvent, tapTempo, togglePlay, toggleSequenceRecording, triggerPad]);

  return null;
}
