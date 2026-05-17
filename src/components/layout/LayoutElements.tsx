import { useEffect, useState } from "react";
import buttonActive from "../../../assets/ui/buttons/button_active.png";
import buttonIdle from "../../../assets/ui/buttons/button_idle.png";
import padActive from "../../../assets/ui/pads/pad_active.png";
import padIdle from "../../../assets/ui/pads/pad_idle.png";
import thiefBlink from "../../../assets/ui/mascot/thief_blink_01.png";
import thiefIdle from "../../../assets/ui/mascot/thief_idle.png";
import { useLayoutStore } from "../../store/useLayoutStore";
import { useAppStore } from "../../store/useAppStore";
import type { LayoutElement } from "../../types/layout";
import { ScreenViewport } from "./ScreenViewport";
import { TopBar } from "./TopBar";
import { LcdContent } from "./LcdContent";

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
  const isRecording = useAppStore((state) => state.isRecording);
  const triggeredPads = useAppStore((state) => state.triggeredPads);
  const triggerPad = useAppStore((state) => state.triggerPad);
  const togglePlay = useAppStore((state) => state.togglePlay);
  const stopPlayback = useAppStore((state) => state.stopPlayback);
  const toggleRecording = useAppStore((state) => state.toggleRecording);
  const tapTempo = useAppStore((state) => state.tapTempo);
  const playStart = useAppStore((state) => state.playStart);
  const flashingButtons = useAppStore((state) => state.flashingButtons);
  const flashButton = useAppStore((state) => state.flashButton);
  const currentPadMode = useAppStore((state) => state.currentPadMode);
  const setPadMode = useAppStore((state) => state.setPadMode);
  const padBank = useAppStore((state) => state.padBank);
  const nextPadBank = useAppStore((state) => state.nextPadBank);

  const commonStyle = {
    left: element.x,
    top: element.y,
    width: element.w,
    height: element.h,
  };

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

  if (element.type === "pad") {
    const isTriggered = Boolean(element.label && triggeredPads[element.label]);
    return (
      <button
        type="button"
        className="absolute"
        style={commonStyle}
        disabled={editMode}
        onClick={() => element.label && triggerPad(element.label)}
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
        onClick={nextPadBank}
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
      ? element.label === activeScreen
      : element.type === "padMode"
        ? element.label === currentPadMode
        : element.label === "REC"
          ? isRecording
          : element.label === "PLAY"
            ? isPlaying
            : Boolean(flashingButtons[element.id]);

  return (
    <button
      type="button"
      className="absolute"
      style={commonStyle}
      disabled={editMode}
      onClick={() => {
        if (element.type === "mode" && element.label) {
          setActiveScreen(element.label as Parameters<typeof setActiveScreen>[0]);
        }
        if (element.type === "padMode" && element.label) {
          setPadMode(element.label as Parameters<typeof setPadMode>[0]);
        }
        if (element.type === "button" && element.label) {
          if (element.label === "PLAY") togglePlay();
          if (element.label === "STOP") stopPlayback();
          if (element.label === "REC") toggleRecording();
          if (element.label === "STOP") flashButton(element.id);
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
        src={active ? buttonActive : buttonIdle}
        alt=""
        className="h-full w-full object-contain"
      />
      <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-[12px] font-semibold tracking-[0.12em] text-[#e5ddcf]">
        {element.label}
      </span>
    </button>
  );
}

function MascotElement({
  style,
}: {
  style: { left: number; top: number; width: number; height: number };
}) {
  const [isBlinking, setIsBlinking] = useState(false);

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
      src={isBlinking ? thiefBlink : thiefIdle}
      alt="LoopThief mascot"
      className="absolute object-contain"
      style={style}
    />
  );
}
