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
  lastTriggeredPad: string;
  lastPadVelocity: number;
  currentPadMode:
    | "PAD_PLAY"
    | "STEP_INPUT";
  fullLevelEnabled: boolean;
  waitPadEnabled: boolean;
  countInMode: "OFF" | "1 BAR" | "2 BAR" | "4 BAR";
  countInClickDuring: "REC ONLY" | "PLAY+REC" | "ALWAYS" | "OFF";
  countInClickVolume: number;
  timingCorrectionCountEnabled: boolean;
  waitPadCompatEnabled: boolean;
  transportPhase: "IDLE" | "WAIT_PAD" | "COUNT_IN";
  transportPendingAction: "PLAY" | "REC" | null;
  transportCountInBeatsRemaining: number;
  transportCountInPulse: number;
  transportAnnouncement: string;
  utilityReturnScreen: ScreenId;
  sixteenLevels: {
    sourcePad: string;
    parameter: "VELOCITY" | "TUNE" | "DECAY" | "FILTER" | "ATTACK";
    range: number;
    rootPad: string;
  };
  noteRepeat: {
    rate: "1/8" | "1/16" | "1/32";
    gate: number;
    swing: number;
    velocityMode: "FIXED" | "PAD";
    timingCorrection: "1/8" | "1/16" | "1/32";
  };
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
  tcValue: "1/4" | "1/8" | "1/16" | "1/32";
  stepEvents: StepEvent[];
  selectedStepEventIndex: number;
  currentStepIndex: number;
  mixerTracks: MixerTrack[];
  padMixer: Record<PadBank, MixerChannel[]>;
  performanceTracks: PerformanceTrack[];
  performanceSequences: string[];
  queuedSequence: string | null;
  performancePulse: number;
  diskFolders: DiskFolder[];
  activeDiskFolderId: string;
  selectedDiskItemIndex: number;
  settingsCategories: SettingsCategory[];
  activeSettingsCategoryId: string;
  selectedSettingIndex: number;
  settingsValues: SettingsValues;
  triggeredPads: Record<string, boolean>;
  flashingButtons: Record<string, boolean>;
  tapHistory: number[];
  setActiveScreen: (screen: ScreenId) => void;
  togglePlay: () => void;
  stopPlayback: () => void;
  toggleSequenceRecording: () => void;
  toggleWaitPad: () => void;
  openCountInUtility: () => void;
  setCountInMode: (mode: AppState["countInMode"]) => void;
  cycleCountInClickDuring: () => void;
  adjustCountInClickVolume: (delta: number) => void;
  toggleTimingCorrectionCount: () => void;
  toggleWaitPadCompat: () => void;
  requestTransportStart: (action: "PLAY" | "REC") => void;
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
  openUtilityWorkflow: (screen: ScreenId) => void;
  exitUtilityWorkflow: () => void;
  toggleFullLevel: () => void;
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
  nextStepEvent: () => void;
  previousStepEvent: () => void;
  tickStepPlayback: () => void;
  updateSelectedMixerChannel: (
    field: "level" | "pan" | "fxSend",
    delta: number,
  ) => void;
  toggleSelectedMixerMute: () => void;
  toggleSelectedMixerSolo: () => void;
  cycleSelectedMixerOutput: () => void;
  queuePerformanceSequence: (sequence: string) => void;
  tickPerformance: () => void;
  tickTransport: (deltaMs: number) => void;
  openDiskFolder: (folderId: string) => void;
  selectDiskItem: (index: number) => void;
  nextDiskItem: () => void;
  previousDiskItem: () => void;
  loadSelectedDiskItem: () => void;
  saveDiskItem: () => void;
  setActiveSettingsCategory: (id: string) => void;
  selectSetting: (index: number) => void;
  adjustSelectedSetting: (delta: number) => void;
  toggleSelectedSetting: () => void;
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

type StepEvent = {
  step: string;
  pad: string;
  velocity: number;
  length: number;
  type: "NOTE";
  timingOffset: number;
  probability: number;
  variation: string;
  muted: boolean;
};

type MixerTrack = {
  name: string;
  level: number;
  muted: boolean;
  solo: boolean;
};

type MixerChannel = {
  pad: string;
  level: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  fxSend: number;
  output: "MAIN" | "OUT1" | "OUT2" | "OUT3";
};

type PerformanceTrack = {
  name: string;
  muted: boolean;
};

