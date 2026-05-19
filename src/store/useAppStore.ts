import { create } from "zustand";
import type { ScreenId } from "../types/navigation";
import { startRecordingCapture, type ActiveRecordingCapture, type RecordingInputSource } from "../audio/recordingCapture";
import { samplerEngine } from "../audio/samplerEngine";
import { createSampleId, createWaveformCache, encodeWavRegion, getSampleAudioRef, registerSampleAudio } from "../audio/sampleLibrary";

type PadBank = "A" | "B" | "C" | "D";
type ChopMarkerSelection = "sampleStart" | "sampleEnd" | "loopStart" | "loopEnd" | `slice:${number}` | null;
type RecordedSample = {
  id: string;
  name: string;
  audioBufferId: string;
  durationMs: number;
  duration: number;
  sampleRate: number;
  channelCount: number;
  waveform: number[];
  keptSlices: string[];
  editState?: SampleEditState;
};
type SampleEditState = {
  sampleStart: number;
  sampleEnd: number;
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  loopBars: number;
  sliceMarkers: number[];
};

type AppState = {
  activeScreen: ScreenId;
  audioStatus: "IDLE" | "READY" | "ERROR";
  lastAudioMessage: string;
  sequence: string;
  sequences: Sequence[];
  currentSequence: string;
  sequenceLengthBars: number;
  timeSignature: "4/4";
  sequenceName: string;
  bar: string;
  bpm: number;
  swing: number;
  timingCorrect: "OFF" | "1/4" | "1/8" | "1/16" | "1/16T" | "1/32" | "1/32T";
  quantizeStrength: number;
  tcEnabled: boolean;
  timingApplyTo: "CURRENT TRACK" | "ALL TRACKS";
  noteRepeatLinkedToTc: boolean;
  noteRepeatEnabled: boolean;
  noteRepeatRate: "1/4" | "1/8" | "1/16" | "1/16T" | "1/32" | "1/32T";
  noteRepeatGate: number;
  noteRepeatLinkToTC: boolean;
  noteRepeatTriplet: boolean;
  activeTrack: string;
  activeProgram: string;
  currentBar: number;
  currentStep: number;
  currentEvent: number;
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
  goToTarget: "BAR" | "STEP" | "EVENT" | "SEQ";
  eraseMode: "PAD" | "TRACK" | "BAR" | "EVENTS" | "AUTOMATION";
  eraseHoldActive: boolean;
  lastEraseMessage: string;
  lastErasedCount: number;
  undoHistory: string[];
  redoHistory: string[];
  lastAction: string;
  sixteenLevelsEnabled: boolean;
  sixteenLevelsSourcePad: string;
  sixteenLevelsParameter: "VELOCITY" | "TUNE" | "DECAY" | "FILTER" | "ATTACK";
  sixteenLevelsRootPad: string;
  sixteenLevelsRangeMin: number;
  sixteenLevelsRangeMax: number;
  lastSixteenLevelsValue: number;
  noteRepeat: {
    rate: "1/4" | "1/8" | "1/16" | "1/16T" | "1/32" | "1/32T";
    gate: number;
    swing: number;
    velocityMode: "FIXED" | "PAD";
    timingCorrection: "1/4" | "1/8" | "1/16" | "1/16T" | "1/32" | "1/32T";
  };
  isPlaying: boolean;
  isSequenceRecording: boolean;
  isSamplingArmed: boolean;
  isSampling: boolean;
  recordingMs: number;
  inputSource: RecordingInputSource;
  inputLevel: number;
  threshold: number | "OFF";
  monitorEnabled: boolean;
  sampleLength: string;
  freeMemory: string;
  sampleName: string;
  inputGain: number;
  importStatus: "IDLE" | "LOADING" | "READY" | "ERROR";
  importMessage: string;
  recordedSamples: RecordedSample[];
  chopSelectedSampleIndex: number;
  waveformZoom: number;
  waveformOffset: number;
  chopEditMode: "TRIM" | "LOOP" | "CHOP";
  chopSliceMode: "AUTO" | "MANUAL";
  autoSliceCount: number;
  selectedMarker: ChopMarkerSelection;
  sampleStart: number;
  sampleEnd: number;
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  loopBars: number;
  sliceMarkers: number[];
  chopMarkers: number[];
  selectedSlice: number;
  chopCursor: number;
  chopPreviewActive: boolean;
  chopPreviewStart: number;
  chopPreviewEnd: number;
  chopPreviewStartedAt: number;
  chopPreviewDurationMs: number;
  normalizeEnabled: boolean;
  padAssignments: Record<PadBank, PadAssignment[]>;
  programView: "PARAMS" | "CHOKE";
  stepEvents: StepEvent[];
  selectedStepEventIndex: number;
  selectedEventIndex: number;
  selectedEventId: string | null;
  eventEditMode: "VELOCITY" | "OFFSET" | "DURATION" | "PROBABILITY" | "TRACK";
  currentStepIndex: number;
  mixerTracks: MixerTrack[];
  padMixer: Record<PadBank, MixerChannel[]>;
  performanceTracks: PerformanceTrack[];
  trackMuteMode: "MUTE" | "SOLO" | "HOLD";
  lastPerformanceMessage: string;
  songSteps: SongStep[];
  selectedSongStepIndex: number;
  currentSongStepIndex: number;
  currentSongRepeat: number;
  queuedSequence: string | null;
  queuedSequenceBarsRemaining: number;
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
  cycleInputSource: () => void;
  toggleMonitor: () => void;
  cycleThreshold: () => void;
  adjustInputGain: (delta: number) => void;
  importWavFile: (file: File) => Promise<void>;
  tickRecording: (deltaMs: number) => void;
  tickChopPlayback: () => void;
  playStart: () => void;
  tapTempo: () => void;
  triggerPad: (pad: string) => void;
  releasePad: (pad: string) => void;
  flashButton: (id: string) => void;
  nextPadBank: () => void;
  setPadMode: (mode: AppState["currentPadMode"]) => void;
  openUtilityWorkflow: (screen: ScreenId) => void;
  exitUtilityWorkflow: () => void;
  setGoToTarget: (target: AppState["goToTarget"]) => void;
  adjustGoToValue: (delta: number) => void;
  executeGoTo: () => void;
  setEraseMode: (mode: AppState["eraseMode"]) => void;
  executeErase: () => void;
  setEraseHoldActive: (active: boolean) => void;
  erasePadEvents: (pad: string) => void;
  undoLastAction: () => void;
  redoLastAction: () => void;
  clearUndoHistory: () => void;
  createSequence: () => void;
  duplicateCurrentSequence: () => void;
  deleteCurrentSequence: () => void;
  renameCurrentSequence: () => void;
  cycleTimingCorrect: () => void;
  adjustSwing: (delta: number) => void;
  adjustQuantizeStrength: (delta: number) => void;
  cycleTimingApplyTo: () => void;
  toggleNoteRepeatLink: () => void;
  resetTimingCorrect: () => void;
  setNoteRepeatEnabled: (enabled: boolean) => void;
  cycleNoteRepeatRate: () => void;
  adjustNoteRepeatGate: (delta: number) => void;
  toggleNoteRepeatTriplet: () => void;
  cycleNoteRepeatVelocityMode: () => void;
  cycleSixteenLevelsParameter: () => void;
  setSixteenLevelsSourcePad: () => void;
  setSixteenLevelsRootPad: () => void;
  cycleSixteenLevelsRange: () => void;
  toggleSixteenLevelsEnabled: () => void;
  insertSongStep: () => void;
  deleteSelectedSongStep: () => void;
  adjustSelectedSongRepeats: (delta: number) => void;
  moveSelectedSongStep: (delta: number) => void;
  cycleSelectedSongSequence: () => void;
  convertSongToSequence: () => void;
  tickSongPlayback: () => void;
  toggleFullLevel: () => void;
  selectSlice: (slice: number) => void;
  nextSlice: () => void;
  previousSlice: () => void;
  setSelectedMarker: (marker: ChopMarkerSelection) => void;
  setChopEditMode: (mode: AppState["chopEditMode"]) => void;
  setChopSliceMode: (mode: AppState["chopSliceMode"]) => void;
  setAutoSliceCount: (count: number) => void;
  enableLoopMode: () => void;
  adjustLoopBars: (delta: number) => void;
  enterChopMode: () => void;
  autoChop: () => void;
  setWaveformZoom: (zoom: number) => void;
  panWaveform: (delta: number) => void;
  moveMarkerTo: (marker: Exclude<ChopMarkerSelection, null>, value: number) => void;
  moveSelectedMarker: (delta: number) => void;
  addSlice: () => void;
  insertSliceAt: (position: number) => void;
  removeSlice: () => void;
  saveChopEdits: () => void;
  previewChopSlice: (sliceIndex: number) => void;
  keepChops: (options: { baseName: string; targetBank: PadBank; createProgram: boolean }) => void;
  discardChopEdits: () => void;
  assignCurrentSliceToSelectedPad: () => void;
  assignSourceToSelectedPad: (sourceName: string) => void;
  previewSource: (sourceName: string) => void;
  previousChopSample: () => void;
  nextChopSample: () => void;
  updateSelectedPadParam: (
    field: "level" | "tune" | "pan" | "attack" | "decay" | "chokeGroup",
    delta: number,
  ) => void;
  toggleSelectedPadMode: () => void;
  toggleSelectedPadVoiceMode: () => void;
  setProgramView: (view: AppState["programView"]) => void;
  cycleMuteTargetMode: () => void;
  toggleMuteTargetForSelectedPad: (pad: string) => void;
  nextStepEvent: () => void;
  previousStepEvent: () => void;
  setEventEditMode: (mode: AppState["eventEditMode"]) => void;
  adjustSelectedEvent: (field: "velocity" | "timingOffset" | "duration" | "probability", delta: number) => void;
  cycleSelectedEventTrack: () => void;
  deleteSelectedEvent: () => void;
  stepBackward: () => void;
  stepForward: () => void;
  barBackward: () => void;
  barForward: () => void;
  tickStepPlayback: () => void;
  updateSelectedMixerChannel: (
    field: "level" | "pan" | "fxSend",
    delta: number,
  ) => void;
  setMixerChannelValue: (pad: string, field: "level" | "pan" | "fxSend", value: number) => void;
  selectMixerPad: (pad: string) => void;
  toggleSelectedMixerMute: () => void;
  toggleSelectedMixerSolo: () => void;
  toggleMixerChannelMute: (pad: string) => void;
  toggleMixerChannelSolo: (pad: string) => void;
  cycleSelectedMixerOutput: () => void;
  cycleTrackMuteMode: () => void;
  setTrackMuteMode: (mode: AppState["trackMuteMode"]) => void;
  clearTrackMutes: () => void;
  queuePerformanceSequence: (sequence: string) => void;
  tickPerformance: () => void;
  tickTransport: (deltaMs: number) => void;
  openDiskFolder: (folderId: string) => void;
  selectDiskItem: (index: number) => void;
  nextDiskItem: () => void;
  previousDiskItem: () => void;
  loadSelectedDiskItem: () => void;
  saveDiskItem: () => void;
  previewSelectedMemorySample: () => void;
  renameSelectedMemorySample: (name: string) => void;
  deleteSelectedMemorySample: () => void;
  exportSelectedMemorySample: () => void;
  setActiveSettingsCategory: (id: string) => void;
  selectSetting: (index: number) => void;
  adjustSelectedSetting: (delta: number) => void;
  toggleSelectedSetting: () => void;
};

type PadAssignment = {
  pad: string;
  assignment: string;
  mode: "ONE SHOT" | "NOTE ON";
  voiceMode: "POLY" | "MONO";
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
  id: string;
  step: string;
  pad: string;
  trackId: string;
  trackName?: string;
  physicalPad?: string;
  sourcePad?: string;
  appliedParameter?: AppState["sixteenLevelsParameter"];
  appliedValue?: number;
  parameterValue?: number;
  noteRepeatGenerated?: boolean;
  velocity: number;
  length: number;
  duration: number;
  type: "NOTE";
  timingOffset: number;
  probability: number;
  variation: string;
  muted: boolean;
};

