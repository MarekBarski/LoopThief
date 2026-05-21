import { create } from "zustand";
import type { ScreenId } from "../types/navigation";
import { startRecordingCapture, type ActiveRecordingCapture, type RecordingInputSource } from "../audio/recordingCapture";
import { samplerEngine } from "../audio/samplerEngine";
import {
  EFFECT_DEFAULTS,
  fxEngine,
  MASTER_COMP_DEFAULTS,
  MASTER_EQ_DEFAULTS,
  type BusId,
  type EffectParamMap,
  type EffectType,
} from "../audio/fxEngine";
import { createSampleId, createWaveformCache, encodeWavRegion, getSampleAudioRef, getSampleBuffer, registerSampleAudio } from "../audio/sampleLibrary";
import metronomeSampleUrl from "../../assets/Samples/Metronome.wav?url";
import {
  loadFromBlob,
  saveBlobAs,
  serializeAll,
  serializeProject,
  serializeSeq,
  writeProjectZip,
} from "../disk";
import type { GlobalSettings, LoadedBundle, LoadedSample } from "../disk";

export type PadBank = "A" | "B" | "C" | "D";
type TimeSignature = "2/4" | "3/4" | "4/4" | "5/4" | "6/4" | "6/8" | "7/8" | "9/8" | "12/8";
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

type UndoSnapshot = {
  stepEvents: StepEvent[];
  sequences: Sequence[];
  programs: Program[];
  padAssignments: Record<PadBank, PadAssignment[]>;
  padMixer: Record<PadBank, MixerChannel[]>;
  recordedSamples: RecordedSample[];
  songSteps: SongStep[];
  sequenceLengthBars: number;
  timeSignature: TimeSignature;
  bpm: number;
  swing: number;
  currentSequence: string;
  currentTrackId: string;
  currentProgramId: string;
  activeScreen: ScreenId;
  selectedPad: string;
  padBank: PadBank;
  currentBar: number;
  currentStep: number;
  currentStepIndex: number;
  currentEvent: number;
  selectedEventIndex: number;
  selectedEventId: string | null;
  fxBuses: FXBus[];
  masterFx: MasterFX;
};

type UndoEntry = {
  label: string;
  snapshot: UndoSnapshot;
  timestamp: number;
  bucket: string;
};

type AppState = {
  activeScreen: ScreenId;
  audioStatus: "IDLE" | "READY" | "ERROR";
  lastAudioMessage: string;
  sequence: string;
  sequences: Sequence[];
  currentSequence: string;
  sequenceLengthBars: number;
  timeSignature: TimeSignature;
  sequenceName: string;
  bar: string;
  bpm: number;
  swing: number;
  timingCorrect: "OFF" | "1/4" | "1/8" | "1/16" | "1/32" | "1/4T" | "1/8T" | "1/16T" | "1/32T";
  quantizeStrength: number;
  tcEnabled: boolean;
  timingApplyTo: "CURRENT TRACK" | "ALL TRACKS";
  noteRepeatEnabled: boolean;
  sequenceLoopedSinceRecordStart: boolean;
  recordingSessionInitialEvents: Record<number, string[]>;
  recordSessionClearedSteps: number[];
  noteRepeatGate: number;
  noteRepeatVelocityMode: "FIXED" | "PAD";
  tripletMode: boolean;
  currentTrackId: string;
  activeTrack: string;
  programs: Program[];
  currentProgramId: string;
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
  metronomeEnabled: boolean;
  metronomeDuringRecord: boolean;
  metronomeCountInBars: number;
  metronomeVolume: number;
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
  undoHistory: UndoEntry[];
  redoHistory: UndoEntry[];
  pendingRecTake: UndoEntry | null;
  projectVersion: number;
  lastSavedProjectVersion: number;
  lastAction: string;
  sixteenLevelsSourcePad: string;
  sixteenLevelsParameter: "VELOCITY" | "TUNE" | "DECAY" | "FILTER" | "ATTACK";
  sixteenLevelsRootPad: number;
  sixteenLevelsFilterCutoff: number | null;
  sixteenLevelsFilterResonance: number | null;
  sixteenLevelsFilterType: "OFF" | "LOWPASS" | "HIGHPASS" | "BANDPASS" | null;
  sixteenLevelsSourceArmed: boolean;
  addEventArmed: boolean;
  stepInputAutoAdvance: boolean;
  lastSixteenLevelsValue: number;
  overdubEnabled: boolean;
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
  programView: "PARAMS" | "CHOKE" | "FILTER" | "FX";
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
  fxBuses: FXBus[];
  masterFx: MasterFX;
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
  toggleOverdub: () => void;
  toggleWaitPad: () => void;
  openCountInUtility: () => void;
  setCountInMode: (mode: AppState["countInMode"]) => void;
  cycleCountInClickDuring: () => void;
  adjustCountInClickVolume: (delta: number) => void;
  toggleMetronomeEnabled: () => void;
  toggleMetronomeDuringRecord: () => void;
  adjustMetronomeCountInBars: (delta: number) => void;
  adjustMetronomeVolume: (delta: number) => void;
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
  setPadBank: (bank: PadBank) => void;
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
  setCurrentSequenceName: (name: string) => void;
  setCurrentTrackName: (name: string) => void;
  setCurrentProgramName: (name: string) => void;
  previousSequence: () => void;
  nextSequence: () => void;
  previousTrack: () => void;
  nextTrack: () => void;
  previousProgram: () => void;
  nextProgram: () => void;
  createProgram: () => void;
  cycleTimingCorrect: () => void;
  adjustSequenceLengthBars: (delta: number) => void;
  cycleTimeSignature: (delta: number) => void;
  adjustBpm: (delta: number) => void;
  adjustSwing: (delta: number) => void;
  adjustQuantizeStrength: (delta: number) => void;
  cycleTimingApplyTo: () => void;
  applyTimingCorrectToEvents: () => void;
  openTimeSigWindow: () => void;
  closeTimeSigWindow: () => void;
  changeBarTimeSignature: (barIndex: number, num: number, den: TimeSignatureDenominator) => void;
  openBarEditor: () => void;
  closeBarEditor: () => void;
  insertBlankBars: (beforeBarIndex: number, count: number, num: number, den: TimeSignatureDenominator) => void;
  deleteBars: (firstBar: number, lastBar: number) => void;
  copyBars: (params: {
    fromSeqId: string;
    firstBarIndex: number;
    lastBarIndex: number;
    toSeqId: string;
    beforeBarIndex: number;
    copies: number;
  }) => void;
  resetTimingCorrect: () => void;
  setNoteRepeatEnabled: (enabled: boolean) => void;
  cycleNoteRepeatRate: () => void;
  cycleNoteRepeatRateBack: () => void;
  adjustNoteRepeatGate: (delta: number) => void;
  toggleTripletMode: () => void;
  cycleTimingCorrectBack: () => void;
  cycleNoteRepeatVelocityMode: () => void;
  cycleSixteenLevelsParameter: () => void;
  cycleSixteenLevelsSourcePad: () => void;
  armSixteenLevelsSource: () => void;
  setSixteenLevelsSourceFromPad: (padIdentifier: string) => void;
  cycleSixteenLevelsRootPad: (delta: number) => void;
  adjustSixteenLevelsFilterCutoff: (delta: number) => void;
  adjustSixteenLevelsFilterResonance: (delta: number) => void;
  cycleSixteenLevelsFilterType: () => void;
  resetSixteenLevelsSandbox: () => void;
  insertSongStep: () => void;
  deleteSelectedSongStep: () => void;
  adjustSelectedSongRepeats: (delta: number) => void;
  moveSelectedSongStep: (delta: number) => void;
  cycleSelectedSongSequence: () => void;
  cycleSelectedSongSequenceBack: () => void;
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
    field:
      | "level"
      | "tune"
      | "fineTune"
      | "pan"
      | "attack"
      | "decay"
      | "chokeGroup"
      | "filterCutoff"
      | "filterResonance"
      | "fxSend",
    delta: number,
  ) => void;
  toggleSelectedPadMode: () => void;
  toggleSelectedPadVoiceMode: () => void;
  cycleSelectedPadFilterType: (delta: number) => void;
  setProgramView: (view: AppState["programView"]) => void;
  cycleMuteTargetMode: () => void;
  toggleMuteTargetForSelectedPad: (pad: string) => void;
  nextStepEvent: () => void;
  previousStepEvent: () => void;
  selectStepEvent: (eventId: string) => void;
  cycleStepTrack: (delta: number) => void;
  setEventEditMode: (mode: AppState["eventEditMode"]) => void;
  adjustSelectedEvent: (field: "velocity" | "timingOffset" | "duration" | "probability", delta: number) => void;
  cycleSelectedEventTrack: () => void;
  deleteSelectedEvent: () => void;
  toggleEventMuted: (eventId: string) => void;
  addStepEventAtCurrentStep: () => void;
  armAddEvent: () => void;
  createStepEventForPad: (padIdentifier: string) => void;
  toggleStepInputAutoAdvance: () => void;
  cycleSelectedEventAppliedParameter: (delta: number) => void;
  adjustSelectedEventAppliedValue: (delta: number) => void;
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
  togglePerformanceTrack: (index: number) => void;
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
  // ---- FX system (Phase A) ----
  setFxBusEffect: (busId: BusId, effect: EffectType | null) => void;
  toggleFxBusDirect: (busId: BusId) => void;
  toggleFxBusBypass: (busId: BusId) => void;
  adjustFxBusParam: (busId: BusId, key: string, delta: number) => void;
  setFxBusParam: (busId: BusId, key: string, value: number) => void;
  toggleMasterEqBypass: () => void;
  toggleMasterCompBypass: () => void;
  adjustMasterEqParam: (key: string, delta: number) => void;
  setMasterEqParam: (key: string, value: number) => void;
  adjustMasterCompParam: (key: string, delta: number) => void;
  setMasterCompParam: (key: string, value: number) => void;
  setPadFxBus: (pad: string, busId: 0 | BusId) => void;
  adjustPadFxSendLevel: (pad: string, delta: number) => void;
  setPadFxSendLevel: (pad: string, level: number) => void;
  openFxSendWindow: () => void;
  closeFxSendWindow: () => void;
  createProjectSnapshot: () => ProjectSnapshot;
  saveProjectFile: (name: string) => Promise<void>;
  saveAllFile: (name: string) => Promise<void>;
  saveSeqFile: (name: string, sequenceId?: string) => Promise<void>;
  loadFile: (file: Blob, options?: { targetSequenceId?: string }) => Promise<{ type: "project" | "all" | "seq"; name: string }>;
  newProject: () => Promise<void>;
  preloadAudioBuffers: () => void;
};

type PadAssignment = {
  pad: string;
  assignment: string;
  mode: "ONE SHOT" | "NOTE ON";
  voiceMode: "POLY" | "MONO";
  level: number;
  tune: number;
  fineTune: number;
  pan: number;
  attack: number;
  decay: number;
  filterType: "OFF" | "LOWPASS" | "HIGHPASS" | "BANDPASS";
  filterCutoff: number;
  filterResonance: number;
  fxSend: number;          // Legacy display field; kept for back-compat with old saved projects.
  fxBus: 0 | BusId;        // Phase-A FX routing — 0 = no bus.
  fxSendLevel: number;     // Phase-A FX send level 0..100. Ignored when bus is in INSERT mode.
  chokeGroup: number;
  muteTargetMode: "OFF" | "PAIR" | "GROUP";
  muteTargets: string[];
};

// ============================================================================
// FX system state types (Phase A — MPC5000 routing model)
// ============================================================================
type FXBus = {
  id: BusId;
  effect: EffectType | null;   // null = empty bus (passthrough)
  direct: boolean;             // true = SEND mode (dry+wet), false = INSERT mode (wet only)
  bypass: boolean;
  params: EffectParamMap;      // shape depends on effect type; switching effect resets to defaults
};

type MasterFX = {
  eq: {
    bypass: boolean;
    params: EffectParamMap;    // lowFreq/lowGain/lowQ, lowMidFreq/..., highMidFreq/..., highFreq/...
  };
  compressor: {
    bypass: boolean;
    params: EffectParamMap;    // threshold/ratio/attack/release/makeupGain
  };
};

