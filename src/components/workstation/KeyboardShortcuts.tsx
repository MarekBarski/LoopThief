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
  const adjustGoToValue = useAppStore((state) => state.adjustGoToValue);
  const setEraseHoldActive = useAppStore((state) => state.setEraseHoldActive);
  const undoLastAction = useAppStore((state) => state.undoLastAction);
  const redoLastAction = useAppStore((state) => state.redoLastAction);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        Boolean(target?.isContentEditable);

      if (isTyping || useLayoutStore.getState().editMode) return;

      const key = event.key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && key === "z" && !event.shiftKey) {
        event.preventDefault();
        undoLastAction();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === "z" && event.shiftKey) {
        event.preventDefault();
        redoLastAction();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === "y") {
        event.preventDefault();
        redoLastAction();
        return;
      }

      if (key === "e") {
        setEraseHoldActive(true);
      }
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
      if (useAppStore.getState().activeScreen === "GO_TO") {
        if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          event.preventDefault();
          adjustGoToValue(-1);
        }
        if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          event.preventDefault();
          adjustGoToValue(1);
        }
      }

      const padIndex = padKeys.indexOf(key);
      if (padIndex !== -1) {
        triggerPad(`P${String(padIndex + 1).padStart(2, "0")}`);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "e") {
        setEraseHoldActive(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [adjustGoToValue, nextDiskItem, nextPadBank, nextStepEvent, previousDiskItem, previousStepEvent, redoLastAction, setEraseHoldActive, tapTempo, togglePlay, toggleSequenceRecording, triggerPad, undoLastAction]);

  return null;
}
