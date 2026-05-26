import { memo, useEffect, useState } from "react";
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
import { useAppStore } from "../../store/useAppStore";
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

// Dispatcher only — no store subscriptions here so it doesn't fan out a
// re-render across all 58 elements on every store mutation. Each variant
// below subscribes only to the atoms it actually reads (per-key for
// triggeredPads / flashingButtons), and is wrapped in React.memo so a
// re-render of the parent (e.g. layout edit) doesn't cascade.
function LayoutElementView({ element, editMode }: { element: LayoutElement; editMode: boolean }) {
  switch (element.type) {
    case "quit-button":
      // QuitButton renders itself in AppShell (separate component owns the
      // disabled/transport-blocked logic). The layout entry exists so the
      // F7 editor can drag/resize it; the actual button reads x/y/w/h
      // directly from the layout store. Skip rendering here to avoid a
      // stub button overlapping the real one.
      return null;
    case "lcd":
      return <LcdVariant element={element} />;
    case "lcdContent":
      return <LcdContentVariant element={element} />;
    case "status":
      return <StatusVariant element={element} />;
    case "mascot":
      return <MascotVariant element={element} />;
    case "logo":
      return <LogoVariant element={element} />;
    case "pad":
      return <PadVariant element={element} editMode={editMode} />;
    case "bank":
      return <BankVariant element={element} editMode={editMode} />;
    case "mode":
      return <ModeVariant element={element} editMode={editMode} />;
    case "padMode":
      return <PadModeVariant element={element} editMode={editMode} />;
    case "button":
      return <ButtonVariant element={element} editMode={editMode} />;
    default:
      return null;
  }
}

function elementStyle(element: LayoutElement) {
  return { left: element.x, top: element.y, width: element.w, height: element.h };
}

// ---------------------------------------------------------------------------
// Static / near-static variants — no store subscriptions in the variant
// itself (children may subscribe internally; that's their concern).
// ---------------------------------------------------------------------------

const LcdVariant = memo(function LcdVariant({ element }: { element: LayoutElement }) {
  return (
    <div className="absolute" style={elementStyle(element)}>
      <ScreenViewport />
    </div>
  );
});

const LcdContentVariant = memo(function LcdContentVariant({ element }: { element: LayoutElement }) {
  return (
    <div className="absolute" style={elementStyle(element)}>
      <LcdContent />
    </div>
  );
});

const StatusVariant = memo(function StatusVariant({ element }: { element: LayoutElement }) {
  return (
    <div className="absolute" style={elementStyle(element)}>
      <TopBar />
    </div>
  );
});

const LogoVariant = memo(function LogoVariant({ element }: { element: LayoutElement }) {
  return (
    <img
      src={logoImg}
      alt="LoopThief logo"
      className="absolute object-contain pointer-events-none"
      style={elementStyle(element)}
    />
  );
});

const MascotVariant = memo(function MascotVariant({ element }: { element: LayoutElement }) {
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
      style={elementStyle(element)}
    />
  );
});

// ---------------------------------------------------------------------------
// Pad — per-key triggeredPads subscription so only the one pad that
// changed re-renders (not all 16 every event, not all 58 every event).
// ---------------------------------------------------------------------------

const PadVariant = memo(function PadVariant({
  element,
  editMode,
}: {
  element: LayoutElement;
  editMode: boolean;
}) {
  const label = element.label;
  const isTriggered = useAppStore((state) =>
    label ? Boolean(state.triggeredPads[`${state.padBank}:${label}`]) : false,
  );

  return (
    <button
      type="button"
      className="absolute"
      style={elementStyle(element)}
      disabled={editMode}
      onPointerDown={(event) => {
        event.preventDefault();
        if (label) useAppStore.getState().triggerPad(label);
      }}
      onPointerUp={() => label && useAppStore.getState().releasePad(label)}
      onPointerLeave={() => label && useAppStore.getState().releasePad(label)}
      onPointerCancel={() => label && useAppStore.getState().releasePad(label)}
    >
      <img
        src={isTriggered ? padActive : padIdle}
        alt=""
        className="h-full w-full object-contain"
      />

      <span className="absolute bottom-[8%] left-[9%] text-[10px] font-semibold tracking-[0.14em] text-[#ddd6c8]">
        {label}
      </span>
    </button>
  );
});