type DiskItem = {
  name: string;
  type: string;
  size: string;
  modified: string;
  assignedProgram: string;
  usedPads: string;
  sampleLength: string;
};

type DiskFolder = {
  id: string;
  label: string;
  items: DiskItem[];
};

type SettingDefinition = {
  key: keyof SettingsValues;
  label: string;
  kind: "toggle" | "numeric" | "enum";
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
};

type SettingsCategory = {
  id: string;
  label: string;
  settings: SettingDefinition[];
};

type SettingsValues = {
  bpmSync: boolean;
  midiClock: "OFF" | "IN" | "OUT";
  metronomeEnabled: boolean;
  padCurve: "SOFT" | "LINEAR" | "HARD";
  displayBrightness: number;
  autoSave: boolean;
  latency: number;
  audioInputSource: "SYSTEM AUDIO" | "LINE IN" | "USB";
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
  lastTriggeredPad: "P01",
  lastPadVelocity: 96,
  currentPadMode: "PAD_PLAY",
  fullLevelEnabled: false,
  waitPadEnabled: false,
  countInMode: "OFF",
  countInClickDuring: "PLAY+REC",
  countInClickVolume: 70,
  timingCorrectionCountEnabled: true,
  waitPadCompatEnabled: true,
  transportPhase: "IDLE",
  transportPendingAction: null,
  transportCountInBeatsRemaining: 0,
  transportCountInPulse: 0,
  transportAnnouncement: "",
  utilityReturnScreen: "MAIN",
  sixteenLevels: { sourcePad: "P01", parameter: "VELOCITY", range: 127, rootPad: "P01" },
  noteRepeat: { rate: "1/16", gate: 75, swing: 54, velocityMode: "PAD", timingCorrection: "1/16" },
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
  tcValue: "1/16",
  stepEvents: createStepEvents(),
  selectedStepEventIndex: 0,
  currentStepIndex: 0,
  mixerTracks: [
    { name: "01 DRUMS", level: 100, muted: false, solo: false },
    { name: "02 BASS", level: 96, muted: false, solo: false },
    { name: "03 CHOPS", level: 104, muted: false, solo: false },
    { name: "04 TEXTURE", level: 88, muted: false, solo: false },
  ],
  padMixer: createPadMixer(),
  performanceTracks: [
    { name: "DRUMS", muted: false },
    { name: "BASS", muted: false },
    { name: "CHOPS", muted: false },
    { name: "FX", muted: false },
    { name: "TEXTURE", muted: false },
    { name: "VOX", muted: false },
  ],
  performanceSequences: ["SEQ 01", "SEQ 02", "SEQ 03", "SEQ 04"],
  queuedSequence: null,
  performancePulse: 0,
  diskFolders: createDiskFolders(),
  activeDiskFolderId: "memory",
  selectedDiskItemIndex: 0,
  settingsCategories: createSettingsCategories(),
  activeSettingsCategoryId: "midi",
  selectedSettingIndex: 0,
  settingsValues: {
    bpmSync: true,
    midiClock: "OUT",
    metronomeEnabled: true,
    padCurve: "LINEAR",
    displayBrightness: 72,
    autoSave: false,
    latency: 8,
    audioInputSource: "SYSTEM AUDIO",
  },
  triggeredPads: {},
  flashingButtons: {},
  tapHistory: [],
  setActiveScreen: (activeScreen) => set({ activeScreen }),
  togglePlay: () => {
    const state = get();
    if (state.isPlaying) {
      set({
        isPlaying: false,
        transportPhase: "IDLE",
        transportPendingAction: null,
        transportCountInBeatsRemaining: 0,
        transportAnnouncement: "",
      });
      return;
    }
    requestTransportStartImpl("PLAY", set, get);
  },
  stopPlayback: () =>
    set({
      isPlaying: false,
      isSequenceRecording: false,
      chopCursor: 0,
      transportPhase: "IDLE",
      transportPendingAction: null,
      transportCountInBeatsRemaining: 0,
      transportAnnouncement: "",
    }),
  toggleSequenceRecording: () => {
    const state = get();
    if (state.isSequenceRecording) {
      set({
        isSequenceRecording: false,
        transportPhase: "IDLE",
        transportPendingAction: null,
        transportCountInBeatsRemaining: 0,
        transportAnnouncement: "",
      });
      return;
    }
    requestTransportStartImpl("REC", set, get);
  },
  toggleWaitPad: () => set((state) => ({ waitPadEnabled: !state.waitPadEnabled })),
  openCountInUtility: () =>
    set((state) => ({
      activeScreen: "COUNT_IN",
      utilityReturnScreen: isUtilityScreen(state.activeScreen) ? state.utilityReturnScreen : state.activeScreen,
    })),
  setCountInMode: (countInMode) => set({ countInMode }),
  cycleCountInClickDuring: () =>
    set((state) => {
      const order: AppState["countInClickDuring"][] = ["REC ONLY", "PLAY+REC", "ALWAYS", "OFF"];
      return { countInClickDuring: order[(order.indexOf(state.countInClickDuring) + 1) % order.length] };
    }),
  adjustCountInClickVolume: (delta) =>
    set((state) => ({ countInClickVolume: clamp(state.countInClickVolume + delta, 0, 100) })),
  toggleTimingCorrectionCount: () =>
    set((state) => ({ timingCorrectionCountEnabled: !state.timingCorrectionCountEnabled })),
  toggleWaitPadCompat: () => set((state) => ({ waitPadCompatEnabled: !state.waitPadCompatEnabled })),
  requestTransportStart: (action) => requestTransportStartImpl(action, set, get),
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
  playStart: () => requestTransportStartImpl("PLAY", set, get),
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

      if (state.activeScreen === "PERFORMANCE" && padNumber >= 1 && padNumber <= state.performanceTracks.length) {
        return {
          selectedPad,
          triggeredPads: { ...state.triggeredPads, [selectedPad]: true },
          performanceTracks: state.performanceTracks.map((track, index) =>
            index === padNumber - 1 ? { ...track, muted: !track.muted } : track,
          ),
        };
      }

      if (state.activeScreen === "COUNT_IN") {
        return state;
      }

      if (state.activeScreen === "UTILITY_TRACK_MUTE" && padNumber >= 1 && padNumber <= state.performanceTracks.length) {
        return {
          selectedPad,
          triggeredPads: { ...state.triggeredPads, [selectedPad]: true },
          performanceTracks: state.performanceTracks.map((track, index) =>
            index === padNumber - 1 ? { ...track, muted: !track.muted } : track,
          ),
        };
      }

      if (state.activeScreen === "UTILITY_PAD_MUTE") {
        return {
          selectedPad,
          triggeredPads: { ...state.triggeredPads, [selectedPad]: true },
          padMixer: {
            ...state.padMixer,
            [state.padBank]: state.padMixer[state.padBank].map((channel) =>
              channel.pad === selectedPad ? { ...channel, muted: !channel.muted } : channel,
            ),
          },
        };
      }

      if (state.activeScreen === "UTILITY_NEXT_SEQ" && padNumber >= 1 && padNumber <= state.performanceSequences.length) {
        return {
          selectedPad,
          triggeredPads: { ...state.triggeredPads, [selectedPad]: true },
          queuedSequence: state.performanceSequences[padNumber - 1],
        };
      }

      if (state.transportPhase === "WAIT_PAD" && state.transportPendingAction) {
        const pendingAction = state.transportPendingAction;
        const countInBeats = countInModeToBeats(state.countInMode);
        if (countInBeats > 0) {
          return {
            selectedPad,
            lastTriggeredPad: selectedPad,
            lastPadVelocity: state.fullLevelEnabled ? 127 : 72 + ((padNumber * 17 + Date.now()) % 48),
            transportPhase: "COUNT_IN",
            transportPendingAction: pendingAction,
            transportCountInBeatsRemaining: countInBeats,
            transportCountInPulse: 0,
            transportAnnouncement: `COUNT IN ${state.countInMode}`,
            triggeredPads: { ...state.triggeredPads, [selectedPad]: true },
          };
        }
        startTransportAction(pendingAction, set, get);
        return {
          selectedPad,
          lastTriggeredPad: selectedPad,
          lastPadVelocity: state.fullLevelEnabled ? 127 : 72 + ((padNumber * 17 + Date.now()) % 48),
          transportPhase: "IDLE",
          transportPendingAction: null,
          transportAnnouncement: "WAIT PAD RELEASED",
          triggeredPads: { ...state.triggeredPads, [selectedPad]: true },
        };
      }

      if (state.activeScreen === "UTILITY_16_LEVELS") {
        return {
          selectedPad,
          lastTriggeredPad: selectedPad,
          lastPadVelocity: state.fullLevelEnabled ? 127 : 8 + Math.round(((padNumber - 1) / 15) * state.sixteenLevels.range),
          sixteenLevels: { ...state.sixteenLevels, sourcePad: selectedPad },
          triggeredPads: { ...state.triggeredPads, [selectedPad]: true },
        };
      }

      const canSelectSlice =
        state.activeScreen === "CHOP" &&
        state.recordedSamples.length > 0 &&
        padNumber >= 1 &&
        padNumber <= state.chopMarkers.length;

      return {
        selectedPad,
        lastTriggeredPad: selectedPad,
        lastPadVelocity: state.fullLevelEnabled ? 127 : 72 + ((padNumber * 17 + Date.now()) % 48),
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
  openUtilityWorkflow: (activeScreen) =>
    set((state) => ({
      activeScreen,
      utilityReturnScreen: isUtilityScreen(state.activeScreen) ? state.utilityReturnScreen : state.activeScreen,
    })),
  exitUtilityWorkflow: () => set((state) => ({ activeScreen: state.utilityReturnScreen })),
  toggleFullLevel: () => set((state) => ({ fullLevelEnabled: !state.fullLevelEnabled })),
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
  nextStepEvent: () =>
    set((state) => ({
      selectedStepEventIndex: Math.min(state.selectedStepEventIndex + 1, state.stepEvents.length - 1),
    })),
  previousStepEvent: () =>
    set((state) => ({
      selectedStepEventIndex: Math.max(state.selectedStepEventIndex - 1, 0),
    })),
  tickStepPlayback: () =>
    set((state) => ({
      currentStepIndex: state.isPlaying ? (state.currentStepIndex + 1) % 64 : state.currentStepIndex,
    })),
  updateSelectedMixerChannel: (field, delta) =>
    set((state) => ({
      padMixer: {
        ...state.padMixer,
        [state.padBank]: state.padMixer[state.padBank].map((channel) => {
          if (channel.pad !== state.selectedPad) return channel;
          const limits = getMixerLimits(field);
          return { ...channel, [field]: clamp(channel[field] + delta, limits.min, limits.max) };
        }),
      },
    })),
  toggleSelectedMixerMute: () =>
    set((state) => ({
      padMixer: {
        ...state.padMixer,
        [state.padBank]: state.padMixer[state.padBank].map((channel) =>
          channel.pad === state.selectedPad ? { ...channel, muted: !channel.muted } : channel,
        ),
      },
    })),
  toggleSelectedMixerSolo: () =>
    set((state) => ({
      padMixer: {
        ...state.padMixer,
        [state.padBank]: state.padMixer[state.padBank].map((channel) =>
          channel.pad === state.selectedPad ? { ...channel, solo: !channel.solo } : channel,
        ),
      },
    })),
  cycleSelectedMixerOutput: () =>
    set((state) => {
      const outputs: MixerChannel["output"][] = ["MAIN", "OUT1", "OUT2", "OUT3"];
      return {
        padMixer: {
          ...state.padMixer,
          [state.padBank]: state.padMixer[state.padBank].map((channel) => {
            if (channel.pad !== state.selectedPad) return channel;
            const nextOutput = outputs[(outputs.indexOf(channel.output) + 1) % outputs.length];
            return { ...channel, output: nextOutput };
          }),
        },
      };
    }),
  queuePerformanceSequence: (queuedSequence) => set({ queuedSequence }),
  tickPerformance: () =>
    set((state) => {
      const performancePulse = (state.performancePulse + 1) % 16;
      const atBarBoundary = performancePulse === 0;
      const sequence = atBarBoundary && state.queuedSequence ? state.queuedSequence.slice(-2) : state.sequence;
      return {
        performancePulse,
        sequence,
        queuedSequence: atBarBoundary ? null : state.queuedSequence,
      };
    }),
  tickTransport: (deltaMs) =>
    set((state) => {
      if (state.transportPhase !== "COUNT_IN" || state.transportCountInBeatsRemaining <= 0) return state;
      const beatMs = 60000 / state.bpm;
      const nextPulse = state.transportCountInPulse + deltaMs;
      if (nextPulse < beatMs) return { transportCountInPulse: nextPulse };
      const remaining = state.transportCountInBeatsRemaining - 1;
      if (remaining <= 0 && state.transportPendingAction) {
        startTransportAction(state.transportPendingAction, set, get);
        return {
          transportPhase: "IDLE",
          transportPendingAction: null,
          transportCountInBeatsRemaining: 0,
          transportCountInPulse: 0,
          transportAnnouncement: "",
        };
      }
      return {
        transportCountInBeatsRemaining: remaining,
        transportCountInPulse: nextPulse - beatMs,
        transportAnnouncement: `COUNT IN ${state.countInMode}`,
      };
    }),
  openDiskFolder: (activeDiskFolderId) => set({ activeDiskFolderId, selectedDiskItemIndex: 0 }),
  selectDiskItem: (selectedDiskItemIndex) => set({ selectedDiskItemIndex }),
  nextDiskItem: () =>
    set((state) => {
      const folder = state.diskFolders.find((item) => item.id === state.activeDiskFolderId);
      if (!folder) return state;
      return { selectedDiskItemIndex: Math.min(state.selectedDiskItemIndex + 1, folder.items.length - 1) };
    }),
  previousDiskItem: () =>
    set((state) => ({ selectedDiskItemIndex: Math.max(state.selectedDiskItemIndex - 1, 0) })),
  loadSelectedDiskItem: () =>
    set((state) => {
      const folder = state.diskFolders.find((item) => item.id === state.activeDiskFolderId);
      const selected = folder?.items[state.selectedDiskItemIndex];
      if (!selected) return state;
      if (selected.type === "PROGRAM") return { activeProgram: selected.assignedProgram };
      if (selected.type === "SEQUENCE") return { sequence: selected.name.match(/\d+/)?.[0] ?? state.sequence };
      return state;
    }),
  saveDiskItem: () =>
    set((state) => {
      const folderIndex = state.diskFolders.findIndex((item) => item.id === state.activeDiskFolderId);
      if (folderIndex === -1) return state;
      const folder = state.diskFolders[folderIndex];
      const nextSave = folder.items.filter((item) => item.type === "SAVE").length + 1;
      const newItem: DiskItem = {
        name: `PROJECT_${String(nextSave).padStart(2, "0")}.ALL`,
        type: "SAVE",
        size: `${640 + nextSave * 32} KB`,
        modified: "TODAY",
        assignedProgram: state.activeProgram,
        usedPads: "16",
        sampleLength: "--:--.---",
      };
      return {
        diskFolders: state.diskFolders.map((item, index) =>
          index === folderIndex ? { ...item, items: [...item.items, newItem] } : item,
        ),
        selectedDiskItemIndex: folder.items.length,
      };
    }),
  setActiveSettingsCategory: (activeSettingsCategoryId) =>
    set({ activeSettingsCategoryId, selectedSettingIndex: 0 }),
  selectSetting: (selectedSettingIndex) => set({ selectedSettingIndex }),
  adjustSelectedSetting: (delta) =>
    set((state) => {
      const category = state.settingsCategories.find((item) => item.id === state.activeSettingsCategoryId);
      const setting = category?.settings[state.selectedSettingIndex];
      if (!setting) return state;
      const current = state.settingsValues[setting.key];
      if (setting.kind === "numeric" && typeof current === "number") {
        return {
          settingsValues: {
            ...state.settingsValues,
            [setting.key]: clamp(current + delta * (setting.step ?? 1), setting.min ?? current, setting.max ?? current),
          },
        };
      }
      if (setting.kind === "enum" && setting.options) {
        const options = setting.options;
        const currentIndex = options.indexOf(String(current));
        const nextIndex = (currentIndex + delta + options.length) % options.length;
        return { settingsValues: { ...state.settingsValues, [setting.key]: options[nextIndex] } };
      }
      return state;
    }),
  toggleSelectedSetting: () =>
    set((state) => {
      const category = state.settingsCategories.find((item) => item.id === state.activeSettingsCategoryId);
      const setting = category?.settings[state.selectedSettingIndex];
      if (!setting || setting.kind !== "toggle") return state;
      return {
        settingsValues: {
          ...state.settingsValues,
          [setting.key]: !state.settingsValues[setting.key],
        },
      };
    }),
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

function createStepEvents(): StepEvent[] {
  const events: StepEvent[] = [];
  const pads = [
    { pad: "P01", type: "kick" },
    { pad: "P05", type: "snare" },
    { pad: "P09", type: "hat" },
  ];

  for (let bar = 0; bar < 4; bar += 1) {
    for (let step = 0; step < 16; step += 1) {
      if (step % 4 === 0) {
        events.push(createStepEvent(bar, step, pads[0].pad, 112 + ((bar + step) % 10)));
      }
      if (step === 4 || step === 12) {
        events.push(createStepEvent(bar, step, pads[1].pad, 104 + ((bar * 3 + step) % 12)));
      }
      if (step % 2 === 0) {
        events.push(createStepEvent(bar, step, pads[2].pad, 76 + ((bar * 7 + step) % 18)));
      }
    }
  }

  return events;
}

function createStepEvent(bar: number, step: number, pad: string, velocity: number): StepEvent {
  const quarter = Math.floor(step / 4) + 1;
  const tick = (step % 4) * 24;
  return {
    step: `${String(bar + 1).padStart(3, "0")}.${quarter}.${String(tick).padStart(2, "0")}`,
    pad,
    velocity,
    length: pad === "P09" ? 12 : 24,
    type: "NOTE",
    timingOffset: step % 5 === 0 ? -2 : step % 7 === 0 ? 3 : 0,
    probability: pad === "P09" && step % 8 !== 0 ? 92 : 100,
    variation: pad === "P09" ? "HAT" : pad === "P05" ? "SNARE" : "KICK",
    muted: false,
  };
}

function createPadMixer(): Record<PadBank, MixerChannel[]> {
  return {
    A: createMixerBank(),
    B: createMixerBank(),
    C: createMixerBank(),
    D: createMixerBank(),
  };
}

function createMixerBank() {
  return Array.from({ length: 16 }, (_, index) => ({
    pad: `P${String(index + 1).padStart(2, "0")}`,
    level: 92 + ((index * 7) % 24),
    pan: index % 4 === 0 ? -12 : index % 4 === 1 ? 12 : 0,
    muted: false,
    solo: false,
    fxSend: (index * 5) % 32,
    output: index < 12 ? ("MAIN" as const) : ("OUT1" as const),
  }));
}

function getMixerLimits(field: "level" | "pan" | "fxSend") {
  switch (field) {
    case "level":
      return { min: 0, max: 127 };
    case "pan":
      return { min: -50, max: 50 };
    case "fxSend":
      return { min: 0, max: 100 };
  }
}

function createDiskFolders(): DiskFolder[] {
  return [
    {
      id: "memory",
      label: "MEMORY",
      items: [
        createDiskItem("PROJECT_BOOT.ALL", "SAVE", "768 KB", "TODAY", "KIT A", "16", "--:--.---"),
        createDiskItem("SEQ_01.ALL", "SEQUENCE", "12 KB", "TODAY", "KIT A", "--", "--:--.---"),
      ],
    },
    {
      id: "projects",
      label: "PROJECTS",
      items: [
        createDiskItem("LOOPTHIEF_01.ALL", "PROJECT", "1.2 MB", "05/17", "KIT A", "16", "--:--.---"),
        createDiskItem("NIGHT_SHIFT.ALL", "PROJECT", "980 KB", "05/14", "KIT B", "12", "--:--.---"),
      ],
    },
    {
      id: "programs",
      label: "PROGRAMS",
      items: [
        createDiskItem("KIT_A.PGM", "PROGRAM", "24 KB", "05/17", "KIT A", "16", "--:--.---"),
        createDiskItem("KIT_B.PGM", "PROGRAM", "22 KB", "05/15", "KIT B", "14", "--:--.---"),
      ],
    },
    {
      id: "samples",
      label: "SAMPLES",
      items: [
        createDiskItem("DRUMS_01.WAV", "SAMPLE", "412 KB", "05/17", "KIT A", "P01,P05", "00:02.184"),
        createDiskItem("CHOP_02.SLC", "SLICE", "188 KB", "05/17", "KIT A", "P09-P16", "00:01.024"),
        createDiskItem("VOX_HIT.WAV", "SAMPLE", "96 KB", "05/16", "KIT B", "P12", "00:00.512"),
      ],
    },
    {
      id: "exports",
      label: "EXPORTS",
      items: [
        createDiskItem("LOOP_94BPM.WAV", "EXPORT", "3.8 MB", "05/17", "--", "--", "00:16.000"),
        createDiskItem("STEMS_A.ZIP", "EXPORT", "8.2 MB", "05/16", "--", "--", "--:--.---"),
      ],
    },
  ];
}

function createDiskItem(
  name: string,
  type: string,
  size: string,
  modified: string,
  assignedProgram: string,
  usedPads: string,
  sampleLength: string,
): DiskItem {
  return { name, type, size, modified, assignedProgram, usedPads, sampleLength };
}

function isUtilityScreen(screen: ScreenId) {
  return screen.startsWith("UTILITY_");
}

function countInModeToBeats(mode: "OFF" | "1 BAR" | "2 BAR" | "4 BAR") {
  if (mode === "OFF") return 0;
  if (mode === "1 BAR") return 4;
  if (mode === "2 BAR") return 8;
  return 16;
}

function requestTransportStartImpl(
  action: "PLAY" | "REC",
  setState: typeof useAppStore.setState,
  getState: typeof useAppStore.getState,
) {
  const state = getState();
  const countInBeats = countInModeToBeats(state.countInMode);

  if (state.waitPadEnabled) {
    setState({
      transportPhase: "WAIT_PAD",
      transportPendingAction: action,
      transportCountInBeatsRemaining: countInBeats,
      transportCountInPulse: 0,
      transportAnnouncement: "WAIT PAD ON",
    });
    return;
  }

  if (countInBeats > 0) {
    setState({
      transportPhase: "COUNT_IN",
      transportPendingAction: action,
      transportCountInBeatsRemaining: countInBeats,
      transportCountInPulse: 0,
      transportAnnouncement: `COUNT IN ${state.countInMode}`,
    });
    window.setTimeout(() => {
      setState((current) =>
        current.transportAnnouncement === `COUNT IN ${state.countInMode}` ? { transportAnnouncement: "" } : current,
      );
    }, 2000);
    return;
  }

  startTransportAction(action, setState, getState);
}

function startTransportAction(
  action: "PLAY" | "REC",
  setState: typeof useAppStore.setState,
  getState: typeof useAppStore.getState,
) {
  const patch = {
    transportPhase: "IDLE" as const,
    transportPendingAction: null as "PLAY" | "REC" | null,
    transportCountInBeatsRemaining: 0,
    transportCountInPulse: 0,
    transportAnnouncement: "",
  };

  if (action === "PLAY") {
    setState({ ...patch, isPlaying: true, bar: "001.01.00", currentStepIndex: 0 });
  } else {
    setState({
      ...patch,
      isPlaying: true,
      isSequenceRecording: true,
      bar: "001.01.00",
      currentStepIndex: 0,
    });
  }
}

function createSettingsCategories(): SettingsCategory[] {
  return [
    {
      id: "midi",
      label: "MIDI",
      settings: [
        { key: "midiClock", label: "MIDI CLOCK", kind: "enum", options: ["OFF", "IN", "OUT"] },
        { key: "bpmSync", label: "BPM SYNC", kind: "toggle" },
        { key: "padCurve", label: "PAD CURVE", kind: "enum", options: ["SOFT", "LINEAR", "HARD"] },
      ],
    },
    {
      id: "audio",
      label: "AUDIO",
      settings: [
        { key: "audioInputSource", label: "AUDIO INPUT", kind: "enum", options: ["SYSTEM AUDIO", "LINE IN", "USB"] },
        { key: "latency", label: "LATENCY", kind: "numeric", min: 2, max: 24, step: 1 },
      ],
    },
    {
      id: "sync",
      label: "SYNC",
      settings: [
        { key: "bpmSync", label: "BPM SYNC", kind: "toggle" },
        { key: "midiClock", label: "CLOCK SOURCE", kind: "enum", options: ["OFF", "IN", "OUT"] },
      ],
    },
    {
      id: "metronome",
      label: "METRONOME",
      settings: [{ key: "metronomeEnabled", label: "METRONOME", kind: "toggle" }],
    },
    {
      id: "memory",
      label: "MEMORY",
      settings: [{ key: "autoSave", label: "AUTO SAVE", kind: "toggle" }],
    },
    {
      id: "display",
      label: "DISPLAY",
      settings: [{ key: "displayBrightness", label: "BRIGHTNESS", kind: "numeric", min: 10, max: 100, step: 1 }],
    },
    {
      id: "system",
      label: "SYSTEM",
      settings: [
        { key: "autoSave", label: "AUTO SAVE", kind: "toggle" },
        { key: "latency", label: "LATENCY", kind: "numeric", min: 2, max: 24, step: 1 },
      ],
    },
  ];
}
