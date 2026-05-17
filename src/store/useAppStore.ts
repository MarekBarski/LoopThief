import { create } from "zustand";
import type { ScreenId } from "../types/navigation";

type PadBank = "A" | "B" | "C" | "D";

type AppState = {
  activeScreen: ScreenId;
  sequence: string;
  bar: string;
  bpm: number;
  swing: number;
  activeTrack: string;
  activeProgram: string;
  padBank: PadBank;
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
  isSequenceRecording: boolean;
  isSamplingArmed: boolean;
  isSampling: boolean;
  recordingMs: number;
  inputSource: "SYSTEM AUDIO";
  threshold: number;
  monitorEnabled: boolean;
  sampleLength: string;
  freeMemory: string;
  sampleName: string;
  inputGain: number;
  recordedSamples: Array<{ name: string; durationMs: number; waveform: number[] }>;
  chopSelectedSampleIndex: number;
  chopMarkers: number[];
  selectedSlice: number;
  chopCursor: number;
  normalizeEnabled: boolean;
  padAssignments: Record<PadBank, PadAssignment[]>;
  programView: "PARAMS" | "CHOKE";
  triggeredPads: Record<string, boolean>;
  flashingButtons: Record<string, boolean>;
  tapHistory: number[];
  setActiveScreen: (screen: ScreenId) => void;
  togglePlay: () => void;
  stopPlayback: () => void;
  toggleSequenceRecording: () => void;
  armSampling: () => void;
  startSampling: () => void;
  keepSampling: () => void;
  tickRecording: (deltaMs: number) => void;
  tickChopPlayback: (delta: number) => void;
  playStart: () => void;
  tapTempo: () => void;
  triggerPad: (pad: string) => void;
  flashButton: (id: string) => void;
  nextPadBank: () => void;
  setPadMode: (mode: AppState["currentPadMode"]) => void;
  selectSlice: (slice: number) => void;
  nextSlice: () => void;
  previousSlice: () => void;
  moveSelectedMarker: (delta: number) => void;
  addSlice: () => void;
  removeSlice: () => void;
  assignCurrentSliceToSelectedPad: () => void;
  updateSelectedPadParam: (
    field: "level" | "tune" | "pan" | "attack" | "decay" | "chokeGroup",
    delta: number,
  ) => void;
  toggleSelectedPadMode: () => void;
  setProgramView: (view: AppState["programView"]) => void;
  cycleMuteTargetMode: () => void;
  toggleMuteTargetForSelectedPad: (pad: string) => void;
};