// ---------------------------------------------------------------------------
// Bank — subscribes to padBank only; re-renders 4 bank buttons on switch.
// ---------------------------------------------------------------------------

const BankVariant = memo(function BankVariant({
  element,
  editMode,
}: {
  element: LayoutElement;
  editMode: boolean;
}) {
  const padBank = useAppStore((state) => state.padBank);
  const label = element.label;
  const isActive = label === padBank;

  return (
    <button
      type="button"
      className="absolute"
      style={elementStyle(element)}
      disabled={editMode}
      onClick={() => {
        if (label === "A" || label === "B" || label === "C" || label === "D") {
          useAppStore.getState().setPadBank(label);
        }
      }}
    >
      <span
        className={`block h-full w-full text-center text-[16px] uppercase tracking-[0.24em] ${
          isActive ? "text-amber-400" : "text-zinc-400"
        }`}
      >
        {label}
      </span>
    </button>
  );
});

// ---------------------------------------------------------------------------
// Mode — selects a top-level screen; subscribes to activeScreen only.
// ---------------------------------------------------------------------------

const ModeVariant = memo(function ModeVariant({
  element,
  editMode,
}: {
  element: LayoutElement;
  editMode: boolean;
}) {
  const label = element.label;
  const active = useAppStore((state) => {
    if (!label) return false;
    if (label === "FX") return state.activeScreen === "FX";
    return label === state.activeScreen;
  });
  const buttonVisual = active ? buttonActive : buttonIdle;

  return (
    <button
      type="button"
      className="absolute"
      style={elementStyle(element)}
      disabled={editMode}
      onClick={() => {
        if (!label) return;
        // Phase A FX system: "FX" hardware button opens the dedicated FX
        // screen (4 buses + master EQ/Comp). Old PERFORMANCE screen is no
        // longer reachable from the hardware shell; left in code as legacy.
        const { setActiveScreen } = useAppStore.getState();
        setActiveScreen(label as Parameters<typeof setActiveScreen>[0]);
      }}
    >
      <img src={buttonVisual} alt="" className="h-full w-full object-contain" />

      <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-[12px] font-semibold tracking-[0.12em] text-[#e5ddcf]">
        {label}
      </span>
    </button>
  );
});

// ---------------------------------------------------------------------------
// PadMode — utility/mode buttons in the pad column. Active state is a
// primitive boolean derived per-label, so each instance re-renders only
// when its own active condition flips.
// ---------------------------------------------------------------------------

const PadModeVariant = memo(function PadModeVariant({
  element,
  editMode,
}: {
  element: LayoutElement;
  editMode: boolean;
}) {
  const label = element.label;
  const active = useAppStore((state) => {
    switch (label) {
      case "PLAY":
        return state.currentPadMode === "PAD_PLAY";
      case "STEP":
        return state.currentPadMode === "STEP_INPUT";
      case "FULL LEVEL":
        return state.fullLevelEnabled;
      case "WAIT PAD":
        return state.waitPadEnabled;
      case "COUNT IN":
        return state.activeScreen === "COUNT_IN" || state.transportPhase === "COUNT_IN";
      case "16 LEVELS":
        return state.activeScreen === "UTILITY_16_LEVELS";
      case "TRACK MUTE":
        return state.activeScreen === "UTILITY_TRACK_MUTE";
      case "PAD MUTE":
        return state.activeScreen === "UTILITY_PAD_MUTE";
      case "NEXT SEQ":
        return state.activeScreen === "UTILITY_NEXT_SEQ";
      case "NOTE REPEAT":
        return state.activeScreen === "UTILITY_NOTE_REPEAT" || state.noteRepeatEnabled;
      default:
        return false;
    }
  });
  const buttonVisual = active ? buttonActive : buttonIdle;

  return (
    <button
      type="button"
      className="absolute"
      style={elementStyle(element)}
      disabled={editMode}
      onClick={() => {
        if (!label) return;
        const state = useAppStore.getState();
        if (label === "PLAY") state.setPadMode("PAD_PLAY");
        if (label === "STEP") {
          // Toggle STEP_INPUT ↔ PAD_PLAY so user can exit STEP_INPUT
          // without a dedicated PAD PLAY button.
          state.setPadMode(state.currentPadMode === "STEP_INPUT" ? "PAD_PLAY" : "STEP_INPUT");
        }
        if (label === "FULL LEVEL") state.toggleFullLevel();
        if (label === "WAIT PAD") state.toggleWaitPad();
        if (label === "COUNT IN") state.openCountInUtility();
        if (label === "16 LEVELS") state.openUtilityWorkflow("UTILITY_16_LEVELS");
        if (label === "TRACK MUTE") state.openUtilityWorkflow("UTILITY_TRACK_MUTE");
        if (label === "PAD MUTE") state.openUtilityWorkflow("UTILITY_PAD_MUTE");
        if (label === "NEXT SEQ") state.openUtilityWorkflow("UTILITY_NEXT_SEQ");
        if (label === "NOTE REPEAT") {
          state.setNoteRepeatEnabled(!state.noteRepeatEnabled);
          state.openUtilityWorkflow("UTILITY_NOTE_REPEAT");
        }
      }}
    >
      <img src={buttonVisual} alt="" className="h-full w-full object-contain" />

      <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-[12px] font-semibold tracking-[0.12em] text-[#e5ddcf]">
        {label ? getPadModeDisplayLabel(label) : ""}
      </span>
    </button>
  );
});

// ---------------------------------------------------------------------------
// Button — transport / nav / utility hardware buttons. Active state is
// a primitive boolean composed per-label. Non-transport buttons fall
// back to flashingButtons[id] — a per-key boolean, so only the flashing
// button re-renders, not all buttons on every flash.
// ---------------------------------------------------------------------------

const ButtonVariant = memo(function ButtonVariant({
  element,
  editMode,
}: {
  element: LayoutElement;
  editMode: boolean;
}) {
  const label = element.label;
  const id = element.id;
  const active = useAppStore((state) => {
    switch (label) {
      case "REC":
        return state.isSequenceRecording;
      case "OVERDUB":
        return state.overdubEnabled;
      case "PLAY":
        return state.isPlaying;
      case "WAIT PAD":
        return state.waitPadEnabled;
      case "COUNT IN":
        return state.activeScreen === "COUNT_IN" || state.transportPhase === "COUNT_IN";
      case "ERASE":
        return state.eraseHoldActive;
      default:
        return Boolean(state.flashingButtons[id]);
    }
  });
  const isRed = label === "REC" || label === "OVERDUB";
  const buttonVisual = active ? buttonActive : isRed ? redButtonIdle : buttonIdle;

  const setEraseHold = (down: boolean) => {
    if (label === "ERASE") useAppStore.getState().setEraseHoldActive(down);
  };

  return (
    <button
      type="button"
      className="absolute"
      style={elementStyle(element)}
      disabled={editMode}
      onMouseDown={() => setEraseHold(true)}
      onMouseUp={() => setEraseHold(false)}
      onMouseLeave={() => setEraseHold(false)}
      onClick={() => {
        if (!label) return;
        const state = useAppStore.getState();
        if (label === "PLAY") state.togglePlay();
        if (label === "STOP") state.stopPlayback();
        if (label === "REC") state.toggleSequenceRecording();
        if (label === "OVERDUB") state.toggleOverdub();
        if (label === "WAIT PAD") state.toggleWaitPad();
        if (label === "COUNT IN") state.openCountInUtility();
        if (label === "GO TO") state.openUtilityWorkflow("GO_TO");
        if (label === "ERASE") state.openUtilityWorkflow("ERASE");
        if (label === "UNDO") state.openUtilityWorkflow("UNDO");
        if (label === "STEP <") state.stepBackward();
        if (label === "STEP >") state.stepForward();
        if (label === "BAR <") state.barBackward();
        if (label === "BAR >") state.barForward();

        if (label === "STOP") {
          state.flashButton(id);
        }

        if (label === "TAP TEMPO") {
          state.tapTempo();
          state.flashButton(id);
        }

        if (label === "PLAY START") {
          state.playStart();
          state.flashButton(id);
        }
      }}
    >
      <img src={buttonVisual} alt="" className="h-full w-full object-contain" />

      <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-[12px] font-semibold tracking-[0.12em] text-[#e5ddcf]">
        {label}
      </span>
    </button>
  );
});
