import { useEffect, useState } from "react";
import buttonActive from "../../../assets/ui/buttons/button_active.png";
import buttonIdle from "../../../assets/ui/buttons/button_idle.png";
import redButtonIdle from "../../../assets/ui/buttons/T_button_idle_RED.png";
import padActive from "../../../assets/ui/pads/pad_active.png";
import padIdle from "../../../assets/ui/pads/pad_idle.png";
import thiefBlink from "../../../assets/ui/mascot/thief_blink_01.png";
import thiefIdle from "../../../assets/ui/mascot/thief_idle.png";
import thiefHeadphonesBlink from "../../../assets/ui/mascot/thief_headphones_blink_01.png";
import thiefHeadphonesIdle from "../../../assets/ui/mascot/thief_headphones_idle.png";
import logoImg from "../../../assets/ui/logo/loopthief_logo.png";

import { useLayoutStore } from "../../store/useLayoutStore";
import { isPadVisuallyTriggered, useAppStore } from "../../store/useAppStore";
import type { LayoutElement } from "../../types/layout";
import { ScreenViewport } from "./ScreenViewport";
import { TopBar } from "./TopBar";
import { LcdContent } from "./LcdContent";
import { getPadModeDisplayLabel } from "../../utils/padModeLabels";

export function LayoutElements() {
  const elements = useLayoutStore((state) => state.elements);
  const editMode = useLayoutStore((state) => state.editMode);

  return (
    <>
      {elements.map((element) => (
        <LayoutElementView key={element.id} element={element} editMode={editMode} />
      ))}
    </>
  );
}