type StepEvent = {
  id: string;
  step: string;
  pad: string;
  padNumber: number;
  trackId: string;
  trackName?: string;
  physicalPad?: string;
  sourcePad?: string;
  sourceAssignment?: string;
  padBank?: PadBank;
  programId?: string;
  appliedParameter?: AppState["sixteenLevelsParameter"];
  appliedValue?: number;
  parameterValue?: number;
  appliedFilterType?: "OFF" | "LOWPASS" | "HIGHPASS" | "BANDPASS";
  appliedFilterResonance?: number;
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

type TimeSignatureDenominator = 4 | 8 | 16 | 32;

type TimeSignatureChange = {
  fromBar: number; // 0-indexed bar from which this TS applies
  num: number;     // 1–31
  den: TimeSignatureDenominator;
};

type Sequence = {
  id: string;
  name: string;
  lengthBars: number;
  timeSignature: TimeSignature;
  timeSignatureChanges?: TimeSignatureChange[]; // Per-bar TS. Always contains entry { fromBar: 0, ... } after migration.
  bpm: number;
  tracks: Track[];
  events: StepEvent[];
};

type Track = {
  id: string;
  name: string;
  programId: string;
  mute: boolean;
  solo: boolean;
  type: "DRUM" | "MIDI" | "AUDIO";
  output: "MAIN" | "OUT1" | "OUT2" | "OUT3";
};

type Program = {
  id: string;
  name: string;
  padAssignments: Record<PadBank, PadAssignment[]>;
  padMixer: Record<PadBank, MixerChannel[]>;
  filter: ProgramFilterSettings;
  fx: ProgramFxSettings;
};

type ProgramFilterSettings = {
  type: "OFF" | "LOWPASS" | "HIGHPASS";
  cutoff: number;
  resonance: number;
};

type ProgramFxSettings = {
  sendLevel: number;
  type: "OFF" | "DELAY" | "REVERB";
};

type ProjectSnapshot = {
  version: 1;
  sequences: Sequence[];
  currentSequence: string;
  currentTrackId: string;
  programs: Program[];
  currentProgramId: string;
  songSteps: SongStep[];
  settingsValues: SettingsValues;
  samples: Array<Pick<RecordedSample, "id" | "name" | "audioBufferId" | "durationMs" | "duration" | "sampleRate" | "channelCount" | "keptSlices" | "editState">>;
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
  id: string;
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
  metronomeDuringRecord: boolean;
  metronomeCountInBars: number;
  metronomeVolume: number;
  padCurve: "SOFT" | "LINEAR" | "HARD";
  displayBrightness: number;
  autoSave: boolean;
  latency: number;
  masterVolume: number;
  audioInputSource: "SYSTEM AUDIO" | "LINE IN" | "USB";
};

let eventIdCounter = 0;
let activeRecordingCapture: ActiveRecordingCapture | null = null;
let sequenceStepStartedAt = typeof performance !== "undefined" ? performance.now() : 0;
let metronomeBufferId: string | null = null;
let metronomeLoadPromise: Promise<string | null> | null = null;
let lastStopAt = 0;
let firstTickPending = false;
const noteRepeatIntervals = new Map<string, number>();

const initialStepEvents: StepEvent[] = [];

export const useAppStore = create<AppState>((set, get) => ({
  activeScreen: "MAIN",
  audioStatus: samplerEngine.getStatus(),
  lastAudioMessage: "",
  sequence: "01",
  sequences: createSequences(initialStepEvents),
  currentSequence: "01",
  sequenceLengthBars: 4,
  timeSignature: "4/4",
  sequenceName: "SEQ01",
  bar: "001.01.00",
  bpm: 94,
  swing: 54,
  timingCorrect: "1/16",
  quantizeStrength: 100,
  tcEnabled: true,
  timingApplyTo: "CURRENT TRACK",
  noteRepeatEnabled: false,
  sequenceLoopedSinceRecordStart: false,
  recordingSessionInitialEvents: {},
  recordSessionClearedSteps: [],
  noteRepeatGate: 75,
  noteRepeatVelocityMode: "PAD",
  tripletMode: false,
  currentTrackId: "TRACK01",
  activeTrack: formatTrackName("TRACK01", 0),
  programs: createPrograms(),
  currentProgramId: "PRG01",
  activeProgram: "PRG01",
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
  countInMode: "1 BAR",
  countInClickDuring: "REC ONLY",
  countInClickVolume: 70,
  metronomeEnabled: true,
  metronomeDuringRecord: true,
  metronomeCountInBars: 1,
  metronomeVolume: 70,
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
  undoHistory: [],
  redoHistory: [],
  pendingRecTake: null,
  projectVersion: 0,
  lastSavedProjectVersion: 0,
  lastAction: "",
  sixteenLevelsSourcePad: "A01",
  sixteenLevelsParameter: "VELOCITY",
  sixteenLevelsRootPad: 5,
  sixteenLevelsFilterCutoff: null,
  sixteenLevelsFilterResonance: null,
  sixteenLevelsFilterType: null,
  sixteenLevelsSourceArmed: false,
  addEventArmed: false,
  stepInputAutoAdvance: false,
  lastSixteenLevelsValue: 96,
  overdubEnabled: false,
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
  inputGain: 9,
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
    { name: "TRACK01", level: 100, muted: false, solo: false },
  ],
  padMixer: createPadMixer(),
  performanceTracks: [
    { id: "TRACK01", name: "TRACK01", muted: false, solo: false, activity: 28 },
  ],
  trackMuteMode: "MUTE",
  lastPerformanceMessage: "",
  songSteps: [
    { sequenceId: "01", repeats: 2 },
  ],
  selectedSongStepIndex: 0,
  currentSongStepIndex: 0,
  currentSongRepeat: 1,
  queuedSequence: null,
  queuedSequenceBarsRemaining: 0,
  performancePulse: 0,
  fxBuses: createDefaultFxBuses(),
  masterFx: createDefaultMasterFx(),
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
    metronomeDuringRecord: true,
    metronomeCountInBars: 1,
    metronomeVolume: 70,
    padCurve: "LINEAR",
    displayBrightness: 72,
    autoSave: false,
    latency: 8,
    masterVolume: 100,
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
  stopPlayback: () => {
    const now = performance.now();
    const isDoubleStop = now - lastStopAt < 500;
    lastStopAt = now;
    stopAllNoteRepeatLoops();
    if (isDoubleStop) {
      samplerEngine.stopAllVoices();
    }
    set((state) => ({
      isPlaying: false,
      isSequenceRecording: false,
      overdubEnabled: false,
      waitPadEnabled: false,
      chopCursor: 0,
      transportPhase: "IDLE",
      transportPendingAction: null,
      transportCountInBeatsRemaining: 0,
      transportAnnouncement: "",
      lastAudioMessage: isDoubleStop ? "ALL AUDIO STOPPED" : state.lastAudioMessage,
      ...endRecTakeSnapshot(state),
    }));
  },
  toggleSequenceRecording: () => {
    const state = get();
    if (state.isSequenceRecording) {
      set({
        isSequenceRecording: false,
        transportPhase: "IDLE",
        transportPendingAction: null,
        transportCountInBeatsRemaining: 0,
        transportAnnouncement: "",
        ...(state.overdubEnabled ? {} : endRecTakeSnapshot(state)),
      });
      return;
    }
    if (state.isPlaying) {
      if (state.metronomeEnabled && state.metronomeCountInBars > 0) {
        set({
          transportPhase: "COUNT_IN",
          transportPendingAction: "REC",
          transportCountInBeatsRemaining: state.metronomeCountInBars * beatsPerBar(state),
          transportCountInPulse: 0,
          transportAnnouncement: "COUNT IN...",
          overdubEnabled: false,
          // Snapshot here at user-click time, NOT at count-in end (audio path).
          ...beginRecTakeSnapshot(state),
        });
        playMetronomeClick(state, true);
        return;
      }
      set({
        isSequenceRecording: true,
        overdubEnabled: false,
        transportAnnouncement: "RECORDING...",
        ...startRecordingSession(state),
        ...beginRecTakeSnapshot(state),
      });
      return;
    }
    // Snapshot now at user-click time — requestTransportStartImpl may invoke count-in or wait-pad
    // which are audio scheduling paths.
    set(beginRecTakeSnapshot(state));
    requestTransportStartImpl("REC", set, get);
  },
  toggleOverdub: () =>
    set((state) => {
      const next = !state.overdubEnabled;
      if (next) {
        return {
          overdubEnabled: true,
          isSequenceRecording: false,
          lastAudioMessage: state.isPlaying ? "OVERDUB" : "OVERDUB ARMED",
          ...(state.isPlaying ? beginRecTakeSnapshot(state) : {}),
        };
      }
      return {
        overdubEnabled: false,
        lastAudioMessage: state.isPlaying ? "OVERDUB OFF" : state.lastAudioMessage,
        ...(state.isSequenceRecording ? {} : endRecTakeSnapshot(state)),
      };
    }),
  toggleWaitPad: () => set((state) => ({ waitPadEnabled: !state.waitPadEnabled })),
  openCountInUtility: () =>
    set((state) => ({
      activeScreen: "COUNT_IN",
      utilityReturnScreen: isUtilityScreen(state.activeScreen) ? state.utilityReturnScreen : state.activeScreen,
    })),
  setCountInMode: (countInMode) =>
    set((state) => {
      const metronomeCountInBars = countInModeToBars(countInMode);
      return {
        countInMode,
        metronomeCountInBars,
        settingsValues: { ...state.settingsValues, metronomeCountInBars },
      };
    }),
  cycleCountInClickDuring: () =>
    set((state) => {
      const order: AppState["countInClickDuring"][] = ["REC ONLY", "PLAY+REC", "ALWAYS", "OFF"];
      return { countInClickDuring: order[(order.indexOf(state.countInClickDuring) + 1) % order.length] };
    }),
  adjustCountInClickVolume: (delta) =>
    set((state) => {
      const metronomeVolume = clamp(state.metronomeVolume + delta, 0, 100);
      return {
        countInClickVolume: metronomeVolume,
        metronomeVolume,
        settingsValues: { ...state.settingsValues, metronomeVolume },
      };
    }),
  toggleMetronomeEnabled: () =>
    set((state) => ({
      metronomeEnabled: !state.metronomeEnabled,
      settingsValues: { ...state.settingsValues, metronomeEnabled: !state.metronomeEnabled },
    })),
  toggleMetronomeDuringRecord: () =>
    set((state) => ({
      metronomeDuringRecord: !state.metronomeDuringRecord,
      settingsValues: { ...state.settingsValues, metronomeDuringRecord: !state.metronomeDuringRecord },
    })),
  adjustMetronomeCountInBars: (delta) =>
    set((state) => {
      const metronomeCountInBars = clamp(state.metronomeCountInBars + delta, 0, 4);
      return {
        metronomeCountInBars,
        countInMode: countInBarsToMode(metronomeCountInBars),
        settingsValues: { ...state.settingsValues, metronomeCountInBars },
      };
    }),
  adjustMetronomeVolume: (delta) =>
    set((state) => {
      const metronomeVolume = clamp(state.metronomeVolume + delta, 0, 100);
      return {
        metronomeVolume,
        countInClickVolume: metronomeVolume,
        settingsValues: { ...state.settingsValues, metronomeVolume },
      };
    }),
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
    const wasArmedSourcePick =
      get().activeScreen === "UTILITY_16_LEVELS" && get().sixteenLevelsSourceArmed;
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
          ...recordUndo(state, `PAD ERASE ${selectedPad}`, `erase:${selectedPad}`),
        };
      }
      if (state.activeScreen === "PROGRAM" && state.programView === "CHOKE") {
        const currentPad = state.padAssignments[state.padBank].find((pad) => pad.pad === state.selectedPad);
        if (currentPad && currentPad.pad !== selectedPad) {
          const hasTarget = currentPad.muteTargets.includes(selectedPad);
          const muteTargets = hasTarget
            ? currentPad.muteTargets.filter((target) => target !== selectedPad)
            : [...currentPad.muteTargets, selectedPad].slice(-2);
          const padAssignments = updatePadAssignmentsForProgram(state, state.padBank, (pad) =>
            pad.pad === state.selectedPad ? { ...pad, muteTargetMode: "PAIR", muteTargets } : pad,
          );
          return {
            triggeredPads: markPadTriggered(state.triggeredPads, state.padBank, selectedPad, true),
            padAssignments,
            programs: syncCurrentProgram(state, { padAssignments }),
          };
        }
      }

      if (state.activeScreen === "PERFORMANCE" && padNumber >= 1 && padNumber <= state.performanceTracks.length) {
        const targetIndex = padNumber - 1;
        const target = state.performanceTracks[targetIndex];
        const performanceTracks = nextPerformanceTracks(state.performanceTracks, targetIndex, state.trackMuteMode);
        return {
          selectedPad,
          triggeredPads: markPadTriggered(state.triggeredPads, state.padBank, selectedPad, true),
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
          triggeredPads: markPadTriggered(state.triggeredPads, state.padBank, selectedPad, true),
          performanceTracks,
          lastPerformanceMessage: performanceMessage(targetIndex, performanceTracks[targetIndex]),
        };
      }

      if (state.activeScreen === "UTILITY_PAD_MUTE") {
        const channels = state.padMixer[state.padBank].map((channel) =>
          channel.pad === selectedPad ? { ...channel, muted: !channel.muted } : channel,
        );
        syncMixerBankToAudio(state.padBank, channels, state.currentProgramId);
        const padMixer = {
          ...state.padMixer,
          [state.padBank]: channels,
        };
        return {
          selectedPad,
          triggeredPads: markPadTriggered(state.triggeredPads, state.padBank, selectedPad, true),
          padMixer,
          programs: syncCurrentProgram(state, { padMixer }),
        };
      }

      if (state.activeScreen === "UTILITY_NEXT_SEQ" && padNumber >= 1 && padNumber <= state.sequences.length) {
        const sequence = state.sequences[padNumber - 1];
        return {
          selectedPad,
          triggeredPads: markPadTriggered(state.triggeredPads, state.padBank, selectedPad, true),
          queuedSequence: sequence.id,
          queuedSequenceBarsRemaining: 1,
          lastPerformanceMessage: `NEXT SEQ: ${sequence.name}`,
        };
      }

      if (state.transportPhase === "WAIT_PAD" && state.transportPendingAction) {
        const pendingAction = state.transportPendingAction;
        // WAIT FOR PAD spec: skip count-in, start immediately, and (for REC) record the first
        // pad hit at 001.01.000. waitPadEnabled auto-toggles off so user must re-arm explicitly.
        if (pendingAction === "REC") {
          const velocity = state.fullLevelEnabled ? 127 : 100;
          const assignment = state.padAssignments[state.padBank].find((item) => item.pad === selectedPad);
          const event = createStepEventAtPosition(0, 0, selectedPad, velocity, 100, {
            sequence: getCurrentSequence(state),
            trackId: state.currentTrackId,
            trackName: getTrackName(getCurrentSequence(state), state.currentTrackId),
            sourcePad: selectedPad,
            sourceAssignment: assignment?.assignment === "---" ? undefined : assignment?.assignment,
            padBank: state.padBank,
            programId: state.currentProgramId,
            variation: "REC",
            duration: 0,
            length: 0,
          });
          sequenceStepStartedAt = performance.now();
          firstTickPending = true;
          return {
            selectedPad,
            lastTriggeredPad: selectedPad,
            lastPadVelocity: velocity,
            waitPadEnabled: false,
            triggeredPads: markPadTriggered(state.triggeredPads, state.padBank, selectedPad, true),
            ...computeRecordTransitionPatch(state, {
              action: "REC",
              additionalEvent: event,
              initialStepIndex: 0,
            }),
          };
        }
        // PLAY pending: just start playback, no event recorded.
        startTransportAction(pendingAction, set, get);
        return {
          selectedPad,
          lastTriggeredPad: selectedPad,
          lastPadVelocity: 127,
          waitPadEnabled: false,
          transportPhase: "IDLE",
          transportPendingAction: null,
          transportAnnouncement: "WAIT PAD RELEASED",
          triggeredPads: markPadTriggered(state.triggeredPads, state.padBank, selectedPad, true),
        };
      }

      if (state.addEventArmed) {
        return {
          selectedPad,
          lastTriggeredPad: selectedPad,
          ...createStepEventForPadImpl(state, selectedPad),
          addEventArmed: false,
          triggeredPads: markPadTriggered(state.triggeredPads, state.padBank, selectedPad, true),
        };
      }

      // STEP INPUT mode: pad click adds event at current NOW position. Only when sequence is stopped.
      if (state.currentPadMode === "STEP_INPUT" && !state.isPlaying) {
        const sequence = getCurrentSequence(state);
        const velocity = state.fullLevelEnabled ? 127 : 100;
        const assignment = state.padAssignments[state.padBank].find((item) => item.pad === selectedPad);
        const newEvent = createStepEventAtPosition(state.currentStepIndex, 0, selectedPad, velocity, 100, {
          sequence,
          trackId: state.currentTrackId,
          trackName: getTrackName(sequence, state.currentTrackId),
          sourcePad: selectedPad,
          sourceAssignment: assignment?.assignment === "---" ? undefined : assignment?.assignment,
          padBank: state.padBank,
          programId: state.currentProgramId,
          variation: "STEP",
          duration: 0,
          length: 0,
        });
        const stepEvents = [...state.stepEvents, newEvent].sort(
          (a, b) => eventStepIndex(a.step) - eventStepIndex(b.step),
        );
        const basePatch: Partial<AppState> = {
          selectedPad,
          lastTriggeredPad: selectedPad,
          lastPadVelocity: velocity,
          stepEvents,
          sequences: updateCurrentSequenceEvents(state, stepEvents),
          lastAudioMessage: `STEP INPUT: ${newEvent.step}`,
          triggeredPads: markPadTriggered(state.triggeredPads, state.padBank, selectedPad, true),
          ...recordUndo(state, "STEP INPUT EVENT", `step-input:${state.currentStepIndex}:${Date.now()}`),
        };
        if (state.stepInputAutoAdvance) {
          const totalSteps = getSequenceTotalSteps(sequence, 24);
          const nextStepIndex = totalSteps > 0 ? (state.currentStepIndex + 1) % totalSteps : state.currentStepIndex;
          const info = findBarAtGlobalStep(sequence, 24, nextStepIndex);
          basePatch.currentStepIndex = nextStepIndex;
          basePatch.currentBar = info.bar + 1;
          basePatch.currentStep = info.stepInBar + 1;
          basePatch.bar = formatBarPosition(info.bar + 1, info.stepInBar + 1, sequence);
        }
        return basePatch;
      }

      if (state.transportPhase === "COUNT_IN" && state.transportPendingAction === "REC") {
        const beatMs = 60_000 / state.bpm;
        const windowMs = 0.25 * beatMs;
        const remainingBeatMs = beatMs - state.transportCountInPulse;
        const isLastBeat = state.transportCountInBeatsRemaining <= 1;
        if (isLastBeat && remainingBeatMs <= windowMs) {
          playMetronomeClick(state, true);
          const velocity = state.fullLevelEnabled ? 127 : 100;
          const assignment = state.padAssignments[state.padBank].find((item) => item.pad === selectedPad);
          const event = createStepEventAtPosition(0, 0, selectedPad, velocity, 100, {
            sequence: getCurrentSequence(state),
            trackId: state.currentTrackId,
            trackName: getTrackName(getCurrentSequence(state), state.currentTrackId),
            sourcePad: selectedPad,
            sourceAssignment: assignment?.assignment === "---" ? undefined : assignment?.assignment,
            padBank: state.padBank,
            programId: state.currentProgramId,
            variation: "REC",
            duration: 0,
            length: 0,
          });
          sequenceStepStartedAt = performance.now();
          firstTickPending = true;
          return {
            selectedPad,
            lastTriggeredPad: selectedPad,
            lastPadVelocity: velocity,
            triggeredPads: markPadTriggered(state.triggeredPads, state.padBank, selectedPad, true),
            ...computeRecordTransitionPatch(state, {
              action: "REC",
              additionalEvent: event,
              initialStepIndex: 0,
            }),
          };
        }
      }

      if (state.activeScreen === "UTILITY_16_LEVELS") {
        if (state.sixteenLevelsSourceArmed) {
          const newSource = `${state.padBank}${selectedPad.slice(1)}`;
          return {
            selectedPad,
            sixteenLevelsSourcePad: newSource,
            sixteenLevelsSourceArmed: false,
            sixteenLevelsFilterCutoff: null,
            sixteenLevelsFilterResonance: null,
            sixteenLevelsFilterType: null,
            triggeredPads: markPadTriggered(state.triggeredPads, state.padBank, selectedPad, true),
          };
        }
        const appliedValue = getSixteenLevelsValue(state, padNumber);
        const sourceBank = state.sixteenLevelsSourcePad.slice(0, 1) as PadBank;
        const sourceNumber = clamp(Number(state.sixteenLevelsSourcePad.slice(1)) || 1, 1, 16);
        const sourcePadId = `P${String(sourceNumber).padStart(2, "0")}`;
        const sourceAssignment = getSourceAssignment(state);
        const sourceAssigned = !!sourceAssignment && sourceAssignment.assignment !== "---";
        const eventVelocity =
          state.sixteenLevelsParameter === "VELOCITY"
            ? appliedValue
            : state.fullLevelEnabled
              ? 127
              : 100;
        const sandboxFilterTypeForRecord =
          state.sixteenLevelsParameter === "FILTER"
            ? state.sixteenLevelsFilterType ?? sourceAssignment?.filterType
            : undefined;
        const sandboxFilterResonanceForRecord =
          state.sixteenLevelsParameter === "FILTER"
            ? state.sixteenLevelsFilterResonance ?? sourceAssignment?.filterResonance
            : undefined;
        const recordedEvent =
          state.isPlaying && (state.isSequenceRecording || state.overdubEnabled) && sourceAssigned
            ? createStepEventFromIndex(
                state.currentStepIndex,
                sourcePadId,
                eventVelocity,
                100,
                0,
                {
                  sequence: getCurrentSequence(state),
                  physicalPad: selectedPad,
                  sourcePad: state.sixteenLevelsSourcePad,
                  trackId: state.currentTrackId,
                  trackName: getTrackName(getCurrentSequence(state), state.currentTrackId),
                  padBank: sourceBank,
                  programId: state.currentProgramId,
                  appliedParameter: state.sixteenLevelsParameter,
                  appliedValue,
                  parameterValue: appliedValue,
                  appliedFilterType: sandboxFilterTypeForRecord,
                  appliedFilterResonance: sandboxFilterResonanceForRecord,
                  duration: 0,
                  length: 0,
                },
              )
            : null;
        const events = recordedEvent
          ? [...state.stepEvents, recordedEvent].sort((a, b) => eventStepIndex(a.step) - eventStepIndex(b.step))
          : state.stepEvents;
        return {
          selectedPad,
          lastTriggeredPad: selectedPad,
          lastPadVelocity: state.fullLevelEnabled ? 127 : eventVelocity,
          lastSixteenLevelsValue: appliedValue,
          stepEvents: events,
          sequences: recordedEvent ? updateCurrentSequenceEvents(state, events) : state.sequences,
          lastAudioMessage:
            !sourceAssigned && state.isPlaying && (state.isSequenceRecording || state.overdubEnabled)
              ? "16LV: SOURCE UNASSIGNED"
              : state.lastAudioMessage,
          triggeredPads: markPadTriggered(state.triggeredPads, state.padBank, selectedPad, true),
        };
      }

      const canSelectSlice =
        state.activeScreen === "CHOP" &&
        state.recordedSamples.length > 0 &&
        padNumber >= 1 &&
        padNumber <= state.chopMarkers.length;
      const velocity = 127;
      const recordingActive = state.isPlaying && (state.isSequenceRecording || state.overdubEnabled);
      const recordedEvent = recordingActive
        ? createRecordedPadEvent(state, selectedPad, velocity)
        : null;
      const events = recordedEvent
        ? [...state.stepEvents, recordedEvent].sort((a, b) => eventStepIndex(a.step) - eventStepIndex(b.step))
        : state.stepEvents;

      return {
        selectedPad,
        lastTriggeredPad: selectedPad,
        lastPadVelocity: velocity,
        stepEvents: events,
        sequences: recordedEvent ? updateCurrentSequenceEvents(state, events) : state.sequences,
        lastAction: recordedEvent
          ? (state.isSequenceRecording ? `REC REPLACE ${selectedPad}` : `OVERDUB ADD ${selectedPad}`)
          : state.lastAction,
        selectedSlice: canSelectSlice ? padNumber : state.selectedSlice,
        chopCursor: canSelectSlice ? state.chopMarkers[padNumber - 1] : state.chopCursor,
        triggeredPads: markPadTriggered(state.triggeredPads, state.padBank, selectedPad, true),
      };
    });
    if (!wasArmedSourcePick) {
      const playbackState = get();
      if (playbackState.activeScreen === "UTILITY_16_LEVELS") {
        playSixteenLevelsVariation(playbackState, padNumberFromPad(selectedPad));
      } else {
        playPadFromState(playbackState, selectedPad);
      }
      if (get().noteRepeatEnabled) startNoteRepeatLoop(selectedPad);
    }
    window.setTimeout(() => {
      set((state) => ({
        triggeredPads: markPadTriggered(state.triggeredPads, state.padBank, selectedPad, false),
      }));
    }, 140);
  },
  releasePad: (pad) => {
    stopNoteRepeatLoop(pad);
    const state = get();
    const assignment = state.padAssignments[state.padBank].find((item) => item.pad === pad);
    if (assignment?.mode === "NOTE ON") {
      const releaseMs = assignment.decay >= 100 ? 0 : programValueToMs(assignment.decay);
      samplerEngine.stopVoiceGroup(
        mixerChannelKey(state.padBank, pad, state.currentProgramId),
        releaseMs > 0 ? { releaseMs } : undefined,
      );
    }
    set((current) => ({
      triggeredPads: markPadTriggered(current.triggeredPads, current.padBank, pad, false),
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
  setPadBank: (padBank) => set({ padBank }),
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
  exitUtilityWorkflow: () =>
    set((state) => {
      const wasInSixteenLevels = state.activeScreen === "UTILITY_16_LEVELS";
      return {
        activeScreen: state.utilityReturnScreen,
        ...(wasInSixteenLevels
          ? {
              sixteenLevelsFilterCutoff: null,
              sixteenLevelsFilterResonance: null,
              sixteenLevelsFilterType: null,
              sixteenLevelsSourceArmed: false,
            }
          : {}),
      };
    }),
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
      const sequence = getCurrentSequence(state);
      const totalSteps = getSequenceTotalSteps(sequence, 24);
      const targetGlobal = globalStepFromBarAndStepInBar(sequence, 24, state.currentBar - 1, state.currentStep - 1);
      const currentStepIndex = ((targetGlobal % totalSteps) + totalSteps) % totalSteps;
      return {
        bar: formatBarPosition(state.currentBar, state.currentStep, sequence),
        currentStepIndex,
        ...selectedEventPatch(state.stepEvents, nearestEventAtOrAfter(state.stepEvents, currentStepIndex)),
        lastAction: `GO TO ${String(state.currentBar).padStart(3, "0")}.${String(state.currentStep).padStart(2, "0")}`,
      };
    }),
  setEraseMode: (eraseMode) => set({ eraseMode }),
  executeErase: () =>
    set((state) => {
      const eraseMode = state.eraseMode;
      if (eraseMode === "AUTOMATION") {
        return { lastAudioMessage: "AUTOMATION ERASE — not implemented" };
      }
      let predicate: (event: StepEvent) => boolean;
      if (eraseMode === "PAD") {
        predicate = (event) => {
          const eventBank = event.padBank ?? "A";
          const eventPad = padFromEvent(event);
          return eventBank === state.padBank && eventPad === state.selectedPad;
        };
      } else if (eraseMode === "TRACK") {
        predicate = (event) => event.trackId === state.currentTrackId;
      } else if (eraseMode === "BAR") {
        const sequence = getCurrentSequence(state);
        const barIndex = state.currentBar - 1;
        const barStart = globalStepFromBarAndStepInBar(sequence, 24, barIndex, 0);
        const barEnd = barStart + getBarStepCount(sequence, barIndex, 24);
        predicate = (event) => {
          const idx = eventGlobalStep(event.step, sequence, 24);
          return idx >= barStart && idx < barEnd;
        };
      } else {
        predicate = () => true;
      }
      const stepEvents = state.stepEvents.filter((event) => !predicate(event));
      const removedCount = state.stepEvents.length - stepEvents.length;
      if (removedCount === 0) {
        return { lastAudioMessage: "NOTHING TO ERASE" };
      }
      const action = `ERASE ${eraseMode}`;
      return {
        stepEvents,
        sequences: updateCurrentSequenceEvents(state, stepEvents),
        lastEraseMessage: `ERASED ${removedCount} EVENTS`,
        lastErasedCount: removedCount,
        lastAudioMessage: `ERASED ${removedCount} EVENTS`,
        ...recordUndo(state, action, `erase-execute:${Date.now()}`),
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
      const entry = state.undoHistory.at(-1);
      if (!entry) return { lastAudioMessage: "NOTHING TO UNDO" };
      const forwardSnapshot: UndoEntry = {
        label: entry.label,
        snapshot: captureSnapshot(state),
        timestamp: performance.now(),
        bucket: entry.bucket,
      };
      return {
        ...restoreSnapshot(entry.snapshot),
        undoHistory: state.undoHistory.slice(0, -1),
        redoHistory: [...state.redoHistory, forwardSnapshot].slice(-UNDO_DEPTH),
        lastAction: `UNDO ${entry.label}`,
        lastAudioMessage: `UNDO: ${entry.label}`,
      };
    }),
  redoLastAction: () =>
    set((state) => {
      const entry = state.redoHistory.at(-1);
      if (!entry) return { lastAudioMessage: "NOTHING TO REDO" };
      const reverseSnapshot: UndoEntry = {
        label: entry.label,
        snapshot: captureSnapshot(state),
        timestamp: performance.now(),
        bucket: entry.bucket,
      };
      return {
        ...restoreSnapshot(entry.snapshot),
        undoHistory: [...state.undoHistory, reverseSnapshot].slice(-UNDO_DEPTH),
        redoHistory: state.redoHistory.slice(0, -1),
        lastAction: `REDO ${entry.label}`,
        lastAudioMessage: `REDO: ${entry.label}`,
      };
    }),
  clearUndoHistory: () => set({ undoHistory: [], redoHistory: [], lastAction: "HISTORY CLEARED" }),
  createSequence: () =>
    set((state) => {
      const id = nextSequenceId(state.sequences);
      const sequence = createSequence(id, `SEQ${id}`, state.bpm, []);
      return {
        ...applyCurrentSequence({ ...state, sequences: [...state.sequences, sequence] }, id),
        ...recordUndo(state, "NEW SEQ", `new-seq:${Date.now()}`),
      };
    }),
  duplicateCurrentSequence: () =>
    set((state) => {
      const current = getCurrentSequence(state);
      const id = nextSequenceId(state.sequences);
      const sequence = {
        ...current,
        id,
        name: `SEQ${id}`,
        events: current.events.map((event) => ({ ...event })),
        tracks: current.tracks.map((track) => ({ ...track })),
      };
      return {
        ...applyCurrentSequence({ ...state, sequences: [...state.sequences, sequence] }, id),
        ...recordUndo(state, "DUPLICATE SEQ", `dup-seq:${Date.now()}`),
      };
    }),
  deleteCurrentSequence: () =>
    set((state) => {
      if (state.sequences.length <= 1) return state;
      const sequences = state.sequences.filter((sequence) => sequence.id !== state.currentSequence);
      return {
        ...applyCurrentSequence({ ...state, sequences }, sequences[0].id),
        ...recordUndo(state, "DELETE SEQ", `del-seq:${Date.now()}`),
      };
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
        ...recordUndo(state, "RENAME SEQ", `rename-seq:${Date.now()}`),
      };
    }),
  setCurrentSequenceName: (name) =>
    set((state) => {
      const nextName = normalizeSequenceOrTrackName(name, state.sequenceName);
      return {
        sequenceName: nextName,
        sequences: state.sequences.map((sequence) =>
          sequence.id === state.currentSequence ? { ...sequence, name: nextName } : sequence,
        ),
        ...recordUndo(state, "RENAME SEQ", `rename-seq-name:${state.currentSequence}`),
      };
    }),
  setCurrentTrackName: (name) =>
    set((state) => renameCurrentTrack(state, name)),
  setCurrentProgramName: (name) =>
    set((state) => renameCurrentProgram(state, name)),
  previousSequence: () =>
    set((state) => moveCurrentSequence(state, -1)),
  nextSequence: () =>
    set((state) => moveCurrentSequence(state, 1)),
  previousTrack: () =>
    set((state) => moveCurrentTrack(state, -1)),
  nextTrack: () =>
    set((state) => moveCurrentTrack(state, 1)),
  previousProgram: () =>
    set((state) => ({
      ...moveCurrentProgram(state, -1),
      ...recordUndo(state, "SWITCH PROGRAM", `switch-program:${Date.now()}`),
    })),
  nextProgram: () =>
    set((state) => ({
      ...moveCurrentProgram(state, 1),
      ...recordUndo(state, "SWITCH PROGRAM", `switch-program:${Date.now()}`),
    })),
  createProgram: () =>
    set((state) => {
      const id = nextProgramId(state.programs);
      const program = createProgramDefinition(id);
      return {
        programs: [...syncCurrentProgram(state), program],
        currentProgramId: id,
        activeProgram: program.name,
        padAssignments: program.padAssignments,
        padMixer: program.padMixer,
        ...recordUndo(state, "NEW PROGRAM", `new-program:${Date.now()}`),
      };
    }),
  adjustSequenceLengthBars: (delta) =>
    set((state) => {
      const sequenceLengthBars = clamp(state.sequenceLengthBars + delta, 1, 999);
      return {
        ...clampTransportToSequenceLength(state, sequenceLengthBars),
        sequenceLengthBars,
        sequences: state.sequences.map((sequence) =>
          sequence.id === state.currentSequence ? { ...sequence, lengthBars: sequenceLengthBars } : sequence,
        ),
        ...recordUndo(state, "SEQ BARS", `seq-bars:${state.currentSequence}`),
      };
    }),
  cycleTimeSignature: (delta) =>
    set((state) => {
      const values: TimeSignature[] = ["2/4", "3/4", "4/4", "5/4", "6/8", "7/8"];
      const currentIndex = values.indexOf(state.timeSignature);
      const timeSignature = values[(Math.max(currentIndex, 0) + delta + values.length) % values.length];
      return {
        timeSignature,
        sequences: state.sequences.map((sequence) =>
          sequence.id === state.currentSequence ? { ...sequence, timeSignature } : sequence,
        ),
        ...recordUndo(state, "TIME SIG", `time-sig:${state.currentSequence}:${Date.now()}`),
      };
    }),
  cycleTimingCorrect: () =>
    set((state) => cycleTimingCorrectPatch(state, 1, { includeOff: true })),
  cycleTimingCorrectBack: () =>
    set((state) => cycleTimingCorrectPatch(state, -1, { includeOff: true })),
  cycleNoteRepeatRate: () =>
    set((state) => cycleTimingCorrectPatch(state, 1, { includeOff: false })),
  cycleNoteRepeatRateBack: () =>
    set((state) => cycleTimingCorrectPatch(state, -1, { includeOff: false })),
  adjustBpm: (delta) =>
    set((state) => {
      const bpm = clamp(Math.round((state.bpm + delta) * 100) / 100, 40, 240);
      return {
        bpm,
        sequences: state.sequences.map((sequence) =>
          sequence.id === state.currentSequence ? { ...sequence, bpm } : sequence,
        ),
        ...recordUndo(state, "BPM", `bpm:${state.currentSequence}`),
      };
    }),
  adjustSwing: (delta) =>
    set((state) => {
      const swing = clamp(state.swing + delta, 50, 75);
      return {
        swing,
        ...recordUndo(state, "SWING", `swing:${state.currentSequence}`),
      };
    }),
  adjustQuantizeStrength: (delta) =>
    set((state) => ({ quantizeStrength: clamp(state.quantizeStrength + delta, 0, 100) })),
  cycleTimingApplyTo: () =>
    set((state) => ({
      timingApplyTo: state.timingApplyTo === "CURRENT TRACK" ? "ALL TRACKS" : "CURRENT TRACK",
    })),
  applyTimingCorrectToEvents: () =>
    set((state) => {
      if (state.timingCorrect === "OFF") {
        return { lastAudioMessage: "TC OFF — nothing to apply" };
      }
      const gridTicks = timingCorrectGridTicks(state.timingCorrect);
      const targetTrackId = state.timingApplyTo === "CURRENT TRACK" ? state.currentTrackId : null;
      const stepEvents = state.stepEvents
        .map((event) => {
          if (targetTrackId && event.trackId !== targetTrackId) return event;
          const realTicks = eventStepToTicks(event.step) + event.timingOffset;
          const snappedTicks = Math.round(realTicks / gridTicks) * gridTicks;
          return {
            ...event,
            step: ticksToStep(snappedTicks),
            timingOffset: 0,
          };
        })
        .sort((a, b) => eventStepIndex(a.step) - eventStepIndex(b.step));
      const action = `TC APPLY ${state.timingCorrect}`;
      return {
        stepEvents,
        sequences: updateCurrentSequenceEvents(state, stepEvents),
        lastAudioMessage: `TC APPLIED ${state.timingCorrect} ${state.timingApplyTo}`,
        ...recordUndo(state, action, `tc-apply:${state.timingApplyTo}`),
      };
    }),
  openTimeSigWindow: () =>
    set((state) => ({
      activeScreen: "TIME_SIG_WINDOW",
      utilityReturnScreen: isUtilityScreen(state.activeScreen) ? state.utilityReturnScreen : state.activeScreen,
    })),
  closeTimeSigWindow: () =>
    set((state) => ({
      activeScreen: state.utilityReturnScreen,
    })),
  changeBarTimeSignature: (barIndex, num, den) =>
    set((state) => {
      const sequence = getCurrentSequence(state);
      const safeNum = Math.max(1, Math.min(31, Math.floor(num)));
      const safeDen: TimeSignatureDenominator = den === 4 || den === 8 || den === 16 || den === 32 ? den : 4;
      const existing = getTimeSignatureChanges(sequence);
      // Compute previous TS at barIndex for truncate detection.
      const oldTs = getTimeSignatureAtBar(sequence, barIndex);
      const newBarTicks = Math.round((safeNum * 384) / safeDen);
      const oldBarTicks = Math.round((oldTs.num * 384) / oldTs.den);
      const isTruncate = newBarTicks < oldBarTicks;
      // Build replacement changes array: drop any existing entry at this fromBar, insert new.
      const filtered = existing.filter((c) => c.fromBar !== barIndex);
      const merged = [...filtered, { fromBar: barIndex, num: safeNum, den: safeDen }].sort(
        (a, b) => a.fromBar - b.fromBar,
      );
      // Truncate: drop events in this bar past the new bar's end tick.
      const barString = String(barIndex + 1).padStart(3, "0");
      let stepEvents = state.stepEvents;
      let removedCount = 0;
      if (isTruncate) {
        stepEvents = state.stepEvents.filter((evt) => {
          const evBar = Number(evt.step.split(".")[0]);
          if (evBar !== barIndex + 1) return true;
          const [, beatStr, tickStr] = evt.step.split(".");
          const tickInBar = (Number(beatStr) - 1) * 96 + Number(tickStr);
          if (tickInBar >= newBarTicks) {
            removedCount += 1;
            return false;
          }
          return true;
        });
      }
      const sequences = state.sequences.map((seq) =>
        seq.id === sequence.id
          ? { ...seq, timeSignatureChanges: merged, events: stepEvents }
          : seq,
      );
      // If this is bar 0, also update the legacy single-TS field on the sequence so older code paths render correctly.
      if (barIndex === 0) {
        sequences[sequences.findIndex((s) => s.id === sequence.id)] = {
          ...sequences[sequences.findIndex((s) => s.id === sequence.id)],
          timeSignature: `${safeNum}/${safeDen}` as TimeSignature,
        };
      }
      return {
        sequences,
        stepEvents,
        lastAudioMessage: isTruncate
          ? `TS BAR ${barString} → ${safeNum}/${safeDen} (truncated, ${removedCount} events removed)`
          : `TS BAR ${barString} → ${safeNum}/${safeDen}`,
        ...recordUndo(state, `TIME SIG BAR ${barString}`, `ts-bar-${barIndex}:${Date.now()}`),
      };
    }),
  openBarEditor: () =>
    set((state) => ({
      activeScreen: "BAR_EDITOR",
      utilityReturnScreen: isUtilityScreen(state.activeScreen) ? state.utilityReturnScreen : state.activeScreen,
    })),
  closeBarEditor: () =>
    set((state) => ({
      activeScreen: state.utilityReturnScreen,
    })),
  insertBlankBars: (beforeBarIndex, count, num, den) =>
    set((state) => {
      const sequence = getCurrentSequence(state);
      const safeBefore = Math.max(0, Math.min(sequence.lengthBars, Math.floor(beforeBarIndex)));
      const safeCount = Math.max(1, Math.min(99, Math.floor(count)));
      const safeNum = Math.max(1, Math.min(31, Math.floor(num)));
      const safeDen: TimeSignatureDenominator = den === 4 || den === 8 || den === 16 || den === 32 ? den : 4;
      // Shift existing events: any event whose bar >= safeBefore + 1 (1-indexed in step strings) needs bar + safeCount.
      const shiftedEvents = state.stepEvents.map((evt) => {
        const [barStr, beatStr, tickStr] = evt.step.split(".");
        const evBar = Number(barStr);
        if (evBar >= safeBefore + 1) {
          return {
            ...evt,
            step: `${String(evBar + safeCount).padStart(3, "0")}.${beatStr}.${tickStr}`,
          };
        }
        return evt;
      });
      // Shift timeSignatureChanges entries with fromBar >= safeBefore; insert new entry at safeBefore.
      const existing = getTimeSignatureChanges(sequence);
      const adjusted = existing.map((c) =>
        c.fromBar >= safeBefore ? { ...c, fromBar: c.fromBar + safeCount } : c,
      );
      const inserted: TimeSignatureChange = { fromBar: safeBefore, num: safeNum, den: safeDen };
      // After inserted's run ends (safeBefore + safeCount), preserve what the bar at that position USED to be.
      // If the bar that was at safeBefore had a specific TS resolved (from earlier changes), we don't need
      // to add a restoration entry — adjusted already shifted those entries by safeCount, so they apply correctly.
      const merged = [...adjusted.filter((c) => c.fromBar !== safeBefore), inserted].sort((a, b) => a.fromBar - b.fromBar);
      const newLengthBars = sequence.lengthBars + safeCount;
      const sequences = state.sequences.map((seq) =>
        seq.id === sequence.id
          ? { ...seq, timeSignatureChanges: merged, events: shiftedEvents, lengthBars: newLengthBars }
          : seq,
      );
      return {
        sequences,
        stepEvents: shiftedEvents,
        sequenceLengthBars: newLengthBars,
        lastAudioMessage: `INSERTED ${safeCount} BAR${safeCount > 1 ? "S" : ""} (${safeNum}/${safeDen}) BEFORE BAR ${String(safeBefore + 1).padStart(3, "0")}`,
        ...recordUndo(state, "INSERT BARS", `insert-bars:${Date.now()}`),
      };
    }),
  deleteBars: (firstBar, lastBar) =>
    set((state) => {
      const sequence = getCurrentSequence(state);
      const safeFirst = Math.max(0, Math.min(sequence.lengthBars - 1, Math.floor(firstBar)));
      const safeLast = Math.max(safeFirst, Math.min(sequence.lengthBars - 1, Math.floor(lastBar)));
      const removedBarCount = safeLast - safeFirst + 1;
      if (removedBarCount >= sequence.lengthBars) {
        return { lastAudioMessage: "CANNOT DELETE ALL BARS" };
      }
      // Remove events in [safeFirst+1 .. safeLast+1]; shift events in bars > safeLast+1 back by removedBarCount.
      let removedEvents = 0;
      const updatedEvents: StepEvent[] = [];
      for (const evt of state.stepEvents) {
        const evBar = Number(evt.step.split(".")[0]);
        if (evBar >= safeFirst + 1 && evBar <= safeLast + 1) {
          removedEvents += 1;
          continue;
        }
        if (evBar > safeLast + 1) {
          const [, beatStr, tickStr] = evt.step.split(".");
          updatedEvents.push({
            ...evt,
            step: `${String(evBar - removedBarCount).padStart(3, "0")}.${beatStr}.${tickStr}`,
          });
        } else {
          updatedEvents.push(evt);
        }
      }
      // Update timeSignatureChanges: drop entries in deleted range, shift later entries.
      const existing = getTimeSignatureChanges(sequence);
      let adjustedChanges = existing
        .filter((c) => c.fromBar < safeFirst || c.fromBar > safeLast)
        .map((c) => (c.fromBar > safeLast ? { ...c, fromBar: c.fromBar - removedBarCount } : c));
      // Ensure there's an entry at fromBar=0.
      if (!adjustedChanges.some((c) => c.fromBar === 0)) {
        // The bar that USED to be at firstBar carried some TS. Use the most recent earlier change (or default 4/4).
        const fallback = existing.filter((c) => c.fromBar <= safeFirst).at(-1) ?? { fromBar: 0, num: 4, den: 4 as TimeSignatureDenominator };
        adjustedChanges = [{ fromBar: 0, num: fallback.num, den: fallback.den }, ...adjustedChanges];
      }
      const merged = adjustedChanges.sort((a, b) => a.fromBar - b.fromBar);
      const newLengthBars = sequence.lengthBars - removedBarCount;
      const sequences = state.sequences.map((seq) =>
        seq.id === sequence.id
          ? { ...seq, timeSignatureChanges: merged, events: updatedEvents, lengthBars: newLengthBars }
          : seq,
      );
      return {
        sequences,
        stepEvents: updatedEvents,
        sequenceLengthBars: newLengthBars,
        currentBar: Math.min(state.currentBar, newLengthBars),
        lastAudioMessage: `DELETED BARS ${String(safeFirst + 1).padStart(3, "0")}-${String(safeLast + 1).padStart(3, "0")} (${removedEvents} events removed)`,
        ...recordUndo(state, "DELETE BARS", `delete-bars:${Date.now()}`),
      };
    }),
  copyBars: ({ fromSeqId, firstBarIndex, lastBarIndex, toSeqId, beforeBarIndex, copies }) =>
    set((state) => {
      const fromSeq = state.sequences.find((s) => s.id === fromSeqId);
      const toSeq = state.sequences.find((s) => s.id === toSeqId);
      if (!fromSeq || !toSeq) return { lastAudioMessage: "SEQ NOT FOUND" };
      const safeFirst = Math.max(0, Math.min(fromSeq.lengthBars - 1, Math.floor(firstBarIndex)));
      const safeLast = Math.max(safeFirst, Math.min(fromSeq.lengthBars - 1, Math.floor(lastBarIndex)));
      const safeBefore = Math.max(0, Math.min(toSeq.lengthBars, Math.floor(beforeBarIndex)));
      const safeCopies = Math.max(1, Math.min(99, Math.floor(copies)));
      const rangeBarCount = safeLast - safeFirst + 1;
      const totalInserted = rangeBarCount * safeCopies;

      // 1. Snapshot source events in range (BEFORE any mutation).
      const sourceEventsSnap = fromSeq.events
        .filter((evt) => {
          const evBar = Number(evt.step.split(".")[0]);
          return evBar >= safeFirst + 1 && evBar <= safeLast + 1;
        })
        .map((evt) => ({ ...evt }));

      // 2. Source TS per bar (one per source bar in range).
      const sourceTsPerBar: Array<{ num: number; den: TimeSignatureDenominator }> = [];
      for (let i = safeFirst; i <= safeLast; i += 1) {
        sourceTsPerBar.push(getTimeSignatureAtBar(fromSeq, i));
      }

      // 3. Resolve dest "interrupted TS" — what's at beforeBarIndex now (for restore after inserted block).
      const interruptedTs =
        safeBefore < toSeq.lengthBars
          ? getTimeSignatureAtBar(toSeq, safeBefore)
          : null;

      // 4. Shift existing dest events with bar >= safeBefore + 1 by +totalInserted (1-indexed in step).
      const shiftedDestEvents = toSeq.events.map((evt) => {
        const [barStr, beatStr, tickStr] = evt.step.split(".");
        const evBar = Number(barStr);
        if (evBar >= safeBefore + 1) {
          return { ...evt, step: `${String(evBar + totalInserted).padStart(3, "0")}.${beatStr}.${tickStr}` };
        }
        return evt;
      });

      // 5. Shift existing dest TS entries with fromBar >= safeBefore.
      const existingDestChanges = getTimeSignatureChanges(toSeq);
      const shiftedTsChanges = existingDestChanges.map((c) =>
        c.fromBar >= safeBefore ? { ...c, fromBar: c.fromBar + totalInserted } : c,
      );

      // 6. Build inserted events with new IDs and shifted bar numbers.
      const insertedEvents: StepEvent[] = [];
      for (let copyIter = 0; copyIter < safeCopies; copyIter += 1) {
        for (const srcEvent of sourceEventsSnap) {
          const [barStr, beatStr, tickStr] = srcEvent.step.split(".");
          const srcBar = Number(barStr) - 1; // 0-indexed
          const destBar = safeBefore + copyIter * rangeBarCount + (srcBar - safeFirst);
          insertedEvents.push({
            ...srcEvent,
            id: nextEventId(),
            step: `${String(destBar + 1).padStart(3, "0")}.${beatStr}.${tickStr}`,
          });
        }
      }

      // 7. Build inserted TS entries — one per inserted bar.
      const insertedTsChanges: TimeSignatureChange[] = [];
      for (let copyIter = 0; copyIter < safeCopies; copyIter += 1) {
        for (let offset = 0; offset < rangeBarCount; offset += 1) {
          const destBar = safeBefore + copyIter * rangeBarCount + offset;
          const ts = sourceTsPerBar[offset];
          insertedTsChanges.push({ fromBar: destBar, num: ts.num, den: ts.den });
        }
      }

      // 8. After inserted block, restore the interruptedTs (if any existing bars remain).
      if (interruptedTs && safeBefore < toSeq.lengthBars) {
        insertedTsChanges.push({
          fromBar: safeBefore + totalInserted,
          num: interruptedTs.num,
          den: interruptedTs.den,
        });
      }

      // 9. Merge + sort + collapse consecutive identical entries.
      const merged = [...shiftedTsChanges, ...insertedTsChanges].sort((a, b) => {
        if (a.fromBar !== b.fromBar) return a.fromBar - b.fromBar;
        return 0;
      });
      // For duplicates at same fromBar, keep the last (later entries override earlier in source order).
      const dedupedByBar = new Map<number, TimeSignatureChange>();
      for (const c of merged) dedupedByBar.set(c.fromBar, c);
      let collapsed: TimeSignatureChange[] = Array.from(dedupedByBar.values()).sort((a, b) => a.fromBar - b.fromBar);
      // Collapse consecutive entries with identical TS.
      const final: TimeSignatureChange[] = [];
      for (const c of collapsed) {
        const prev = final.at(-1);
        if (prev && prev.num === c.num && prev.den === c.den) continue;
        final.push(c);
      }
      if (final.length === 0 || final[0].fromBar !== 0) {
        // Ensure fromBar=0 anchor exists.
        const fallback = final[0] ?? { num: 4, den: 4 as TimeSignatureDenominator };
        final.unshift({ fromBar: 0, num: fallback.num, den: fallback.den });
      }

      // 10. Combine dest events + insertedEvents (sorted by step for consistency).
      const newDestEvents = [...shiftedDestEvents, ...insertedEvents].sort(
        (a, b) => eventStepIndex(a.step) - eventStepIndex(b.step),
      );

      const newLengthBars = toSeq.lengthBars + totalInserted;
      const isSameSeq = fromSeqId === toSeqId;

      const sequences = state.sequences.map((seq) => {
        if (seq.id === toSeqId) {
          return {
            ...seq,
            events: newDestEvents,
            timeSignatureChanges: final,
            lengthBars: newLengthBars,
          };
        }
        return seq;
      });

      // Top-level stepEvents mirrors current sequence if dest is current.
      const isDestCurrent = state.currentSequence === toSeqId;
      const isFromCurrent = state.currentSequence === fromSeqId;
      const patch: Partial<AppState> = {
        sequences,
        lastAudioMessage: `COPY ${rangeBarCount}×${safeCopies} BARS ${
          isSameSeq ? "WITHIN" : `${fromSeqId}→${toSeqId}`
        } AT ${String(safeBefore + 1).padStart(3, "0")}`,
        ...recordUndo(state, "COPY BARS", `copy-bars:${Date.now()}`),
      };
      if (isDestCurrent) {
        patch.stepEvents = newDestEvents;
        patch.sequenceLengthBars = newLengthBars;
      } else if (isFromCurrent) {
        // No-op for source (untouched) when current sequence is the source.
      }
      return patch;
    }),
  resetTimingCorrect: () =>
    set(() => ({
      timingCorrect: "1/16",
      tcEnabled: true,
      swing: 50,
      tripletMode: false,
      timingApplyTo: "CURRENT TRACK",
    })),
  setNoteRepeatEnabled: (noteRepeatEnabled) => {
    if (!noteRepeatEnabled) stopAllNoteRepeatLoops();
    set({ noteRepeatEnabled });
  },
  adjustNoteRepeatGate: (delta) =>
    set((state) => ({ noteRepeatGate: clamp(state.noteRepeatGate + delta, 1, 100) })),
  toggleTripletMode: () =>
    set((state) => {
      const tripletMode = !state.tripletMode;
      if (state.timingCorrect === "OFF") {
        return { tripletMode };
      }
      const baseRate = state.timingCorrect.replace("T", "") as "1/4" | "1/8" | "1/16" | "1/32";
      const timingCorrect = (tripletMode ? `${baseRate}T` : baseRate) as AppState["timingCorrect"];
      return { tripletMode, timingCorrect };
    }),
  cycleNoteRepeatVelocityMode: () =>
    set((state) => ({
      noteRepeatVelocityMode: state.noteRepeatVelocityMode === "PAD" ? "FIXED" : "PAD",
    })),
  cycleSixteenLevelsParameter: () =>
    set((state) => {
      const parameters: AppState["sixteenLevelsParameter"][] = ["VELOCITY", "TUNE", "FILTER", "ATTACK", "DECAY"];
      const idx = parameters.indexOf(state.sixteenLevelsParameter);
      const next = parameters[(idx === -1 ? 0 : (idx + 1) % parameters.length)];
      return { sixteenLevelsParameter: next };
    }),
  cycleSixteenLevelsSourcePad: () =>
    set((state) => {
      const banks: PadBank[] = ["A", "B", "C", "D"];
      const currentBank = state.sixteenLevelsSourcePad.slice(0, 1) as PadBank;
      const currentNumber = clamp(Number(state.sixteenLevelsSourcePad.slice(1)) || 1, 1, 16);
      const bankIndex = banks.indexOf(currentBank);
      const globalIndex = bankIndex * 16 + (currentNumber - 1);
      const nextGlobalIndex = (globalIndex + 1) % 64;
      const nextBank = banks[Math.floor(nextGlobalIndex / 16)];
      const nextNumber = (nextGlobalIndex % 16) + 1;
      return {
        sixteenLevelsSourcePad: `${nextBank}${String(nextNumber).padStart(2, "0")}`,
        sixteenLevelsFilterCutoff: null,
        sixteenLevelsFilterResonance: null,
        sixteenLevelsFilterType: null,
      };
    }),
  armSixteenLevelsSource: () =>
    set((state) => ({ sixteenLevelsSourceArmed: !state.sixteenLevelsSourceArmed })),
  setSixteenLevelsSourceFromPad: (padIdentifier) =>
    set((state) => {
      const padNumber = clamp(Number(padIdentifier.replace(/^P/, "")) || 1, 1, 16);
      const newSource = `${state.padBank}${String(padNumber).padStart(2, "0")}`;
      return {
        sixteenLevelsSourcePad: newSource,
        sixteenLevelsSourceArmed: false,
        sixteenLevelsFilterCutoff: null,
        sixteenLevelsFilterResonance: null,
        sixteenLevelsFilterType: null,
      };
    }),
  cycleSixteenLevelsRootPad: (delta) =>
    set((state) => {
      const next = ((state.sixteenLevelsRootPad - 1 + delta) % 16 + 16) % 16 + 1;
      return { sixteenLevelsRootPad: next };
    }),
  adjustSixteenLevelsFilterCutoff: (delta) =>
    set((state) => {
      const base = state.sixteenLevelsFilterCutoff ?? getSourceFilterCutoff(state) ?? 50;
      return { sixteenLevelsFilterCutoff: clamp(base + delta, 0, 100) };
    }),
  adjustSixteenLevelsFilterResonance: (delta) =>
    set((state) => {
      const sourceRes = getSourceFilterResonance(state);
      const base = state.sixteenLevelsFilterResonance ?? sourceRes ?? 0;
      return { sixteenLevelsFilterResonance: clamp(base + delta, 0, 100) };
    }),
  cycleSixteenLevelsFilterType: () =>
    set((state) => {
      const types: ("OFF" | "LOWPASS" | "HIGHPASS" | "BANDPASS")[] = ["OFF", "LOWPASS", "HIGHPASS", "BANDPASS"];
      const sourceType = getSourceFilterType(state) ?? "OFF";
      const current = state.sixteenLevelsFilterType ?? sourceType;
      const idx = types.indexOf(current);
      const next = types[(idx === -1 ? 0 : (idx + 1) % types.length)];
      return { sixteenLevelsFilterType: next };
    }),
  resetSixteenLevelsSandbox: () =>
    set({
      sixteenLevelsFilterCutoff: null,
      sixteenLevelsFilterResonance: null,
      sixteenLevelsFilterType: null,
    }),
  insertSongStep: () =>
    set((state) => ({
      songSteps: [
        ...state.songSteps.slice(0, state.selectedSongStepIndex + 1),
        { sequenceId: state.currentSequence, repeats: 1 },
        ...state.songSteps.slice(state.selectedSongStepIndex + 1),
      ],
      selectedSongStepIndex: state.selectedSongStepIndex + 1,
      ...recordUndo(state, "INSERT SONG STEP", `song-insert:${Date.now()}`),
    })),
  deleteSelectedSongStep: () =>
    set((state) => {
      if (state.songSteps.length <= 1) return state;
      const songSteps = state.songSteps.filter((_, index) => index !== state.selectedSongStepIndex);
      return {
        songSteps,
        selectedSongStepIndex: clamp(state.selectedSongStepIndex, 0, songSteps.length - 1),
        currentSongStepIndex: clamp(state.currentSongStepIndex, 0, songSteps.length - 1),
        ...recordUndo(state, "DELETE SONG STEP", `song-delete:${Date.now()}`),
      };
    }),
  adjustSelectedSongRepeats: (delta) =>
    set((state) => ({
      songSteps: state.songSteps.map((step, index) =>
        index === state.selectedSongStepIndex ? { ...step, repeats: clamp(step.repeats + delta, 1, 99) } : step,
      ),
      ...recordUndo(state, "SONG REPEATS", `song-repeats:${state.selectedSongStepIndex}`),
    })),
  moveSelectedSongStep: (delta) =>
    set((state) => {
      const targetIndex = clamp(state.selectedSongStepIndex + delta, 0, state.songSteps.length - 1);
      if (targetIndex === state.selectedSongStepIndex) return state;
      const songSteps = [...state.songSteps];
      const [step] = songSteps.splice(state.selectedSongStepIndex, 1);
      songSteps.splice(targetIndex, 0, step);
      return {
        songSteps,
        selectedSongStepIndex: targetIndex,
        ...recordUndo(state, "MOVE SONG STEP", `song-move:${Date.now()}`),
      };
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
        ...recordUndo(state, "SONG SEQ", `song-seq:${state.selectedSongStepIndex}:${Date.now()}`),
      };
    }),
  cycleSelectedSongSequenceBack: () =>
    set((state) => {
      const selected = state.songSteps[state.selectedSongStepIndex];
      const currentIndex = state.sequences.findIndex((sequence) => sequence.id === selected.sequenceId);
      const length = state.sequences.length;
      const nextSequence = state.sequences[(currentIndex - 1 + length) % length];
      return {
        songSteps: state.songSteps.map((step, index) =>
          index === state.selectedSongStepIndex ? { ...step, sequenceId: nextSequence.id } : step,
        ),
        ...recordUndo(state, "SONG SEQ", `song-seq:${state.selectedSongStepIndex}:${Date.now()}`),
      };
    }),
  convertSongToSequence: () =>
    set((state) => {
      const id = nextSequenceId(state.sequences);
      let accumulatedTicks = 0;
      let lengthBars = 0;
      const flattenedEvents = state.songSteps.flatMap((step) => {
        const sequence = state.sequences.find((item) => item.id === step.sequenceId);
        if (!sequence) return [];
        const sequenceTicks = sequence.lengthBars * 384;
        const copied = Array.from({ length: step.repeats }, (_, repeatIndex) => {
          const offsetTicks = accumulatedTicks + repeatIndex * sequenceTicks;
          return sequence.events.map((event) =>
            offsetStepEvent(
              { ...event, programId: event.programId ?? getTrackProgramId(sequence, event.trackId) },
              offsetTicks,
            ),
          );
        }).flat();
        accumulatedTicks += sequenceTicks * step.repeats;
        lengthBars += sequence.lengthBars * step.repeats;
        return copied;
      });
      const songTracks = uniqueSongTracks(state);
      const sequence = {
        ...createSequence(id, "SONG_CONVERT", state.bpm, flattenedEvents),
        lengthBars: Math.max(1, lengthBars),
        tracks: songTracks.length > 0 ? songTracks : createDefaultSequenceTracks(),
      };
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
        ? updatePadAssignmentsForProgram(state, targetBank, (pad, index) =>
            sliceSamples[index] ? { ...pad, assignment: sliceSamples[index].name } : pad,
          )
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
        programs: createProgram ? syncCurrentProgram(state, { padAssignments }) : state.programs,
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
      const padAssignments = updatePadAssignmentsForProgram(state, state.padBank, (pad) =>
        pad.pad === state.selectedPad ? { ...pad, assignment } : pad,
      );
      return {
        padAssignments,
        programs: syncCurrentProgram(state, { padAssignments }),
        ...recordUndo(state, `ASSIGN ${state.selectedPad}`, `assign-pad:${state.selectedPad}:${Date.now()}`),
      };
    }),
  assignSourceToSelectedPad: (sourceName) =>
    set((state) => {
      const padAssignments = updatePadAssignmentsForProgram(state, state.padBank, (pad) =>
        pad.pad === state.selectedPad ? { ...pad, assignment: sourceName } : pad,
      );
      return {
        padAssignments,
        programs: syncCurrentProgram(state, { padAssignments }),
        ...recordUndo(state, `ASSIGN ${state.selectedPad}`, `assign-pad:${state.selectedPad}:${Date.now()}`),
      };
    }),
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
    set((state) => {
      const padAssignments = updatePadAssignmentsForProgram(state, state.padBank, (pad) => {
          if (pad.pad !== state.selectedPad) return pad;
          const limits = getParamLimits(field);
          return {
            ...pad,
            [field]: clamp(pad[field] + delta, limits.min, limits.max),
          };
        });
      if (field === "filterCutoff" || field === "filterResonance") {
        syncSelectedPadFilterToAudio(state, padAssignments);
      }
      const labelGroup: string =
        field === "tune" || field === "fineTune" ? "TUNE"
        : field === "attack" || field === "decay" ? "ENV"
        : field === "filterCutoff" || field === "filterResonance" ? "FILTER"
        : field === "chokeGroup" ? "CHOKE"
        : `MIX ${(field as string).toUpperCase()}`;
      return {
        padAssignments,
        programs: syncCurrentProgram(state, { padAssignments }),
        ...recordUndo(state, `${labelGroup} ${state.selectedPad}`, `pad-param-${field}:${state.selectedPad}`),
      };
    }),
  toggleSelectedPadMode: () =>
    set((state) => {
      const padAssignments = updatePadAssignmentsForProgram(state, state.padBank, (pad) =>
          pad.pad === state.selectedPad
            ? { ...pad, mode: pad.mode === "ONE SHOT" ? "NOTE ON" : "ONE SHOT" }
            : pad,
        );
      return {
        padAssignments,
        programs: syncCurrentProgram(state, { padAssignments }),
        ...recordUndo(state, `PAD MODE ${state.selectedPad}`, `pad-mode:${state.selectedPad}:${Date.now()}`),
      };
    }),
  toggleSelectedPadVoiceMode: () =>
    set((state) => {
      const padAssignments = updatePadAssignmentsForProgram(state, state.padBank, (pad) =>
          pad.pad === state.selectedPad
            ? { ...pad, voiceMode: pad.voiceMode === "POLY" ? "MONO" : "POLY" }
            : pad,
        );
      return {
        padAssignments,
        programs: syncCurrentProgram(state, { padAssignments }),
        ...recordUndo(state, `VOICE MODE ${state.selectedPad}`, `voice-mode:${state.selectedPad}:${Date.now()}`),
      };
    }),
  cycleSelectedPadFilterType: (delta) =>
    set((state) => {
      const filterTypes: PadAssignment["filterType"][] = ["OFF", "LOWPASS", "HIGHPASS", "BANDPASS"];
      const padAssignments = updatePadAssignmentsForProgram(state, state.padBank, (pad) => {
        if (pad.pad !== state.selectedPad) return pad;
        const currentIndex = filterTypes.indexOf(pad.filterType);
        return {
          ...pad,
          filterType: filterTypes[(Math.max(currentIndex, 0) + delta + filterTypes.length) % filterTypes.length],
        };
      });
      syncSelectedPadFilterToAudio(state, padAssignments);
      return {
        padAssignments,
        programs: syncCurrentProgram(state, { padAssignments }),
        ...recordUndo(state, `FILTER TYPE ${state.selectedPad}`, `filter-type:${state.selectedPad}:${Date.now()}`),
      };
    }),
  setProgramView: (programView) => set({ programView }),
  cycleMuteTargetMode: () =>
    set((state) => {
      const padAssignments = updatePadAssignmentsForProgram(state, state.padBank, (pad) => {
          if (pad.pad !== state.selectedPad) return pad;
          const order: PadAssignment["muteTargetMode"][] = ["OFF", "PAIR", "GROUP"];
          const muteTargetMode = order[(order.indexOf(pad.muteTargetMode) + 1) % order.length];
          return {
            ...pad,
            muteTargetMode,
            muteTargets: muteTargetMode === "PAIR" ? pad.muteTargets : [],
          };
        });
      return {
        padAssignments,
        programs: syncCurrentProgram(state, { padAssignments }),
        ...recordUndo(state, `CHOKE MODE ${state.selectedPad}`, `choke-mode:${state.selectedPad}:${Date.now()}`),
      };
    }),
  toggleMuteTargetForSelectedPad: (targetPad) =>
    set((state) => {
      const padAssignments = updatePadAssignmentsForProgram(state, state.padBank, (pad) => {
          if (pad.pad !== state.selectedPad || pad.pad === targetPad) return pad;
          const hasTarget = pad.muteTargets.includes(targetPad);
          return {
            ...pad,
            muteTargetMode: "PAIR",
            muteTargets: hasTarget
              ? pad.muteTargets.filter((target) => target !== targetPad)
              : [...pad.muteTargets, targetPad].slice(-2),
          };
        });
      return {
        padAssignments,
        programs: syncCurrentProgram(state, { padAssignments }),
        ...recordUndo(state, `CHOKE ${state.selectedPad}->${targetPad}`, `choke-target:${state.selectedPad}:${targetPad}:${Date.now()}`),
      };
    }),
  nextStepEvent: () =>
    set((state) => {
      const trackIndexes = state.stepEvents
        .map((event, index) => ({ event, index }))
        .filter(({ event }) => event.trackId === state.currentTrackId)
        .map(({ index }) => index);
      const currentTrackIndex = Math.max(trackIndexes.indexOf(state.selectedEventIndex), 0);
      const index = trackIndexes[Math.min(currentTrackIndex + 1, trackIndexes.length - 1)] ?? state.selectedEventIndex;
      const event = state.stepEvents[index];
      if (event) playStepEventFromState(state, event, 0);
      return selectedEventPatch(state.stepEvents, index);
    }),
  previousStepEvent: () =>
    set((state) => {
      const trackIndexes = state.stepEvents
        .map((event, index) => ({ event, index }))
        .filter(({ event }) => event.trackId === state.currentTrackId)
        .map(({ index }) => index);
      const currentTrackIndex = Math.max(trackIndexes.indexOf(state.selectedEventIndex), 0);
      const index = trackIndexes[Math.max(currentTrackIndex - 1, 0)] ?? state.selectedEventIndex;
      const event = state.stepEvents[index];
      if (event) playStepEventFromState(state, event, 0);
      return selectedEventPatch(state.stepEvents, index);
    }),
  selectStepEvent: (eventId) => {
    const state = get();
    const selectedEventIndex = state.stepEvents.findIndex((event) => event.id === eventId);
    const event = state.stepEvents[selectedEventIndex];
    if (!event) return;
    set(selectedEventPatch(state.stepEvents, selectedEventIndex));
    playStepEventFromState(state, event, 0);
  },
  cycleStepTrack: (delta) => {
    const state = get();
    const trackPatch = moveCurrentTrack(state, delta);
    const currentTrackId = trackPatch.currentTrackId ?? state.currentTrackId;
    const selectedEventIndex = Math.max(state.stepEvents.findIndex((event) => event.trackId === currentTrackId), 0);
    set({
      ...trackPatch,
      ...selectedEventPatch(state.stepEvents, selectedEventIndex),
    });
    const event = state.stepEvents[selectedEventIndex];
    if (event?.trackId === currentTrackId) playStepEventFromState({ ...state, ...trackPatch }, event, 0);
  },
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
              ? clamp(event.duration + delta, 0, 96)
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
      const fieldLabel = field === "timingOffset" ? "OFFSET" : field.toUpperCase();
      return {
        stepEvents,
        sequences: updateCurrentSequenceEvents(state, stepEvents),
        ...recordUndo(state, `EDIT ${fieldLabel}`, `edit-event-${field}:${event.id}`),
      };
    }),
  cycleSelectedEventTrack: () =>
    set((state) => {
      const event = state.stepEvents[state.selectedEventIndex];
      if (!event) return state;
      const tracks = getCurrentSequence(state).tracks;
      const currentIndex = tracks.findIndex((track) => track.id === event.trackId);
      const track = tracks[(Math.max(currentIndex, 0) + 1 + tracks.length) % tracks.length];
      const trackId = track.id;
      const stepEvents = state.stepEvents.map((item, index) =>
        index === state.selectedEventIndex ? { ...item, trackId, trackName: track.name, programId: track.programId } : item,
      );
      return {
        stepEvents,
        sequences: updateCurrentSequenceEvents(state, stepEvents),
        ...recordUndo(state, "EVENT TRACK", `event-track:${event.id}:${Date.now()}`),
      };
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
        ...recordUndo(state, "DELETE EVENT", `delete-event:${Date.now()}`),
      };
    }),
  cycleSelectedEventAppliedParameter: (delta) =>
    set((state) => {
      const event = state.stepEvents[state.selectedEventIndex];
      if (!event) return state;
      const cycle: (AppState["sixteenLevelsParameter"] | undefined)[] = [undefined, "VELOCITY", "TUNE", "FILTER", "ATTACK", "DECAY"];
      const currentIdx = cycle.indexOf(event.appliedParameter);
      const nextIdx = ((currentIdx === -1 ? 0 : currentIdx) + delta + cycle.length) % cycle.length;
      const nextParameter = cycle[nextIdx];
      const stepEvents = state.stepEvents.map((item, index) => {
        if (index !== state.selectedEventIndex) return item;
        if (nextParameter === undefined) {
          return { ...item, appliedParameter: undefined, appliedValue: undefined, parameterValue: undefined };
        }
        const defaultValue =
          nextParameter === "TUNE" ? 0
          : nextParameter === "VELOCITY" ? item.velocity
          : nextParameter === "FILTER" ? 50
          : 0;
        return { ...item, appliedParameter: nextParameter, appliedValue: defaultValue, parameterValue: defaultValue };
      });
      return {
        stepEvents,
        sequences: updateCurrentSequenceEvents(state, stepEvents),
        ...recordUndo(state, "PARAM TYPE", `param-type:${event.id}:${Date.now()}`),
      };
    }),
  adjustSelectedEventAppliedValue: (delta) =>
    set((state) => {
      const event = state.stepEvents[state.selectedEventIndex];
      if (!event || !event.appliedParameter) return state;
      const current = event.parameterValue ?? event.appliedValue ?? 0;
      const range = appliedValueRange(event.appliedParameter);
      const next = clamp(current + delta, range.min, range.max);
      const stepEvents = state.stepEvents.map((item, index) =>
        index !== state.selectedEventIndex ? item : { ...item, appliedValue: next, parameterValue: next },
      );
      return {
        stepEvents,
        sequences: updateCurrentSequenceEvents(state, stepEvents),
        ...recordUndo(state, "PARAM VALUE", `param-value:${event.id}`),
      };
    }),
  toggleEventMuted: (eventId) =>
    set((state) => {
      const target = state.stepEvents.find((event) => event.id === eventId);
      const willMute = target ? !target.muted : false;
      const stepEvents = state.stepEvents.map((event) =>
        event.id === eventId ? { ...event, muted: !event.muted } : event,
      );
      return {
        stepEvents,
        sequences: updateCurrentSequenceEvents(state, stepEvents),
        ...recordUndo(state, willMute ? "MUTE EVENT" : "UNMUTE EVENT", `mute-event:${eventId}:${Date.now()}`),
      };
    }),
  addStepEventAtCurrentStep: () =>
    // DIAGNOSTIC (Session 8.1): recordUndo temporarily disabled while
    // investigating STEP ADD EVENT regression. Re-enable once root cause confirmed.
    set((state) => ({
      ...createStepEventForPadImpl(state, state.selectedPad),
    })),
  armAddEvent: () => set((state) => ({ addEventArmed: !state.addEventArmed })),
  createStepEventForPad: (padIdentifier) =>
    // DIAGNOSTIC (Session 8.1): recordUndo temporarily disabled. See above.
    set((state) => ({
      ...createStepEventForPadImpl(state, padIdentifier),
      addEventArmed: false,
    })),
  toggleStepInputAutoAdvance: () =>
    set((state) => ({ stepInputAutoAdvance: !state.stepInputAutoAdvance })),
  stepBackward: () => {
    set((state) => {
      const sequence = getCurrentSequence(state);
      const currentStepIndex = Math.max(state.currentStepIndex - 1, 0);
      const info = findBarAtGlobalStep(sequence, 24, currentStepIndex);
      const currentBar = info.bar + 1;
      const currentStep = info.stepInBar + 1;
      return {
        currentStepIndex,
        currentBar,
        currentStep,
        currentEvent: nearestEventAtOrAfter(state.stepEvents, currentStepIndex) + 1,
        ...selectedEventPatch(state.stepEvents, nearestEventAtOrAfter(state.stepEvents, currentStepIndex)),
        bar: formatBarPosition(currentBar, currentStep, sequence),
      };
    });
    playEventsAtCurrentStep(get());
  },
  stepForward: () => {
    set((state) => {
      const sequence = getCurrentSequence(state);
      const totalSteps = getSequenceTotalSteps(sequence, 24);
      const currentStepIndex = Math.min(state.currentStepIndex + 1, totalSteps - 1);
      const info = findBarAtGlobalStep(sequence, 24, currentStepIndex);
      const currentBar = info.bar + 1;
      const currentStep = info.stepInBar + 1;
      return {
        currentStepIndex,
        currentBar,
        currentStep,
        currentEvent: nearestEventAtOrAfter(state.stepEvents, currentStepIndex) + 1,
        ...selectedEventPatch(state.stepEvents, nearestEventAtOrAfter(state.stepEvents, currentStepIndex)),
        bar: formatBarPosition(currentBar, currentStep, sequence),
      };
    });
    playEventsAtCurrentStep(get());
  },
  barBackward: () => {
    set((state) => {
      const sequence = getCurrentSequence(state);
      const atBarStart = state.currentStep === 1;
      const targetBarIndex = atBarStart ? Math.max(state.currentBar - 2, 0) : state.currentBar - 1;
      const currentStepIndex = globalStepFromBarAndStepInBar(sequence, 24, targetBarIndex, 0);
      const selectedStepEventIndex = nearestEventAtOrAfter(state.stepEvents, currentStepIndex);
      return {
        currentBar: targetBarIndex + 1,
        currentStep: 1,
        currentStepIndex,
        currentEvent: selectedStepEventIndex + 1,
        ...selectedEventPatch(state.stepEvents, selectedStepEventIndex),
        bar: formatBarPosition(targetBarIndex + 1, 1, sequence),
      };
    });
    playFirstEventInCurrentBar(get());
  },
  barForward: () => {
    set((state) => {
      const sequence = getCurrentSequence(state);
      const targetBarIndex = Math.min(state.currentBar, sequence.lengthBars - 1);
      const currentStepIndex = globalStepFromBarAndStepInBar(sequence, 24, targetBarIndex, 0);
      const selectedStepEventIndex = nearestEventAtOrAfter(state.stepEvents, currentStepIndex);
      return {
        currentBar: targetBarIndex + 1,
        currentStep: 1,
        currentStepIndex,
        currentEvent: selectedStepEventIndex + 1,
        ...selectedEventPatch(state.stepEvents, selectedStepEventIndex),
        bar: formatBarPosition(targetBarIndex + 1, 1, sequence),
      };
    });
    playFirstEventInCurrentBar(get());
  },
  tickStepPlayback: () => {
    const state = get();
    if (!state.isPlaying) return;
    const sequence = getCurrentSequence(state);
    // Playback always advances in 1/16 steps (RuntimeClock fires every 1/16 ms).
    // TC affects snap/quantize, not the playback grid.
    const playbackGridTicks = 24;
    const sequenceLengthSteps = getSequenceTotalSteps(sequence, playbackGridTicks);
    const previousStepIndex = state.currentStepIndex;
    const currentStepIndex = (previousStepIndex + 1) % sequenceLengthSteps;
    const wrappedThisTick = currentStepIndex === 0 && previousStepIndex >= sequenceLengthSteps - 1;
    sequenceStepStartedAt = performance.now();
    const nextStepIndex = (currentStepIndex + 1) % sequenceLengthSteps;
    const ppqMs = 60_000 / state.bpm / 96;
    const stepMs = ppqMs * playbackGridTicks;

    // REC mode per-step clearing: remove initial-snapshot events for current step + current track.
    let workingStepEvents = state.stepEvents;
    let workingSequences = state.sequences;
    let clearedStepsPatch: number[] | undefined;
    if (
      state.isSequenceRecording &&
      !state.overdubEnabled &&
      !state.recordSessionClearedSteps.includes(currentStepIndex)
    ) {
      const idsToRemove = state.recordingSessionInitialEvents[currentStepIndex];
      if (idsToRemove && idsToRemove.length > 0) {
        const removeSet = new Set(idsToRemove);
        workingStepEvents = state.stepEvents.filter((evt) => !removeSet.has(evt.id));
        workingSequences = updateCurrentSequenceEvents(state, workingStepEvents);
      }
      clearedStepsPatch = [...state.recordSessionClearedSteps, currentStepIndex];
    }

    const eventsAtStep = workingStepEvents.filter((event) =>
      eventGlobalStep(event.step, sequence, playbackGridTicks) === currentStepIndex &&
      event.timingOffset >= 0 &&
      shouldPlayStepEvent(state, event)
    );
    const earlyNextEvents = workingStepEvents.filter((event) =>
      eventGlobalStep(event.step, sequence, playbackGridTicks) === nextStepIndex &&
      event.timingOffset < 0 &&
      shouldPlayStepEvent(state, event)
    );
    const currentSwingTicks = swingOffsetTicks(state, currentStepIndex);
    const nextSwingTicks = swingOffsetTicks(state, nextStepIndex);
    eventsAtStep.forEach((event) =>
      playStepEventFromState(state, event, (event.timingOffset + currentSwingTicks) * ppqMs),
    );
    earlyNextEvents.forEach((event) =>
      playStepEventFromState(state, event, stepMs + (event.timingOffset + nextSwingTicks) * ppqMs),
    );
    const barInfo = findBarAtGlobalStep(sequence, playbackGridTicks, currentStepIndex);
    const currentBar = barInfo.bar + 1;
    const currentStep = barInfo.stepInBar + 1;
    const selectedStepEventIndex = nearestEventAtOrAfter(workingStepEvents, currentStepIndex);

    const autoSwitchPatch: Partial<AppState> =
      state.isSequenceRecording && wrappedThisTick && !state.sequenceLoopedSinceRecordStart
        ? {
            sequenceLoopedSinceRecordStart: true,
            isSequenceRecording: false,
            overdubEnabled: true,
            lastAudioMessage: "AUTO OVERDUB",
          }
        : {};

    set({
      currentStepIndex,
      currentBar,
      currentStep,
      currentEvent: selectedStepEventIndex + 1,
      ...selectedEventPatch(workingStepEvents, selectedStepEventIndex),
      bar: formatBarPosition(currentBar, currentStep, sequence),
      ...(workingStepEvents !== state.stepEvents
        ? { stepEvents: workingStepEvents, sequences: workingSequences }
        : {}),
      ...(clearedStepsPatch ? { recordSessionClearedSteps: clearedStepsPatch } : {}),
      ...autoSwitchPatch,
    });
  },
  updateSelectedMixerChannel: (field, delta) =>
    set((state) => {
      const channels = state.padMixer[state.padBank].map((channel) => {
        if (channel.pad !== state.selectedPad) return channel;
        const limits = getMixerLimits(field);
        return { ...channel, [field]: clamp(channel[field] + delta, limits.min, limits.max) };
      });
      syncMixerBankToAudio(state.padBank, channels, state.currentProgramId);
      const padMixer = { ...state.padMixer, [state.padBank]: channels };
      return {
        padMixer,
        programs: syncCurrentProgram(state, { padMixer }),
        ...recordUndo(state, `MIX ${field.toUpperCase()} ${state.selectedPad}`, `mix-${field}:${state.selectedPad}`),
      };
    }),
  setMixerChannelValue: (pad, field, value) =>
    set((state) => {
      const limits = getMixerLimits(field);
      const channels = state.padMixer[state.padBank].map((channel) =>
        channel.pad === pad ? { ...channel, [field]: clamp(value, limits.min, limits.max) } : channel,
      );
      syncMixerBankToAudio(state.padBank, channels, state.currentProgramId);
      const padMixer = { ...state.padMixer, [state.padBank]: channels };
      return {
        padMixer,
        programs: syncCurrentProgram(state, { padMixer }),
        ...recordUndo(state, `MIX ${field.toUpperCase()} ${pad}`, `mix-${field}:${pad}`),
      };
    }),
  // ============================================================
  // FX system actions (Phase A)
  // ============================================================
  setFxBusEffect: (busId, effect) =>
    set((state) => {
      const params: EffectParamMap = effect ? { ...EFFECT_DEFAULTS[effect] } : {};
      const fxBuses = state.fxBuses.map((b) =>
        b.id === busId ? { ...b, effect, params } : b,
      );
      fxEngine.setBusEffect(busId, effect, params);
      return {
        fxBuses,
        lastAudioMessage: effect ? `FX${busId} ${effect}` : `FX${busId} OFF`,
        ...recordUndo(state, `FX BUS ${busId} EFFECT`, `fx-effect:${busId}:${Date.now()}`),
      };
    }),
  toggleFxBusDirect: (busId) =>
    set((state) => {
      const fxBuses = state.fxBuses.map((b) =>
        b.id === busId ? { ...b, direct: !b.direct } : b,
      );
      const bus = fxBuses.find((b) => b.id === busId);
      return {
        fxBuses,
        lastAudioMessage: `FX${busId} ${bus?.direct ? "SEND" : "INSERT"}`,
        ...recordUndo(state, `FX BUS ${busId} DIRECT`, `fx-direct:${busId}:${Date.now()}`),
      };
    }),
  toggleFxBusBypass: (busId) =>
    set((state) => {
      const fxBuses = state.fxBuses.map((b) =>
        b.id === busId ? { ...b, bypass: !b.bypass } : b,
      );
      const bus = fxBuses.find((b) => b.id === busId)!;
      fxEngine.setBusBypass(busId, bus.bypass);
      fxEngine.setBusEffect(busId, bus.bypass ? null : bus.effect, bus.params);
      return {
        fxBuses,
        lastAudioMessage: `FX${busId} BYPASS ${bus.bypass ? "ON" : "OFF"}`,
        ...recordUndo(state, `FX BUS ${busId} BYPASS`, `fx-bypass:${busId}:${Date.now()}`),
      };
    }),
  adjustFxBusParam: (busId, key, delta) =>
    set((state) => {
      const fxBuses = state.fxBuses.map((b) => {
        if (b.id !== busId) return b;
        const cur = b.params[key] ?? 0;
        return { ...b, params: { ...b.params, [key]: cur + delta } };
      });
      const bus = fxBuses.find((b) => b.id === busId)!;
      fxEngine.setBusParam(busId, key, bus.params[key]);
      return {
        fxBuses,
        ...recordUndo(state, `FX ${key.toUpperCase()}`, `fx-param:${busId}:${key}`),
      };
    }),
  setFxBusParam: (busId, key, value) =>
    set((state) => {
      const fxBuses = state.fxBuses.map((b) =>
        b.id === busId ? { ...b, params: { ...b.params, [key]: value } } : b,
      );
      fxEngine.setBusParam(busId, key, value);
      return {
        fxBuses,
        ...recordUndo(state, `FX ${key.toUpperCase()}`, `fx-param:${busId}:${key}`),
      };
    }),
  toggleMasterEqBypass: () =>
    set((state) => {
      const masterFx: MasterFX = {
        ...state.masterFx,
        eq: { ...state.masterFx.eq, bypass: !state.masterFx.eq.bypass },
      };
      fxEngine.setMasterEqBypass(masterFx.eq.bypass);
      return {
        masterFx,
        lastAudioMessage: `MASTER EQ ${masterFx.eq.bypass ? "OFF" : "ON"}`,
        ...recordUndo(state, "MASTER EQ BYPASS", `master-eq-bypass:${Date.now()}`),
      };
    }),
  toggleMasterCompBypass: () =>
    set((state) => {
      const masterFx: MasterFX = {
        ...state.masterFx,
        compressor: { ...state.masterFx.compressor, bypass: !state.masterFx.compressor.bypass },
      };
      fxEngine.setMasterCompBypass(masterFx.compressor.bypass);
      return {
        masterFx,
        lastAudioMessage: `MASTER COMP ${masterFx.compressor.bypass ? "OFF" : "ON"}`,
        ...recordUndo(state, "MASTER COMP BYPASS", `master-comp-bypass:${Date.now()}`),
      };
    }),
  adjustMasterEqParam: (key, delta) =>
    set((state) => {
      const cur = state.masterFx.eq.params[key] ?? 0;
      const masterFx: MasterFX = {
        ...state.masterFx,
        eq: { ...state.masterFx.eq, params: { ...state.masterFx.eq.params, [key]: cur + delta } },
      };
      applyMasterEqParamToEngine(masterFx.eq.params, key);
      return {
        masterFx,
        ...recordUndo(state, `MASTER EQ ${key.toUpperCase()}`, `master-eq:${key}`),
      };
    }),
  setMasterEqParam: (key, value) =>
    set((state) => {
      const masterFx: MasterFX = {
        ...state.masterFx,
        eq: { ...state.masterFx.eq, params: { ...state.masterFx.eq.params, [key]: value } },
      };
      applyMasterEqParamToEngine(masterFx.eq.params, key);
      return {
        masterFx,
        ...recordUndo(state, `MASTER EQ ${key.toUpperCase()}`, `master-eq:${key}`),
      };
    }),
  adjustMasterCompParam: (key, delta) =>
    set((state) => {
      const cur = state.masterFx.compressor.params[key] ?? 0;
      const masterFx: MasterFX = {
        ...state.masterFx,
        compressor: { ...state.masterFx.compressor, params: { ...state.masterFx.compressor.params, [key]: cur + delta } },
      };
      fxEngine.setMasterCompParam(key, masterFx.compressor.params[key]);
      return {
        masterFx,
        ...recordUndo(state, `MASTER COMP ${key.toUpperCase()}`, `master-comp:${key}`),
      };
    }),
  setMasterCompParam: (key, value) =>
    set((state) => {
      const masterFx: MasterFX = {
        ...state.masterFx,
        compressor: { ...state.masterFx.compressor, params: { ...state.masterFx.compressor.params, [key]: value } },
      };
      fxEngine.setMasterCompParam(key, value);
      return {
        masterFx,
        ...recordUndo(state, `MASTER COMP ${key.toUpperCase()}`, `master-comp:${key}`),
      };
    }),
  setPadFxBus: (pad, busId) =>
    set((state) => {
      const assignments = state.padAssignments[state.padBank].map((a) =>
        a.pad === pad ? { ...a, fxBus: busId } : a,
      );
      const padAssignments = { ...state.padAssignments, [state.padBank]: assignments };
      return {
        padAssignments,
        programs: syncCurrentProgram(state, { padAssignments }),
        lastAudioMessage: `PAD ${pad} → ${busId === 0 ? "OFF" : `FX${busId}`}`,
        ...recordUndo(state, `PAD ${pad} FX BUS`, `pad-fx-bus:${pad}:${Date.now()}`),
      };
    }),
  adjustPadFxSendLevel: (pad, delta) =>
    set((state) => {
      const assignments = state.padAssignments[state.padBank].map((a) => {
        if (a.pad !== pad) return a;
        const next = clamp(a.fxSendLevel + delta, 0, 100);
        return { ...a, fxSendLevel: next };
      });
      const padAssignments = { ...state.padAssignments, [state.padBank]: assignments };
      return {
        padAssignments,
        programs: syncCurrentProgram(state, { padAssignments }),
        ...recordUndo(state, `PAD ${pad} FX SEND`, `pad-fx-send:${pad}`),
      };
    }),
  setPadFxSendLevel: (pad, level) =>
    set((state) => {
      const assignments = state.padAssignments[state.padBank].map((a) =>
        a.pad === pad ? { ...a, fxSendLevel: clamp(level, 0, 100) } : a,
      );
      const padAssignments = { ...state.padAssignments, [state.padBank]: assignments };
      return {
        padAssignments,
        programs: syncCurrentProgram(state, { padAssignments }),
        ...recordUndo(state, `PAD ${pad} FX SEND`, `pad-fx-send:${pad}`),
      };
    }),
  openFxSendWindow: () =>
    set((state) => ({
      activeScreen: "FX_SEND_WINDOW",
      utilityReturnScreen: isUtilityScreen(state.activeScreen) ? state.utilityReturnScreen : state.activeScreen,
    })),
  closeFxSendWindow: () =>
    set((state) => ({
      activeScreen: state.utilityReturnScreen,
    })),
  selectMixerPad: (selectedPad) => set({ selectedPad }),
  toggleSelectedMixerMute: () =>
    set((state) => {
      const channels = state.padMixer[state.padBank].map((channel) =>
        channel.pad === state.selectedPad ? { ...channel, muted: !channel.muted } : channel,
      );
      syncMixerBankToAudio(state.padBank, channels, state.currentProgramId);
      const padMixer = { ...state.padMixer, [state.padBank]: channels };
      return {
        padMixer,
        programs: syncCurrentProgram(state, { padMixer }),
        ...recordUndo(state, `MUTE ${state.selectedPad}`, `mute-pad:${state.selectedPad}:${Date.now()}`),
      };
    }),
  toggleSelectedMixerSolo: () =>
    set((state) => {
      const channels = state.padMixer[state.padBank].map((channel) =>
        channel.pad === state.selectedPad ? { ...channel, solo: !channel.solo } : channel,
      );
      syncMixerBankToAudio(state.padBank, channels, state.currentProgramId);
      const padMixer = { ...state.padMixer, [state.padBank]: channels };
      return {
        padMixer,
        programs: syncCurrentProgram(state, { padMixer }),
        ...recordUndo(state, `SOLO ${state.selectedPad}`, `solo-pad:${state.selectedPad}:${Date.now()}`),
      };
    }),
  toggleMixerChannelMute: (pad) =>
    set((state) => {
      const channels = state.padMixer[state.padBank].map((channel) =>
        channel.pad === pad ? { ...channel, muted: !channel.muted } : channel,
      );
      syncMixerBankToAudio(state.padBank, channels, state.currentProgramId);
      const padMixer = { ...state.padMixer, [state.padBank]: channels };
      return {
        padMixer,
        programs: syncCurrentProgram(state, { padMixer }),
        ...recordUndo(state, `MUTE ${pad}`, `mute-pad:${pad}:${Date.now()}`),
      };
    }),
  toggleMixerChannelSolo: (pad) =>
    set((state) => {
      const channels = state.padMixer[state.padBank].map((channel) =>
        channel.pad === pad ? { ...channel, solo: !channel.solo } : channel,
      );
      syncMixerBankToAudio(state.padBank, channels, state.currentProgramId);
      const padMixer = { ...state.padMixer, [state.padBank]: channels };
      return {
        padMixer,
        programs: syncCurrentProgram(state, { padMixer }),
        ...recordUndo(state, `SOLO ${pad}`, `solo-pad:${pad}:${Date.now()}`),
      };
    }),
  cycleSelectedMixerOutput: () =>
    set((state) => {
      const outputs: MixerChannel["output"][] = ["MAIN", "OUT1", "OUT2", "OUT3"];
      const padMixer = {
        ...state.padMixer,
        [state.padBank]: state.padMixer[state.padBank].map((channel) => {
            if (channel.pad !== state.selectedPad) return channel;
            const nextOutput = outputs[(outputs.indexOf(channel.output) + 1) % outputs.length];
            return { ...channel, output: nextOutput };
          }),
      };
      return {
        padMixer,
        programs: syncCurrentProgram(state, { padMixer }),
        ...recordUndo(state, `OUTPUT ${state.selectedPad}`, `mix-output:${state.selectedPad}:${Date.now()}`),
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
  togglePerformanceTrack: (targetIndex) =>
    set((state) => {
      if (targetIndex < 0 || targetIndex >= state.performanceTracks.length) return state;
      const performanceTracks = nextPerformanceTracks(state.performanceTracks, targetIndex, state.trackMuteMode);
      return {
        performanceTracks,
        lastPerformanceMessage: performanceMessage(targetIndex, performanceTracks[targetIndex]),
      };
    }),
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
  tickTransport: (deltaMs) => {
    set((state) => {
      if (state.transportPhase !== "COUNT_IN" || state.transportCountInBeatsRemaining <= 0) {
        if (state.isPlaying && (state.isSequenceRecording || state.overdubEnabled) && shouldClickDuringRecord(state)) {
          // Pulse rate depends on current bar's TS denominator. 4/4 → quarter pulse,
          // 6/8 → eighth pulse, etc. Accent on first step of bar.
          const sequence = getCurrentSequence(state);
          const barInfo = findBarAtGlobalStep(sequence, 24, state.currentStepIndex);
          const barTs = getTimeSignatureAtBar(sequence, barInfo.bar);
          const beatMs = (60000 / state.bpm) * (4 / barTs.den);
          const nextPulse = state.transportCountInPulse + deltaMs;
          if (nextPulse < beatMs) return { transportCountInPulse: nextPulse };
          const accent = barInfo.stepInBar === 0;
          playMetronomeClick(state, accent);
          return { transportCountInPulse: nextPulse - beatMs };
        }
        return state;
      }
      const beatMs = 60000 / state.bpm;
      const nextPulse = state.transportCountInPulse + deltaMs;
      if (nextPulse < beatMs) return { transportCountInPulse: nextPulse };
      const remaining = state.transportCountInBeatsRemaining - 1;
      if (remaining <= 0 && state.transportPendingAction) {
        playMetronomeClick(state, true);
        const action = state.transportPendingAction;
        const wasAlreadyPlaying = state.isPlaying;
        if (wasAlreadyPlaying && action === "REC") {
          // Sequence was already playing (e.g. PLAY → REC mid-loop). Don't reset position.
          return computeRecordTransitionPatch(state, { action, preserveSequencePosition: true });
        }
        sequenceStepStartedAt = performance.now();
        firstTickPending = true;
        return computeRecordTransitionPatch(state, { action, initialStepIndex: -1 });
      }
      playMetronomeClick(state, remaining % beatsPerBar(state) === 0);
      return {
        transportCountInBeatsRemaining: remaining,
        transportCountInPulse: nextPulse - beatMs,
        transportAnnouncement: "COUNT IN...",
      };
    });
    if (firstTickPending) {
      firstTickPending = false;
      get().tickStepPlayback();
      get().tickPerformance();
    }
  },
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
      if (selected.type === "PROGRAM") {
        const syncedPrograms = syncCurrentProgram(state);
        const program = syncedPrograms.find((item) => item.id === selected.assignedProgram);
        return program
          ? {
              programs: syncedPrograms,
              currentProgramId: program.id,
              activeProgram: program.name,
              padAssignments: program.padAssignments,
              padMixer: program.padMixer,
            }
          : state;
      }
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
      const padAssignments = renameSampleAssignments(state.padAssignments, sample.name, nextName);
      return {
        recordedSamples: state.recordedSamples.map((item) =>
          item.id === sample.id ? { ...item, name: nextName } : item,
        ),
        padAssignments,
        programs: renameSampleInPrograms(syncCurrentProgram(state, { padAssignments }), sample.name, nextName),
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
          ...metronomeSettingPatch(setting.key, nextValue),
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
      const nextValue = !state.settingsValues[setting.key];
      return {
        ...metronomeSettingPatch(setting.key, nextValue),
        settingsValues: {
          ...state.settingsValues,
          [setting.key]: nextValue,
        },
      };
    }),
  createProjectSnapshot: () => {
    const state = get();
    return {
      version: 1,
      sequences: state.sequences,
      currentSequence: state.currentSequence,
      currentTrackId: state.currentTrackId,
      programs: syncCurrentProgram(state),
      currentProgramId: state.currentProgramId,
      songSteps: state.songSteps,
      settingsValues: state.settingsValues,
      samples: state.recordedSamples.map((sample) => ({
        id: sample.id,
        name: sample.name,
        audioBufferId: sample.audioBufferId,
        durationMs: sample.durationMs,
        duration: sample.duration,
        sampleRate: sample.sampleRate,
        channelCount: sample.channelCount,
        keptSlices: sample.keptSlices,
        editState: sample.editState,
      })),
    };
  },
  saveProjectFile: async (name: string) => {
    const state = get();
    const programs = syncCurrentProgram(state);
    const sanitized = sanitizeProjectName(name);
    const { manifest, sampleEntries } = serializeProject({
      name: sanitized,
      appVersion: APP_VERSION,
      samples: state.recordedSamples.map((sample) => ({
        id: sample.id,
        name: sample.name,
        audioBufferId: sample.audioBufferId,
        durationMs: sample.durationMs,
        duration: sample.duration,
        sampleRate: sample.sampleRate,
        channelCount: sample.channelCount,
        waveform: sample.waveform,
        keptSlices: sample.keptSlices,
        editState: sample.editState,
      })),
      programs,
      sequences: state.sequences,
      songs: state.songSteps,
      globalSettings: collectGlobalSettings(state),
      fxBuses: state.fxBuses,
      masterFx: state.masterFx,
      resolveAudioBuffer: (id) => getSampleBuffer(id),
    });
    const blob = await writeProjectZip(manifest, sampleEntries);
    saveBlobAs(blob, `${sanitized}.lthief`);
    set((current) => ({
      lastAudioMessage: `SAVED: ${sanitized}.lthief`,
      lastSavedProjectVersion: current.projectVersion,
    }));
    void (await import("../disk")).clearAutosave();
  },
  saveAllFile: async (name: string) => {
    const state = get();
    const sanitized = sanitizeProjectName(name);
    const manifest = serializeAll({
      name: sanitized,
      appVersion: APP_VERSION,
      sequences: state.sequences,
      songs: state.songSteps,
      globalSettings: collectGlobalSettings(state),
    });
    const blob = await writeProjectZip(manifest, []);
    saveBlobAs(blob, `${sanitized}.lthief-all`);
    set((current) => ({
      lastAudioMessage: `SAVED: ${sanitized}.lthief-all`,
      lastSavedProjectVersion: current.projectVersion,
    }));
  },
  saveSeqFile: async (name: string, sequenceId?: string) => {
    const state = get();
    const targetId = sequenceId ?? state.currentSequence;
    const sequence = state.sequences.find((seq) => seq.id === targetId);
    if (!sequence) {
      set({ lastAudioMessage: "SEQ NOT FOUND" });
      return;
    }
    const sanitized = sanitizeProjectName(name);
    const manifest = serializeSeq({
      name: sanitized,
      appVersion: APP_VERSION,
      sequence,
    });
    const blob = await writeProjectZip(manifest, []);
    saveBlobAs(blob, `${sanitized}.lthief-seq`);
    set((current) => ({
      lastAudioMessage: `SAVED: ${sanitized}.lthief-seq`,
      lastSavedProjectVersion: current.projectVersion,
    }));
  },
  newProject: async () => {
    const current = get();
    const isDirty = current.projectVersion > current.lastSavedProjectVersion;
    if (isDirty) {
      const decision = window.confirm(
        "Unsaved changes will be lost.\n\nOK = discard and start blank\nCancel = keep current project",
      );
      if (!decision) return;
    }
    const blank = createBlankProjectState();
    set(blank);
    if (blank.fxBuses && blank.masterFx) syncFxEngine(blank.fxBuses, blank.masterFx);
    const { clearAutosave } = await import("../disk");
    await clearAutosave().catch(() => {});
  },
  loadFile: async (file: Blob, options) => {
    const targetSequenceId = options?.targetSequenceId;
    const bundle = await loadFromBlob(file, {
      decodeAudio: (bytes) => samplerEngine.decodeAudioData(bytes),
      onProgress: (progress) => {
        set({ lastAudioMessage: progress.message });
      },
    });
    if (bundle.type === "project") {
      hydrateProjectBundle(bundle, set);
      return { type: "project", name: bundle.manifest.name };
    }
    if (bundle.type === "all") {
      hydrateAllBundle(bundle, set);
      return { type: "all", name: bundle.manifest.name };
    }
    hydrateSeqBundle(bundle, set, get, targetSequenceId);
    return { type: "seq", name: bundle.manifest.name };
  },
  preloadAudioBuffers: () => {
    // Fire-and-forget. Metronome buffer fetch + decode happens before first user gesture
    // so that count-in clicks aren't racing AudioContext.resume() on cold start.
    void loadMetronomeBuffer();
  },
}));