type PadAssignment = {
  pad: string;
  assignment: string;
  mode: "ONE SHOT" | "NOTE ON";
  level: number;
  tune: number;
  pan: number;
  attack: number;
  decay: number;
  chokeGroup: number;
  muteTargetMode: "OFF" | "PAIR" | "GROUP";
  muteTargets: string[];
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
  isSequenceRecording: false,
  isSamplingArmed: false,
  isSampling: false,
  recordingMs: 0,
  inputSource: "SYSTEM AUDIO",
  threshold: -24,
  monitorEnabled: true,
  sampleLength: "00:00.000",
  freeMemory: "25:00",
  sampleName: "SAMPLE_001",
  inputGain: 0,
  recordedSamples: [],
  chopSelectedSampleIndex: 0,
  chopMarkers: createDefaultMarkers(),
  selectedSlice: 1,
  chopCursor: 0,
  normalizeEnabled: false,
  padAssignments: createPadAssignments(),
  programView: "PARAMS",
  triggeredPads: {},
  flashingButtons: {},
  tapHistory: [],
  setActiveScreen: (activeScreen) => set({ activeScreen }),
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  stopPlayback: () => set({ isPlaying: false, chopCursor: 0 }),
  toggleSequenceRecording: () =>
    set((state) => ({ isSequenceRecording: !state.isSequenceRecording })),
  armSampling: () => set({ isSamplingArmed: true, isSampling: false, recordingMs: 0 }),
  startSampling: () =>
    set((state) =>
      state.isSamplingArmed
        ? { isSampling: true, isSamplingArmed: false, recordingMs: 0 }
        : state,
    ),
  keepSampling: () => {
    const state = get();
    if (!state.isSampling) return;
    const nextIndex = state.recordedSamples.length + 1;
    const waveform = createWaveform(nextIndex);
    const nextName = `SAMPLE_${String(nextIndex + 1).padStart(3, "0")}`;
    set({
      isSampling: false,
      isSamplingArmed: false,
      recordedSamples: [
        ...state.recordedSamples,
        { name: state.sampleName, durationMs: state.recordingMs, waveform },
      ],
      chopSelectedSampleIndex: state.recordedSamples.length,
      chopMarkers: createDefaultMarkers(),
      selectedSlice: 1,
      chopCursor: 0,
      padAssignments: {
        ...state.padAssignments,
        [state.padBank]: state.padAssignments[state.padBank].map((pad, index) =>
          index < 8 && pad.assignment === "---"
            ? { ...pad, assignment: `${state.sampleName} / S${String(index + 1).padStart(2, "0")}` }
            : pad,
        ),
      },
      sampleLength: formatMs(state.recordingMs),
      sampleName: nextName,
    });
  },
  tickRecording: (deltaMs) =>
    set((state) =>
      state.isSampling
        ? {
            recordingMs: state.recordingMs + deltaMs,
            sampleLength: formatMs(state.recordingMs + deltaMs),
          }
        : state,
    ),
  tickChopPlayback: (delta) =>
    set((state) => ({
      chopCursor: state.isPlaying ? (state.chopCursor + delta) % 1 : state.chopCursor,
    })),
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
    const padNumber = Number(selectedPad.slice(1));
    set((state) => {
      if (state.activeScreen === "PROGRAM" && state.programView === "CHOKE") {
        const currentPad = state.padAssignments[state.padBank].find((pad) => pad.pad === state.selectedPad);
        if (currentPad && currentPad.pad !== selectedPad) {
          const hasTarget = currentPad.muteTargets.includes(selectedPad);
          const muteTargets = hasTarget
            ? currentPad.muteTargets.filter((target) => target !== selectedPad)
            : [...currentPad.muteTargets, selectedPad].slice(-2);
          return {
            triggeredPads: { ...state.triggeredPads, [selectedPad]: true },
            padAssignments: {
              ...state.padAssignments,
              [state.padBank]: state.padAssignments[state.padBank].map((pad) =>
                pad.pad === state.selectedPad ? { ...pad, muteTargetMode: "PAIR", muteTargets } : pad,
              ),
            },
          };
        }
      }

      const canSelectSlice =
        state.activeScreen === "CHOP" &&
        state.recordedSamples.length > 0 &&
        padNumber >= 1 &&
        padNumber <= state.chopMarkers.length;

      return {
        selectedPad,
        selectedSlice: canSelectSlice ? padNumber : state.selectedSlice,
        chopCursor: canSelectSlice ? state.chopMarkers[padNumber - 1] : state.chopCursor,
        triggeredPads: { ...state.triggeredPads, [selectedPad]: true },
      };
    });
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
  selectSlice: (slice) =>
    set((state) => {
      const bounded = clamp(Math.round(slice), 1, state.chopMarkers.length);
      return { selectedSlice: bounded, chopCursor: state.chopMarkers[bounded - 1] };
    }),
  nextSlice: () =>
    set((state) => {
      const selectedSlice = Math.min(state.selectedSlice + 1, state.chopMarkers.length);
      return { selectedSlice, chopCursor: state.chopMarkers[selectedSlice - 1] };
    }),
  previousSlice: () =>
    set((state) => {
      const selectedSlice = Math.max(state.selectedSlice - 1, 1);
      return { selectedSlice, chopCursor: state.chopMarkers[selectedSlice - 1] };
    }),
  moveSelectedMarker: (delta) =>
    set((state) => {
      const index = state.selectedSlice - 1;
      const previous = index === 0 ? 0 : state.chopMarkers[index - 1] + 0.02;
      const next =
        index === state.chopMarkers.length - 1 ? 0.98 : state.chopMarkers[index + 1] - 0.02;
      const nextValue = clamp(state.chopMarkers[index] + delta, previous, next);
      const chopMarkers = state.chopMarkers.map((marker, markerIndex) =>
        markerIndex === index ? nextValue : marker,
      );
      return { chopMarkers, chopCursor: nextValue };
    }),
  addSlice: () =>
    set((state) => {
      if (state.chopMarkers.length >= 16) return state;
      const index = state.selectedSlice - 1;
      const start = state.chopMarkers[index];
      const end = state.chopMarkers[index + 1] ?? 1;
      const newMarker = start + (end - start) / 2;
      const chopMarkers = [...state.chopMarkers, newMarker].sort((a, b) => a - b);
      const selectedSlice = chopMarkers.indexOf(newMarker) + 1;
      return { chopMarkers, selectedSlice, chopCursor: newMarker };
    }),
  removeSlice: () =>
    set((state) => {
      if (state.chopMarkers.length <= 1) return state;
      const index = state.selectedSlice === 1 ? 1 : state.selectedSlice - 1;
      const chopMarkers = state.chopMarkers.filter((_, markerIndex) => markerIndex !== index);
      const selectedSlice = clamp(state.selectedSlice, 1, chopMarkers.length);
      return { chopMarkers, selectedSlice, chopCursor: chopMarkers[selectedSlice - 1] };
    }),
  assignCurrentSliceToSelectedPad: () =>
    set((state) => {
      const latestSample = state.recordedSamples[state.chopSelectedSampleIndex] ?? state.recordedSamples.at(-1);
      if (!latestSample) return state;
      const assignment = `${latestSample.name} / S${String(state.selectedSlice).padStart(2, "0")}`;
      return {
        padAssignments: {
          ...state.padAssignments,
          [state.padBank]: state.padAssignments[state.padBank].map((pad) =>
            pad.pad === state.selectedPad ? { ...pad, assignment } : pad,
          ),
        },
      };
    }),
  updateSelectedPadParam: (field, delta) =>
    set((state) => ({
      padAssignments: {
        ...state.padAssignments,
        [state.padBank]: state.padAssignments[state.padBank].map((pad) => {
          if (pad.pad !== state.selectedPad) return pad;
          const limits = getParamLimits(field);
          return {
            ...pad,
            [field]: clamp(pad[field] + delta, limits.min, limits.max),
          };
        }),
      },
    })),
  toggleSelectedPadMode: () =>
    set((state) => ({
      padAssignments: {
        ...state.padAssignments,
        [state.padBank]: state.padAssignments[state.padBank].map((pad) =>
          pad.pad === state.selectedPad
            ? { ...pad, mode: pad.mode === "ONE SHOT" ? "NOTE ON" : "ONE SHOT" }
            : pad,
        ),
      },
    })),
  setProgramView: (programView) => set({ programView }),
  cycleMuteTargetMode: () =>
    set((state) => ({
      padAssignments: {
        ...state.padAssignments,
        [state.padBank]: state.padAssignments[state.padBank].map((pad) => {
          if (pad.pad !== state.selectedPad) return pad;
          const order: PadAssignment["muteTargetMode"][] = ["OFF", "PAIR", "GROUP"];
          const muteTargetMode = order[(order.indexOf(pad.muteTargetMode) + 1) % order.length];
          return {
            ...pad,
            muteTargetMode,
            muteTargets: muteTargetMode === "PAIR" ? pad.muteTargets : [],
          };
        }),
      },
    })),
  toggleMuteTargetForSelectedPad: (targetPad) =>
    set((state) => ({
      padAssignments: {
        ...state.padAssignments,
        [state.padBank]: state.padAssignments[state.padBank].map((pad) => {
          if (pad.pad !== state.selectedPad || pad.pad === targetPad) return pad;
          const hasTarget = pad.muteTargets.includes(targetPad);
          return {
            ...pad,
            muteTargetMode: "PAIR",
            muteTargets: hasTarget
              ? pad.muteTargets.filter((target) => target !== targetPad)
              : [...pad.muteTargets, targetPad].slice(-2),
          };
        }),
      },
    })),
}));