function LayoutElementView({ element, editMode }: { element: LayoutElement; editMode: boolean }) {
  const setActiveScreen = useAppStore((state) => state.setActiveScreen);
  const activeScreen = useAppStore((state) => state.activeScreen);
  const isPlaying = useAppStore((state) => state.isPlaying);
  const isSequenceRecording = useAppStore((state) => state.isSequenceRecording);
  const overdubEnabled = useAppStore((state) => state.overdubEnabled);
  const triggeredPads = useAppStore((state) => state.triggeredPads);
  const triggerPad = useAppStore((state) => state.triggerPad);
  const releasePad = useAppStore((state) => state.releasePad);
  const togglePlay = useAppStore((state) => state.togglePlay);
  const stopPlayback = useAppStore((state) => state.stopPlayback);
  const toggleSequenceRecording = useAppStore((state) => state.toggleSequenceRecording);
  const toggleOverdub = useAppStore((state) => state.toggleOverdub);
  const toggleWaitPad = useAppStore((state) => state.toggleWaitPad);
  const openCountInUtility = useAppStore((state) => state.openCountInUtility);
  const tapTempo = useAppStore((state) => state.tapTempo);
  const playStart = useAppStore((state) => state.playStart);
  const stepBackward = useAppStore((state) => state.stepBackward);
  const stepForward = useAppStore((state) => state.stepForward);
  const barBackward = useAppStore((state) => state.barBackward);
  const barForward = useAppStore((state) => state.barForward);
  const flashingButtons = useAppStore((state) => state.flashingButtons);
  const eraseHoldActive = useAppStore((state) => state.eraseHoldActive);
  const setEraseHoldActive = useAppStore((state) => state.setEraseHoldActive);
  const noteRepeatEnabled = useAppStore((state) => state.noteRepeatEnabled);
  const setNoteRepeatEnabled = useAppStore((state) => state.setNoteRepeatEnabled);
  const flashButton = useAppStore((state) => state.flashButton);
  const currentPadMode = useAppStore((state) => state.currentPadMode);
  const setPadMode = useAppStore((state) => state.setPadMode);
  const fullLevelEnabled = useAppStore((state) => state.fullLevelEnabled);
  const toggleFullLevel = useAppStore((state) => state.toggleFullLevel);
  const openUtilityWorkflow = useAppStore((state) => state.openUtilityWorkflow);
  const waitPadEnabled = useAppStore((state) => state.waitPadEnabled);
  const transportPhase = useAppStore((state) => state.transportPhase);
  const padBank = useAppStore((state) => state.padBank);
  const setPadBank = useAppStore((state) => state.setPadBank);

  const commonStyle = {
    left: element.x,
    top: element.y,
    width: element.w,
    height: element.h,
  };

  if (element.type === "quit-button") {
    // QuitButton renders itself in AppShell (separate component owns the
    // disabled/transport-blocked logic). The layout entry exists so the F7
    // editor can drag/resize it; the actual button reads x/y/w/h directly
    // from the layout store. Skip rendering here to avoid a stub button
    // overlapping the real one.
    return null;
  }

  if (element.type === "lcd") {
    return (
      <div className="absolute" style={commonStyle}>
        <ScreenViewport />
      </div>
    );
  }

  if (element.type === "lcdContent") {
    return (
      <div className="absolute" style={commonStyle}>
        <LcdContent />
      </div>
    );
  }

  if (element.type === "status") {
    return (
      <div className="absolute" style={commonStyle}>
        <TopBar />
      </div>
    );
  }

  if (element.type === "mascot") {
    return <MascotElement style={commonStyle} />;
  }

  if (element.type === "logo") {
    return (
      <img
        src={logoImg}
        alt="LoopThief logo"
        className="absolute object-contain pointer-events-none"
        style={commonStyle}
      />
    );
  }

  if (element.type === "pad") {
    const isTriggered = Boolean(element.label && isPadVisuallyTriggered(triggeredPads, padBank, element.label));

    return (
      <button
        type="button"
        className="absolute"
        style={commonStyle}
        disabled={editMode}
        onPointerDown={(event) => {
          event.preventDefault();
          if (element.label) triggerPad(element.label);
        }}
        onPointerUp={() => element.label && releasePad(element.label)}
        onPointerLeave={() => element.label && releasePad(element.label)}
        onPointerCancel={() => element.label && releasePad(element.label)}
      >
        <img
          src={isTriggered ? padActive : padIdle}
          alt=""
          className="h-full w-full object-contain"
        />

        <span className="absolute bottom-[8%] left-[9%] text-[10px] font-semibold tracking-[0.14em] text-[#ddd6c8]">
          {element.label}
        </span>
      </button>
    );
  }

  if (element.type === "bank") {
    return (
      <button
        type="button"
        className="absolute"
        style={commonStyle}
        disabled={editMode}
        onClick={() => {
          if (element.label === "A" || element.label === "B" || element.label === "C" || element.label === "D") {
            setPadBank(element.label);
          }
        }}
      >
        <span
          className={`block h-full w-full text-center text-[16px] uppercase tracking-[0.24em] ${
            element.label === padBank ? "text-amber-400" : "text-zinc-400"
          }`}
        >
          {element.label}
        </span>
      </button>
    );
  }

  const active =
    element.type === "mode"
      ? (element.label === "FX"
          ? activeScreen === "FX"
          : element.label === activeScreen)
      : element.type === "padMode"
        ? (element.label === "PLAY" && currentPadMode === "PAD_PLAY") ||
          (element.label === "STEP" && currentPadMode === "STEP_INPUT") ||
          (element.label === "FULL LEVEL" && fullLevelEnabled) ||
          (element.label === "WAIT PAD" && waitPadEnabled) ||
          (element.label === "COUNT IN" &&
            (activeScreen === "COUNT_IN" || transportPhase === "COUNT_IN")) ||
          (element.label === "16 LEVELS" &&
            activeScreen === "UTILITY_16_LEVELS") ||
          (element.label === "TRACK MUTE" &&
            activeScreen === "UTILITY_TRACK_MUTE") ||
          (element.label === "PAD MUTE" &&
            activeScreen === "UTILITY_PAD_MUTE") ||
          (element.label === "NEXT SEQ" &&
            activeScreen === "UTILITY_NEXT_SEQ") ||
          (element.label === "NOTE REPEAT" &&
            (activeScreen === "UTILITY_NOTE_REPEAT" || noteRepeatEnabled))
        : element.label === "REC"
          ? isSequenceRecording
          : element.label === "OVERDUB"
            ? overdubEnabled
          : element.label === "PLAY"
            ? isPlaying
            : element.label === "WAIT PAD"
              ? waitPadEnabled
              : element.label === "COUNT IN"
                ? activeScreen === "COUNT_IN" ||
                  transportPhase === "COUNT_IN"
                : element.label === "ERASE"
                  ? eraseHoldActive
                  : Boolean(flashingButtons[element.id]);
  const buttonVisual = getButtonVisual(element, active);

  return (
    <button
      type="button"
      className="absolute"
      style={commonStyle}
      disabled={editMode}
      onMouseDown={() => {
        if (element.type === "button" && element.label === "ERASE") setEraseHoldActive(true);
      }}
      onMouseUp={() => {
        if (element.type === "button" && element.label === "ERASE") setEraseHoldActive(false);
      }}
      onMouseLeave={() => {
        if (element.type === "button" && element.label === "ERASE") setEraseHoldActive(false);
      }}
      onClick={() => {
        if (element.type === "mode" && element.label) {
          // Phase A FX system: "FX" hardware button opens the dedicated FX screen
          // (4 buses + master EQ/Comp). Old PERFORMANCE screen is no longer reachable
          // from the hardware shell; left in code as legacy.
          setActiveScreen(element.label as Parameters<typeof setActiveScreen>[0]);
        }

        if (element.type === "padMode" && element.label) {
          if (element.label === "PLAY") setPadMode("PAD_PLAY");
          if (element.label === "STEP") {
            // Toggle STEP_INPUT ↔ PAD_PLAY so user can exit STEP_INPUT without a dedicated PAD PLAY button.
            setPadMode(currentPadMode === "STEP_INPUT" ? "PAD_PLAY" : "STEP_INPUT");
          }
          if (element.label === "FULL LEVEL") toggleFullLevel();
          if (element.label === "WAIT PAD") toggleWaitPad();
          if (element.label === "COUNT IN") openCountInUtility();
          if (element.label === "16 LEVELS")
            openUtilityWorkflow("UTILITY_16_LEVELS");
          if (element.label === "TRACK MUTE")
            openUtilityWorkflow("UTILITY_TRACK_MUTE");
          if (element.label === "PAD MUTE")
            openUtilityWorkflow("UTILITY_PAD_MUTE");
          if (element.label === "NEXT SEQ")
            openUtilityWorkflow("UTILITY_NEXT_SEQ");
          if (element.label === "NOTE REPEAT") {
            setNoteRepeatEnabled(!noteRepeatEnabled);
            openUtilityWorkflow("UTILITY_NOTE_REPEAT");
          }
        }

        if (element.type === "button" && element.label) {
          if (element.label === "PLAY") togglePlay();
          if (element.label === "STOP") stopPlayback();
          if (element.label === "REC") toggleSequenceRecording();
          if (element.label === "OVERDUB") toggleOverdub();
          if (element.label === "WAIT PAD") toggleWaitPad();
          if (element.label === "COUNT IN") openCountInUtility();
          if (element.label === "GO TO") openUtilityWorkflow("GO_TO");
          if (element.label === "ERASE") openUtilityWorkflow("ERASE");
          if (element.label === "UNDO") openUtilityWorkflow("UNDO");
          if (element.label === "STEP <") stepBackward();
          if (element.label === "STEP >") stepForward();
          if (element.label === "BAR <") barBackward();
          if (element.label === "BAR >") barForward();

          if (
            element.label === "STOP"
          ) {
            flashButton(element.id);
          }

          if (element.label === "TAP TEMPO") {
            tapTempo();
            flashButton(element.id);
          }

          if (element.label === "PLAY START") {
            playStart();
            flashButton(element.id);
          }
        }
      }}
    >
      <img
        src={buttonVisual}
        alt=""
        className="h-full w-full object-contain"
      />

      <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-[12px] font-semibold tracking-[0.12em] text-[#e5ddcf]">
        {element.type === "padMode" && element.label
          ? getPadModeDisplayLabel(element.label)
          : element.label}
      </span>
    </button>
  );
}

function getButtonVisual(element: LayoutElement, active: boolean) {
  if (isRedTransportButton(element)) {
    return active ? buttonActive : redButtonIdle;
  }

  return active ? buttonActive : buttonIdle;
}

function isRedTransportButton(element: LayoutElement) {
  return element.type === "button" && (element.label === "REC" || element.label === "OVERDUB");
}

function MascotElement({
  style,
}: {
  style: { left: number; top: number; width: number; height: number };
}) {
  const activeScreen = useAppStore((state) => state.activeScreen);
  const [isBlinking, setIsBlinking] = useState(false);
  const isRecordScreen = activeScreen === "RECORD";

  useEffect(() => {
    let blinkTimeout: ReturnType<typeof setTimeout>;
    let resetTimeout: ReturnType<typeof setTimeout>;

    const scheduleBlink = () => {
      blinkTimeout = setTimeout(
        () => {
          setIsBlinking(true);

          resetTimeout = setTimeout(
            () => {
              setIsBlinking(false);
              scheduleBlink();
            },
            150 + Math.random() * 100,
          );
        },
        6000 + Math.random() * 6000,
      );
    };

    scheduleBlink();

    return () => {
      clearTimeout(blinkTimeout);
      clearTimeout(resetTimeout);
    };
  }, []);

  return (
    <img
      src={
        isRecordScreen
          ? isBlinking
            ? thiefHeadphonesBlink
            : thiefHeadphonesIdle
          : isBlinking
            ? thiefBlink
            : thiefIdle
      }
      alt="LoopThief mascot"
      className="absolute object-contain"
      style={style}
    />
  );
}
