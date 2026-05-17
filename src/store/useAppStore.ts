import { create } from "zustand";
import type { ScreenId } from "../types/navigation";

type AppState = {
  activeScreen: ScreenId;
  sequence: string;
  bar: string;
  bpm: number;
  swing: number;
  activeTrack: string;
  activeProgram: string;
  padBank: "A" | "B" | "C" | "D";
  selectedPad: string;
  currentPadMode:
    | "PLAY"
    | "16 LEVELS"
    | "FULL LEVEL"
    | "NOTE REPEAT"
    | "TRACK MUTE"
    | "PAD MUTE"
    | "NEXT SEQ"
    | "STEP";
  isPlaying: boolean;
  isRecording: boolean;
  triggeredPads: Record<string, boolean>;
  flashingButtons: Record<string, boolean>;
  tapHistory: number[];
  setActiveScreen: (screen: ScreenId) => void;
  togglePlay: () => void;
  stopPlayback: () => void;
  toggleRecording: () => void;
  playStart: () => void;
  tapTempo: () => void;
  triggerPad: (pad: string) => void;
  flashButton: (id: string) => void;
  nextPadBank: () => void;
  setPadMode: (mode: AppState["currentPadMode"]) => void;
};

export const useAppStore = create<AppState>((set, get) => ({
  activeScreen: "MAIN",
  sequence: "01",
  bar: "001.01.00",
  bpm: 94,
  swing: 54,
  activeTrack: "01 DRUMS",
  activeProgram: "KIT A",
  padBank: "A",
  selectedPad: "P01",
  currentPadMode: "PLAY",
  isPlaying: false,
  isRecording: false,
  triggeredPads: {},
  flashingButtons: {},
  tapHistory: [],
  setActiveScreen: (activeScreen) => set({ activeScreen }),
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  stopPlayback: () => set({ isPlaying: false }),
  toggleRecording: () => set((state) => ({ isRecording: !state.isRecording })),
  playStart: () => set({ bar: "001.01.00", isPlaying: true }),
  tapTempo: () => {
    const now = performance.now();
    const recent = [...get().tapHistory, now].slice(-4);
    if (recent.length >= 2) {
      const intervals = recent.slice(1).map((time, index) => time - recent[index]);
      const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
      set({ bpm: Math.round((60000 / average) * 100) / 100, tapHistory: recent });
      return;
    }
    set({ tapHistory: recent });
  },
  triggerPad: (selectedPad) => {
    set((state) => ({
      selectedPad,
      triggeredPads: { ...state.triggeredPads, [selectedPad]: true },
    }));
    window.setTimeout(() => {
      set((state) => ({
        triggeredPads: { ...state.triggeredPads, [selectedPad]: false },
      }));
    }, 140);
  },
  flashButton: (id) => {
    set((state) => ({
      flashingButtons: { ...state.flashingButtons, [id]: true },
    }));
    window.setTimeout(() => {
      set((state) => ({
        flashingButtons: { ...state.flashingButtons, [id]: false },
      }));
    }, 140);
  },
  nextPadBank: () =>
    set((state) => {
      const banks: AppState["padBank"][] = ["A", "B", "C", "D"];
      const nextIndex = (banks.indexOf(state.padBank) + 1) % banks.length;
      return { padBank: banks[nextIndex] };
    }),
  setPadMode: (currentPadMode) => set({ currentPadMode }),
}));