const APP_VERSION = "0.1.0";

function sanitizeProjectName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "untitled";
  return trimmed.replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 80);
}

function createBlankProjectState(): Partial<AppState> {
  return {
    sequences: [],
    currentSequence: "",
    stepEvents: [],
    sequenceName: "",
    programs: [],
    currentProgramId: "",
    activeProgram: "",
    padAssignments: createPadAssignments(),
    padMixer: createPadMixer(),
    recordedSamples: [],
    songSteps: [],
    currentSongStepIndex: 0,
    selectedSongStepIndex: 0,
    fxBuses: createDefaultFxBuses(),
    masterFx: createDefaultMasterFx(),
    undoHistory: [],
    redoHistory: [],
    pendingRecTake: null,
    projectVersion: 0,
    lastSavedProjectVersion: 0,
    lastAction: "NEW PROJECT",
    lastAudioMessage: "NEW PROJECT",
  };
}

function collectGlobalSettings(state: AppState): GlobalSettings {
  return {
    bpm: state.bpm,
    swing: state.swing,
    timingCorrect: state.timingCorrect,
    tripletMode: state.tripletMode,
    timeSignature: state.timeSignature,
    sequenceLengthBars: state.sequenceLengthBars,
    metronomeEnabled: state.metronomeEnabled,
    metronomeDuringRecord: state.metronomeDuringRecord,
    metronomeCountInBars: state.metronomeCountInBars,
    metronomeVolume: state.metronomeVolume,
  };
}