type Sequence = {
  id: string;
  name: string;
  lengthBars: number;
  timeSignature: "4/4";
  bpm: number;
  tracks: string[];
  events: StepEvent[];
};

type SongStep = {
  sequenceId: string;
  repeats: number;
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
  solo: boolean;
  activity: number;
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
  masterVolume: number;
  audioInputSource: "SYSTEM AUDIO" | "LINE IN" | "USB";
};

let eventIdCounter = 0;
let activeRecordingCapture: ActiveRecordingCapture | null = null;

const initialStepEvents = createStepEvents();

export const useAppStore = create<AppState>((set, get) => ({
  activeScreen: "MAIN",
  audioStatus: samplerEngine.getStatus(),
  lastAudioMessage: "",
  sequence: "01",
  sequences: createSequences(initialStepEvents),
  currentSequence: "01",
  sequenceLengthBars: 4,
  timeSignature: "4/4",
  sequenceName: "SEQ 01",
  bar: "001.01.00",
  bpm: 94,
  swing: 54,
  timingCorrect: "1/16",
  quantizeStrength: 100,
  tcEnabled: true,
  timingApplyTo: "CURRENT TRACK",
  noteRepeatLinkedToTc: true,
  noteRepeatEnabled: false,
  noteRepeatRate: "1/16",
  noteRepeatGate: 75,
  noteRepeatLinkToTC: true,
  noteRepeatTriplet: false,
  activeTrack: "01 DRUMS",
  activeProgram: "KIT A",
  currentBar: 1,
  currentStep: 1,
  currentEvent: 1,
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
  goToTarget: "BAR",
  eraseMode: "PAD",
  eraseHoldActive: false,
  lastEraseMessage: "",
  lastErasedCount: 0,
  undoHistory: ["OVERDUB", "PAD ERASE", "TC APPLY"],
  redoHistory: [],
  lastAction: "TC APPLY",
  sixteenLevelsEnabled: false,
  sixteenLevelsSourcePad: "P01",
  sixteenLevelsParameter: "VELOCITY",
  sixteenLevelsRootPad: "P01",
  sixteenLevelsRangeMin: 1,
  sixteenLevelsRangeMax: 127,
  lastSixteenLevelsValue: 96,
  noteRepeat: { rate: "1/16", gate: 75, swing: 54, velocityMode: "PAD", timingCorrection: "1/16" },
  isPlaying: false,
  isSequenceRecording: false,
  isSamplingArmed: false,
  isSampling: false,
  recordingMs: 0,
  inputSource: "SYSTEM",
  inputLevel: 0,
  threshold: -24,
  monitorEnabled: true,
  sampleLength: "00:00.000",
  freeMemory: "25:00",
  sampleName: "SAMPLE_001",
  inputGain: 0,
  importStatus: "IDLE",
  importMessage: "WAV ONLY",
  recordedSamples: [],
  chopSelectedSampleIndex: 0,
  waveformZoom: 1,
  waveformOffset: 0,
  chopEditMode: "TRIM",
  chopSliceMode: "AUTO",
  autoSliceCount: 8,
  selectedMarker: "sampleStart",
  sampleStart: 0,
  sampleEnd: 1,
  loopEnabled: false,
  loopStart: 0,
  loopEnd: 1,
  loopBars: 4,
  sliceMarkers: [],
  chopMarkers: [],
  selectedSlice: 1,
  chopCursor: 0,
  chopPreviewActive: false,
  chopPreviewStart: 0,
  chopPreviewEnd: 0,
  chopPreviewStartedAt: 0,
  chopPreviewDurationMs: 0,
  normalizeEnabled: false,
  padAssignments: createPadAssignments(),
  programView: "PARAMS",
  stepEvents: initialStepEvents,
  selectedStepEventIndex: 0,
  selectedEventIndex: 0,
  selectedEventId: initialStepEvents[0]?.id ?? null,
  eventEditMode: "VELOCITY",
  currentStepIndex: 0,
  mixerTracks: [
    { name: "01 DRUMS", level: 100, muted: false, solo: false },
    { name: "02 BASS", level: 96, muted: false, solo: false },
    { name: "03 CHOPS", level: 104, muted: false, solo: false },
    { name: "04 TEXTURE", level: 88, muted: false, solo: false },
  ],
  padMixer: createPadMixer(),
  performanceTracks: [
    { name: "DRUMS", muted: false, solo: false, activity: 78 },
    { name: "BASS", muted: false, solo: false, activity: 62 },
    { name: "CHOPS", muted: false, solo: false, activity: 54 },
    { name: "FX", muted: false, solo: false, activity: 36 },
    { name: "TEXTURE", muted: false, solo: false, activity: 44 },
    { name: "VOX", muted: false, solo: false, activity: 28 },
  ],
  trackMuteMode: "MUTE",
  lastPerformanceMessage: "",
  songSteps: [
    { sequenceId: "01", repeats: 2 },
    { sequenceId: "02", repeats: 1 },
    { sequenceId: "03", repeats: 1 },
  ],
  selectedSongStepIndex: 0,
  currentSongStepIndex: 0,
  currentSongRepeat: 1,
  queuedSequence: null,
  queuedSequenceBarsRemaining: 0,
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
    masterVolume: 1500,
    audioInputSource: "SYSTEM AUDIO",
  },
  triggeredPads: {},
  flashingButtons: {},
  tapHistory: [],
  setActiveScreen: (activeScreen) => set({ activeScreen }),
  togglePlay: () => {
    void samplerEngine.ensureReady();
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
  armSampling: () => set({ isSamplingArmed: true, isSampling: false, recordingMs: 0, sampleLength: "00:00.000", importStatus: "IDLE", importMessage: "ARMED" }),
  startSampling: () => {
    const state = get();
    if (!state.isSamplingArmed || state.isSampling) return;
    set({ importStatus: "LOADING", importMessage: `OPENING ${state.inputSource}` });
    const gain = dbToGain(state.inputGain);
    void startRecordingCapture(state.inputSource, (inputLevel) => useAppStore.setState({ inputLevel: clamp(inputLevel * gain, 0, 1) }))
      .then((capture) => {
        activeRecordingCapture = capture;
        set({
          isSampling: true,
          isSamplingArmed: false,
          recordingMs: 0,
          sampleLength: "00:00.000",
          importStatus: "READY",
          importMessage: `RECORDING ${get().inputSource}`,
        });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message.toUpperCase() : "CAPTURE FAILED";
        set({ isSampling: false, isSamplingArmed: false, inputLevel: 0, importStatus: "ERROR", importMessage: message });
      });
  },
  keepSampling: () => {
    const state = get();
    if (!state.isSampling) return;
    const capture = activeRecordingCapture;
    activeRecordingCapture = null;
    if (!capture) {
      set({ isSampling: false, isSamplingArmed: false, inputLevel: 0, importStatus: "ERROR", importMessage: "NO ACTIVE RECORDER" });
      return;
    }
    set({ importStatus: "LOADING", importMessage: "DECODING RECORDING" });
    void capture.stop()
      .then((blob) => blob.arrayBuffer())
      .then((data) => samplerEngine.decodeAudioData(data))
      .then((buffer) => {
        applyBufferGain(buffer, get().inputGain);
        const sample = createImportedSample(get().sampleName, buffer);
        registerSampleAudio(sample.audioBufferId, buffer);
        set((latest) => ({
          ...addSampleToState(latest, sample, `RECORDED ${sample.name}`),
          activeScreen: "CHOP",
          isSampling: false,
          isSamplingArmed: false,
          inputLevel: 0,
        }));
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message.toUpperCase() : "RECORD DECODE FAILED";
        set({ isSampling: false, isSamplingArmed: false, inputLevel: 0, importStatus: "ERROR", importMessage: message });
      });
  },
  cycleInputSource: () =>
    set((state) => {
      const sources: RecordingInputSource[] = ["DEFAULT", "MIC", "SYSTEM"];
      return { inputSource: sources[(sources.indexOf(state.inputSource) + 1) % sources.length] };
    }),
  toggleMonitor: () => set((state) => ({ monitorEnabled: !state.monitorEnabled })),
  cycleThreshold: () =>
    set((state) => {
      const values: Array<number | "OFF"> = [-60, -48, -36, -24, -18, -12, -6, "OFF"];
      return { threshold: values[(values.indexOf(state.threshold) + 1) % values.length] };
    }),
  adjustInputGain: (delta) => set((state) => ({ inputGain: clamp(state.inputGain + delta, -24, 24) })),
  importWavFile: async (file) => {
    if (!isWavFile(file)) {
      set({ importStatus: "ERROR", importMessage: "WAV FILES ONLY" });
      return;
    }

    set({ importStatus: "LOADING", importMessage: `IMPORTING ${file.name.toUpperCase()}` });

    try {
      const buffer = await samplerEngine.decodeAudioData(await file.arrayBuffer());
      const imported = createImportedSample(file.name, buffer);
      registerSampleAudio(imported.audioBufferId, buffer);
      set((state) => addSampleToState(state, imported, `IMPORTED ${imported.name}`));
    } catch {
      set({ importStatus: "ERROR", importMessage: "WAV DECODE FAILED" });
    }
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
  tickChopPlayback: () =>
    set((state) => {
      if (!state.chopPreviewActive || state.chopPreviewDurationMs <= 0) return state;
      const elapsed = performance.now() - state.chopPreviewStartedAt;
      const progress = clamp(elapsed / state.chopPreviewDurationMs, 0, 1);
      const chopCursor = state.chopPreviewStart + (state.chopPreviewEnd - state.chopPreviewStart) * progress;
      if (progress >= 1) {
        return {
          chopCursor,
          chopPreviewActive: false,
        };
      }
      return { chopCursor };
    }),
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
      if (state.eraseHoldActive) {
        const events = state.stepEvents.filter((event) => event.pad !== selectedPad);
        const removedCount = state.stepEvents.length - events.length;
        const sequences = state.sequences.map((sequence) =>
          sequence.id === state.currentSequence ? { ...sequence, events } : sequence,
        );
        return {
          selectedPad,
          stepEvents: events,
          sequences,
          lastEraseMessage: `ERASE ${selectedPad}`,
          lastErasedCount: removedCount,
          undoHistory: pushHistory(state.undoHistory, `PAD ERASE ${selectedPad}`),
          redoHistory: [],
        };
      }
      if (state.noteRepeatEnabled) {
        const rate = state.noteRepeatLinkToTC && state.timingCorrect !== "OFF"
          ? state.timingCorrect
          : state.noteRepeatRate;
        const repeatedEvents = createRepeatedNoteEvents(state, selectedPad, rate);
        const events = state.isSequenceRecording
          ? [...state.stepEvents, ...repeatedEvents].sort((a, b) => eventStepIndex(a.step) - eventStepIndex(b.step))
          : state.stepEvents;
        return {
          selectedPad,
          lastTriggeredPad: selectedPad,
          lastPadVelocity: state.fullLevelEnabled ? 127 : 96,
          stepEvents: events,
          sequences: state.sequences.map((sequence) =>
            sequence.id === state.currentSequence ? { ...sequence, events } : sequence,
          ),
          triggeredPads: { ...state.triggeredPads, [selectedPad]: true },
        };
      }
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
        const targetIndex = padNumber - 1;
        const target = state.performanceTracks[targetIndex];
        const performanceTracks = nextPerformanceTracks(state.performanceTracks, targetIndex, state.trackMuteMode);
        return {
          selectedPad,
          triggeredPads: { ...state.triggeredPads, [selectedPad]: true },
          performanceTracks,
          lastPerformanceMessage: performanceMessage(targetIndex, performanceTracks[targetIndex]),
        };
      }

      if (state.activeScreen === "COUNT_IN") {
        return state;
      }

      if (state.activeScreen === "UTILITY_TRACK_MUTE" && padNumber >= 1 && padNumber <= state.performanceTracks.length) {
        const targetIndex = padNumber - 1;
        const target = state.performanceTracks[targetIndex];
        const performanceTracks = nextPerformanceTracks(state.performanceTracks, targetIndex, state.trackMuteMode);
        return {
          selectedPad,
          triggeredPads: { ...state.triggeredPads, [selectedPad]: true },
          performanceTracks,
          lastPerformanceMessage: performanceMessage(targetIndex, performanceTracks[targetIndex]),
        };
      }

      if (state.activeScreen === "UTILITY_PAD_MUTE") {
        const channels = state.padMixer[state.padBank].map((channel) =>
          channel.pad === selectedPad ? { ...channel, muted: !channel.muted } : channel,
        );
        syncMixerBankToAudio(state.padBank, channels);
        return {
          selectedPad,
          triggeredPads: { ...state.triggeredPads, [selectedPad]: true },
          padMixer: {
            ...state.padMixer,
            [state.padBank]: channels,
          },
        };
      }

      if (state.activeScreen === "UTILITY_NEXT_SEQ" && padNumber >= 1 && padNumber <= state.sequences.length) {
        const sequence = state.sequences[padNumber - 1];
        return {
          selectedPad,
          triggeredPads: { ...state.triggeredPads, [selectedPad]: true },
          queuedSequence: sequence.id,
          queuedSequenceBarsRemaining: 1,
          lastPerformanceMessage: `NEXT SEQ: ${sequence.name}`,
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

      if (state.sixteenLevelsEnabled) {
        const appliedValue = getSixteenLevelsValue(state, padNumber);
        const event = createStepEventFromIndex(
          state.currentStepIndex,
          state.sixteenLevelsSourcePad,
          state.sixteenLevelsParameter === "VELOCITY" ? appliedValue : state.lastPadVelocity,
          100,
          0,
          {
            physicalPad: selectedPad,
            sourcePad: state.sixteenLevelsSourcePad,
            appliedParameter: state.sixteenLevelsParameter,
            appliedValue,
            parameterValue: appliedValue,
          },
        );
        const events = [...state.stepEvents, event].sort((a, b) => eventStepIndex(a.step) - eventStepIndex(b.step));
        return {
          selectedPad,
          lastTriggeredPad: selectedPad,
          lastPadVelocity: state.sixteenLevelsParameter === "VELOCITY" ? appliedValue : state.lastPadVelocity,
          lastSixteenLevelsValue: appliedValue,
          stepEvents: events,
          sequences: state.sequences.map((sequence) =>
            sequence.id === state.currentSequence ? { ...sequence, events } : sequence,
          ),
          triggeredPads: { ...state.triggeredPads, [selectedPad]: true },
        };
      }

      if (state.activeScreen === "UTILITY_16_LEVELS") {
        return {
          selectedPad,
          lastTriggeredPad: selectedPad,
          lastPadVelocity: state.fullLevelEnabled ? 127 : state.lastPadVelocity,
          sixteenLevelsSourcePad: selectedPad,
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
    playPadFromState(get(), selectedPad);
    if (get().noteRepeatEnabled) playNoteRepeatBurst(get(), selectedPad);
    window.setTimeout(() => {
      set((state) => ({
        triggeredPads: { ...state.triggeredPads, [selectedPad]: false },
      }));
    }, 140);
  },
  releasePad: (pad) => {
    const state = get();
    const assignment = state.padAssignments[state.padBank].find((item) => item.pad === pad);
    if (assignment?.mode === "NOTE ON") samplerEngine.stopVoiceGroup(mixerChannelKey(state.padBank, pad));
    set((current) => ({
      triggeredPads: { ...current.triggeredPads, [pad]: false },
    }));
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
  setGoToTarget: (goToTarget) => set({ goToTarget }),
  adjustGoToValue: (delta) =>
    set((state) => {
      if (state.goToTarget === "BAR") {
        return { currentBar: clamp(state.currentBar + delta, 1, state.sequenceLengthBars) };
      }
      if (state.goToTarget === "STEP") {
        return { currentStep: clamp(state.currentStep + delta, 1, 16) };
      }
      if (state.goToTarget === "EVENT") {
        return { currentEvent: clamp(state.currentEvent + delta, 1, 999) };
      }
      const currentIndex = state.sequences.findIndex((sequence) => sequence.id === state.currentSequence);
      const nextIndex = clamp(currentIndex + delta, 0, state.sequences.length - 1);
      return applyCurrentSequence(state, state.sequences[nextIndex].id);
    }),
  executeGoTo: () =>
    set((state) => {
      const currentStepIndex = ((state.currentBar - 1) * 16 + (state.currentStep - 1)) % (state.sequenceLengthBars * 16);
      return {
      bar: formatBarPosition(state.currentBar, state.currentStep),
      currentStepIndex,
      ...selectedEventPatch(state.stepEvents, nearestEventAtOrAfter(state.stepEvents, currentStepIndex)),
      lastAction: `GO TO ${String(state.currentBar).padStart(3, "0")}.${String(state.currentStep).padStart(2, "0")}`,
      undoHistory: pushHistory(state.undoHistory, `GO TO ${String(state.currentBar).padStart(3, "0")}.${String(state.currentStep).padStart(2, "0")}`),
      redoHistory: [],
      };
    }),
  setEraseMode: (eraseMode) => set({ eraseMode }),
  executeErase: () =>
    set((state) => {
      const action = `${state.eraseMode} ERASE`;
      return {
        lastAction: action,
        undoHistory: pushHistory(state.undoHistory, action),
        redoHistory: [],
      };
    }),
  setEraseHoldActive: (eraseHoldActive) => set({ eraseHoldActive }),
  erasePadEvents: (pad) =>
    set((state) => {
      const events = state.stepEvents.filter((event) => event.pad !== pad);
      const removedCount = state.stepEvents.length - events.length;
      return {
        stepEvents: events,
        sequences: state.sequences.map((sequence) =>
          sequence.id === state.currentSequence ? { ...sequence, events } : sequence,
        ),
        lastEraseMessage: `ERASE ${pad}`,
        lastErasedCount: removedCount,
      };
    }),
  undoLastAction: () =>
    set((state) => {
      const action = state.undoHistory.at(-1);
      if (!action) return state;
      return {
        undoHistory: state.undoHistory.slice(0, -1),
        redoHistory: [action, ...state.redoHistory].slice(0, 8),
        lastAction: `UNDO ${action}`,
      };
    }),
  redoLastAction: () =>
    set((state) => {
      const action = state.redoHistory[0];
      if (!action) return state;
      return {
        undoHistory: pushHistory(state.undoHistory, action),
        redoHistory: state.redoHistory.slice(1),
        lastAction: `REDO ${action}`,
      };
    }),
  clearUndoHistory: () => set({ undoHistory: [], redoHistory: [], lastAction: "HISTORY CLEARED" }),
  createSequence: () =>
    set((state) => {
      const id = nextSequenceId(state.sequences);
      const sequence = createSequence(id, `SEQ ${id}`, state.bpm, []);
      return applyCurrentSequence({ ...state, sequences: [...state.sequences, sequence] }, id);
    }),
  duplicateCurrentSequence: () =>
    set((state) => {
      const current = getCurrentSequence(state);
      const id = nextSequenceId(state.sequences);
      const sequence = {
        ...current,
        id,
        name: `${current.name} COPY`,
        events: current.events.map((event) => ({ ...event })),
      };
      return applyCurrentSequence({ ...state, sequences: [...state.sequences, sequence] }, id);
    }),
  deleteCurrentSequence: () =>
    set((state) => {
      if (state.sequences.length <= 1) return state;
      const sequences = state.sequences.filter((sequence) => sequence.id !== state.currentSequence);
      return applyCurrentSequence({ ...state, sequences }, sequences[0].id);
    }),
  renameCurrentSequence: () =>
    set((state) => {
      const nextName = state.sequenceName.endsWith("*")
        ? state.sequenceName.replace(/\*+$/, "")
        : `${state.sequenceName}*`;
      return {
        sequences: state.sequences.map((sequence) =>
          sequence.id === state.currentSequence ? { ...sequence, name: nextName } : sequence,
        ),
        sequenceName: nextName,
      };
    }),
  cycleTimingCorrect: () =>
    set((state) => {
      const values: AppState["timingCorrect"][] = ["OFF", "1/4", "1/8", "1/16", "1/16T", "1/32", "1/32T"];
      const timingCorrect = values[(values.indexOf(state.timingCorrect) + 1) % values.length];
      return {
        timingCorrect,
        tcEnabled: timingCorrect !== "OFF",
        noteRepeat: state.noteRepeatLinkToTC
          ? { ...state.noteRepeat, rate: timingCorrect === "OFF" ? state.noteRepeat.rate : timingCorrect, timingCorrection: timingCorrect === "OFF" ? state.noteRepeat.timingCorrection : timingCorrect }
          : state.noteRepeat,
      };
    }),
  adjustSwing: (delta) =>
    set((state) => {
      const swing = clamp(state.swing + delta, 50, 75);
      return { swing, noteRepeat: { ...state.noteRepeat, swing } };
    }),
  adjustQuantizeStrength: (delta) =>
    set((state) => ({ quantizeStrength: clamp(state.quantizeStrength + delta, 0, 100) })),
  cycleTimingApplyTo: () =>
    set((state) => ({
      timingApplyTo: state.timingApplyTo === "CURRENT TRACK" ? "ALL TRACKS" : "CURRENT TRACK",
    })),
  toggleNoteRepeatLink: () =>
    set((state) => ({
      noteRepeatLinkedToTc: !state.noteRepeatLinkedToTc,
      noteRepeatLinkToTC: !state.noteRepeatLinkToTC,
      noteRepeat: !state.noteRepeatLinkedToTc && state.timingCorrect !== "OFF"
        ? { ...state.noteRepeat, rate: state.timingCorrect, timingCorrection: state.timingCorrect }
        : state.noteRepeat,
    })),
  resetTimingCorrect: () =>
    set((state) => ({
      timingCorrect: "1/16",
      tcEnabled: true,
      swing: 50,
      quantizeStrength: 100,
      timingApplyTo: "CURRENT TRACK",
      noteRepeat: state.noteRepeatLinkToTC
        ? { ...state.noteRepeat, rate: "1/16", timingCorrection: "1/16", swing: 50 }
        : { ...state.noteRepeat, swing: 50 },
    })),
  setNoteRepeatEnabled: (noteRepeatEnabled) => set({ noteRepeatEnabled }),
  cycleNoteRepeatRate: () =>
    set((state) => {
      const rates: AppState["noteRepeatRate"][] = ["1/4", "1/8", "1/16", "1/16T", "1/32", "1/32T"];
      const noteRepeatRate = rates[(rates.indexOf(state.noteRepeatRate) + 1) % rates.length];
      return {
        noteRepeatRate,
        noteRepeat: { ...state.noteRepeat, rate: noteRepeatRate },
      };
    }),
  adjustNoteRepeatGate: (delta) =>
    set((state) => {
      const noteRepeatGate = clamp(state.noteRepeatGate + delta, 1, 100);
      return { noteRepeatGate, noteRepeat: { ...state.noteRepeat, gate: noteRepeatGate } };
    }),
  toggleNoteRepeatTriplet: () =>
    set((state) => {
      const noteRepeatTriplet = !state.noteRepeatTriplet;
      const baseRate = state.noteRepeatRate.replace("T", "") as "1/4" | "1/8" | "1/16" | "1/32";
      const noteRepeatRate = noteRepeatTriplet && (baseRate === "1/16" || baseRate === "1/32")
        ? `${baseRate}T` as AppState["noteRepeatRate"]
        : baseRate;
      return { noteRepeatTriplet, noteRepeatRate, noteRepeat: { ...state.noteRepeat, rate: noteRepeatRate } };
    }),
  cycleNoteRepeatVelocityMode: () =>
    set((state) => ({
      noteRepeat: {
        ...state.noteRepeat,
        velocityMode: state.noteRepeat.velocityMode === "PAD" ? "FIXED" : "PAD",
      },
    })),
  cycleSixteenLevelsParameter: () =>
    set((state) => {
      const parameters: AppState["sixteenLevelsParameter"][] = ["VELOCITY", "TUNE", "DECAY", "FILTER", "ATTACK"];
      return { sixteenLevelsParameter: parameters[(parameters.indexOf(state.sixteenLevelsParameter) + 1) % parameters.length] };
    }),
  setSixteenLevelsSourcePad: () => set((state) => ({ sixteenLevelsSourcePad: state.selectedPad })),
  setSixteenLevelsRootPad: () => set((state) => ({ sixteenLevelsRootPad: state.selectedPad })),
  cycleSixteenLevelsRange: () =>
    set((state) => {
      if (state.sixteenLevelsParameter === "TUNE") {
        return { sixteenLevelsRangeMin: -12, sixteenLevelsRangeMax: 12 };
      }
      return state.sixteenLevelsRangeMax === 127
        ? { sixteenLevelsRangeMin: 0, sixteenLevelsRangeMax: 100 }
        : { sixteenLevelsRangeMin: 1, sixteenLevelsRangeMax: 127 };
    }),
  toggleSixteenLevelsEnabled: () => set((state) => ({ sixteenLevelsEnabled: !state.sixteenLevelsEnabled })),
  insertSongStep: () =>
    set((state) => ({
      songSteps: [
        ...state.songSteps.slice(0, state.selectedSongStepIndex + 1),
        { sequenceId: state.currentSequence, repeats: 1 },
        ...state.songSteps.slice(state.selectedSongStepIndex + 1),
      ],
      selectedSongStepIndex: state.selectedSongStepIndex + 1,
    })),
  deleteSelectedSongStep: () =>
    set((state) => {
      if (state.songSteps.length <= 1) return state;
      const songSteps = state.songSteps.filter((_, index) => index !== state.selectedSongStepIndex);
      return {
        songSteps,
        selectedSongStepIndex: clamp(state.selectedSongStepIndex, 0, songSteps.length - 1),
        currentSongStepIndex: clamp(state.currentSongStepIndex, 0, songSteps.length - 1),
      };
    }),
  adjustSelectedSongRepeats: (delta) =>
    set((state) => ({
      songSteps: state.songSteps.map((step, index) =>
        index === state.selectedSongStepIndex ? { ...step, repeats: clamp(step.repeats + delta, 1, 99) } : step,
      ),
    })),
  moveSelectedSongStep: (delta) =>
    set((state) => {
      const targetIndex = clamp(state.selectedSongStepIndex + delta, 0, state.songSteps.length - 1);
      if (targetIndex === state.selectedSongStepIndex) return state;
      const songSteps = [...state.songSteps];
      const [step] = songSteps.splice(state.selectedSongStepIndex, 1);
      songSteps.splice(targetIndex, 0, step);
      return { songSteps, selectedSongStepIndex: targetIndex };
    }),
  cycleSelectedSongSequence: () =>
    set((state) => {
      const selected = state.songSteps[state.selectedSongStepIndex];
      const currentIndex = state.sequences.findIndex((sequence) => sequence.id === selected.sequenceId);
      const nextSequence = state.sequences[(currentIndex + 1) % state.sequences.length];
      return {
        songSteps: state.songSteps.map((step, index) =>
          index === state.selectedSongStepIndex ? { ...step, sequenceId: nextSequence.id } : step,
        ),
      };
    }),
  convertSongToSequence: () =>
    set((state) => {
      const id = nextSequenceId(state.sequences);
      const flattenedEvents = state.songSteps.flatMap((step) => {
        const sequence = state.sequences.find((item) => item.id === step.sequenceId);
        return Array.from({ length: step.repeats }, () => sequence?.events ?? []).flat().map((event) => ({ ...event }));
      });
      const sequence = createSequence(id, "SONG_CONVERT", state.bpm, flattenedEvents);
      return applyCurrentSequence({ ...state, sequences: [...state.sequences, sequence] }, id);
    }),
  tickSongPlayback: () =>
    set((state) => {
      if (!state.isPlaying || state.activeScreen !== "SONG" || state.songSteps.length === 0) return state;
      const selectedStep = state.songSteps[state.currentSongStepIndex];
      if (state.currentSongRepeat < selectedStep.repeats) {
        return { currentSongRepeat: state.currentSongRepeat + 1 };
      }
      const nextIndex = (state.currentSongStepIndex + 1) % state.songSteps.length;
      return {
        currentSongStepIndex: nextIndex,
        currentSongRepeat: 1,
      };
    }),
  toggleFullLevel: () => set((state) => ({ fullLevelEnabled: !state.fullLevelEnabled })),
  selectSlice: (slice) =>
    set((state) => {
      if (state.chopMarkers.length === 0) return state;
      const bounded = clamp(Math.round(slice), 1, state.chopMarkers.length);
      return { selectedSlice: bounded, chopCursor: state.chopMarkers[bounded - 1] };
    }),
  nextSlice: () =>
    set((state) => {
      if (state.chopMarkers.length === 0) return state;
      const selectedSlice = Math.min(state.selectedSlice + 1, state.chopMarkers.length);
      return { selectedSlice, chopCursor: state.chopMarkers[selectedSlice - 1] };
    }),
  previousSlice: () =>
    set((state) => {
      if (state.chopMarkers.length === 0) return state;
      const selectedSlice = Math.max(state.selectedSlice - 1, 1);
      return { selectedSlice, chopCursor: state.chopMarkers[selectedSlice - 1] };
    }),
  setSelectedMarker: (selectedMarker) => set({ selectedMarker }),
  setChopEditMode: (chopEditMode) => set({ chopEditMode }),
  setChopSliceMode: (chopSliceMode) =>
    set((state) => {
      if (chopSliceMode === "AUTO") {
        const sliceMarkers = createAutoMarkers(state.sampleStart, state.sampleEnd, state.autoSliceCount);
        return {
          chopSliceMode,
          sliceMarkers,
          chopMarkers: sliceMarkers,
          selectedSlice: 1,
          selectedMarker: "slice:0",
          chopCursor: sliceMarkers[0] ?? state.sampleStart,
        };
      }
      return { chopSliceMode };
    }),
  setAutoSliceCount: (count) =>
    set((state) => {
      const autoSliceCount = clamp(Math.round(count), 1, 64);
      if (state.chopSliceMode !== "AUTO") return { autoSliceCount };
      const sliceMarkers = createAutoMarkers(state.sampleStart, state.sampleEnd, autoSliceCount);
      return {
        autoSliceCount,
        sliceMarkers,
        chopMarkers: sliceMarkers,
        selectedSlice: clamp(state.selectedSlice, 1, sliceMarkers.length),
        selectedMarker: `slice:${clamp(state.selectedSlice, 1, sliceMarkers.length) - 1}`,
        chopCursor: sliceMarkers[clamp(state.selectedSlice, 1, sliceMarkers.length) - 1],
      };
    }),
  enableLoopMode: () =>
    set({
      chopEditMode: "LOOP",
      loopEnabled: true,
      selectedMarker: "loopStart",
    }),
  adjustLoopBars: (delta) =>
    set((state) => ({ loopBars: clamp(state.loopBars + delta, 1, 16) })),
  enterChopMode: () =>
    set((state) => {
      const sliceMarkers =
        state.sliceMarkers.length > 0 ? state.sliceMarkers : createAutoMarkers(state.sampleStart, state.sampleEnd, 8);
      return {
        chopEditMode: "CHOP",
        chopSliceMode: state.chopSliceMode,
        sliceMarkers,
        chopMarkers: sliceMarkers,
        selectedSlice: 1,
        selectedMarker: "slice:0",
        chopCursor: sliceMarkers[0] ?? state.sampleStart,
      };
    }),
  autoChop: () =>
    set((state) => {
      const sliceMarkers = createAutoMarkers(state.sampleStart, state.sampleEnd, state.autoSliceCount);
      return {
        chopEditMode: "CHOP",
        chopSliceMode: "AUTO",
        sliceMarkers,
        chopMarkers: sliceMarkers,
        selectedSlice: 1,
        selectedMarker: "slice:0",
        chopCursor: sliceMarkers[0],
      };
    }),
  setWaveformZoom: (zoom) =>
    set((state) => {
      const waveformZoom = clamp(zoom, 1, 16);
      const maxOffset = Math.max(0, 1 - 1 / waveformZoom);
      return { waveformZoom, waveformOffset: clamp(state.waveformOffset, 0, maxOffset) };
    }),
  panWaveform: (delta) =>
    set((state) => {
      const maxOffset = Math.max(0, 1 - 1 / state.waveformZoom);
      return { waveformOffset: clamp(state.waveformOffset + delta, 0, maxOffset) };
    }),
  moveMarkerTo: (marker, value) =>
    set((state) => moveMarkerState(state, marker, value)),
  moveSelectedMarker: (delta) =>
    set((state) => {
      const marker = state.selectedMarker ?? (`slice:${state.selectedSlice - 1}` as const);
      return moveMarkerState(state, marker, getMarkerValue(state, marker) + delta);
    }),
  addSlice: () =>
    set((state) => {
      if (state.chopMarkers.length === 0) {
        return {
          chopEditMode: "CHOP",
          chopSliceMode: "MANUAL",
          chopMarkers: [state.sampleStart],
          sliceMarkers: [state.sampleStart],
          selectedSlice: 1,
          selectedMarker: "slice:0",
          chopCursor: state.sampleStart,
        };
      }
      if (state.chopMarkers.length >= 64) return state;
      const index = state.selectedSlice - 1;
      const start = state.chopMarkers[index];
      const end = state.chopMarkers[index + 1] ?? state.sampleEnd;
      const newMarker = start + (end - start) / 2;
      const chopMarkers = [...state.chopMarkers, newMarker].sort((a, b) => a - b);
      const selectedSlice = chopMarkers.indexOf(newMarker) + 1;
      return {
        chopMarkers,
        sliceMarkers: chopMarkers,
        chopSliceMode: "MANUAL",
        selectedSlice,
        selectedMarker: `slice:${selectedSlice - 1}`,
        chopCursor: newMarker,
      };
    }),
  insertSliceAt: (position) =>
    set((state) => {
      if (state.chopMarkers.length >= 64) return state;
      const bounded = clamp(position, state.sampleStart, state.sampleEnd - 0.0025);
      const chopMarkers =
        state.chopMarkers.length === 0
          ? [state.sampleStart, bounded].sort((a, b) => a - b)
          : [...state.chopMarkers, bounded].sort((a, b) => a - b);
      const selectedSlice = chopMarkers.indexOf(bounded) + 1;
      return {
        chopEditMode: "CHOP",
        chopSliceMode: "MANUAL",
        chopMarkers,
        sliceMarkers: chopMarkers,
        selectedSlice,
        selectedMarker: `slice:${selectedSlice - 1}`,
        chopCursor: bounded,
      };
    }),
  removeSlice: () =>
    set((state) => {
      if (state.chopMarkers.length <= 1) return state;
      const index = state.selectedSlice === 1 ? 1 : state.selectedSlice - 1;
      const chopMarkers = state.chopMarkers.filter((_, markerIndex) => markerIndex !== index);
      const selectedSlice = clamp(state.selectedSlice, 1, chopMarkers.length);
      return {
        chopMarkers,
        sliceMarkers: chopMarkers,
        chopSliceMode: "MANUAL",
        selectedSlice,
        selectedMarker: `slice:${selectedSlice - 1}`,
        chopCursor: chopMarkers[selectedSlice - 1],
      };
    }),
  saveChopEdits: () =>
    set((state) => {
      const sampleIndex = state.chopSelectedSampleIndex;
      const sample = state.recordedSamples[sampleIndex] ?? state.recordedSamples.at(-1);
      if (!sample) return state;
      const actualIndex = state.recordedSamples.indexOf(sample);
      const editState: SampleEditState = {
        sampleStart: state.sampleStart,
        sampleEnd: state.sampleEnd,
        loopEnabled: state.loopEnabled,
        loopStart: state.loopStart,
        loopEnd: state.loopEnd,
        loopBars: state.loopBars,
        sliceMarkers: state.sliceMarkers,
      };
      return {
        recordedSamples: state.recordedSamples.map((item, index) =>
          index === actualIndex ? { ...item, editState } : item,
        ),
        chopMarkers: state.sliceMarkers,
        lastAudioMessage: `SAVED ${sample.name}`,
      };
    }),
  previewChopSlice: (sliceIndex) => {
    const state = get();
    const preview = resolveTemporaryChopPreview(state, sliceIndex);
    if (!preview) return;
    set({
      selectedSlice: sliceIndex + 1,
      selectedMarker: `slice:${sliceIndex}`,
      chopCursor: preview.sampleStart,
      ...createChopPreviewCursorState(preview),
      lastAudioMessage: `PREVIEW S${String(sliceIndex + 1).padStart(2, "0")}`,
    });
    samplerEngine.play(preview, { gain: 1, pan: 0 });
  },
  keepChops: ({ baseName, targetBank, createProgram }) =>
    set((state) => {
      const sampleIndex = state.chopSelectedSampleIndex;
      const sample = state.recordedSamples[sampleIndex] ?? state.recordedSamples.at(-1);
      if (!sample) return state;
      const actualIndex = state.recordedSamples.indexOf(sample);
      const editState: SampleEditState = {
        sampleStart: state.sampleStart,
        sampleEnd: state.sampleEnd,
        loopEnabled: state.loopEnabled,
        loopStart: state.loopStart,
        loopEnd: state.loopEnd,
        loopBars: state.loopBars,
        sliceMarkers: state.sliceMarkers,
      };
      const sliceSamples = state.sliceMarkers.map((start, index) => {
        const end = state.sliceMarkers[index + 1] ?? state.sampleEnd;
        const id = createSampleId();
        return {
          id,
          name: `${baseName}_S${String(index + 1).padStart(2, "0")}`,
          audioBufferId: sample.audioBufferId,
          durationMs: Math.max(1, Math.round((end - start) * sample.durationMs)),
          duration: Math.max(0.001, (end - start) * sample.duration),
          sampleRate: sample.sampleRate,
          channelCount: sample.channelCount,
          waveform: sample.waveform,
          keptSlices: [],
          editState: {
            sampleStart: start,
            sampleEnd: end,
            loopEnabled: false,
            loopStart: start,
            loopEnd: end,
            loopBars: 4,
            sliceMarkers: [],
          },
        } satisfies RecordedSample;
      });
      const retainedSamples = state.recordedSamples.filter(
        (item, index) => index === actualIndex || !item.name.startsWith(`${baseName}_S`),
      );
      const padAssignments = createProgram
        ? {
            ...state.padAssignments,
            [targetBank]: state.padAssignments[targetBank].map((pad, index) =>
              sliceSamples[index]
                ? { ...pad, assignment: sliceSamples[index].name }
                : pad,
            ),
          }
        : state.padAssignments;
      return {
        recordedSamples: [
          ...retainedSamples.map((item, index) =>
            item.id === sample.id
              ? { ...item, editState, keptSlices: sliceSamples.map((slice) => slice.id) }
              : item,
          ),
          ...sliceSamples,
        ],
        padAssignments,
        chopMarkers: state.sliceMarkers,
        chopEditMode: "TRIM",
        selectedMarker: "sampleStart",
      };
    }),
  discardChopEdits: () =>
    set((state) => {
      const sample = state.recordedSamples[state.chopSelectedSampleIndex] ?? state.recordedSamples.at(-1);
      const kept = sample?.editState?.sliceMarkers ?? [];
      return {
        sliceMarkers: kept,
        chopMarkers: kept,
        selectedSlice: 1,
        selectedMarker: "sampleStart",
        chopCursor: kept[0] ?? state.sampleStart,
        chopEditMode: "TRIM",
      };
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
  assignSourceToSelectedPad: (sourceName) =>
    set((state) => ({
      padAssignments: {
        ...state.padAssignments,
        [state.padBank]: state.padAssignments[state.padBank].map((pad) =>
          pad.pad === state.selectedPad ? { ...pad, assignment: sourceName } : pad,
        ),
      },
    })),
  previewSource: (sourceName) => {
    const state = get();
    const resolved = resolveAssignedSample(state, sourceName);
    if (!resolved) return;
    set({ lastAudioMessage: `PREVIEW ${sourceName}` });
    samplerEngine.play(resolved, { gain: 1, pan: 0 });
  },
  previousChopSample: () =>
    set((state) => switchChopSample(state, -1)),
  nextChopSample: () =>
    set((state) => switchChopSample(state, 1)),
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
  toggleSelectedPadVoiceMode: () =>
    set((state) => ({
      padAssignments: {
        ...state.padAssignments,
        [state.padBank]: state.padAssignments[state.padBank].map((pad) =>
          pad.pad === state.selectedPad
            ? { ...pad, voiceMode: pad.voiceMode === "POLY" ? "MONO" : "POLY" }
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
    set((state) => selectedEventPatch(state.stepEvents, Math.min(state.selectedEventIndex + 1, state.stepEvents.length - 1))),
  previousStepEvent: () =>
    set((state) => selectedEventPatch(state.stepEvents, Math.max(state.selectedEventIndex - 1, 0))),
  setEventEditMode: (eventEditMode) => set({ eventEditMode }),
  adjustSelectedEvent: (field, delta) =>
    set((state) => {
      const event = state.stepEvents[state.selectedEventIndex];
      if (!event) return state;
      const nextValue =
        field === "velocity"
          ? clamp(event.velocity + delta, 1, 127)
          : field === "timingOffset"
            ? clamp(event.timingOffset + delta, -24, 24)
            : field === "duration"
              ? clamp(event.duration + delta, 1, 96)
              : clamp(event.probability + delta, 0, 100);
      const stepEvents = state.stepEvents.map((item, index) =>
        index === state.selectedEventIndex
          ? {
              ...item,
              [field]: nextValue,
              ...(field === "duration" ? { length: nextValue } : {}),
            }
          : item,
      );
      return {
        stepEvents,
        sequences: updateCurrentSequenceEvents(state, stepEvents),
      };
    }),
  cycleSelectedEventTrack: () =>
    set((state) => {
      const event = state.stepEvents[state.selectedEventIndex];
      if (!event) return state;
      const tracks = getCurrentSequence(state).tracks;
      const currentIndex = tracks.indexOf(event.trackId);
      const trackId = tracks[(currentIndex + 1 + tracks.length) % tracks.length];
      const stepEvents = state.stepEvents.map((item, index) =>
        index === state.selectedEventIndex ? { ...item, trackId, trackName: trackId } : item,
      );
      return { stepEvents, sequences: updateCurrentSequenceEvents(state, stepEvents) };
    }),
  deleteSelectedEvent: () =>
    set((state) => {
      if (state.stepEvents.length === 0) return state;
      const stepEvents = state.stepEvents.filter((_, index) => index !== state.selectedEventIndex);
      const nextIndex = clamp(state.selectedEventIndex, 0, Math.max(stepEvents.length - 1, 0));
      return {
        stepEvents,
        sequences: updateCurrentSequenceEvents(state, stepEvents),
        ...selectedEventPatch(stepEvents, nextIndex),
      };
    }),
  stepBackward: () =>
    set((state) => {
      const currentStepIndex = Math.max(state.currentStepIndex - 1, 0);
      const currentBar = Math.floor(currentStepIndex / 16) + 1;
      return {
        currentStepIndex,
        currentBar,
        currentStep: (currentStepIndex % 16) + 1,
        currentEvent: nearestEventAtOrAfter(state.stepEvents, currentStepIndex) + 1,
        ...selectedEventPatch(state.stepEvents, nearestEventAtOrAfter(state.stepEvents, currentStepIndex)),
        bar: formatBarPosition(currentBar, (currentStepIndex % 16) + 1),
      };
    }),
  stepForward: () =>
    set((state) => {
      const currentStepIndex = Math.min(state.currentStepIndex + 1, state.sequenceLengthBars * 16 - 1);
      const currentBar = Math.floor(currentStepIndex / 16) + 1;
      return {
        currentStepIndex,
        currentBar,
        currentStep: (currentStepIndex % 16) + 1,
        currentEvent: nearestEventAtOrAfter(state.stepEvents, currentStepIndex) + 1,
        ...selectedEventPatch(state.stepEvents, nearestEventAtOrAfter(state.stepEvents, currentStepIndex)),
        bar: formatBarPosition(currentBar, (currentStepIndex % 16) + 1),
      };
    }),
  barBackward: () =>
    set((state) => {
      const currentBar = Math.max(state.currentBar - 1, 1);
      const currentStepIndex = (currentBar - 1) * 16 + (state.currentStep - 1);
      const selectedStepEventIndex = nearestEventAtOrAfter(state.stepEvents, currentStepIndex);
      return { currentBar, currentStepIndex, currentEvent: selectedStepEventIndex + 1, ...selectedEventPatch(state.stepEvents, selectedStepEventIndex), bar: formatBarPosition(currentBar, state.currentStep) };
    }),
  barForward: () =>
    set((state) => {
      const currentBar = Math.min(state.currentBar + 1, state.sequenceLengthBars);
      const currentStepIndex = (currentBar - 1) * 16 + (state.currentStep - 1);
      const selectedStepEventIndex = nearestEventAtOrAfter(state.stepEvents, currentStepIndex);
      return { currentBar, currentStepIndex, currentEvent: selectedStepEventIndex + 1, ...selectedEventPatch(state.stepEvents, selectedStepEventIndex), bar: formatBarPosition(currentBar, state.currentStep) };
    }),
  tickStepPlayback: () => {
    const state = get();
    if (!state.isPlaying) return;
    const currentStepIndex = (state.currentStepIndex + 1) % (state.sequenceLengthBars * 16);
    const eventsAtStep = state.stepEvents.filter(
      (event) => eventStepIndex(event.step) === currentStepIndex && !isTrackMuted(state, event.trackId),
    );
    eventsAtStep.forEach((event) => playAssignedPadFromState(state, event.pad));
    const currentBar = Math.floor(currentStepIndex / 16) + 1;
    const currentStep = (currentStepIndex % 16) + 1;
    const selectedStepEventIndex = nearestEventAtOrAfter(state.stepEvents, currentStepIndex);
    set({
      currentStepIndex,
      currentBar,
      currentStep,
      currentEvent: selectedStepEventIndex + 1,
      ...selectedEventPatch(state.stepEvents, selectedStepEventIndex),
      bar: formatBarPosition(currentBar, currentStep),
    });
  },
  updateSelectedMixerChannel: (field, delta) =>
    set((state) => {
      const channels = state.padMixer[state.padBank].map((channel) => {
        if (channel.pad !== state.selectedPad) return channel;
        const limits = getMixerLimits(field);
        return { ...channel, [field]: clamp(channel[field] + delta, limits.min, limits.max) };
      });
      syncMixerBankToAudio(state.padBank, channels);
      return { padMixer: { ...state.padMixer, [state.padBank]: channels } };
    }),
  setMixerChannelValue: (pad, field, value) =>
    set((state) => {
      const limits = getMixerLimits(field);
      const channels = state.padMixer[state.padBank].map((channel) =>
        channel.pad === pad ? { ...channel, [field]: clamp(value, limits.min, limits.max) } : channel,
      );
      syncMixerBankToAudio(state.padBank, channels);
      return { padMixer: { ...state.padMixer, [state.padBank]: channels } };
    }),
  selectMixerPad: (selectedPad) => set({ selectedPad }),
  toggleSelectedMixerMute: () =>
    set((state) => {
      const channels = state.padMixer[state.padBank].map((channel) =>
        channel.pad === state.selectedPad ? { ...channel, muted: !channel.muted } : channel,
      );
      syncMixerBankToAudio(state.padBank, channels);
      return { padMixer: { ...state.padMixer, [state.padBank]: channels } };
    }),
  toggleSelectedMixerSolo: () =>
    set((state) => {
      const channels = state.padMixer[state.padBank].map((channel) =>
        channel.pad === state.selectedPad ? { ...channel, solo: !channel.solo } : channel,
      );
      syncMixerBankToAudio(state.padBank, channels);
      return { padMixer: { ...state.padMixer, [state.padBank]: channels } };
    }),
  toggleMixerChannelMute: (pad) =>
    set((state) => {
      const channels = state.padMixer[state.padBank].map((channel) =>
        channel.pad === pad ? { ...channel, muted: !channel.muted } : channel,
      );
      syncMixerBankToAudio(state.padBank, channels);
      return { padMixer: { ...state.padMixer, [state.padBank]: channels } };
    }),
  toggleMixerChannelSolo: (pad) =>
    set((state) => {
      const channels = state.padMixer[state.padBank].map((channel) =>
        channel.pad === pad ? { ...channel, solo: !channel.solo } : channel,
      );
      syncMixerBankToAudio(state.padBank, channels);
      return { padMixer: { ...state.padMixer, [state.padBank]: channels } };
    }),
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
  cycleTrackMuteMode: () =>
    set((state) => ({
      trackMuteMode:
        state.trackMuteMode === "MUTE"
          ? "SOLO"
          : state.trackMuteMode === "SOLO"
            ? "HOLD"
            : "MUTE",
    })),
  setTrackMuteMode: (trackMuteMode) => set({ trackMuteMode }),
  clearTrackMutes: () =>
    set({
      performanceTracks: get().performanceTracks.map((track) => ({ ...track, muted: false, solo: false })),
      lastPerformanceMessage: "CLEAR TRACK MUTES",
    }),
  queuePerformanceSequence: (queuedSequence) =>
    set((state) => ({
      queuedSequence,
      queuedSequenceBarsRemaining: 1,
      lastPerformanceMessage: `NEXT SEQ: ${state.sequences.find((sequence) => sequence.id === queuedSequence)?.name ?? queuedSequence}`,
    })),
  tickPerformance: () =>
    set((state) => {
      const performancePulse = (state.performancePulse + 1) % 16;
      const atBarBoundary = performancePulse === 0;
      const performanceTracks = state.performanceTracks.map((track, index) => ({
        ...track,
        activity: track.muted ? 0 : 24 + ((state.performancePulse * 11 + index * 17) % 76),
      }));
      if (atBarBoundary && state.queuedSequence) {
        return {
          ...applyCurrentSequence(state, state.queuedSequence),
          performancePulse,
          performanceTracks,
          queuedSequence: null,
          queuedSequenceBarsRemaining: 0,
        };
      }
      return {
        performancePulse,
        performanceTracks,
        queuedSequenceBarsRemaining: state.queuedSequence ? 1 : 0,
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
      if (selected.type === "SEQUENCE") {
        const id = selected.name.match(/\d+/)?.[0];
        return id && state.sequences.some((sequence) => sequence.id === id)
          ? applyCurrentSequence(state, id)
          : state;
      }
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
  previewSelectedMemorySample: () => {
    const state = get();
    const sample = state.recordedSamples[state.selectedDiskItemIndex];
    if (!sample) {
      set({ importStatus: "ERROR", importMessage: "NO MEMORY SAMPLE" });
      return;
    }
    const playable = resolveSampleRegion(sample);
    set({ importStatus: "READY", importMessage: `PREVIEW ${sample.name}`, lastAudioMessage: `PREVIEW ${sample.name}` });
    samplerEngine.play(playable, { gain: 1, pan: 0 });
  },
  renameSelectedMemorySample: (name) =>
    set((state) => {
      const sample = state.recordedSamples[state.selectedDiskItemIndex];
      if (!sample) return { importStatus: "ERROR", importMessage: "NO MEMORY SAMPLE" };
      const nextName = createSampleName(name);
      if (!nextName) return { importStatus: "ERROR", importMessage: "INVALID NAME" };
      if (state.recordedSamples.some((item) => item.id !== sample.id && item.name === nextName)) {
        return { importStatus: "ERROR", importMessage: "NAME EXISTS" };
      }
      return {
        recordedSamples: state.recordedSamples.map((item) =>
          item.id === sample.id ? { ...item, name: nextName } : item,
        ),
        padAssignments: renameSampleAssignments(state.padAssignments, sample.name, nextName),
        diskFolders: renameDiskSampleItems(state.diskFolders, sample.name, nextName),
        importStatus: "READY",
        importMessage: `RENAMED ${nextName}`,
      };
    }),
  deleteSelectedMemorySample: () =>
    set((state) => {
      const sample = state.recordedSamples[state.selectedDiskItemIndex];
      if (!sample) return { importStatus: "ERROR", importMessage: "NO MEMORY SAMPLE" };
      const assignedPads = getAssignedPads(state, sample.name);
      if (assignedPads.length > 0) {
        return {
          importStatus: "ERROR",
          importMessage: `ASSIGNED ${assignedPads.join(",")} - DELETE BLOCKED`,
        };
      }
      const recordedSamples = state.recordedSamples.filter((item) => item.id !== sample.id);
      return {
        recordedSamples,
        selectedDiskItemIndex: clamp(state.selectedDiskItemIndex, 0, Math.max(0, recordedSamples.length - 1)),
        chopSelectedSampleIndex: clamp(state.chopSelectedSampleIndex, 0, Math.max(0, recordedSamples.length - 1)),
        diskFolders: removeDiskSampleItems(state.diskFolders, sample.name),
        importStatus: "READY",
        importMessage: `DELETED ${sample.name}`,
      };
    }),
  exportSelectedMemorySample: () => {
    const state = get();
    const sample = state.recordedSamples[state.selectedDiskItemIndex];
    if (!sample) {
      set({ importStatus: "ERROR", importMessage: "NO MEMORY SAMPLE" });
      return;
    }
    const audioRef = getSampleAudioRef(sample.audioBufferId);
    if (!audioRef) {
      set({ importStatus: "ERROR", importMessage: "PCM BUFFER MISSING" });
      return;
    }
    const region = getSampleRegion(sample);
    const wav = encodeWavRegion(audioRef, region.start, region.end);
    downloadBytes(`${sample.name}.wav`, wav, "audio/wav");
    set({ importStatus: "READY", importMessage: `EXPORTED ${sample.name}` });
  },
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
        const nextValue = clamp(current + delta * (setting.step ?? 1), setting.min ?? current, setting.max ?? current);
        if (setting.key === "masterVolume") samplerEngine.setMasterVolume(nextValue);
        return {
          settingsValues: {
            ...state.settingsValues,
            [setting.key]: nextValue,
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

samplerEngine.onStatusChange((audioStatus) => {
  useAppStore.setState({ audioStatus });
});

function formatMs(value: number) {
  const totalSeconds = Math.floor(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.floor(value % 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function shiftBar(bar: string, delta: number) {
  const [barNumber = "001", beat = "01", tick = "00"] = bar.split(".");
  const nextBar = Math.max(1, Number(barNumber) + delta);
  return `${String(nextBar).padStart(3, "0")}.${beat}.${tick}`;
}

function formatBarPosition(bar: number, step: number) {
  return `${String(bar).padStart(3, "0")}.${String(Math.ceil(step / 4)).padStart(2, "0")}.${String(((step - 1) % 4) * 24).padStart(2, "0")}`;
}

function pushHistory(history: string[], action: string) {
  return [...history, action].slice(-8);
}

function nearestEventAtOrAfter(events: StepEvent[], stepIndex: number) {
  if (events.length === 0) return 0;
  const nextIndex = events.findIndex((event) => eventStepIndex(event.step) >= stepIndex);
  return nextIndex === -1 ? events.length - 1 : nextIndex;
}

function selectedEventPatch(events: StepEvent[], selectedEventIndex: number) {
  const safeIndex = events.length === 0 ? 0 : clamp(selectedEventIndex, 0, events.length - 1);
  return {
    selectedStepEventIndex: safeIndex,
    selectedEventIndex: safeIndex,
    selectedEventId: events[safeIndex]?.id ?? null,
  };
}

function updateCurrentSequenceEvents(state: Pick<AppState, "sequences" | "currentSequence">, events: StepEvent[]) {
  return state.sequences.map((sequence) =>
    sequence.id === state.currentSequence ? { ...sequence, events } : sequence,
  );
}

function eventStepIndex(step: string) {
  const [bar, beat, tick] = step.split(".").map(Number);
  return (bar - 1) * 16 + (beat - 1) * 4 + Math.floor(tick / 24);
}

function createRepeatedNoteEvents(state: AppState, pad: string, rate: AppState["noteRepeatRate"]) {
  const interval = repeatIntervalSteps(rate);
  const sequenceLengthSteps = state.sequenceLengthBars * 16;
  const eventCount = 4;
  return Array.from({ length: eventCount }, (_, index) => {
    const rawStep = state.currentStepIndex + index * interval;
    const stepIndex = Math.min(Math.round(rawStep), sequenceLengthSteps - 1);
    const velocity =
      state.noteRepeat.velocityMode === "FIXED"
        ? 100
        : state.fullLevelEnabled
          ? 127
          : 96;
    const swingOffset = index % 2 === 1 ? Math.round((state.swing - 50) / 5) : 0;
    return createStepEventFromIndex(stepIndex, pad, velocity, state.noteRepeatGate, swingOffset, {
      trackId: "DRUMS",
      trackName: "DRUMS",
      noteRepeatGenerated: true,
    });
  });
}

function repeatIntervalSteps(rate: AppState["noteRepeatRate"]) {
  switch (rate) {
    case "1/4":
      return 4;
    case "1/8":
      return 2;
    case "1/16":
      return 1;
    case "1/16T":
      return 2 / 3;
    case "1/32":
      return 0.5;
    case "1/32T":
      return 1 / 3;
  }
}

function createStepEventFromIndex(
  stepIndex: number,
  pad: string,
  velocity: number,
  gate: number,
  timingOffset: number,
  extra?: Partial<StepEvent>,
): StepEvent {
  const bar = Math.floor(stepIndex / 16);
  const local = stepIndex % 16;
  const beat = Math.floor(local / 4) + 1;
  const tick = (local % 4) * 24;
  return {
    id: nextEventId(),
    step: `${String(bar + 1).padStart(3, "0")}.${beat}.${String(tick).padStart(2, "0")}`,
    pad,
    trackId: "DRUMS",
    trackName: "DRUMS",
    velocity,
    length: Math.max(1, Math.round((gate / 100) * 24)),
    duration: Math.max(1, Math.round((gate / 100) * 24)),
    type: "NOTE",
    timingOffset,
    probability: 100,
    variation: "REPEAT",
    muted: false,
    ...extra,
  };
}

function getSixteenLevelsValue(state: AppState, padNumber: number) {
  const ratio = (padNumber - 1) / 15;
  return Math.round(state.sixteenLevelsRangeMin + (state.sixteenLevelsRangeMax - state.sixteenLevelsRangeMin) * ratio);
}

function createDefaultMarkers() {
  return Array.from({ length: 8 }, (_, index) => index / 8);
}

function createImportedSample(fileName: string, buffer: AudioBuffer): RecordedSample {
  const id = createSampleId();
  return {
    id,
    name: createSampleName(fileName),
    audioBufferId: id,
    durationMs: Math.round(buffer.duration * 1000),
    duration: buffer.duration,
    sampleRate: buffer.sampleRate,
    channelCount: buffer.numberOfChannels,
    waveform: createWaveformCache(buffer),
    keptSlices: [],
    editState: createDefaultSampleEditState(),
  };
}

function addSampleToState(state: AppState, sample: RecordedSample, message: string): Partial<AppState> {
  return {
    recordedSamples: [...state.recordedSamples, sample],
    chopSelectedSampleIndex: state.recordedSamples.length,
    waveformZoom: 1,
    waveformOffset: 0,
    chopEditMode: "TRIM",
    chopSliceMode: "AUTO",
    autoSliceCount: 8,
    selectedMarker: "sampleStart",
    sampleStart: 0,
    sampleEnd: 1,
    loopEnabled: false,
    loopStart: 0,
    loopEnd: 1,
    loopBars: 4,
    sliceMarkers: [],
    chopMarkers: [],
    selectedSlice: 1,
    chopCursor: 0,
    sampleLength: formatMs(sample.durationMs),
    sampleName: nextSampleName(state.recordedSamples.length + 2),
    importStatus: "READY",
    importMessage: message,
    lastAudioMessage: message,
    diskFolders: addSampleToDiskMemory(state.diskFolders, sample),
  };
}

function createSampleName(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^/.]+$/, "");
  const normalized = withoutExtension.toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return (normalized || "SAMPLE").slice(0, 24);
}

function nextSampleName(index: number) {
  return `SAMPLE_${String(index).padStart(3, "0")}`;
}

function isWavFile(file: File) {
  return file.name.toLowerCase().endsWith(".wav") || file.type === "audio/wav" || file.type === "audio/x-wav";
}

function addSampleToDiskMemory(folders: DiskFolder[], sample: RecordedSample) {
  return folders.map((folder) => {
    if (folder.id !== "memory" && folder.id !== "samples") return folder;
    const item = createDiskItem(
      `${sample.name}.WAV`,
      "SAMPLE",
      estimatePcmSize(sample),
      "TODAY",
      "--",
      "--",
      formatMs(sample.durationMs),
    );
    return { ...folder, items: [...folder.items.filter((existing) => existing.name !== item.name), item] };
  });
}

function estimatePcmSize(sample: RecordedSample) {
  const bytes = Math.max(1, Math.round(sample.duration * sample.sampleRate * sample.channelCount * 2));
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function dbToGain(db: number) {
  return 10 ** (db / 20);
}

function applyBufferGain(buffer: AudioBuffer, gainDb: number) {
  const gain = dbToGain(gainDb);
  if (gain === 1) return;
  for (let channelIndex = 0; channelIndex < buffer.numberOfChannels; channelIndex += 1) {
    const channel = buffer.getChannelData(channelIndex);
    for (let frame = 0; frame < channel.length; frame += 1) {
      channel[frame] = clamp(channel[frame] * gain, -1, 1);
    }
  }
}

function createDefaultSampleEditState(): SampleEditState {
  return {
    sampleStart: 0,
    sampleEnd: 1,
    loopEnabled: false,
    loopStart: 0,
    loopEnd: 1,
    loopBars: 4,
    sliceMarkers: [],
  };
}

function createAutoMarkers(start: number, end: number, count: number) {
  return Array.from({ length: count }, (_, index) => start + ((end - start) * index) / count);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getMarkerValue(state: AppState, marker: Exclude<ChopMarkerSelection, null>) {
  if (marker === "sampleStart") return state.sampleStart;
  if (marker === "sampleEnd") return state.sampleEnd;
  if (marker === "loopStart") return state.loopStart;
  if (marker === "loopEnd") return state.loopEnd;
  const index = Number(marker.split(":")[1]);
  return state.sliceMarkers[index] ?? 0;
}

function moveMarkerState(
  state: AppState,
  marker: Exclude<ChopMarkerSelection, null>,
  value: number,
): Partial<AppState> {
  const minimumGap = 0.0025;

  if (marker === "sampleStart") {
    const sampleStart = clamp(value, 0, state.sampleEnd - minimumGap);
    const loopStart = Math.max(state.loopStart, sampleStart);
    return {
      sampleStart,
      loopStart,
      loopEnd: Math.max(state.loopEnd, loopStart + minimumGap),
      selectedMarker: marker,
    };
  }

  if (marker === "sampleEnd") {
    const sampleEnd = clamp(value, state.sampleStart + minimumGap, 1);
    const loopEnd = Math.min(state.loopEnd, sampleEnd);
    return {
      sampleEnd,
      loopStart: Math.min(state.loopStart, loopEnd - minimumGap),
      loopEnd,
      selectedMarker: marker,
    };
  }

  if (marker === "loopStart") {
    const loopStart = clamp(value, state.sampleStart, state.loopEnd - minimumGap);
    return { loopStart, selectedMarker: marker };
  }

  if (marker === "loopEnd") {
    const loopEnd = clamp(value, state.loopStart + minimumGap, state.sampleEnd);
    return { loopEnd, selectedMarker: marker };
  }

  const index = Number(marker.split(":")[1]);
  const previous = index === 0 ? state.sampleStart : state.sliceMarkers[index - 1] + minimumGap;
  const next =
    index === state.sliceMarkers.length - 1
      ? state.sampleEnd - minimumGap
      : state.sliceMarkers[index + 1] - minimumGap;
  const nextValue = clamp(value, previous, next);
  const sliceMarkers = state.sliceMarkers.map((sliceMarker, markerIndex) =>
    markerIndex === index ? nextValue : sliceMarker,
  );
  return {
    sliceMarkers,
    chopMarkers: sliceMarkers,
    chopSliceMode: "MANUAL",
    selectedSlice: index + 1,
    selectedMarker: marker,
    chopCursor: nextValue,
  };
}

function createPadAssignments(): Record<"A" | "B" | "C" | "D", PadAssignment[]> {
  return {
    A: createBankAssignments(),
    B: createBankAssignments(),
    C: createBankAssignments(),
    D: createBankAssignments(),
  };
}

function playPadFromState(state: AppState, pad: string, options: { allowUtilityPlayback?: boolean } = {}) {
  if (
    !options.allowUtilityPlayback &&
    (state.activeScreen === "PERFORMANCE" ||
      state.activeScreen.startsWith("UTILITY_") ||
      state.activeScreen === "COUNT_IN")
  ) {
    return;
  }
  if (state.activeScreen === "CHOP") {
    const preview = resolveTemporaryChopPadPreview(state, pad);
    if (!preview) return;
    useAppStore.setState({
      selectedSlice: preview.sliceIndex != null ? preview.sliceIndex + 1 : state.selectedSlice,
      selectedMarker: preview.sliceIndex != null ? `slice:${preview.sliceIndex}` : state.selectedMarker,
      chopCursor: preview.sampleStart,
      ...createChopPreviewCursorState(preview),
      lastAudioMessage: preview.label,
    });
    const mix = state.padMixer[state.padBank].find((item) => item.pad === pad);
    if (!mix || !isMixerChannelAudible(state.padMixer[state.padBank], pad)) return;
    samplerEngine.play(preview, {
      gain: mix.level / 100,
      pan: mix.pan / 64,
      channelKey: mixerChannelKey(state.padBank, pad),
      previewGroup: state.chopEditMode === "CHOP" ? undefined : "chop-trim-loop",
    });
    return;
  }
  playAssignedPadFromState(state, pad);
}

function playAssignedPadFromState(state: AppState, pad: string) {
  const assignment = state.padAssignments[state.padBank].find((item) => item.pad === pad);
  const mix = state.padMixer[state.padBank].find((item) => item.pad === pad);
  if (!assignment || assignment.assignment === "---" || !mix || !isMixerChannelAudible(state.padMixer[state.padBank], pad)) {
    useAppStore.setState({ lastAudioMessage: "UNASSIGNED PAD" });
    return;
  }
  const resolved = resolveAssignedSample(state, assignment.assignment);
  if (!resolved) return;
  useAppStore.setState({ lastAudioMessage: assignment.assignment });
  const voiceGroup = mixerChannelKey(state.padBank, pad);
  samplerEngine.stopVoiceGroups(getMuteStopGroups(state, assignment, pad));
  samplerEngine.play(resolved, {
    gain: mix.level / 100,
    pan: mix.pan / 64,
    channelKey: voiceGroup,
    voiceGroup,
    mono: assignment.voiceMode === "MONO",
  });
}

function resolveTemporaryChopPreview(state: AppState, sliceIndex: number) {
  const sample = state.recordedSamples[state.chopSelectedSampleIndex] ?? state.recordedSamples.at(-1);
  if (!sample || state.sliceMarkers[sliceIndex] == null) return null;
  return createTemporarySampleRegion(
    sample,
    `${sample.name}#preview-${sliceIndex}`,
    state.sliceMarkers[sliceIndex],
    state.sliceMarkers[sliceIndex + 1] ?? state.sampleEnd,
    `PREVIEW S${String(sliceIndex + 1).padStart(2, "0")}`,
    sliceIndex,
  );
}

function resolveTemporaryChopPadPreview(state: AppState, pad: string) {
  const sample = state.recordedSamples[state.chopSelectedSampleIndex] ?? state.recordedSamples.at(-1);
  if (!sample) return null;
  if (state.chopEditMode === "CHOP") {
    const sliceIndex = Number(pad.slice(1)) - 1;
    if (state.sliceMarkers[sliceIndex] == null) return null;
    return createTemporarySampleRegion(
      sample,
      `${sample.name}#pad-${sliceIndex}`,
      state.sliceMarkers[sliceIndex],
      state.sliceMarkers[sliceIndex + 1] ?? state.sampleEnd,
      `CHOP S${String(sliceIndex + 1).padStart(2, "0")}`,
      sliceIndex,
    );
  }
  if (state.chopEditMode === "LOOP" && state.loopEnabled) {
    return createTemporarySampleRegion(sample, `${sample.name}#loop`, state.loopStart, state.loopEnd, "LOOP PREVIEW");
  }
  return createTemporarySampleRegion(sample, `${sample.name}#trim`, state.sampleStart, state.sampleEnd, "TRIM PREVIEW");
}

function createTemporarySampleRegion(
  sample: RecordedSample,
  name: string,
  sampleStart: number,
  sampleEnd: number,
  label: string,
  sliceIndex?: number,
) {
  return {
    id: sample.id,
    name,
    audioBufferId: sample.audioBufferId,
    durationMs: sample.durationMs,
    sampleRate: sample.sampleRate,
    waveform: sample.waveform,
    sampleStart,
    sampleEnd,
    playbackRate: 1,
    label,
    sliceIndex,
  };
}

function createChopPreviewCursorState(preview: { sampleStart: number; sampleEnd: number; durationMs: number }) {
  return {
    chopPreviewActive: true,
    chopPreviewStart: preview.sampleStart,
    chopPreviewEnd: preview.sampleEnd,
    chopPreviewStartedAt: performance.now(),
    chopPreviewDurationMs: Math.max(1, (preview.sampleEnd - preview.sampleStart) * preview.durationMs),
  };
}

function switchChopSample(state: AppState, delta: number): Partial<AppState> {
  const baseSampleIndexes = state.recordedSamples
    .map((sample, index) => ({ sample, index }))
    .filter(({ sample }) => !isSliceSampleName(sample.name))
    .map(({ index }) => index);
  if (baseSampleIndexes.length === 0) return state;

  const currentPosition = Math.max(baseSampleIndexes.indexOf(state.chopSelectedSampleIndex), 0);
  const targetPosition = (currentPosition + delta + baseSampleIndexes.length) % baseSampleIndexes.length;
  const targetIndex = baseSampleIndexes[targetPosition];
  const currentSample = state.recordedSamples[state.chopSelectedSampleIndex];
  const currentEditState = buildCurrentSampleEditState(state);
  const recordedSamples = currentSample
    ? state.recordedSamples.map((sample, index) =>
        index === state.chopSelectedSampleIndex ? { ...sample, editState: currentEditState } : sample,
      )
    : state.recordedSamples;
  const target = recordedSamples[targetIndex];
  const targetEditState = target.editState ?? createDefaultSampleEditState();
  return {
    recordedSamples,
    chopSelectedSampleIndex: targetIndex,
    waveformZoom: 1,
    waveformOffset: 0,
    chopEditMode: "TRIM",
    chopSliceMode: targetEditState.sliceMarkers.length > 0 ? "MANUAL" : "AUTO",
    autoSliceCount: targetEditState.sliceMarkers.length || state.autoSliceCount,
    selectedMarker: "sampleStart",
    sampleStart: targetEditState.sampleStart,
    sampleEnd: targetEditState.sampleEnd,
    loopEnabled: targetEditState.loopEnabled,
    loopStart: targetEditState.loopStart,
    loopEnd: targetEditState.loopEnd,
    loopBars: targetEditState.loopBars,
    sliceMarkers: targetEditState.sliceMarkers,
    chopMarkers: targetEditState.sliceMarkers,
    selectedSlice: 1,
    chopCursor: targetEditState.sliceMarkers[0] ?? targetEditState.sampleStart,
  };
}

function buildCurrentSampleEditState(state: AppState): SampleEditState {
  return {
    sampleStart: state.sampleStart,
    sampleEnd: state.sampleEnd,
    loopEnabled: state.loopEnabled,
    loopStart: state.loopStart,
    loopEnd: state.loopEnd,
    loopBars: state.loopBars,
    sliceMarkers: state.sliceMarkers,
  };
}

function isSliceSampleName(name: string) {
  return /_S\d{2}$/.test(name);
}

export function isPadAssigned(state: Pick<AppState, "padAssignments" | "padBank">, pad: string) {
  const assignment = state.padAssignments[state.padBank].find((item) => item.pad === pad);
  return Boolean(assignment && assignment.assignment !== "---");
}

function resolveAssignedSample(state: AppState, assignment: string) {
  const [sampleNamePart, slicePart] = assignment.split("/").map((part) => part.trim());
  const sample = state.recordedSamples.find((item) => item.name === sampleNamePart);
  if (!sample) return null;
  const explicitSlice = slicePart?.match(/^S(\d{2})$/)?.[1];
  const sliceIndex = explicitSlice ? Number(explicitSlice) - 1 : -1;
  const editState = sample.editState;
  const sampleStart =
    sliceIndex >= 0 && editState?.sliceMarkers[sliceIndex] != null
      ? editState.sliceMarkers[sliceIndex]
      : editState?.sampleStart ?? 0;
  const sampleEnd =
    sliceIndex >= 0 && editState?.sliceMarkers[sliceIndex] != null
      ? editState.sliceMarkers[sliceIndex + 1] ?? editState.sampleEnd
      : editState?.sampleEnd ?? 1;
  return {
    id: sample.id,
    name: sample.name,
    audioBufferId: sample.audioBufferId,
    durationMs: sample.durationMs,
    sampleRate: sample.sampleRate,
    waveform: sample.waveform,
    sampleStart,
    sampleEnd,
    playbackRate: 1,
  };
}

function resolveSampleRegion(sample: RecordedSample) {
  const region = getSampleRegion(sample);
  return {
    id: sample.id,
    name: sample.name,
    audioBufferId: sample.audioBufferId,
    durationMs: sample.durationMs,
    sampleRate: sample.sampleRate,
    waveform: sample.waveform,
    sampleStart: region.start,
    sampleEnd: region.end,
    playbackRate: 1,
  };
}

function getSampleRegion(sample: RecordedSample) {
  const editState = sample.editState;
  return {
    start: editState?.sampleStart ?? 0,
    end: editState?.sampleEnd ?? 1,
  };
}

function getAssignedPads(state: AppState, sampleName: string) {
  const assigned: string[] = [];
  for (const [bank, assignments] of Object.entries(state.padAssignments)) {
    for (const assignment of assignments) {
      if (assignmentMatchesSample(assignment.assignment, sampleName)) assigned.push(`${bank}${assignment.pad.slice(1)}`);
    }
  }
  return assigned;
}

function renameSampleAssignments(
  padAssignments: Record<PadBank, PadAssignment[]>,
  oldName: string,
  newName: string,
): Record<PadBank, PadAssignment[]> {
  return mapPadAssignments(padAssignments, (assignment) => {
    if (!assignmentMatchesSample(assignment, oldName)) return assignment;
    const [, slicePart] = assignment.split("/").map((part) => part.trim());
    return slicePart ? `${newName} / ${slicePart}` : newName;
  });
}

function mapPadAssignments(
  padAssignments: Record<PadBank, PadAssignment[]>,
  mapper: (assignment: string) => string,
): Record<PadBank, PadAssignment[]> {
  return {
    A: padAssignments.A.map((pad) => ({ ...pad, assignment: mapper(pad.assignment) })),
    B: padAssignments.B.map((pad) => ({ ...pad, assignment: mapper(pad.assignment) })),
    C: padAssignments.C.map((pad) => ({ ...pad, assignment: mapper(pad.assignment) })),
    D: padAssignments.D.map((pad) => ({ ...pad, assignment: mapper(pad.assignment) })),
  };
}

function assignmentMatchesSample(assignment: string, sampleName: string) {
  return assignment === sampleName || assignment.startsWith(`${sampleName} /`);
}

function renameDiskSampleItems(folders: DiskFolder[], oldName: string, newName: string) {
  return folders.map((folder) => ({
    ...folder,
    items: folder.items.map((item) => (item.name === `${oldName}.WAV` ? { ...item, name: `${newName}.WAV` } : item)),
  }));
}

function removeDiskSampleItems(folders: DiskFolder[], sampleName: string) {
  return folders.map((folder) => ({
    ...folder,
    items: folder.items.filter((item) => item.name !== `${sampleName}.WAV`),
  }));
}

function downloadBytes(fileName: string, bytes: ArrayBuffer, mimeType: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isTrackMuted(state: AppState, trackId: string) {
  return state.performanceTracks.find((track) => track.name === trackId)?.muted ?? false;
}

function isMixerChannelAudible(channels: MixerChannel[], pad: string) {
  const channel = channels.find((item) => item.pad === pad);
  if (!channel || channel.muted) return false;
  const hasSolo = channels.some((item) => item.solo);
  return !hasSolo || channel.solo;
}

function mixerChannelKey(bank: PadBank, pad: string) {
  return `${bank}:${pad}`;
}

function getMuteStopGroups(state: AppState, assignment: PadAssignment, pad: string) {
  const targets = new Set<string>();
  assignment.muteTargets.forEach((targetPad) => targets.add(mixerChannelKey(state.padBank, targetPad)));
  if (assignment.chokeGroup > 0) {
    state.padAssignments[state.padBank].forEach((candidate) => {
      if (candidate.pad !== pad && candidate.chokeGroup === assignment.chokeGroup) {
        targets.add(mixerChannelKey(state.padBank, candidate.pad));
      }
    });
  }
  return [...targets];
}

function syncMixerBankToAudio(bank: PadBank, channels: MixerChannel[]) {
  channels.forEach((channel) => {
    samplerEngine.updateChannelMix(mixerChannelKey(bank, channel.pad), {
      gain: channel.level / 100,
      pan: channel.pan / 64,
      audible: isMixerChannelAudible(channels, channel.pad),
    });
  });
}

function playNoteRepeatBurst(state: AppState, pad: string) {
  const rate = state.noteRepeatLinkToTC && state.timingCorrect !== "OFF" ? state.timingCorrect : state.noteRepeatRate;
  const intervalMs = repeatIntervalSteps(rate) * (60_000 / state.bpm / 4);
  for (let index = 1; index < 4; index += 1) {
    window.setTimeout(() => {
      const liveState = useAppStore.getState();
      if (!liveState.noteRepeatEnabled) return;
      playPadFromState(liveState, pad, { allowUtilityPlayback: true });
    }, intervalMs * index);
  }
}

function createBankAssignments() {
  return Array.from({ length: 16 }, (_, index) => ({
    pad: `P${String(index + 1).padStart(2, "0")}`,
    assignment: "---",
    mode: "ONE SHOT" as const,
    voiceMode: "POLY" as const,
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
    { pad: "P08", type: "hat" },
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

function createSequences(firstSequenceEvents = createStepEvents()): Sequence[] {
  return [
    createSequence("01", "SEQ 01", 94, firstSequenceEvents),
    createSequence("02", "SEQ 02", 96, createStepEvents().slice(0, 18)),
    createSequence("03", "SEQ 03", 92, createStepEvents().slice(8, 28)),
    createSequence("04", "SEQ 04", 100, createStepEvents().slice(0, 12)),
  ];
}

function createSequence(id: string, name: string, bpm: number, events: StepEvent[]): Sequence {
  return { id, name, lengthBars: 4, timeSignature: "4/4", bpm, tracks: ["DRUMS", "BASS", "CHOPS", "FX", "TEXTURE", "VOX"], events };
}

function getCurrentSequence(state: Pick<AppState, "sequences" | "currentSequence">) {
  return state.sequences.find((sequence) => sequence.id === state.currentSequence) ?? state.sequences[0];
}

function applyCurrentSequence<T extends Pick<AppState, "sequences">>(state: T, id: string) {
  const sequence = state.sequences.find((item) => item.id === id) ?? state.sequences[0];
  const priorTracks =
    "performanceTracks" in state
      ? (state.performanceTracks as PerformanceTrack[])
      : [];
  return {
    ...state,
    sequence: sequence.id,
    currentSequence: sequence.id,
    sequenceName: sequence.name,
    sequenceLengthBars: sequence.lengthBars,
    timeSignature: sequence.timeSignature,
    bpm: sequence.bpm,
    stepEvents: sequence.events,
    performanceTracks: sequence.tracks.map((name, index) => {
      const previous = priorTracks.find((track) => track.name === name);
      return previous ?? { name, muted: false, solo: false, activity: 28 + index * 8 };
    }),
    currentBar: 1,
    currentStep: 1,
    currentEvent: 1,
    bar: "001.01.00",
    currentStepIndex: 0,
    ...selectedEventPatch(sequence.events, 0),
  };
}

function nextSequenceId(sequences: Sequence[]) {
  const next = Math.max(...sequences.map((sequence) => Number(sequence.id)), 0) + 1;
  return String(next).padStart(2, "0");
}

function createStepEvent(bar: number, step: number, pad: string, velocity: number): StepEvent {
  const quarter = Math.floor(step / 4) + 1;
  const tick = (step % 4) * 24;
  return {
    id: nextEventId(),
    step: `${String(bar + 1).padStart(3, "0")}.${quarter}.${String(tick).padStart(2, "0")}`,
    pad,
    trackId: "DRUMS",
    trackName: "DRUMS",
    velocity,
    length: pad === "P08" ? 12 : 24,
    duration: pad === "P08" ? 12 : 24,
    type: "NOTE",
    timingOffset: step % 5 === 0 ? -2 : step % 7 === 0 ? 3 : 0,
    probability: pad === "P08" && step % 8 !== 0 ? 92 : 100,
    variation: pad === "P08" ? "HAT" : pad === "P05" ? "SNARE" : "KICK",
    muted: false,
  };
}

function nextEventId() {
  eventIdCounter += 1;
  return `EV${String(eventIdCounter).padStart(4, "0")}`;
}

function nextPerformanceTracks(
  tracks: PerformanceTrack[],
  targetIndex: number,
  mode: AppState["trackMuteMode"],
) {
  if (mode === "SOLO") {
    return tracks.map((track, index) => ({
      ...track,
      muted: index !== targetIndex,
      solo: index === targetIndex,
    }));
  }

  return tracks.map((track, index) =>
    index === targetIndex ? { ...track, muted: !track.muted, solo: false } : { ...track, solo: false },
  );
}

function performanceMessage(index: number, next: PerformanceTrack) {
  const trackNumber = String(index + 1).padStart(2, "0");
  if (next.solo) return `SOLO TRACK ${trackNumber}`;
  return `${next.muted ? "MUTE" : "UNMUTE"} TRACK ${trackNumber}`;
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
    level: 127,
    pan: 0,
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
  return screen.startsWith("UTILITY_") || screen === "COUNT_IN" || screen === "GO_TO" || screen === "ERASE" || screen === "UNDO" || screen === "SEQUENCE_EDIT" || screen === "SONG" || screen === "TIMING_CORRECT";
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
    setState({ ...patch, isPlaying: true, bar: "001.01.00", currentBar: 1, currentStep: 1, currentStepIndex: 0 });
  } else {
    setState({
      ...patch,
      isPlaying: true,
      isSequenceRecording: true,
      bar: "001.01.00",
      currentBar: 1,
      currentStep: 1,
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
        { key: "masterVolume", label: "MASTER VOL", kind: "numeric", min: 0, max: 2000, step: 5 },
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