function formatMs(value: number) {
  const totalSeconds = Math.floor(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.floor(value % 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function createWaveform(seed: number) {
  let value = seed * 16807;
  return Array.from({ length: 64 }, () => {
    value = (value * 48271) % 2147483647;
    return 0.12 + ((value / 2147483647) * 0.88);
  });
}

function createDefaultMarkers() {
  return Array.from({ length: 8 }, (_, index) => index / 8);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function createPadAssignments(): Record<"A" | "B" | "C" | "D", PadAssignment[]> {
  return {
    A: createBankAssignments(),
    B: createBankAssignments(),
    C: createBankAssignments(),
    D: createBankAssignments(),
  };
}

function createBankAssignments() {
  return Array.from({ length: 16 }, (_, index) => ({
    pad: `P${String(index + 1).padStart(2, "0")}`,
    assignment: "---",
    mode: "ONE SHOT" as const,
    level: 100,
    tune: 0,
    pan: 0,
    attack: 0,
    decay: 100,
    chokeGroup: 0,
    muteTargetMode: "OFF" as const,
    muteTargets: [],
  }));
}

function getParamLimits(field: "level" | "tune" | "pan" | "attack" | "decay" | "chokeGroup") {
  switch (field) {
    case "level":
      return { min: 0, max: 127 };
    case "tune":
      return { min: -24, max: 24 };
    case "pan":
      return { min: -50, max: 50 };
    case "attack":
    case "decay":
      return { min: 0, max: 100 };
    case "chokeGroup":
      return { min: 0, max: 8 };
  }
}