function applyGlobalSettings(settings: GlobalSettings): Partial<AppState> {
  return {
    bpm: settings.bpm,
    swing: settings.swing,
    timingCorrect: settings.timingCorrect as AppState["timingCorrect"],
    tripletMode: settings.tripletMode,
    timeSignature: settings.timeSignature as TimeSignature,
    sequenceLengthBars: settings.sequenceLengthBars,
    metronomeEnabled: settings.metronomeEnabled,
    metronomeDuringRecord: settings.metronomeDuringRecord,
    metronomeCountInBars: settings.metronomeCountInBars,
    metronomeVolume: settings.metronomeVolume,
  };
}

function hydrateSamples(loaded: LoadedSample[]): RecordedSample[] {
  return loaded.map((entry) => {
    const audioBufferId = entry.metadata.id;
    registerSampleAudio(audioBufferId, entry.buffer);
    const waveform =
      entry.metadata.waveform && entry.metadata.waveform.length > 0
        ? entry.metadata.waveform
        : createWaveformCache(entry.buffer);
    return {
      id: entry.metadata.id,
      name: entry.metadata.name,
      audioBufferId,
      durationMs: entry.metadata.durationMs,
      duration: entry.metadata.duration,
      sampleRate: entry.metadata.sampleRate,
      channelCount: entry.metadata.channelCount,
      waveform,
      keptSlices: entry.metadata.keptSlices,
      editState: entry.metadata.editState,
    } satisfies RecordedSample;
  });
}

// Derived from sequence.tracks. Each PerformanceTrack mirrors mute/solo from the source track
// plus a decorative `activity` field. Re-derive whenever loading a sequence so the count and
// mute/solo state of state.performanceTracks always matches the active sequence's tracks.
function derivePerformanceTracks(sequence: Sequence | undefined): PerformanceTrack[] {
  if (!sequence) return [];
  return sequence.tracks.map((track, index) => ({
    id: track.id,
    name: track.name,
    muted: track.mute,
    solo: track.solo,
    activity: 28 + index * 8,
  }));
}

function hydrateProjectBundle(
  bundle: Extract<LoadedBundle, { type: "project" }>,
  set: (partial: Partial<AppState>) => void,
) {
  const samples = hydrateSamples(bundle.samples);
  const programs = (bundle.manifest.programs as Program[]).map(ensureProgramFxFields);
  const sequences = (bundle.manifest.sequences as Sequence[]).map(ensureTimeSignatureChanges);
  const songSteps = bundle.manifest.songs as SongStep[];
  const firstProgram = programs[0];
  const firstSequence = sequences[0];
  const firstTrackId = firstSequence?.tracks[0]?.id ?? "TRACK01";
  const manifestExt = bundle.manifest as unknown as { fxBuses?: unknown; masterFx?: unknown };
  const fxBuses = ensureFxBusesFromManifest(manifestExt.fxBuses);
  const masterFx = ensureMasterFxFromManifest(manifestExt.masterFx);
  set({
    recordedSamples: samples,
    programs,
    currentProgramId: firstProgram?.id ?? "",
    padAssignments: firstProgram?.padAssignments ?? createPadAssignments(),
    padMixer: firstProgram?.padMixer ?? createPadMixer(),
    activeProgram: firstProgram?.name ?? "",
    sequences,
    currentSequence: firstSequence?.id ?? "",
    sequence: firstSequence?.id ?? "",
    stepEvents: firstSequence?.events ?? [],
    sequenceName: firstSequence?.name ?? "",
    currentTrackId: firstTrackId,
    activeTrack: firstSequence
      ? formatTrackName(getTrackName(firstSequence, firstTrackId), Math.max(0, firstSequence.tracks.findIndex((t) => t.id === firstTrackId)))
      : "TRACK01",
    performanceTracks: derivePerformanceTracks(firstSequence),
    songSteps,
    currentSongStepIndex: 0,
    selectedSongStepIndex: 0,
    fxBuses,
    masterFx,
    ...applyGlobalSettings(bundle.manifest.globalSettings),
    lastAudioMessage: `LOADED: ${bundle.manifest.name}.lthief`,
  });
  syncFxEngine(fxBuses, masterFx);
}

function hydrateAllBundle(
  bundle: Extract<LoadedBundle, { type: "all" }>,
  set: (partial: Partial<AppState>) => void,
) {
  const sequences = (bundle.manifest.sequences as Sequence[]).map(ensureTimeSignatureChanges);
  const songSteps = bundle.manifest.songs as SongStep[];
  const firstSequence = sequences[0];
  const firstTrackId = firstSequence?.tracks[0]?.id ?? "TRACK01";
  set({
    sequences,
    currentSequence: firstSequence?.id ?? "",
    sequence: firstSequence?.id ?? "",
    stepEvents: firstSequence?.events ?? [],
    sequenceName: firstSequence?.name ?? "",
    currentTrackId: firstTrackId,
    activeTrack: firstSequence
      ? formatTrackName(getTrackName(firstSequence, firstTrackId), Math.max(0, firstSequence.tracks.findIndex((t) => t.id === firstTrackId)))
      : "TRACK01",
    performanceTracks: derivePerformanceTracks(firstSequence),
    songSteps,
    currentSongStepIndex: 0,
    selectedSongStepIndex: 0,
    ...applyGlobalSettings(bundle.manifest.globalSettings),
    lastAudioMessage: `LOADED: ${bundle.manifest.name}.lthief-all`,
  });
}

function hydrateSeqBundle(
  bundle: Extract<LoadedBundle, { type: "seq" }>,
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
  targetSequenceId?: string,
) {
  const state = get();
  const incoming = ensureTimeSignatureChanges(bundle.manifest.sequence as Sequence);
  const targetId: string = targetSequenceId ?? state.currentSequence;
  const replaced: Sequence = { ...incoming, id: targetId };
  const sequences = state.sequences.some((seq) => seq.id === targetId)
    ? state.sequences.map((seq) => (seq.id === targetId ? replaced : seq))
    : [...state.sequences, replaced];
  const firstTrackId = replaced.tracks[0]?.id ?? state.currentTrackId;
  set({
    sequences,
    currentSequence: targetId,
    sequence: targetId,
    stepEvents: replaced.events,
    sequenceName: replaced.name,
    currentTrackId: firstTrackId,
    activeTrack: formatTrackName(getTrackName(replaced, firstTrackId), Math.max(0, replaced.tracks.findIndex((t) => t.id === firstTrackId))),
    performanceTracks: derivePerformanceTracks(replaced),
    lastAudioMessage: `LOADED: ${bundle.manifest.name}.lthief-seq`,
  });
}

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

function formatBarPosition(bar: number, step: number, sequence?: Sequence) {
  // `step` is 1-indexed within bar at 1/16 grid (24 ticks each). Output: "BAR.BEAT.TICK".
  // For non-4/4 bars, beat count depends on TS denominator: 4/4 → 4 beats × 96 ticks each,
  // 6/8 → 6 beats × 48 ticks (eighth pulses), 3/4 → 3 × 96, etc.
  const denominator = sequence ? getTimeSignatureAtBar(sequence, bar - 1).den : 4;
  const ticksPerBeat = Math.round((96 * 4) / denominator);
  const ticksFromBarStart = Math.max(0, (step - 1) * 24);
  const beat = Math.floor(ticksFromBarStart / ticksPerBeat) + 1;
  const tickInBeat = ticksFromBarStart % ticksPerBeat;
  return `${String(bar).padStart(3, "0")}.${String(beat).padStart(2, "0")}.${String(tickInBeat).padStart(2, "0")}`;
}

const UNDO_DEPTH = 50;
const UNDO_ACCUMULATE_MS = 500;

function snapshotTrackEventsByStep(state: AppState, trackId: string): Record<number, string[]> {
  const sequence = getCurrentSequence(state);
  const map: Record<number, string[]> = {};
  state.stepEvents.forEach((evt) => {
    if (evt.trackId !== trackId) return;
    const idx = eventGlobalStep(evt.step, sequence, 24);
    if (!map[idx]) map[idx] = [];
    map[idx].push(evt.id);
  });
  return map;
}

function startRecordingSession(state: AppState): Pick<AppState, "sequenceLoopedSinceRecordStart" | "recordingSessionInitialEvents" | "recordSessionClearedSteps"> {
  return {
    sequenceLoopedSinceRecordStart: false,
    recordingSessionInitialEvents: snapshotTrackEventsByStep(state, state.currentTrackId),
    recordSessionClearedSteps: [],
  };
}

function beginRecTakeSnapshot(state: AppState): Partial<AppState> {
  if (state.pendingRecTake) return {};
  const trackIndex = Math.max(
    getCurrentSequence(state).tracks.findIndex((t) => t.id === state.currentTrackId),
    0,
  );
  return {
    pendingRecTake: {
      label: `REC TAKE SEQ${state.currentSequence} TRK${String(trackIndex + 1).padStart(2, "0")}`,
      snapshot: captureSnapshot(state),
      timestamp: performance.now(),
      bucket: `rec-take:${Date.now()}`,
    },
  };
}

function endRecTakeSnapshot(state: AppState): Partial<AppState> {
  if (!state.pendingRecTake) return {};
  return {
    undoHistory: [...state.undoHistory, state.pendingRecTake].slice(-UNDO_DEPTH),
    redoHistory: [],
    pendingRecTake: null,
    lastAction: state.pendingRecTake.label,
    projectVersion: state.projectVersion + 1,
  };
}

function refreshRecordingSessionForTrack(state: AppState): Pick<AppState, "recordingSessionInitialEvents" | "recordSessionClearedSteps"> {
  return {
    recordingSessionInitialEvents: snapshotTrackEventsByStep(state, state.currentTrackId),
    recordSessionClearedSteps: [],
  };
}

function computeRecordTransitionPatch(
  state: AppState,
  options: {
    action: "PLAY" | "REC";
    additionalEvent?: StepEvent;
    initialStepIndex?: number;
    preserveSequencePosition?: boolean;
  },
): Partial<AppState> {
  const isRec = options.action === "REC";
  const sessionPatch = isRec ? startRecordingSession(state) : {};
  // REC TAKE snapshot is captured at user-click paths (toggleSequenceRecording,
  // requestTransportStartImpl, triggerPad anticipation) — never here, because
  // this function is also called from tickTransport count-in end (audio scheduling path).
  // beginRecTakeSnapshot is idempotent so the existing pendingRecTake (set at click time)
  // carries through to recording start without re-cloning state.
  const basePatch: Partial<AppState> = {
    transportPhase: "IDLE",
    transportPendingAction: null,
    transportCountInBeatsRemaining: 0,
    transportCountInPulse: 0,
    isPlaying: true,
    isSequenceRecording: isRec ? true : state.isSequenceRecording,
    overdubEnabled: isRec ? false : state.overdubEnabled,
    transportAnnouncement: isRec ? "RECORDING..." : "",
    ...sessionPatch,
  };
  if (options.additionalEvent) {
    const events = [...state.stepEvents, options.additionalEvent].sort(
      (a, b) => eventStepIndex(a.step) - eventStepIndex(b.step),
    );
    basePatch.stepEvents = events;
    basePatch.sequences = updateCurrentSequenceEvents(state, events);
  }
  if (options.preserveSequencePosition) {
    return basePatch;
  }
  const stepIndex = options.initialStepIndex ?? -1;
  const visualStep = stepIndex < 0 ? 1 : (stepIndex % 16) + 1;
  return {
    ...basePatch,
    bar: stepIndex < 0 ? "001.01.00" : formatBarPosition(1, visualStep),
    currentBar: 1,
    currentStep: visualStep,
    currentStepIndex: stepIndex,
  };
}

function captureSnapshot(state: AppState): UndoSnapshot {
  return {
    stepEvents: structuredClone(state.stepEvents),
    sequences: structuredClone(state.sequences),
    programs: structuredClone(state.programs),
    padAssignments: structuredClone(state.padAssignments),
    padMixer: structuredClone(state.padMixer),
    recordedSamples: structuredClone(state.recordedSamples),
    songSteps: structuredClone(state.songSteps),
    sequenceLengthBars: state.sequenceLengthBars,
    timeSignature: state.timeSignature,
    bpm: state.bpm,
    swing: state.swing,
    currentSequence: state.currentSequence,
    currentTrackId: state.currentTrackId,
    currentProgramId: state.currentProgramId,
    activeScreen: state.activeScreen,
    selectedPad: state.selectedPad,
    padBank: state.padBank,
    currentBar: state.currentBar,
    currentStep: state.currentStep,
    currentStepIndex: state.currentStepIndex,
    currentEvent: state.currentEvent,
    selectedEventIndex: state.selectedEventIndex,
    selectedEventId: state.selectedEventId,
    fxBuses: structuredClone(state.fxBuses),
    masterFx: structuredClone(state.masterFx),
  };
}

function restoreSnapshot(snapshot: UndoSnapshot): Partial<AppState> {
  // activeScreen intentionally NOT restored — undo/redo stay in current screen.
  // snapshot.activeScreen is captured for possible future "jump to edit site" feature.
  const fxBuses = structuredClone(snapshot.fxBuses ?? createDefaultFxBuses());
  const masterFx = structuredClone(snapshot.masterFx ?? createDefaultMasterFx());
  // Push restored FX state into the audio engine; restoreSnapshot is consumed by undo/redo
  // which calls set() with this partial. Side effect is acceptable here — audio nodes
  // must reflect the restored state.
  syncFxEngine(fxBuses, masterFx);
  return {
    stepEvents: structuredClone(snapshot.stepEvents),
    sequences: structuredClone(snapshot.sequences),
    programs: structuredClone(snapshot.programs),
    padAssignments: structuredClone(snapshot.padAssignments),
    padMixer: structuredClone(snapshot.padMixer),
    recordedSamples: structuredClone(snapshot.recordedSamples),
    songSteps: structuredClone(snapshot.songSteps),
    sequenceLengthBars: snapshot.sequenceLengthBars,
    timeSignature: snapshot.timeSignature,
    bpm: snapshot.bpm,
    swing: snapshot.swing,
    currentSequence: snapshot.currentSequence,
    currentTrackId: snapshot.currentTrackId,
    currentProgramId: snapshot.currentProgramId,
    selectedPad: snapshot.selectedPad,
    padBank: snapshot.padBank,
    currentBar: snapshot.currentBar,
    currentStep: snapshot.currentStep,
    currentStepIndex: snapshot.currentStepIndex,
    currentEvent: snapshot.currentEvent,
    selectedEventIndex: snapshot.selectedEventIndex,
    selectedEventId: snapshot.selectedEventId,
    fxBuses,
    masterFx,
  };
}

function recordUndo(state: AppState, label: string, bucket: string): Pick<AppState, "undoHistory" | "redoHistory" | "lastAction" | "projectVersion"> {
  const now = performance.now();
  const nextVersion = state.projectVersion + 1;
  const last = state.undoHistory.at(-1);
  if (last && last.bucket === bucket && now - last.timestamp < UNDO_ACCUMULATE_MS) {
    const updated = state.undoHistory.slice(0, -1).concat({ ...last, label, timestamp: now });
    return { undoHistory: updated, redoHistory: [], lastAction: label, projectVersion: nextVersion };
  }
  const entry: UndoEntry = { label, snapshot: captureSnapshot(state), timestamp: now, bucket };
  return {
    undoHistory: [...state.undoHistory, entry].slice(-UNDO_DEPTH),
    redoHistory: [],
    lastAction: label,
    projectVersion: nextVersion,
  };
}

function metronomeSettingPatch(key: keyof SettingsValues, value: SettingsValues[keyof SettingsValues]): Partial<AppState> {
  if (key === "metronomeEnabled" && typeof value === "boolean") return { metronomeEnabled: value };
  if (key === "metronomeDuringRecord" && typeof value === "boolean") return { metronomeDuringRecord: value };
  if (key === "metronomeCountInBars" && typeof value === "number") {
    return { metronomeCountInBars: value, countInMode: countInBarsToMode(value) };
  }
  if (key === "metronomeVolume" && typeof value === "number") return { metronomeVolume: value, countInClickVolume: value };
  return {};
}

function nearestEventAtOrAfter(events: StepEvent[], stepIndex: number, sequence?: Sequence) {
  if (events.length === 0) return 0;
  const stepOf = sequence
    ? (s: string) => eventGlobalStep(s, sequence, 24)
    : (s: string) => eventStepIndex(s);
  const nextIndex = events.findIndex((event) => stepOf(event.step) >= stepIndex);
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

function clampTransportToSequenceLength(state: AppState, sequenceLengthBars: number): Partial<AppState> {
  const maxStepIndex = sequenceLengthBars * 16 - 1;
  const currentStepIndex = clamp(state.currentStepIndex, state.currentStepIndex < 0 ? -1 : 0, maxStepIndex);
  if (currentStepIndex < 0) return { currentBar: 1, currentStep: 1, currentStepIndex, bar: "001.01.00" };
  const currentBar = Math.floor(currentStepIndex / 16) + 1;
  const currentStep = (currentStepIndex % 16) + 1;
  const selectedStepEventIndex = nearestEventAtOrAfter(state.stepEvents, currentStepIndex);
  return {
    currentBar,
    currentStep,
    currentStepIndex,
    currentEvent: selectedStepEventIndex + 1,
    ...selectedEventPatch(state.stepEvents, selectedStepEventIndex),
    bar: formatBarPosition(currentBar, currentStep),
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

// Bar-aware global step index. Walks bars to account for variable per-bar TS step counts.
// Use this when the sequence may have mixed time signatures. For default 4/4 sequences,
// returns the same value as eventStepIndex.
function eventGlobalStep(step: string, sequence: Sequence, gridTicks: number = 24): number {
  const [bar, beat, tick] = step.split(".").map(Number);
  const barIndex = (bar ?? 1) - 1;
  let cumulative = 0;
  for (let i = 0; i < barIndex && i < sequence.lengthBars; i += 1) {
    cumulative += getBarStepCount(sequence, i, gridTicks);
  }
  const ticksInBar = ((beat ?? 1) - 1) * 96 + (tick ?? 0);
  return cumulative + Math.floor(ticksInBar / gridTicks);
}

function eventStepToTicks(step: string) {
  const [bar, beat, tick] = step.split(".").map(Number);
  return (bar - 1) * 384 + (beat - 1) * 96 + tick;
}

function ticksToStep(ticks: number) {
  const bounded = Math.max(0, Math.round(ticks));
  const bar = Math.floor(bounded / 384) + 1;
  const tickInBar = bounded % 384;
  const beat = Math.floor(tickInBar / 96) + 1;
  const tick = tickInBar % 96;
  return `${String(bar).padStart(3, "0")}.${String(beat).padStart(2, "0")}.${String(tick).padStart(2, "0")}`;
}

function offsetStepEvent(event: StepEvent, offsetTicks: number): StepEvent {
  return {
    ...event,
    id: nextEventId(),
    step: ticksToStep(eventStepToTicks(event.step) + offsetTicks),
    padBank: event.padBank ?? "A",
    padNumber: event.padNumber ?? padNumberFromPad(event.pad),
  };
}

function uniqueSongTracks(state: AppState) {
  const tracks = new Map<string, Track>();
  state.songSteps.forEach((step) => {
    const sequence = state.sequences.find((item) => item.id === step.sequenceId);
    sequence?.tracks.forEach((track) => tracks.set(track.id, { ...track }));
  });
  return [...tracks.values()];
}

function createRecordedPadEvent(state: AppState, pad: string, velocity: number) {
  const position = getRecordedEventPosition(state);
  const assignment = state.padAssignments[state.padBank].find((item) => item.pad === pad);
  return createStepEventAtPosition(position.stepIndex, position.tickOffset, pad, velocity, state.noteRepeatGate, {
    sequence: getCurrentSequence(state),
    trackId: state.currentTrackId,
    trackName: getTrackName(getCurrentSequence(state), state.currentTrackId),
    sourcePad: pad,
    sourceAssignment: assignment?.assignment === "---" ? undefined : assignment?.assignment,
    padBank: state.padBank,
    programId: state.currentProgramId,
    variation: "REC",
    duration: 0,
    length: 0,
  });
}

function getRecordedEventPosition(state: AppState) {
  const sequence = getCurrentSequence(state);
  const ppqMs = 60_000 / state.bpm / 96;
  const elapsedTicks = ppqMs > 0 ? Math.round((performance.now() - sequenceStepStartedAt) / ppqMs) : 0;
  const rawTickOffset = clamp(elapsedTicks, 0, 23);
  const totalTicks = Math.max(0, state.currentStepIndex) * 24 + rawTickOffset;
  const sequenceTicks = getSequenceTotalTicks(sequence);
  const quantizedTicks =
    state.timingCorrect === "OFF"
      ? totalTicks
      : Math.round(totalTicks / timingCorrectGridTicks(state.timingCorrect)) * timingCorrectGridTicks(state.timingCorrect);
  const boundedTicks = sequenceTicks > 0 ? ((quantizedTicks % sequenceTicks) + sequenceTicks) % sequenceTicks : 0;
  return {
    stepIndex: Math.floor(boundedTicks / 24),
    tickOffset: boundedTicks % 24,
  };
}

function timingCorrectGridTicks(timingCorrect: AppState["timingCorrect"]): number {
  switch (timingCorrect) {
    case "1/4":
      return 96;
    case "1/8":
      return 48;
    case "1/16":
      return 24;
    case "1/32":
      return 12;
    case "1/4T":
      return 64;
    case "1/8T":
      return 32;
    case "1/16T":
      return 16;
    case "1/32T":
      return 8;
    case "OFF":
    default:
      return 1;
  }
}

function repeatIntervalSteps(rate: AppState["timingCorrect"]) {
  switch (rate) {
    case "1/4":
      return 4;
    case "1/8":
      return 2;
    case "1/16":
      return 1;
    case "1/32":
      return 0.5;
    case "1/4T":
      return 8 / 3;
    case "1/8T":
      return 4 / 3;
    case "1/16T":
      return 2 / 3;
    case "1/32T":
      return 1 / 3;
    default:
      return 1;
  }
}

function cycleTimingCorrectPatch(
  state: AppState,
  delta: number,
  options: { includeOff: boolean },
): Partial<AppState> {
  const nonTriplet: AppState["timingCorrect"][] = options.includeOff
    ? ["OFF", "1/4", "1/8", "1/16", "1/32"]
    : ["1/4", "1/8", "1/16", "1/32"];
  const triplet: AppState["timingCorrect"][] = options.includeOff
    ? ["OFF", "1/4T", "1/8T", "1/16T", "1/32T"]
    : ["1/4T", "1/8T", "1/16T", "1/32T"];
  const values = state.tripletMode ? triplet : nonTriplet;
  const currentIdx = values.indexOf(state.timingCorrect);
  const startIdx = currentIdx === -1 ? 0 : currentIdx;
  const nextIdx = (startIdx + delta + values.length) % values.length;
  const timingCorrect = values[nextIdx];
  return {
    timingCorrect,
    tcEnabled: timingCorrect !== "OFF",
  };
}

function createStepEventFromIndex(
  stepIndex: number,
  pad: string,
  velocity: number,
  gate: number,
  timingOffset: number,
  extra?: Partial<StepEvent> & { sequence?: Sequence },
): StepEvent {
  // Bar-aware position derive if sequence provided; else legacy uniform-16 assumption.
  let bar: number;
  let local: number;
  let beat: number;
  let tick: number;
  const denominator = extra?.sequence
    ? getTimeSignatureAtBar(extra.sequence, findBarAtGlobalStep(extra.sequence, 24, stepIndex).bar).den
    : 4;
  if (extra?.sequence) {
    const info = findBarAtGlobalStep(extra.sequence, 24, stepIndex);
    bar = info.bar;
    local = info.stepInBar;
  } else {
    bar = Math.floor(stepIndex / 16);
    local = stepIndex % 16;
  }
  const ticksPerBeat = Math.round((96 * 4) / denominator);
  const ticksFromBarStart = local * 24;
  beat = Math.floor(ticksFromBarStart / ticksPerBeat) + 1;
  tick = ticksFromBarStart % ticksPerBeat;
  const { sequence: _ignored, ...rest } = extra ?? {};
  void _ignored;
  return {
    id: nextEventId(),
    step: `${String(bar + 1).padStart(3, "0")}.${beat}.${String(tick).padStart(2, "0")}`,
    pad,
    padNumber: padNumberFromPad(pad),
    trackId: "TRACK01",
    trackName: "TRACK01",
    velocity,
    length: Math.max(1, Math.round((gate / 100) * 24)),
    duration: Math.max(1, Math.round((gate / 100) * 24)),
    type: "NOTE",
    timingOffset,
    probability: 100,
    variation: "REPEAT",
    muted: false,
    ...rest,
  };
}

function createStepEventAtPosition(
  stepIndex: number,
  tickOffset: number,
  pad: string,
  velocity: number,
  gate: number,
  extra?: Partial<StepEvent> & { sequence?: Sequence },
): StepEvent {
  let bar: number;
  let local: number;
  const denominator = extra?.sequence
    ? getTimeSignatureAtBar(extra.sequence, findBarAtGlobalStep(extra.sequence, 24, stepIndex).bar).den
    : 4;
  if (extra?.sequence) {
    const info = findBarAtGlobalStep(extra.sequence, 24, stepIndex);
    bar = info.bar;
    local = info.stepInBar;
  } else {
    bar = Math.floor(stepIndex / 16);
    local = stepIndex % 16;
  }
  const tickInBar = local * 24 + tickOffset;
  const ticksPerBeat = Math.round((96 * 4) / denominator);
  const beat = Math.floor(tickInBar / ticksPerBeat) + 1;
  const tick = tickInBar % ticksPerBeat;
  const { sequence: _ignored, ...rest } = extra ?? {};
  void _ignored;
  return {
    id: nextEventId(),
    step: `${String(bar + 1).padStart(3, "0")}.${String(beat).padStart(2, "0")}.${String(tick).padStart(2, "0")}`,
    pad,
    padNumber: padNumberFromPad(pad),
    trackId: "TRACK01",
    trackName: "TRACK01",
    velocity,
    length: Math.max(1, Math.round((gate / 100) * 24)),
    duration: Math.max(1, Math.round((gate / 100) * 24)),
    type: "NOTE",
    timingOffset: tickOffset,
    probability: 100,
    variation: "REC",
    muted: false,
    ...rest,
  };
}

function padNumberFromPad(pad: string) {
  return clamp(Number(pad.replace(/^P/, "")) || 1, 1, 16);
}

function padFromEvent(event: StepEvent) {
  return `P${String(event.padNumber ?? padNumberFromPad(event.pad)).padStart(2, "0")}`;
}

function padNumberToVariationIndex(padNumber: number) {
  const idx = clamp(padNumber, 1, 16) - 1;
  const row = Math.floor(idx / 4);
  const col = idx % 4;
  return (3 - row) * 4 + col + 1;
}

function getSixteenLevelsValue(state: AppState, padNumber: number) {
  const variationIndex = padNumberToVariationIndex(padNumber);
  const rootVariationIndex = padNumberToVariationIndex(state.sixteenLevelsRootPad);
  switch (state.sixteenLevelsParameter) {
    case "TUNE":
      return computeSixteenLevelsTune(variationIndex, rootVariationIndex);
    case "FILTER": {
      const effectiveCutoff = state.sixteenLevelsFilterCutoff ?? getSourceFilterCutoff(state) ?? 50;
      return Math.round(computeSixteenLevelsFilterCutoff(variationIndex, effectiveCutoff));
    }
    case "ATTACK":
    case "DECAY":
      return Math.round(((variationIndex - 1) / 15) * 100);
    case "VELOCITY":
    default:
      return Math.round(1 + 126 * (variationIndex - 1) / 15);
  }
}

function computeSixteenLevelsTune(variationIndex: number, rootVariationIndex: number) {
  return clamp(variationIndex - rootVariationIndex, -12, 12);
}

function computeSixteenLevelsFilterCutoff(variationIndex: number, currentCutoff: number) {
  if (variationIndex <= 8) return (variationIndex - 1) / 7 * currentCutoff;
  return currentCutoff + (variationIndex - 8) / 8 * (100 - currentCutoff);
}

function getSourceAssignment(state: AppState): PadAssignment | null {
  const sourceBank = state.sixteenLevelsSourcePad.slice(0, 1) as PadBank;
  const sourceNumber = clamp(Number(state.sixteenLevelsSourcePad.slice(1)) || 1, 1, 16);
  const sourcePadId = `P${String(sourceNumber).padStart(2, "0")}`;
  const program = getProgramForPlayback(state, state.currentProgramId);
  const assignments = program?.padAssignments ?? state.padAssignments;
  return assignments[sourceBank]?.find((p) => p.pad === sourcePadId) ?? null;
}

function getSourceFilterCutoff(state: AppState): number | null {
  return getSourceAssignment(state)?.filterCutoff ?? null;
}

function getSourceFilterResonance(state: AppState): number | null {
  return getSourceAssignment(state)?.filterResonance ?? null;
}

function getSourceFilterType(state: AppState): PadAssignment["filterType"] | null {
  return getSourceAssignment(state)?.filterType ?? null;
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
  playAssignedPadWithContext(state, {
    pad,
    bank: state.padBank,
    programId: state.currentProgramId,
  });
}

function playAssignedPadWithContext(
  state: AppState,
  context: {
    pad: string;
    bank: PadBank;
    programId?: string;
    tuneOverride?: number;
    fineTuneOverride?: number;
    gainOverride?: number;
    filterCutoffOverride?: number;
    filterResonanceOverride?: number;
    filterTypeOverride?: PadAssignment["filterType"];
    attackOverride?: number;
    decayOverride?: number;
    sustainMs?: number;
  },
) {
  const program = getProgramForPlayback(state, context.programId);
  const padAssignments = program?.padAssignments ?? state.padAssignments;
  const padMixer = program?.padMixer ?? state.padMixer;
  const assignment = padAssignments[context.bank].find((item) => item.pad === context.pad);
  const mix = padMixer[context.bank].find((item) => item.pad === context.pad);
  if (!assignment || assignment.assignment === "---" || !mix || !isMixerChannelAudible(padMixer[context.bank], context.pad)) {
    useAppStore.setState({ lastAudioMessage: "UNASSIGNED PAD" });
    return;
  }
  const resolved = resolveAssignedSample(state, assignment.assignment);
  if (!resolved) return;
  useAppStore.setState((current) => ({
    lastAudioMessage: assignment.assignment,
    triggeredPads: markPadTriggered(current.triggeredPads, context.bank, context.pad, true),
  }));
  window.setTimeout(() => {
    useAppStore.setState((current) => ({
      triggeredPads: markPadTriggered(current.triggeredPads, context.bank, context.pad, false),
    }));
  }, Math.max(80, Math.min(240, assignment.decay * 2)));
  const voiceGroup = mixerChannelKey(context.bank, context.pad, program?.id);
  samplerEngine.stopVoiceGroups(getMuteStopGroups(state, assignment, context.pad, context.bank, padAssignments, program?.id));
  const fxRouting = (() => {
    const busId = (assignment.fxBus ?? 0) as 0 | BusId;
    if (busId === 0) return undefined;
    const bus = state.fxBuses.find((b) => b.id === busId);
    if (!bus) return undefined;
    return { busId, sendLevel: assignment.fxSendLevel ?? 0, direct: bus.direct };
  })();
  const playbackRate = tuneToPlaybackRate(
    context.tuneOverride ?? assignment.tune,
    context.fineTuneOverride ?? assignment.fineTune,
  );
  const playable = playbackRate === 1 ? resolved : { ...resolved, playbackRate: (resolved.playbackRate ?? 1) * playbackRate };
  const effectiveAttack = context.attackOverride ?? assignment.attack;
  const effectiveDecay = context.decayOverride ?? assignment.decay;
  const envelope = effectiveAttack === 0 && effectiveDecay >= 100
    ? undefined
    : {
        attackMs: programValueToMs(effectiveAttack),
        decayMs: programValueToMs(effectiveDecay),
        holdMode: assignment.mode,
      };
  samplerEngine.play(playable, {
    gain: (context.gainOverride ?? 1) * (mix.level / 100),
    pan: mix.pan / 64,
    channelKey: voiceGroup,
    voiceGroup,
    mono: assignment.voiceMode === "MONO",
    filter: createPadFilterOptions(assignment, {
      cutoffOverride: context.filterCutoffOverride,
      resonanceOverride: context.filterResonanceOverride,
      typeOverride: context.filterTypeOverride,
    }),
    envelope,
    sustainMs: context.sustainMs,
    fxRouting,
  });
}

function programValueToMs(value: number) {
  const normalized = clamp(value, 0, 100) / 100;
  return Math.pow(normalized, 3) * 5000;
}

function playSixteenLevelsVariation(state: AppState, padNumber: number) {
  const sourceBank = state.sixteenLevelsSourcePad.slice(0, 1) as PadBank;
  const sourceNumber = clamp(Number(state.sixteenLevelsSourcePad.slice(1)) || 1, 1, 16);
  const sourcePadId = `P${String(sourceNumber).padStart(2, "0")}`;
  const appliedValue = getSixteenLevelsValue(state, padNumber);
  let gainOverride: number | undefined;
  let tuneOverride: number | undefined;
  let filterCutoffOverride: number | undefined;
  let filterResonanceOverride: number | undefined;
  let filterTypeOverride: PadAssignment["filterType"] | undefined;
  let attackOverride: number | undefined;
  let decayOverride: number | undefined;
  switch (state.sixteenLevelsParameter) {
    case "VELOCITY":
      gainOverride = appliedValue / 127;
      break;
    case "TUNE":
      tuneOverride = appliedValue;
      break;
    case "FILTER":
      filterCutoffOverride = appliedValue;
      filterResonanceOverride = state.sixteenLevelsFilterResonance ?? undefined;
      filterTypeOverride = state.sixteenLevelsFilterType ?? undefined;
      break;
    case "ATTACK":
      attackOverride = appliedValue;
      break;
    case "DECAY":
      decayOverride = appliedValue;
      break;
    default:
      break;
  }
  playAssignedPadWithContext(state, {
    pad: sourcePadId,
    bank: sourceBank,
    programId: state.currentProgramId,
    gainOverride,
    tuneOverride,
    filterCutoffOverride,
    filterResonanceOverride,
    filterTypeOverride,
    attackOverride,
    decayOverride,
  });
}

function syncSelectedPadFilterToAudio(state: AppState, padAssignments: Record<PadBank, PadAssignment[]>) {
  const assignment = padAssignments[state.padBank].find((pad) => pad.pad === state.selectedPad);
  samplerEngine.updateChannelFilter(
    mixerChannelKey(state.padBank, state.selectedPad, state.currentProgramId),
    assignment ? createPadFilterOptions(assignment) : undefined,
  );
}

function tuneToPlaybackRate(semitones: number, cents: number) {
  return Math.pow(2, (semitones + cents / 100) / 12);
}

function createPadFilterOptions(
  assignment: PadAssignment,
  overrides?: {
    cutoffOverride?: number;
    resonanceOverride?: number;
    typeOverride?: PadAssignment["filterType"];
  },
) {
  const effectiveType = overrides?.typeOverride ?? assignment.filterType;
  if (effectiveType === "OFF") return undefined;
  const effectiveCutoff = overrides?.cutoffOverride ?? assignment.filterCutoff;
  const effectiveResonance = overrides?.resonanceOverride ?? assignment.filterResonance;
  const normalized = clamp(effectiveCutoff, 0, 100) / 100;
  const minHz = 80;
  const maxHz = 18000;
  const filterType: Record<Exclude<PadAssignment["filterType"], "OFF">, BiquadFilterType> = {
    LOWPASS: "lowpass",
    HIGHPASS: "highpass",
    BANDPASS: "bandpass",
  };
  return {
    type: filterType[effectiveType],
    frequency: minHz * Math.pow(maxHz / minHz, normalized),
    q: 0.0001 + clamp(effectiveResonance, 0, 100) / 10,
  };
}

function shouldPlayStepEvent(state: AppState, event: StepEvent) {
  if (isTrackMuted(state, event.trackId)) return false;
  if (event.muted) return false;
  return event.probability >= 100 || Math.random() * 100 < event.probability;
}

function createStepEventForPadImpl(state: AppState, padIdentifier: string): Partial<AppState> {
  const assignment = state.padAssignments[state.padBank].find((item) => item.pad === padIdentifier);
  const totalTicks = state.currentStepIndex * 24;
  const gridTicks = state.timingCorrect === "OFF" ? 1 : timingCorrectGridTicks(state.timingCorrect);
  const snappedTicks = state.timingCorrect === "OFF"
    ? totalTicks
    : Math.round(totalTicks / gridTicks) * gridTicks;
  const sequenceTicks = state.sequenceLengthBars * 16 * 24;
  const boundedTicks = ((snappedTicks % sequenceTicks) + sequenceTicks) % sequenceTicks;
  const stepIndex = Math.floor(boundedTicks / 24);
  const tickOffset = boundedTicks % 24;
  const newEvent = createStepEventAtPosition(stepIndex, tickOffset, padIdentifier, 100, 100, {
    sequence: getCurrentSequence(state),
    trackId: state.currentTrackId,
    trackName: getTrackName(getCurrentSequence(state), state.currentTrackId),
    sourcePad: padIdentifier,
    sourceAssignment: assignment?.assignment === "---" ? undefined : assignment?.assignment,
    padBank: state.padBank,
    programId: state.currentProgramId,
    variation: "ADD",
    duration: 0,
    length: 0,
    probability: 100,
  });
  const stepEvents = [...state.stepEvents, newEvent].sort((a, b) => eventStepIndex(a.step) - eventStepIndex(b.step));
  const newIndex = stepEvents.findIndex((event) => event.id === newEvent.id);
  return {
    stepEvents,
    sequences: updateCurrentSequenceEvents(state, stepEvents),
    ...selectedEventPatch(stepEvents, newIndex),
  };
}

function appliedValueRange(parameter: AppState["sixteenLevelsParameter"]) {
  switch (parameter) {
    case "VELOCITY": return { min: 1, max: 127 };
    case "TUNE": return { min: -12, max: 12 };
    case "FILTER": return { min: 0, max: 127 };
    case "ATTACK":
    case "DECAY": return { min: 0, max: 100 };
    default: return { min: 0, max: 127 };
  }
}

function swingApplicable(timingCorrect: AppState["timingCorrect"]) {
  return timingCorrect === "1/16" || timingCorrect === "1/8";
}

function swingOffsetTicks(state: Pick<AppState, "swing" | "timingCorrect">, stepIndex: number) {
  if (state.swing === 50 || !swingApplicable(state.timingCorrect)) return 0;
  const isSwing =
    state.timingCorrect === "1/16"
      ? stepIndex % 2 === 1
      : stepIndex % 4 === 2;
  if (!isSwing) return 0;
  const gridTicks = state.timingCorrect === "1/16" ? 24 : 48;
  return Math.round((state.swing - 50) / 50 * gridTicks);
}

function playEventsAtCurrentStep(state: AppState) {
  const sequence = getCurrentSequence(state);
  const eventsAtStep = state.stepEvents.filter(
    (event) => eventGlobalStep(event.step, sequence, 24) === state.currentStepIndex && shouldPlayStepEvent(state, event),
  );
  eventsAtStep.forEach((event) => playStepEventFromState(state, event, 0));
}

function playFirstEventInCurrentBar(state: AppState) {
  const sequence = getCurrentSequence(state);
  const barIndex = state.currentBar - 1;
  const barStart = globalStepFromBarAndStepInBar(sequence, 24, barIndex, 0);
  const barSteps = getBarStepCount(sequence, barIndex, 24);
  const barEnd = barStart + barSteps;
  const event = state.stepEvents.find((evt) => {
    const idx = eventGlobalStep(evt.step, sequence, 24);
    return idx >= barStart && idx < barEnd && shouldPlayStepEvent(state, evt);
  });
  if (event) playStepEventFromState(state, event, 0);
}

function playStepEventFromState(state: AppState, event: StepEvent, delayMs: number) {
  const eventBank = event.padBank ?? "A";
  const eventPad = padFromEvent(event);
  const eventProgramId = event.programId ?? getTrackProgramId(getCurrentSequence(state), event.trackId) ?? state.currentProgramId;
  const tuneOverride = event.appliedParameter === "TUNE" ? event.parameterValue ?? event.appliedValue : undefined;
  const filterCutoffOverride = event.appliedParameter === "FILTER" ? event.parameterValue ?? event.appliedValue : undefined;
  const filterTypeOverride = event.appliedParameter === "FILTER" ? event.appliedFilterType : undefined;
  const filterResonanceOverride = event.appliedParameter === "FILTER" ? event.appliedFilterResonance : undefined;
  const attackOverride = event.appliedParameter === "ATTACK" ? event.parameterValue ?? event.appliedValue : undefined;
  const decayOverride = event.appliedParameter === "DECAY" ? event.parameterValue ?? event.appliedValue : undefined;
  const gainOverride = event.velocity != null ? clamp(event.velocity, 0, 127) / 127 : undefined;
  const eventDuration = event.duration ?? 0;
  const sustainMs = eventDuration > 0 ? (eventDuration / 96) * (60_000 / state.bpm) : undefined;
  const context = {
    pad: eventPad,
    bank: eventBank,
    programId: eventProgramId,
    tuneOverride,
    filterCutoffOverride,
    filterTypeOverride,
    filterResonanceOverride,
    attackOverride,
    decayOverride,
    gainOverride,
    sustainMs,
  };
  if (delayMs <= 0) {
    playAssignedPadWithContext(state, context);
    return;
  }
  window.setTimeout(() => {
    const liveState = useAppStore.getState();
    if (!liveState.isPlaying || liveState.currentSequence !== state.currentSequence) return;
    playAssignedPadWithContext(liveState, context);
  }, delayMs);
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
  const programs = syncCurrentProgram(state);
  for (const program of programs) {
    for (const [bank, assignments] of Object.entries(program.padAssignments)) {
      for (const assignment of assignments) {
        if (assignmentMatchesSample(assignment.assignment, sampleName)) assigned.push(`${program.id}:${bank}${assignment.pad.slice(1)}`);
      }
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

function renameSampleInPrograms(programs: Program[], oldName: string, newName: string) {
  return programs.map((program) => ({
    ...program,
    padAssignments: renameSampleAssignments(program.padAssignments, oldName, newName),
  }));
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
  return state.performanceTracks.find((track) => track.id === trackId || track.name === trackId)?.muted ?? false;
}

function isMixerChannelAudible(channels: MixerChannel[], pad: string) {
  const channel = channels.find((item) => item.pad === pad);
  if (!channel || channel.muted) return false;
  const hasSolo = channels.some((item) => item.solo);
  return !hasSolo || channel.solo;
}

function mixerChannelKey(bank: PadBank, pad: string, programId?: string) {
  return programId ? `${programId}:${bank}:${pad}` : `${bank}:${pad}`;
}

function padActivityKey(bank: PadBank, pad: string) {
  return `${bank}:${pad}`;
}

function markPadTriggered(
  triggeredPads: Record<string, boolean>,
  bank: PadBank,
  pad: string,
  active: boolean,
) {
  return {
    ...triggeredPads,
    [padActivityKey(bank, pad)]: active,
  };
}

export function isPadVisuallyTriggered(
  triggeredPads: Record<string, boolean>,
  bank: PadBank,
  pad: string,
) {
  return Boolean(triggeredPads[padActivityKey(bank, pad)]);
}

function getMuteStopGroups(
  state: AppState,
  assignment: PadAssignment,
  pad: string,
  bank = state.padBank,
  padAssignments = state.padAssignments,
  programId?: string,
) {
  const targets = new Set<string>();
  assignment.muteTargets.forEach((targetPad) => targets.add(mixerChannelKey(bank, targetPad, programId)));
  if (assignment.chokeGroup > 0) {
    padAssignments[bank].forEach((candidate) => {
      if (candidate.pad !== pad && candidate.chokeGroup === assignment.chokeGroup) {
        targets.add(mixerChannelKey(bank, candidate.pad, programId));
      }
    });
  }
  return [...targets];
}

function syncMixerBankToAudio(bank: PadBank, channels: MixerChannel[], programId?: string) {
  channels.forEach((channel) => {
    samplerEngine.updateChannelMix(mixerChannelKey(bank, channel.pad, programId), {
      gain: channel.level / 100,
      pan: channel.pan / 64,
      audible: isMixerChannelAudible(channels, channel.pad),
    });
  });
}

function noteRepeatEffectiveRate(state: AppState): AppState["timingCorrect"] {
  return state.timingCorrect === "OFF" ? "1/16" : state.timingCorrect;
}

function noteRepeatIntervalMs(state: AppState) {
  return repeatIntervalSteps(noteRepeatEffectiveRate(state)) * (60_000 / state.bpm / 4);
}

function noteRepeatSwingApplies(rate: string) {
  return rate === "1/8" || rate === "1/16";
}

function startNoteRepeatLoop(pad: string) {
  if (noteRepeatIntervals.has(pad)) return;
  const state = useAppStore.getState();
  const intervalMs = noteRepeatIntervalMs(state);
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return;
  let tickIndex = 0;
  const scheduleNext = (delay: number) => {
    const id = window.setTimeout(() => {
      const live = useAppStore.getState();
      if (!live.noteRepeatEnabled || !noteRepeatIntervals.has(pad)) {
        noteRepeatIntervals.delete(pad);
        return;
      }
      playPadFromState(live, pad, { allowUtilityPlayback: true });
      if (live.isSequenceRecording && live.isPlaying) {
        recordNoteRepeatTick(pad);
      }
      tickIndex += 1;
      const rateNow = noteRepeatEffectiveRate(live);
      const baseInterval = noteRepeatIntervalMs(live);
      const swingApplied =
        noteRepeatSwingApplies(rateNow) && live.swing !== 50 && tickIndex % 2 === 1
          ? baseInterval * ((live.swing - 50) / 50)
          : 0;
      scheduleNext(baseInterval + swingApplied);
    }, delay);
    noteRepeatIntervals.set(pad, id);
  };
  scheduleNext(intervalMs);
}

function recordNoteRepeatTick(pad: string) {
  useAppStore.setState((state) => {
    const position = getRecordedEventPosition(state);
    const assignment = state.padAssignments[state.padBank].find((item) => item.pad === pad);
    const velocity =
      state.noteRepeatVelocityMode === "FIXED"
        ? 100
        : state.fullLevelEnabled
          ? 127
          : 96;
    const event = createStepEventAtPosition(
      position.stepIndex,
      position.tickOffset,
      pad,
      velocity,
      state.noteRepeatGate,
      {
        trackId: state.currentTrackId,
        trackName: getTrackName(getCurrentSequence(state), state.currentTrackId),
        sourcePad: pad,
        sourceAssignment: assignment?.assignment === "---" ? undefined : assignment?.assignment,
        padBank: state.padBank,
        programId: state.currentProgramId,
        variation: "REC",
        noteRepeatGenerated: true,
        duration: 0,
        length: 0,
      },
    );
    const events = [...state.stepEvents, event].sort((a, b) => eventStepIndex(a.step) - eventStepIndex(b.step));
    return {
      stepEvents: events,
      sequences: updateCurrentSequenceEvents(state, events),
    };
  });
}

function stopNoteRepeatLoop(pad: string) {
  const id = noteRepeatIntervals.get(pad);
  if (id !== undefined) {
    window.clearTimeout(id);
    noteRepeatIntervals.delete(pad);
  }
}

function stopAllNoteRepeatLoops() {
  noteRepeatIntervals.forEach((id) => window.clearTimeout(id));
  noteRepeatIntervals.clear();
}

// Legacy export retained for any callers; new behaviour uses startNoteRepeatLoop.

function createBankAssignments(): PadAssignment[] {
  return Array.from({ length: 16 }, (_, index) => ({
    pad: `P${String(index + 1).padStart(2, "0")}`,
    assignment: "---",
    mode: "ONE SHOT" as const,
    voiceMode: "POLY" as const,
    level: 100,
    tune: 0,
    fineTune: 0,
    pan: 0,
    attack: 0,
    decay: 100,
    filterType: "OFF" as const,
    filterCutoff: 50,
    filterResonance: 0,
    fxSend: 0,
    fxBus: 0 as const,
    fxSendLevel: 0,
    chokeGroup: 0,
    muteTargetMode: "OFF" as const,
    muteTargets: [],
  }));
}

function createDefaultFxBuses(): FXBus[] {
  return ([1, 2, 3, 4] as BusId[]).map((id) => ({
    id,
    effect: null,
    direct: true,
    bypass: false,
    params: {},
  }));
}

function createDefaultMasterFx(): MasterFX {
  return {
    eq: { bypass: true, params: { ...MASTER_EQ_DEFAULTS } },
    compressor: { bypass: true, params: { ...MASTER_COMP_DEFAULTS } },
  };
}

function ensurePadAssignmentFxFields(pa: PadAssignment): PadAssignment {
  if (typeof (pa as PadAssignment & { fxBus?: number }).fxBus === "number" &&
      typeof (pa as PadAssignment & { fxSendLevel?: number }).fxSendLevel === "number") {
    return pa;
  }
  return { ...pa, fxBus: 0 as const, fxSendLevel: typeof pa.fxSend === "number" ? pa.fxSend : 0 };
}

function ensureProgramFxFields(program: Program): Program {
  const banks: PadBank[] = ["A", "B", "C", "D"];
  const padAssignments = { ...program.padAssignments } as Record<PadBank, PadAssignment[]>;
  for (const bank of banks) {
    const list = padAssignments[bank] ?? [];
    padAssignments[bank] = list.map(ensurePadAssignmentFxFields);
  }
  return { ...program, padAssignments };
}

function ensureFxBusesFromManifest(input: unknown): FXBus[] {
  if (!Array.isArray(input) || input.length === 0) return createDefaultFxBuses();
  const ids: BusId[] = [1, 2, 3, 4];
  const result: FXBus[] = ids.map((id) => {
    const found = (input as Array<Record<string, unknown>>).find((b) => b && b.id === id);
    if (!found) return { id, effect: null, direct: true, bypass: false, params: {} };
    const effectRaw = found.effect;
    const effect: EffectType | null =
      effectRaw === "REVERB" || effectRaw === "DELAY" || effectRaw === "EQ" || effectRaw === "FLANGER"
        || effectRaw === "CHORUS" || effectRaw === "BITCRUSHER" || effectRaw === "COMPRESSOR"
        ? effectRaw
        : null;
    return {
      id,
      effect,
      direct: typeof found.direct === "boolean" ? found.direct : true,
      bypass: typeof found.bypass === "boolean" ? found.bypass : false,
      params: (found.params && typeof found.params === "object")
        ? { ...(found.params as EffectParamMap) }
        : (effect ? { ...EFFECT_DEFAULTS[effect] } : {}),
    };
  });
  return result;
}

function ensureMasterFxFromManifest(input: unknown): MasterFX {
  if (!input || typeof input !== "object") return createDefaultMasterFx();
  const m = input as { eq?: { bypass?: unknown; params?: unknown }; compressor?: { bypass?: unknown; params?: unknown } };
  return {
    eq: {
      bypass: typeof m.eq?.bypass === "boolean" ? m.eq.bypass : true,
      params: (m.eq?.params && typeof m.eq.params === "object")
        ? { ...MASTER_EQ_DEFAULTS, ...(m.eq.params as EffectParamMap) }
        : { ...MASTER_EQ_DEFAULTS },
    },
    compressor: {
      bypass: typeof m.compressor?.bypass === "boolean" ? m.compressor.bypass : true,
      params: (m.compressor?.params && typeof m.compressor.params === "object")
        ? { ...MASTER_COMP_DEFAULTS, ...(m.compressor.params as EffectParamMap) }
        : { ...MASTER_COMP_DEFAULTS },
    },
  };
}

/** Apply a single EQ band param to the engine. Key format e.g. "lowFreq" / "lowMidGain" / "highQ". */
function applyMasterEqParamToEngine(eqParams: EffectParamMap, key: string) {
  const map: Record<string, { idx: 0 | 1 | 2 | 3; kind: "freq" | "gain" | "q" }> = {
    lowFreq: { idx: 0, kind: "freq" }, lowGain: { idx: 0, kind: "gain" }, lowQ: { idx: 0, kind: "q" },
    lowMidFreq: { idx: 1, kind: "freq" }, lowMidGain: { idx: 1, kind: "gain" }, lowMidQ: { idx: 1, kind: "q" },
    highMidFreq: { idx: 2, kind: "freq" }, highMidGain: { idx: 2, kind: "gain" }, highMidQ: { idx: 2, kind: "q" },
    highFreq: { idx: 3, kind: "freq" }, highGain: { idx: 3, kind: "gain" }, highQ: { idx: 3, kind: "q" },
  };
  const target = map[key];
  if (!target) return;
  fxEngine.setMasterEqBand(target.idx, target.kind, eqParams[key]);
}

/** Pushes the FX state into the audio engine. Called after every FX state mutation. */
function syncFxEngine(fxBuses: FXBus[], masterFx: MasterFX) {
  for (const bus of fxBuses) {
    fxEngine.setBusBypass(bus.id, bus.bypass);
    fxEngine.setBusEffect(bus.id, bus.bypass ? null : bus.effect, bus.params);
    for (const [key, value] of Object.entries(bus.params)) {
      fxEngine.setBusParam(bus.id, key, value);
    }
  }
  fxEngine.setMasterEqBypass(masterFx.eq.bypass);
  const bandKeys: Array<[0 | 1 | 2 | 3, "low" | "lowMid" | "highMid" | "high"]> = [
    [0, "low"], [1, "lowMid"], [2, "highMid"], [3, "high"],
  ];
  for (const [idx, prefix] of bandKeys) {
    fxEngine.setMasterEqBand(idx, "freq", masterFx.eq.params[`${prefix}Freq`] ?? MASTER_EQ_DEFAULTS[`${prefix}Freq`]);
    fxEngine.setMasterEqBand(idx, "gain", masterFx.eq.params[`${prefix}Gain`] ?? MASTER_EQ_DEFAULTS[`${prefix}Gain`]);
    fxEngine.setMasterEqBand(idx, "q", masterFx.eq.params[`${prefix}Q`] ?? MASTER_EQ_DEFAULTS[`${prefix}Q`]);
  }
  fxEngine.setMasterCompBypass(masterFx.compressor.bypass);
  for (const [key, value] of Object.entries(masterFx.compressor.params)) {
    fxEngine.setMasterCompParam(key, value);
  }
}

function getParamLimits(
  field:
    | "level"
    | "tune"
    | "fineTune"
    | "pan"
    | "attack"
    | "decay"
    | "chokeGroup"
    | "filterCutoff"
    | "filterResonance"
    | "fxSend",
) {
  switch (field) {
    case "level":
      return { min: 0, max: 127 };
    case "tune":
      return { min: -24, max: 24 };
    case "fineTune":
      return { min: -100, max: 100 };
    case "pan":
      return { min: -50, max: 50 };
    case "attack":
    case "decay":
    case "filterCutoff":
    case "filterResonance":
    case "fxSend":
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
    createSequence("01", "SEQ01", 94, firstSequenceEvents),
  ];
}

function createSequence(id: string, name: string, bpm: number, events: StepEvent[]): Sequence {
  return {
    id,
    name,
    lengthBars: 4,
    timeSignature: "4/4",
    timeSignatureChanges: [{ fromBar: 0, num: 4, den: 4 }],
    bpm,
    tracks: createDefaultSequenceTracks(),
    events,
  };
}

function createDefaultSequenceTracks() {
  return [createTrack("TRACK01", "TRACK01", "PRG01")];
}

function createPrograms(): Program[] {
  return [createProgramDefinition("PRG01")];
}

function createProgramDefinition(id: string): Program {
  return {
    id,
    name: id,
    padAssignments: createPadAssignments(),
    padMixer: createPadMixer(),
    filter: { type: "OFF", cutoff: 100, resonance: 0 },
    fx: { type: "OFF", sendLevel: 0 },
  };
}

function createTrack(id: string, name: string, programId: string): Track {
  return { id, name, programId, mute: false, solo: false, type: "DRUM", output: "MAIN" };
}

function getCurrentSequence(state: Pick<AppState, "sequences" | "currentSequence">) {
  return state.sequences.find((sequence) => sequence.id === state.currentSequence) ?? state.sequences[0];
}

// Parses "n/d" string time signatures into numeric pieces. Falls back to 4/4.
function parseTimeSignature(ts: TimeSignature): { num: number; den: TimeSignatureDenominator } {
  const [n, d] = ts.split("/").map(Number);
  const num = Number.isFinite(n) && n >= 1 && n <= 31 ? n : 4;
  const denCandidate = Number.isFinite(d) ? d : 4;
  const den: TimeSignatureDenominator =
    denCandidate === 4 || denCandidate === 8 || denCandidate === 16 || denCandidate === 32
      ? denCandidate
      : 4;
  return { num, den };
}

function getTimeSignatureChanges(sequence: Sequence): TimeSignatureChange[] {
  if (sequence.timeSignatureChanges && sequence.timeSignatureChanges.length > 0) {
    return sequence.timeSignatureChanges;
  }
  const parsed = parseTimeSignature(sequence.timeSignature);
  return [{ fromBar: 0, num: parsed.num, den: parsed.den }];
}

function getTimeSignatureAtBar(sequence: Sequence, barIndex: number): { num: number; den: TimeSignatureDenominator } {
  const changes = getTimeSignatureChanges(sequence);
  let resolved = changes[0];
  for (const change of changes) {
    if (change.fromBar <= barIndex) resolved = change;
    else break;
  }
  return { num: resolved.num, den: resolved.den };
}

// Total ticks in a bar at PPQ=96. ticks_per_bar = num * (96 * 4 / den) = num * 384 / den.
function getBarTickCount(sequence: Sequence, barIndex: number): number {
  const ts = getTimeSignatureAtBar(sequence, barIndex);
  return Math.round((ts.num * 384) / ts.den);
}

// Step count per bar at the current TC grid. Each 1/16 step = 24 ticks, 1/8 = 48 ticks, etc.
function getBarStepCount(sequence: Sequence, barIndex: number, gridTicks: number): number {
  if (gridTicks <= 0) return getBarTickCount(sequence, barIndex);
  return Math.max(1, Math.floor(getBarTickCount(sequence, barIndex) / gridTicks));
}

function getBarStartTick(sequence: Sequence, barIndex: number): number {
  let total = 0;
  const safeBar = Math.min(Math.max(0, Math.floor(barIndex)), sequence.lengthBars);
  for (let i = 0; i < safeBar; i += 1) total += getBarTickCount(sequence, i);
  return total;
}

function getSequenceTotalTicks(sequence: Sequence): number {
  let total = 0;
  for (let i = 0; i < sequence.lengthBars; i += 1) total += getBarTickCount(sequence, i);
  return total;
}

function getBarAtTick(sequence: Sequence, tick: number): { barIndex: number; tickWithinBar: number } {
  let cumulative = 0;
  for (let i = 0; i < sequence.lengthBars; i += 1) {
    const barTicks = getBarTickCount(sequence, i);
    if (tick < cumulative + barTicks) {
      return { barIndex: i, tickWithinBar: tick - cumulative };
    }
    cumulative += barTicks;
  }
  const lastBarIndex = Math.max(0, sequence.lengthBars - 1);
  return {
    barIndex: lastBarIndex,
    tickWithinBar: Math.max(0, getBarTickCount(sequence, lastBarIndex) - 1),
  };
}

function ensureTimeSignatureChanges(sequence: Sequence): Sequence {
  if (sequence.timeSignatureChanges && sequence.timeSignatureChanges.length > 0) return sequence;
  const parsed = parseTimeSignature(sequence.timeSignature);
  return {
    ...sequence,
    timeSignatureChanges: [{ fromBar: 0, num: parsed.num, den: parsed.den }],
  };
}

// Cumulative step boundaries: result[i] = total steps from start of sequence through end of bar i.
function computeBarStepBoundaries(sequence: Sequence, gridTicks: number): number[] {
  const boundaries: number[] = [];
  let cumulative = 0;
  for (let i = 0; i < sequence.lengthBars; i += 1) {
    cumulative += getBarStepCount(sequence, i, gridTicks);
    boundaries.push(cumulative);
  }
  return boundaries;
}

function getSequenceTotalSteps(sequence: Sequence, gridTicks: number): number {
  let total = 0;
  for (let i = 0; i < sequence.lengthBars; i += 1) total += getBarStepCount(sequence, i, gridTicks);
  return total;
}

// Given a global step counter (0-indexed, where each step = one grid unit), returns which bar
// it lands in and the step offset within that bar.
function findBarAtGlobalStep(sequence: Sequence, gridTicks: number, globalStep: number): { bar: number; stepInBar: number; barStartStep: number } {
  if (globalStep < 0) return { bar: 0, stepInBar: 0, barStartStep: 0 };
  let cumulative = 0;
  for (let i = 0; i < sequence.lengthBars; i += 1) {
    const barSteps = getBarStepCount(sequence, i, gridTicks);
    if (globalStep < cumulative + barSteps) {
      return { bar: i, stepInBar: globalStep - cumulative, barStartStep: cumulative };
    }
    cumulative += barSteps;
  }
  const lastBar = Math.max(0, sequence.lengthBars - 1);
  const lastBarStart = cumulative - getBarStepCount(sequence, lastBar, gridTicks);
  return { bar: lastBar, stepInBar: getBarStepCount(sequence, lastBar, gridTicks) - 1, barStartStep: lastBarStart };
}

function globalStepFromBarAndStepInBar(sequence: Sequence, gridTicks: number, barIndex: number, stepInBar: number): number {
  let cumulative = 0;
  const safeBar = Math.min(Math.max(0, Math.floor(barIndex)), sequence.lengthBars - 1);
  for (let i = 0; i < safeBar; i += 1) cumulative += getBarStepCount(sequence, i, gridTicks);
  const barSteps = getBarStepCount(sequence, safeBar, gridTicks);
  const safeStep = Math.min(Math.max(0, Math.floor(stepInBar)), Math.max(0, barSteps - 1));
  return cumulative + safeStep;
}

// Helper: figure out current TC grid (in ticks) from state.
function gridTicksForState(state: Pick<AppState, "timingCorrect">): number {
  return state.timingCorrect === "OFF" ? 24 : timingCorrectGridTicks(state.timingCorrect);
}

function getTrackName(sequence: Sequence, trackId: string) {
  return sequence.tracks.find((track) => track.id === trackId)?.name ?? trackId;
}

function getTrackProgramId(sequence: Sequence, trackId: string) {
  return sequence.tracks.find((track) => track.id === trackId)?.programId;
}

function getProgramForPlayback(state: AppState, programId?: string) {
  return state.programs.find((program) => program.id === programId) ??
    state.programs.find((program) => program.id === state.currentProgramId) ??
    state.programs[0];
}

function syncCurrentProgram(
  state: Pick<AppState, "programs" | "currentProgramId" | "padAssignments" | "padMixer">,
  overrides: Partial<Pick<Program, "padAssignments" | "padMixer">> = {},
) {
  return state.programs.map((program) =>
    program.id === state.currentProgramId
      ? {
          ...program,
          padAssignments: overrides.padAssignments ?? state.padAssignments,
          padMixer: overrides.padMixer ?? state.padMixer,
        }
      : program,
  );
}

function updatePadAssignmentsForProgram(
  state: Pick<AppState, "padAssignments">,
  bank: PadBank,
  mapper: (pad: PadAssignment, index: number) => PadAssignment,
) {
  return {
    ...state.padAssignments,
    [bank]: state.padAssignments[bank].map(mapper),
  };
}

function applyCurrentSequence<T extends Pick<AppState, "sequences">>(state: T, id: string) {
  const sequence = state.sequences.find((item) => item.id === id) ?? state.sequences[0];
  const priorTracks =
    "performanceTracks" in state
      ? (state.performanceTracks as PerformanceTrack[])
      : [];
  const priorTrackId =
    "currentTrackId" in state && sequence.tracks.some((track) => track.id === state.currentTrackId)
      ? (state.currentTrackId as string)
      : sequence.tracks[0]?.id ?? "TRACK01";
  return {
    ...state,
    sequence: sequence.id,
    currentSequence: sequence.id,
    sequenceName: sequence.name,
    sequenceLengthBars: sequence.lengthBars,
    timeSignature: sequence.timeSignature,
    bpm: sequence.bpm,
    stepEvents: sequence.events,
    currentTrackId: priorTrackId,
    activeTrack: formatTrackName(getTrackName(sequence, priorTrackId), sequence.tracks.findIndex((track) => track.id === priorTrackId)),
    performanceTracks: sequence.tracks.map((track, index) => {
      const previous = priorTracks.find((item) => item.id === track.id || item.name === track.name);
      return previous ?? { id: track.id, name: track.name, muted: track.mute, solo: track.solo, activity: 28 + index * 8 };
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

function nextProgramId(programs: Program[]) {
  const next = Math.max(...programs.map((program) => Number(program.id.replace(/^PRG/, ""))), 0) + 1;
  return `PRG${String(next).padStart(2, "0")}`;
}

function moveCurrentSequence(state: AppState, delta: number): Partial<AppState> {
  const currentIndex = state.sequences.findIndex((sequence) => sequence.id === state.currentSequence);
  const nextIndex = (Math.max(currentIndex, 0) + delta + state.sequences.length) % state.sequences.length;
  return applyCurrentSequence(state, state.sequences[nextIndex].id);
}

function moveCurrentTrack(state: AppState, delta: number): Partial<AppState> {
  const sequence = getCurrentSequence(state);
  const tracks = sequence.tracks.length > 0 ? sequence.tracks : createDefaultSequenceTracks();
  const currentIndex = Math.max(tracks.findIndex((track) => track.id === state.currentTrackId), 0);
  if (delta > 0 && currentIndex === tracks.length - 1) {
    const newTrackPatch = createNextTrack(state, tracks);
    if (state.isSequenceRecording && newTrackPatch.currentTrackId !== state.currentTrackId) {
      return { ...newTrackPatch, ...refreshRecordingSessionForTrack({ ...state, ...newTrackPatch }) };
    }
    return newTrackPatch;
  }
  const nextIndex = (currentIndex + delta + tracks.length) % tracks.length;
  const currentTrackId = tracks[nextIndex].id;
  const patch: Partial<AppState> = {
    currentTrackId,
    activeTrack: formatTrackName(tracks[nextIndex].name, nextIndex),
  };
  if (state.isSequenceRecording && currentTrackId !== state.currentTrackId) {
    return { ...patch, ...refreshRecordingSessionForTrack({ ...state, currentTrackId }) };
  }
  return patch;
}

function createNextTrack(state: AppState, tracks: Track[]): Partial<AppState> {
  const currentTrackId = nextTrackId(tracks);
  const nextTrack = createTrack(currentTrackId, currentTrackId, state.currentProgramId);
  const nextTracks = [...tracks, nextTrack];
  return {
    currentTrackId,
    activeTrack: formatTrackName(nextTrack.name, nextTracks.length - 1),
    sequences: state.sequences.map((item) =>
      item.id === state.currentSequence ? { ...item, tracks: nextTracks } : item,
    ),
    performanceTracks: [...state.performanceTracks, { id: currentTrackId, name: nextTrack.name, muted: false, solo: false, activity: 28 }],
    mixerTracks: [...state.mixerTracks, { name: currentTrackId, level: 100, muted: false, solo: false }],
  };
}

function nextTrackId(tracks: Track[]) {
  const next = Math.max(...tracks.map((track) => Number(track.id.replace(/^TRACK/, ""))), 0) + 1;
  return `TRACK${String(next).padStart(2, "0")}`;
}

function renameCurrentTrack(state: AppState, name: string): Partial<AppState> {
  const sequence = getCurrentSequence(state);
  const tracks = sequence.tracks.length > 0 ? sequence.tracks : createDefaultSequenceTracks();
  const currentIndex = Math.max(tracks.findIndex((track) => track.id === state.currentTrackId), 0);
  const currentTrack = tracks[currentIndex] ?? createTrack(`TRACK${String(currentIndex + 1).padStart(2, "0")}`, `TRACK${String(currentIndex + 1).padStart(2, "0")}`, state.currentProgramId);
  const nextName = normalizeSequenceOrTrackName(name, currentTrack.name);
  const nextTracks = tracks.map((track, index) => (index === currentIndex ? { ...track, name: nextName } : track));
  const stepEvents = state.stepEvents.map((event) =>
    event.trackId === state.currentTrackId ? { ...event, trackName: nextName } : event,
  );
  return {
    activeTrack: formatTrackName(nextName, currentIndex),
    stepEvents,
    sequences: state.sequences.map((item) =>
      item.id === state.currentSequence ? { ...item, tracks: nextTracks, events: stepEvents } : item,
    ),
    performanceTracks: state.performanceTracks.map((track) =>
      track.id === state.currentTrackId ? { ...track, name: nextName } : track,
    ),
  };
}

function moveCurrentProgram(state: AppState, delta: number): Partial<AppState> {
  const currentIndex = state.programs.findIndex((program) => program.id === state.currentProgramId);
  const syncedPrograms = syncCurrentProgram(state);
  if (delta > 0 && currentIndex === state.programs.length - 1) {
    const id = nextProgramId(state.programs);
    const program = createProgramDefinition(id);
    return {
      programs: [...syncedPrograms, program],
      currentProgramId: id,
      activeProgram: program.name,
      padAssignments: program.padAssignments,
      padMixer: program.padMixer,
    };
  }
  const nextIndex = (Math.max(currentIndex, 0) + delta + state.programs.length) % state.programs.length;
  const program = syncedPrograms[nextIndex] ?? syncedPrograms[0];
  return {
    programs: syncedPrograms,
    currentProgramId: program.id,
    activeProgram: program.name,
    padAssignments: program.padAssignments,
    padMixer: program.padMixer,
  };
}

function renameCurrentProgram(state: AppState, name: string): Partial<AppState> {
  const nextName = normalizeSequenceOrTrackName(name, state.activeProgram);
  return {
    activeProgram: nextName,
    programs: state.programs.map((program) =>
      program.id === state.currentProgramId ? { ...program, name: nextName } : program,
    ),
  };
}

function formatTrackName(trackId: string, index: number) {
  return `${String(Math.max(index, 0) + 1).padStart(2, "0")} ${trackId}`;
}

function normalizeSequenceOrTrackName(name: string, fallback: string) {
  const normalized = name.toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return (normalized || fallback).slice(0, 16);
}

function createStepEvent(bar: number, step: number, pad: string, velocity: number): StepEvent {
  const quarter = Math.floor(step / 4) + 1;
  const tick = (step % 4) * 24;
  return {
    id: nextEventId(),
    step: `${String(bar + 1).padStart(3, "0")}.${quarter}.${String(tick).padStart(2, "0")}`,
    pad,
    padNumber: padNumberFromPad(pad),
    trackId: "TRACK01",
    trackName: "TRACK01",
    padBank: "A",
    programId: "PRG01",
    velocity,
    length: 0,
    duration: 0,
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
        createDiskItem("PROJECT_BOOT.ALL", "SAVE", "128 KB", "TODAY", "PRG01", "16", "--:--.---"),
        createDiskItem("SEQ01.ALL", "SEQUENCE", "4 KB", "TODAY", "PRG01", "--", "--:--.---"),
      ],
    },
    {
      id: "projects",
      label: "PROJECTS",
      items: [],
    },
    {
      id: "programs",
      label: "PROGRAMS",
      items: [
        createDiskItem("PRG01.PGM", "PROGRAM", "24 KB", "TODAY", "PRG01", "16", "--:--.---"),
      ],
    },
    {
      id: "samples",
      label: "SAMPLES",
      items: [],
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
  return screen.startsWith("UTILITY_") || screen === "COUNT_IN" || screen === "GO_TO" || screen === "ERASE" || screen === "UNDO" || screen === "SEQUENCE_EDIT" || screen === "SONG" || screen === "TIMING_CORRECT" || screen === "TIME_SIG_WINDOW" || screen === "BAR_EDITOR" || screen === "FX_SEND_WINDOW";
}

function countInModeToBeats(mode: "OFF" | "1 BAR" | "2 BAR" | "4 BAR") {
  if (mode === "OFF") return 0;
  if (mode === "1 BAR") return 4;
  if (mode === "2 BAR") return 8;
  return 16;
}

function countInModeToBars(mode: AppState["countInMode"]) {
  if (mode === "OFF") return 0;
  if (mode === "1 BAR") return 1;
  if (mode === "2 BAR") return 2;
  return 4;
}

function countInBarsToMode(bars: number): AppState["countInMode"] {
  if (bars <= 0) return "OFF";
  if (bars === 1) return "1 BAR";
  if (bars === 2) return "2 BAR";
  return "4 BAR";
}

function beatsPerBar(state: Pick<AppState, "timeSignature">) {
  switch (state.timeSignature) {
    case "2/4": return 2;
    case "3/4": return 3;
    case "4/4": return 4;
    case "5/4": return 5;
    case "6/4": return 6;
    case "6/8": return 6;
    case "7/8": return 7;
    case "9/8": return 9;
    case "12/8": return 12;
    default: return 4;
  }
}

function isFirstBeatOfBar(stepIndex: number, state: Pick<AppState, "timeSignature">) {
  return stepIndex % (beatsPerBar(state) * 4) === 0;
}

function shouldClickDuringRecord(state: Pick<AppState, "metronomeEnabled" | "metronomeDuringRecord">) {
  return state.metronomeEnabled && state.metronomeDuringRecord;
}

function playMetronomeClick(state: Pick<AppState, "metronomeEnabled" | "metronomeVolume">, accented = false) {
  if (!state.metronomeEnabled || state.metronomeVolume <= 0) return;
  void loadMetronomeBuffer().then((audioBufferId) => {
    if (!audioBufferId) return;
    samplerEngine.play(
      {
        name: "METRONOME",
        audioBufferId,
        durationMs: 120,
        waveform: [],
      },
      { gain: (state.metronomeVolume / 100) * (accented ? 2 : 1), pan: 0, previewGroup: "metronome" },
    );
  });
}

function loadMetronomeBuffer() {
  if (metronomeBufferId) return Promise.resolve(metronomeBufferId);
  metronomeLoadPromise ??= fetch(metronomeSampleUrl)
    .then((response) => response.arrayBuffer())
    .then((data) => samplerEngine.decodeAudioData(data))
    .then((buffer) => {
      metronomeBufferId = "metronome-click";
      registerSampleAudio(metronomeBufferId, buffer);
      return metronomeBufferId;
    })
    .catch(() => null);
  return metronomeLoadPromise;
}

function requestTransportStartImpl(
  action: "PLAY" | "REC",
  setState: typeof useAppStore.setState,
  getState: typeof useAppStore.getState,
) {
  const state = getState();
  const countInBeats =
    action === "REC" && state.metronomeEnabled
      ? state.metronomeCountInBars * beatsPerBar(state)
      : 0;

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
    playMetronomeClick(state, true);
    setState({
      transportPhase: "COUNT_IN",
      transportPendingAction: action,
      transportCountInBeatsRemaining: countInBeats,
      transportCountInPulse: 0,
      transportAnnouncement: "COUNT IN...",
    });
    return;
  }

  startTransportAction(action, setState, getState);
}

function startTransportAction(
  action: "PLAY" | "REC",
  setState: typeof useAppStore.setState,
  getState: typeof useAppStore.getState,
) {
  sequenceStepStartedAt = performance.now();
  const patch = {
    transportPhase: "IDLE" as const,
    transportPendingAction: null as "PLAY" | "REC" | null,
    transportCountInBeatsRemaining: 0,
    transportCountInPulse: 0,
    transportAnnouncement: "",
  };

  if (action === "PLAY") {
    setState({ ...patch, isPlaying: true, bar: "001.01.00", currentBar: 1, currentStep: 1, currentStepIndex: -1 });
  } else {
    const takeStateBefore = getState();
    const sessionPatch = startRecordingSession(takeStateBefore);
    const takeSnapshotPatch = beginRecTakeSnapshot(takeStateBefore);
    setState({
      ...patch,
      isPlaying: true,
      isSequenceRecording: true,
      transportAnnouncement: "RECORDING...",
      bar: "001.01.00",
      currentBar: 1,
      currentStep: 1,
      currentStepIndex: -1,
      ...sessionPatch,
      ...takeSnapshotPatch,
    });
  }
  // Fire first step immediately so sequence beat 1 aligns with downbeat instead of arriving
  // sixteenthMs late (= delay before first setInterval fire). Both tickers are advanced now;
  // subsequent ticks come from RuntimeClock setIntervals.
  getState().tickStepPlayback();
  getState().tickPerformance();
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
        { key: "masterVolume", label: "MASTER VOL", kind: "numeric", min: 0, max: 200, step: 5 },
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
      settings: [
        { key: "metronomeEnabled", label: "METRONOME", kind: "toggle" },
        { key: "metronomeDuringRecord", label: "DURING REC", kind: "toggle" },
        { key: "metronomeCountInBars", label: "COUNT BARS", kind: "numeric", min: 0, max: 4, step: 1 },
        { key: "metronomeVolume", label: "CLICK VOL", kind: "numeric", min: 0, max: 100, step: 5 },
      ],
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
