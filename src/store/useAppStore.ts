import { create } from "zustand";
import type { ScreenId } from "../types/navigation";
import { startRecordingCapture, type RecordingInputSource, type UnifiedCaptureSession } from "../audio/recordingCapture";
import { startNativeRecording, defaultAudioConfig as defaultAudioConfigInternal } from "../audio/native";
import { samplerEngine } from "../audio/samplerEngine";
import {
  EFFECT_DEFAULTS,
  fxEngine,
  FxEngine,
  MASTER_COMP_DEFAULTS,
  MASTER_EQ_DEFAULTS,
  type BusBlockId,
  type BusId,
  type ChainPair,
  type EffectParamMap,
  type EffectType,
} from "../audio/fxEngine";
import { createSampleId, createWaveformCache, encodeWavRegion, getSampleAudioRef, getSampleBuffer, registerSampleAudio } from "../audio/sampleLibrary";
import {
  applyOp as applySampleOp,
  DEFAULT_OP_PARAMS,
  extractRegion,
  OP_NAME_SUFFIX,
  type SampleEditOp,
  type SampleEditParams,
} from "../audio/sampleEditOps";
import metronomeSampleUrl from "../../assets/Samples/Metronome.wav?url";
import {
  loadFromBlob,
  saveBlobAsync,
  serializeProject,
  writeProjectZip,
} from "../disk";
import { encodeAudioBufferToWav } from "../disk/wavCodec";
import type { GlobalSettings, LoadedBundle, LoadedSample } from "../disk";
import {
  noteOn as midiNoteOn,
  noteOff as midiNoteOff,
  sendClock as midiSendClock,
  sendTransport as midiSendTransport,
  subscribeToInput as midiSubscribeToInput,
  type MidiMessage,
} from "../midi";
import { noteToPad, padToNote, padIdToIndex } from "../midi/mapping";
import { isTauri } from "../runtime/environment";

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
  fxChainFX1ToFX2: boolean;
  fxChainFX3ToFX4: boolean;
};

type UndoEntry = {
  label: string;
  snapshot: UndoSnapshot;
  timestamp: number;
  bucket: string;
};

// File browser (in-LCD replacement for native dialogs / HTML file inputs).
// Sub-phase A landed the Rust filesystem commands. Sub-phase B (this code)
// stands up the React component and store slice; mode wiring (preview,
// new folder, overwrite confirmation) and migration of existing flows
// follow in Sub-phases C / D respectively.
export type FileBrowserMode =
  | "LOAD_SAMPLE"
  | "LOAD_PROJECT"
  | "SAVE_SAMPLE"
  | "SAVE_PROJECT"
  | "SAVE_MIXDOWN_WAV";

export type FsLocationKind = "Drive" | "MountPoint" | "Shortcut";

// Mirrors the Rust serde shape in src-tauri/src/fs_browser.rs.
export type FsLocation = {
  label: string;
  path: string;
  kind: FsLocationKind;
};

// Mirrors FsEntry in src-tauri/src/fs_browser.rs.
export type FsEntry = {
  name: string;
  path: string;
  isDir: boolean;
  sizeBytes?: number;
  modified?: string;
  durationMs?: number;
};

// Map a browser mode to the file extension(s) the directory listing should
// filter to. Folders pass the filter regardless (navigation requirement).
function extensionsForMode(mode: FileBrowserMode): string[] {
  switch (mode) {
    case "LOAD_SAMPLE":
    case "SAVE_SAMPLE":
    case "SAVE_MIXDOWN_WAV":
      return ["wav"];
    case "LOAD_PROJECT":
    case "SAVE_PROJECT":
      return ["lthief"];
  }
}

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
  trackMuteMode: "MUTE" | "SOLO" | "GROUP" | "UNGROUP";
  padMuteMode: "MUTE" | "SOLO" | "GROUP" | "UNGROUP";
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
  fxChainFX1ToFX2: boolean;
  fxChainFX3ToFX4: boolean;
  // Sample Edit window state (Phase A — destructive sample operations)
  sampleEditSourceIndex: number;          // recordedSamples index being edited
  sampleEditOp: SampleEditOp;
  sampleEditParams: SampleEditParams;
  pendingSampleEdit: PendingSampleEdit | null;
  diskFolders: DiskFolder[];
  activeDiskFolderId: string;
  selectedDiskItemIndex: number;
  settingsCategories: SettingsCategory[];
  activeSettingsCategoryId: string;
  selectedSettingIndex: number;
  settingsValues: SettingsValues;
  midiAvailable: boolean;
  midiInputs: { id: string; name: string }[];
  midiOutputs: { id: string; name: string }[];
  triggeredPads: Record<string, boolean>;
  flashingButtons: Record<string, boolean>;
  tapHistory: number[];
  quitDialogOpen: boolean;
  quitStep: "CONFIRM" | "SAVE_FORM";
  quitStatus: "IDLE" | "SAVING" | "ERROR";
  quitErrorMessage: string;
  quitSaveFilename: string;
  requestAppQuit: () => void;
  cancelAppQuit: () => void;
  confirmAppQuit: () => Promise<void>;
  beginSaveAndQuit: () => void;
  backToQuitConfirm: () => void;
  setQuitSaveFilename: (name: string) => void;
  saveAsAndQuit: (filename: string) => Promise<void>;
  cancelSampling: () => void;
  bootResumeOpen: boolean;
  bootResumeStatus: "IDLE" | "LOADING" | "ERROR";
  bootResumeMessage: string;
  setBootResumeBlob: (blob: Blob) => void;
  acceptBootResume: () => Promise<void>;
  dismissBootResume: () => Promise<void>;
  loadLatestAutosave: () => Promise<{ ok: boolean; message: string }>;
  hasAutosaveEntry: () => Promise<boolean>;
  // -------- File browser (Sub-phases B + C) --------
  fileBrowserMode: FileBrowserMode | null;
  fileBrowserPath: string;
  fileBrowserLocations: FsLocation[];
  fileBrowserEntries: FsEntry[];
  fileBrowserSelectedIndex: number;
  fileBrowserLoading: boolean;
  fileBrowserError: string | null;
  fileBrowserReturnScreen: ScreenId;
  // Sub-phase C: F2 PREVIEW toggle + sample-preview source.
  fileBrowserPreviewEnabled: boolean;
  // Sub-phase C: filename input value in SAVE_* modes (without extension —
  // the extension is appended automatically based on mode).
  fileBrowserSaveFilename: string;
  // Sub-phase C: F2 NEW FOLDER overlay state.
  fileBrowserNewFolderOpen: boolean;
  fileBrowserNewFolderName: string;
  // Sub-phase C: overwrite-confirmation overlay. When non-null, the save
  // flow is paused waiting for the user to confirm/cancel overwrite. The
  // string holds the full destination path that would be overwritten.
  fileBrowserOverwritePath: string | null;
  // Sub-phase C: deferred result of `fileBrowserSave` after overwrite
  // confirmation. Stored so the action can resume after the user confirms.
  // (Not exposed in the interface; lives on internal closure state.)
  openFileBrowser: (mode: FileBrowserMode) => Promise<void>;
  closeFileBrowser: () => void;
  fileBrowserSelectIndex: (index: number) => void;
  fileBrowserNavigateInto: (entry: FsEntry) => Promise<void>;
  fileBrowserNavigateUp: () => Promise<void>;
  fileBrowserNavigateToLocation: (path: string) => Promise<void>;
  fileBrowserRefreshLocations: () => Promise<void>;
  // Sub-phase C — F1 OPEN / SAVE handlers, preview, overlays.
  fileBrowserOpenSelected: () => Promise<void>;
  fileBrowserTogglePreview: () => void;
  fileBrowserPreviewEntry: (entry: FsEntry) => Promise<void>;
  fileBrowserSetSaveFilename: (name: string) => void;
  fileBrowserSave: () => Promise<void>;
  fileBrowserOpenNewFolder: () => void;
  fileBrowserSetNewFolderName: (name: string) => void;
  fileBrowserConfirmNewFolder: () => Promise<void>;
  fileBrowserCancelNewFolder: () => void;
  fileBrowserConfirmOverwrite: () => Promise<void>;
  fileBrowserCancelOverwrite: () => void;
  // -------- Phase 2 audio config (Tauri native capture) --------
  audioConfig: import("../audio/native").AudioConfig;
  appliedAudioConfig: import("../audio/native").AudioConfig;
  audioDevices: import("../audio/native").AudioDevice[];
  audioBitDepth: 16 | 24 | 32;
  audioStatusMessage: string;
  /** Rolling waveform bars (0..1) accumulated from audio:frame events
   *  during native recording. Cleared on start/stop. ~128 bars max. */
  liveRecordingWaveform: number[];
  refreshAudioDevices: () => Promise<void>;
  setAudioInputDevice: (id: string) => Promise<void>;
  setAudioOutputDevice: (id: string) => Promise<void>;
  setAudioMonitorMode: (mode: "off" | "direct" | "throughfx") => Promise<void>;
  setAudioSampleRate: (rate: number) => void;
  setAudioBufferSize: (size: number) => void;
  setAudioChannels: (channels: 1 | 2) => void;
  setAudioWasapiMode: (mode: "shared" | "exclusive") => void;
  setAudioBitDepth: (depth: 16 | 24 | 32) => void;
  applyAudioSettings: () => Promise<{ ok: boolean; message: string }>;
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
  setMetronomeCountInBars: (value: number) => void;
  adjustMetronomeVolume: (delta: number) => void;
  setMetronomeVolume: (value: number) => void;
  toggleTimingCorrectionCount: () => void;
  toggleWaitPadCompat: () => void;
  requestTransportStart: (action: "PLAY" | "REC") => void;
  armSampling: () => void;
  startSampling: () => void;
  keepSampling: () => void;
  cycleInputSource: () => void;
  toggleMonitor: () => void;
  cycleThreshold: () => void;
  setThreshold: (value: number) => void;
  adjustInputGain: (delta: number) => void;
  setInputGain: (value: number) => void;
  importWavFile: (file: File) => Promise<void>;
  tickRecording: (deltaMs: number) => void;
  tickChopPlayback: () => void;
  playStart: () => void;
  tapTempo: () => void;
  triggerPad: (pad: string, velocityOverride?: number) => void;
  releasePad: (pad: string) => void;
  flashButton: (id: string) => void;
  setPadBank: (bank: PadBank) => void;
  nextPadBank: () => void;
  setPadMode: (mode: AppState["currentPadMode"]) => void;
  openUtilityWorkflow: (screen: ScreenId) => void;
  exitUtilityWorkflow: () => void;
  setGoToTarget: (target: AppState["goToTarget"]) => void;
  adjustGoToValue: (delta: number) => void;
  setGoToValue: (target: "BAR" | "STEP" | "EVENT" | "SEQ", value: number) => void;
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
  setSequenceLengthBars: (value: number) => void;
  cycleTimeSignature: (delta: number) => void;
  adjustBpm: (delta: number) => void;
  setBpm: (value: number) => void;
  adjustSwing: (delta: number) => void;
  setSwing: (value: number) => void;
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
  setNoteRepeatGate: (value: number) => void;
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
  setSongStepRepeats: (index: number, value: number) => void;
  setSongStepBars: (index: number, value: number) => void;
  setSongTotalBars: (value: number) => void;
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
  setLoopBars: (value: number) => void;
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
      | "muteGroup"
      | "filterCutoff"
      | "filterResonance"
      | "fxSend",
    delta: number,
  ) => void;
  setSelectedPadParam: (
    field:
      | "level"
      | "tune"
      | "fineTune"
      | "pan"
      | "attack"
      | "decay"
      | "chokeGroup"
      | "muteGroup"
      | "filterCutoff"
      | "filterResonance"
      | "fxSend",
    value: number,
  ) => void;
  toggleSelectedPadMode: () => void;
  toggleSelectedPadVoiceMode: () => void;
  toggleSelectedPadLoop: () => void;
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
  setSelectedEvent: (field: "velocity" | "timingOffset" | "duration" | "probability", value: number) => void;
  cycleSelectedEventTrack: () => void;
  deleteSelectedEvent: () => void;
  toggleEventMuted: (eventId: string) => void;
  addStepEventAtCurrentStep: () => void;
  armAddEvent: () => void;
  createStepEventForPad: (padIdentifier: string) => void;
  toggleStepInputAutoAdvance: () => void;
  cycleSelectedEventAppliedParameter: (delta: number) => void;
  adjustSelectedEventAppliedValue: (delta: number) => void;
  setSelectedEventAppliedValue: (value: number) => void;
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
  selectPad: (pad: string) => void;
  toggleSelectedMixerMute: () => void;
  toggleSelectedMixerSolo: () => void;
  toggleMixerChannelMute: (pad: string) => void;
  toggleMixerChannelSolo: (pad: string) => void;
  cycleSelectedMixerOutput: () => void;
  cycleTrackMuteMode: () => void;
  setTrackMuteMode: (mode: AppState["trackMuteMode"]) => void;
  setTrackGroup: (index: number, group: number) => void;
  setPadMuteMode: (mode: AppState["padMuteMode"]) => void;
  applyPadMuteAction: (pad: string) => void;
  setPadGroup: (pad: string, group: number) => void;
  clearPadMutes: () => void;
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
  exportSelectedMemorySample: () => Promise<void>;
  exportSongToWav: (filename: string) => Promise<{ ok: true; filename: string } | { ok: false; reason: string }>;
  setActiveSettingsCategory: (id: string) => void;
  selectSetting: (index: number) => void;
  adjustSelectedSetting: (delta: number) => void;
  setSelectedSetting: (value: number) => void;
  toggleSelectedSetting: () => void;
  persistSettingsNow: () => void;
  hydrateSettings: (values: Partial<SettingsValues>) => void;
  setMidiAvailable: (value: boolean) => void;
  setMidiInputs: (inputs: { id: string; name: string }[]) => void;
  setMidiOutputs: (outputs: { id: string; name: string }[]) => void;
  setMidiInputDevice: (id: string | null) => void;
  setMidiOutputDevice: (id: string | null) => void;
  setMidiPadMapping: (preset: "MPC_NATIVE" | "GM_36_51") => void;
  setMidiAutoBankSwitch: (value: boolean) => void;
  setMidiSyncIn: (mode: "OFF" | "CLOCK") => void;
  setMidiSyncOut: (mode: "OFF" | "CLOCK") => void;
  setMidiPadOut: (value: boolean) => void;
  handleMidiInputMessage: (message: MidiMessage) => void;
  // ---- FX system (Phase 2 — 2 blocks per bus + chaining) ----
  setFxBusBlockEffect: (busId: BusId, block: BusBlockId, effect: EffectType | null) => void;
  toggleFxBusBlockBypass: (busId: BusId, block: BusBlockId) => void;
  adjustFxBusBlockParam: (busId: BusId, block: BusBlockId, key: string, delta: number) => void;
  setFxBusBlockParam: (busId: BusId, block: BusBlockId, key: string, value: number) => void;
  toggleFxBusDirect: (busId: BusId) => void;
  toggleFxChain: (pair: ChainPair) => void;
  resetBusBlock: (busId: BusId, block: BusBlockId) => void;
  toggleMasterEqBypass: () => void;
  toggleMasterCompBypass: () => void;
  adjustMasterEqParam: (key: string, delta: number) => void;
  setMasterEqParam: (key: string, value: number) => void;
  adjustMasterCompParam: (key: string, delta: number) => void;
  setMasterCompParam: (key: string, value: number) => void;
  resetMasterEq: () => void;
  resetMasterComp: () => void;
  setPadFxBus: (pad: string, busId: 0 | BusId) => void;
  adjustPadFxSendLevel: (pad: string, delta: number) => void;
  setPadFxSendLevel: (pad: string, level: number) => void;
  openFxSendWindow: () => void;
  closeFxSendWindow: () => void;
  // Sample Edit window actions
  openSampleEditWindow: (preselectedOp?: SampleEditOp) => void;
  closeSampleEditWindow: () => void;
  setSampleEditOp: (op: SampleEditOp) => void;
  setSampleEditParam: <K extends keyof SampleEditParams>(key: K, value: SampleEditParams[K]) => void;
  applySampleEdit: () => Promise<void>;
  keepEditedSample: (name?: string) => void;
  overwriteEditedSample: () => void;
  retryEditedSample: () => void;
  previewEditedSample: () => void;
  createProjectSnapshot: () => ProjectSnapshot;
  saveProjectFile: (name: string) => Promise<import("../disk").SaveResult>;
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
  loop: boolean;
  // Mute group (1-16) — independent of CHOKE. When pad triggers, all other
  // pads (cross-bank, current program) with the same muteGroup value get a
  // fast-release voice stop. 0 = OFF, no mute behaviour. Coexists with
  // chokeGroup (same-bank pair) and muteTargets (explicit pad list) —
  // those mechanisms remain untouched.
  muteGroup: number;
};

// ============================================================================
// Sample Edit window — pending edit (awaiting Keep/Retry decision)
// ============================================================================
type PendingSampleEdit = {
  sourceSampleIndex: number;       // index in recordedSamples being edited
  sourceSampleName: string;
  newAudioBufferId: string;        // already registered in sampleLibrary
  newDurationSec: number;
  newDurationMs: number;
  newSampleRate: number;
  newChannelCount: number;
  newWaveform: number[];
  opLabel: string;                 // "REVERSED" / "STRETCHED" etc. (for UI message)
  proposedName: string;
};

// ============================================================================
// FX system state types (Phase 2 — MPC5000 routing model with 2 blocks per bus + chaining)
// ============================================================================
type FXBlock = {
  effect: EffectType | null;   // null = block OFF (passthrough)
  bypass: boolean;             // bypass routes around this block (passthrough)
  params: EffectParamMap;      // per-effect params; switching effect resets to defaults
};

type FXBus = {
  id: BusId;
  blockA: FXBlock;
  blockB: FXBlock;
  direct: boolean;             // SEND vs INSERT (per-bus, not per-block)
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
  group: number;
};

type PerformanceTrack = {
  id: string;
  name: string;
  muted: boolean;
  solo: boolean;
  activity: number;
  group: number;
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
  autosaveIntervalSec: number;
  latency: number;
  masterVolume: number;
  audioInputSource: "SYSTEM AUDIO" | "LINE IN" | "USB";
  midiInputDeviceId: string | null;
  midiOutputDeviceId: string | null;
  midiPadMapping: "MPC_NATIVE" | "GM_36_51";
  midiAutoBankSwitch: boolean;
  midiSyncIn: "OFF" | "CLOCK";
  midiSyncOut: "OFF" | "CLOCK";
  midiPadOut: boolean;
  // FileBrowser per-mode last-used directory. Persisted in loopthief.settings
  // so opening LOAD_SAMPLE / SAVE_PROJECT etc. lands the user back where they
  // were last time. null = no persisted value yet → use Desktop / first drive.
  // CANCEL does NOT update; only successful F1 OPEN / F1 SAVE writes here.
  fileBrowserPaths: {
    LOAD_SAMPLE: string | null;
    LOAD_PROJECT: string | null;
    SAVE_SAMPLE: string | null;
    SAVE_PROJECT: string | null;
    SAVE_MIXDOWN_WAV: string | null;
  };
};

let eventIdCounter = 0;
let activeRecordingCapture: UnifiedCaptureSession | null = null;
// Module-scoped blob handed in by App.tsx during boot-resume detection.
// Kept off the React store because Blobs are large + not serialisable.
let bootResumeBlob: Blob | null = null;
let sequenceStepStartedAt = typeof performance !== "undefined" ? performance.now() : 0;
let metronomeBufferId: string | null = null;
let metronomeLoadPromise: Promise<string | null> | null = null;
let lastStopAt = 0;
let firstTickPending = false;
const noteRepeatIntervals = new Map<string, number>();

// In-progress notes during sequence recording. NoteOn stores press position;
// NoteOff (releasePad) finalizes the StepEvent with real duration = release
// tick − press tick. Keyed by `${physicalBank}:${physicalPad}` so 16 LEVELS
// variations resolve correctly (key = location of the physical press).
type ActiveRecordingNote = {
  startTickAbsolute: number;
  startStepIndex: number;
  startTickOffset: number;
  velocity: number;
  bank: PadBank;
  pad: string;
  sourcePad: string;
  programId?: string;
  trackId: string;
  trackName?: string;
  sourceAssignment?: string;
  appliedParameter?: AppState["sixteenLevelsParameter"];
  appliedValue?: number;
  parameterValue?: number;
  appliedFilterType?: PadAssignment["filterType"];
  appliedFilterResonance?: number;
};

const activeRecordingNotes = new Map<string, ActiveRecordingNote>();

function activeNoteKey(bank: PadBank, pad: string): string {
  return `${bank}:${pad}`;
}

function captureAbsoluteTick(state: AppState): { absTick: number; stepIndex: number; tickOffset: number } {
  const ppqMs = 60_000 / state.bpm / 96;
  const elapsedTicks = ppqMs > 0 ? Math.round((performance.now() - sequenceStepStartedAt) / ppqMs) : 0;
  const tickOffset = clamp(elapsedTicks, 0, 23);
  const absTick = Math.max(0, state.currentStepIndex) * 24 + tickOffset;
  return { absTick, stepIndex: state.currentStepIndex, tickOffset };
}

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
  bpm: 96,
  swing: 54,
  timingCorrect: "1/16",
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
    { id: "TRACK01", name: "TRACK01", muted: false, solo: false, activity: 28, group: 0 },
  ],
  trackMuteMode: "MUTE",
  padMuteMode: "MUTE",
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
  fxChainFX1ToFX2: false,
  fxChainFX3ToFX4: false,
  sampleEditSourceIndex: 0,
  sampleEditOp: "TIME_STRETCH" as SampleEditOp,
  sampleEditParams: { ...DEFAULT_OP_PARAMS.TIME_STRETCH },
  pendingSampleEdit: null,
  diskFolders: createDiskFolders(),
  activeDiskFolderId: "memory",
  selectedDiskItemIndex: 0,
  settingsCategories: createSettingsCategories(),
  activeSettingsCategoryId: "masterVolume",
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
    autosaveIntervalSec: 60,
    latency: 8,
    masterVolume: 100,
    audioInputSource: "SYSTEM AUDIO",
    midiInputDeviceId: null,
    midiOutputDeviceId: null,
    midiPadMapping: "MPC_NATIVE",
    midiAutoBankSwitch: true,
    midiSyncIn: "OFF",
    midiSyncOut: "OFF",
    midiPadOut: false,
    fileBrowserPaths: {
      LOAD_SAMPLE: null,
      LOAD_PROJECT: null,
      SAVE_SAMPLE: null,
      SAVE_PROJECT: null,
      SAVE_MIXDOWN_WAV: null,
    },
  },
  midiAvailable: false,
  midiInputs: [],
  midiOutputs: [],
  triggeredPads: {},
  flashingButtons: {},
  tapHistory: [],
  quitDialogOpen: false,
  quitStep: "CONFIRM",
  quitStatus: "IDLE",
  quitErrorMessage: "",
  quitSaveFilename: "loopthief_project",
  bootResumeOpen: false,
  bootResumeStatus: "IDLE",
  bootResumeMessage: "",
  fileBrowserMode: null,
  fileBrowserPath: "",
  fileBrowserLocations: [],
  fileBrowserEntries: [],
  fileBrowserSelectedIndex: 0,
  fileBrowserLoading: false,
  fileBrowserError: null,
  fileBrowserReturnScreen: "MAIN",
  fileBrowserPreviewEnabled: true,
  fileBrowserSaveFilename: "",
  fileBrowserNewFolderOpen: false,
  fileBrowserNewFolderName: "",
  fileBrowserOverwritePath: null,
  audioConfig: defaultAudioConfigInternal(),
  appliedAudioConfig: defaultAudioConfigInternal(),
  audioDevices: [],
  audioBitDepth: 16,
  audioStatusMessage: "",
  liveRecordingWaveform: [],
  refreshAudioDevices: async () => {
    if (!isTauri()) return;
    try {
      const native = await import("../audio/native");
      const devices = await native.listAudioDevices();
      set({ audioDevices: devices });
    } catch (err) {
      set({ audioStatusMessage: err instanceof Error ? err.message : "Device list failed" });
    }
  },
  setAudioInputDevice: async (id: string) => {
    const next = { ...get().audioConfig, inputDeviceId: id };
    set({ audioConfig: next });
    if (!isTauri()) return;
    try {
      const native = await import("../audio/native");
      await native.setInputDevice(id);
      // Hot-swap counts as applied — keeps dirty flag accurate.
      set((s) => ({
        appliedAudioConfig: { ...s.appliedAudioConfig, inputDeviceId: id },
        audioStatusMessage: "Input device switched",
      }));
      // Loopback input forces monitor off.
      if (id.startsWith("loopback::")) {
        await get().setAudioMonitorMode("off");
      }
    } catch (err) {
      set({ audioStatusMessage: err instanceof Error ? err.message : "Input swap failed" });
    }
  },
  setAudioOutputDevice: async (id: string) => {
    const next = { ...get().audioConfig, outputDeviceId: id };
    set({ audioConfig: next });
    if (!isTauri()) return;
    try {
      const native = await import("../audio/native");
      await native.setOutputDevice(id);
      set((s) => ({
        appliedAudioConfig: { ...s.appliedAudioConfig, outputDeviceId: id },
        audioStatusMessage: "Output device switched",
      }));
    } catch (err) {
      set({ audioStatusMessage: err instanceof Error ? err.message : "Output swap failed" });
    }
  },
  setAudioMonitorMode: async (mode) => {
    const next = { ...get().audioConfig, monitorMode: mode };
    set({ audioConfig: next });
    if (!isTauri()) return;
    try {
      const native = await import("../audio/native");
      await native.setMonitorMode(mode);
      // Toggle JS-side monitor playback. Through FX routes via fxEngine's
      // master input (the same node sampler voices use); Direct goes to
      // AudioContext.destination. Off detaches the listener entirely.
      if (mode === "off") {
        await native.stopMonitor();
      } else {
        let fxMasterInput: AudioNode | null = null;
        if (mode === "throughfx") {
          try {
            const { fxEngine } = await import("../audio/fxEngine");
            fxMasterInput = fxEngine.getMasterInput();
          } catch {
            fxMasterInput = null;
          }
        }
        await native.startMonitor(mode, fxMasterInput);
      }
      set((s) => ({
        appliedAudioConfig: { ...s.appliedAudioConfig, monitorMode: mode },
        audioStatusMessage: mode === "off" ? "Monitor off" : `Monitor ${mode}`,
      }));
    } catch (err) {
      set({ audioStatusMessage: err instanceof Error ? err.message : "Monitor swap failed" });
    }
  },
  setAudioSampleRate: (rate: number) =>
    set((s) => ({ audioConfig: { ...s.audioConfig, sampleRate: rate } })),
  setAudioBufferSize: (size: number) =>
    set((s) => ({ audioConfig: { ...s.audioConfig, bufferSize: size } })),
  setAudioChannels: (channels: 1 | 2) =>
    set((s) => ({ audioConfig: { ...s.audioConfig, channels } })),
  setAudioWasapiMode: (mode: "shared" | "exclusive") =>
    set((s) => ({ audioConfig: { ...s.audioConfig, wasapiMode: mode } })),
  setAudioBitDepth: (depth: 16 | 24 | 32) => set({ audioBitDepth: depth }),
  applyAudioSettings: async () => {
    if (!isTauri()) {
      // Browser mode — bit depth still persists but nothing to restart.
      set((s) => ({ appliedAudioConfig: { ...s.audioConfig } }));
      return { ok: true, message: "Browser mode — settings saved" };
    }
    try {
      const native = await import("../audio/native");
      await native.restartEngine(get().audioConfig);
      set((s) => ({
        appliedAudioConfig: { ...s.audioConfig },
        audioStatusMessage: "Audio engine restarted",
      }));
      return { ok: true, message: "Audio engine restarted" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Restart failed";
      set({ audioStatusMessage: msg });
      return { ok: false, message: msg };
    }
  },
  requestAppQuit: () => {
    const state = get();
    // Block quit while transport / sampling is active. User must STOP first.
    // Same path is used by QUIT button, Ctrl+Q, Alt+F4, and the Tauri title-bar X.
    if (
      state.isPlaying ||
      state.isSequenceRecording ||
      state.overdubEnabled ||
      state.isSampling ||
      state.isSamplingArmed
    ) {
      set({ lastAudioMessage: "CANNOT QUIT — STOP TRANSPORT FIRST" });
      return;
    }
    set({
      quitDialogOpen: true,
      quitStep: "CONFIRM",
      quitStatus: "IDLE",
      quitErrorMessage: "",
    });
  },
  cancelAppQuit: () =>
    set({
      quitDialogOpen: false,
      quitStep: "CONFIRM",
      quitStatus: "IDLE",
      quitErrorMessage: "",
    }),
  confirmAppQuit: async () => {
    try {
      await closeApplicationWindow();
      // If close succeeds we never reach this line — destroy() / window.close()
      // unmounts the page. Reaching it means browser blocked the close OR
      // Tauri lacked the destroy permission; surface as ERROR so the user sees
      // a clear message instead of a frozen dialog.
      set({
        quitStatus: "ERROR",
        quitErrorMessage: isTauri()
          ? "Window close blocked. Check Tauri permissions."
          : "Browser blocked close. Close the tab manually.",
      });
    } catch (err) {
      set({
        quitStatus: "ERROR",
        quitErrorMessage: err instanceof Error ? err.message : "Close failed",
      });
    }
  },
  beginSaveAndQuit: () => {
    // Tauri: skip the SAVE_FORM stage — the native Save As… dialog already
    // gives the user filename + path. Browser: keep SAVE_FORM with the
    // filename input + anchor-download flow.
    if (isTauri()) {
      void get().saveAsAndQuit(get().quitSaveFilename);
      return;
    }
    set({ quitStep: "SAVE_FORM", quitStatus: "IDLE", quitErrorMessage: "" });
  },
  backToQuitConfirm: () =>
    set({ quitStep: "CONFIRM", quitStatus: "IDLE", quitErrorMessage: "" }),
  setQuitSaveFilename: (name: string) => set({ quitSaveFilename: name }),
  saveAsAndQuit: async (filename: string) => {
    const trimmed = filename.trim() || "loopthief_project";
    set({ quitStatus: "SAVING", quitErrorMessage: "" });
    let result: import("../disk").SaveResult;
    try {
      result = await Promise.race([
        get().saveProjectFile(trimmed),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Save timeout (10s)")), 10000),
        ),
      ]);
    } catch (err) {
      set({
        quitStatus: "ERROR",
        quitErrorMessage: err instanceof Error ? err.message : "Save failed",
      });
      return;
    }
    if (!result.ok) {
      if (result.reason === "cancelled") {
        // User cancelled the native Save As… dialog (or Tauri-mode short-circuit
        // from beginSaveAndQuit). Drop back to the CONFIRM stage so they can
        // pick YES / NO / SAVE & QUIT again.
        set({ quitStep: "CONFIRM", quitStatus: "IDLE", quitErrorMessage: "" });
        return;
      }
      set({
        quitStatus: "ERROR",
        quitErrorMessage: result.reason,
      });
      return;
    }
    try {
      await closeApplicationWindow();
      set({
        quitStatus: "ERROR",
        quitErrorMessage: isTauri()
          ? "Saved, but window close blocked. Check Tauri permissions."
          : "Saved. Browser blocked close — close the tab manually.",
      });
    } catch (err) {
      set({
        quitStatus: "ERROR",
        quitErrorMessage: err instanceof Error
          ? `Saved, but close failed: ${err.message}`
          : "Saved, but close failed",
      });
    }
  },
  cancelSampling: () => {
    const capture = activeRecordingCapture;
    activeRecordingCapture = null;
    if (capture) {
      // Fire-and-forget cancel — discard the recording. UnifiedCaptureSession
      // exposes cancel() (returns Promise<void>) for both backends.
      void capture.cancel().catch(() => undefined);
    }
    set({
      isSampling: false,
      isSamplingArmed: false,
      inputLevel: 0,
      importStatus: "IDLE",
      importMessage: "CANCELLED",
    });
  },
  setBootResumeBlob: (blob: Blob) => {
    bootResumeBlob = blob;
    set({ bootResumeOpen: true, bootResumeStatus: "IDLE", bootResumeMessage: "" });
  },
  acceptBootResume: async () => {
    const blob = bootResumeBlob;
    if (!blob) {
      set({ bootResumeOpen: false });
      return;
    }
    set({ bootResumeStatus: "LOADING", bootResumeMessage: "Restoring…" });
    try {
      await get().loadFile(blob);
      bootResumeBlob = null;
      set({ bootResumeOpen: false, bootResumeStatus: "IDLE", bootResumeMessage: "" });
    } catch (err) {
      set({
        bootResumeStatus: "ERROR",
        bootResumeMessage: err instanceof Error ? err.message : "Restore failed",
      });
    }
  },
  dismissBootResume: async () => {
    bootResumeBlob = null;
    try {
      const { clearAutosave } = await import("../disk");
      await clearAutosave();
    } catch {
      /* ignore — clearing autosave is best-effort */
    }
    set({ bootResumeOpen: false, bootResumeStatus: "IDLE", bootResumeMessage: "" });
  },
  loadLatestAutosave: async () => {
    try {
      const { readAutosave } = await import("../disk");
      const blob = await readAutosave();
      if (!blob) return { ok: false, message: "No autosave found" };
      await get().loadFile(blob);
      return { ok: true, message: "Autosave restored" };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Restore failed",
      };
    }
  },
  // ---------- File browser (Sub-phase B) ----------
  // openFileBrowser: enter the LCD viewport file browser in the given mode.
  // Fetches the locations cache (cold first call, instant thereafter) and
  // lists the first location's directory as the starting view. The previous
  // screen is stashed in `fileBrowserReturnScreen` so closeFileBrowser can
  // route back without callers having to remember.
  //
  // Requires Tauri runtime — the Rust fs_browser commands aren't available
  // in browser dev mode. Browser fallback path stays on the existing HTML
  // file inputs until Sub-phase D migration.
  openFileBrowser: async (mode) => {
    if (!isTauri()) {
      set({ lastAudioMessage: "FILE BROWSER REQUIRES DESKTOP APP" });
      return;
    }
    stopFileBrowserPreview();
    const { invoke } = await import("@tauri-apps/api/core");
    const prevScreen = get().activeScreen;
    const state = get();
    const defaultFilename = suggestSaveFilename(mode, state);
    set({
      activeScreen: "FILE_BROWSER",
      fileBrowserMode: mode,
      fileBrowserReturnScreen: prevScreen,
      fileBrowserLoading: true,
      fileBrowserError: null,
      fileBrowserEntries: [],
      fileBrowserSelectedIndex: 0,
      fileBrowserSaveFilename: defaultFilename,
      fileBrowserNewFolderOpen: false,
      fileBrowserNewFolderName: "",
      fileBrowserOverwritePath: null,
    });
    try {
      const locations = await invoke<FsLocation[]>("fs_list_locations", {});
      // Persisted-path fallback chain:
      //   1. settingsValues.fileBrowserPaths[mode] if it still exists on disk
      //   2. Desktop shortcut (kind === "Shortcut" in the locations list)
      //   3. First location (drives / mounts)
      //   4. Empty (caller hits the "No locations available" branch below)
      const persisted = state.settingsValues.fileBrowserPaths[mode];
      let startPath = "";
      if (persisted) {
        const exists = await invoke<boolean>("fs_path_exists", { path: persisted })
          .catch(() => false);
        if (exists) {
          startPath = persisted;
        }
      }
      if (!startPath) {
        const desktop = locations.find((loc) => loc.kind === "Shortcut");
        startPath = desktop?.path ?? locations[0]?.path ?? "";
      }
      if (!startPath) {
        set({
          fileBrowserLocations: locations,
          fileBrowserPath: "",
          fileBrowserEntries: [],
          fileBrowserLoading: false,
          fileBrowserError: "No locations available",
        });
        return;
      }
      const entries = await invoke<FsEntry[]>("fs_list_directory", {
        path: startPath,
        extensions: extensionsForMode(mode),
      });
      set({
        fileBrowserLocations: locations,
        fileBrowserPath: startPath,
        fileBrowserEntries: entries,
        fileBrowserSelectedIndex: 0,
        fileBrowserLoading: false,
        fileBrowserError: null,
      });
    } catch (err) {
      set({
        fileBrowserLoading: false,
        fileBrowserError: err instanceof Error ? err.message : String(err),
      });
    }
  },
  closeFileBrowser: () => {
    stopFileBrowserPreview();
    set((state) => ({
      activeScreen: state.fileBrowserReturnScreen,
      fileBrowserMode: null,
      fileBrowserPath: "",
      fileBrowserEntries: [],
      fileBrowserSelectedIndex: 0,
      fileBrowserLoading: false,
      fileBrowserError: null,
      fileBrowserSaveFilename: "",
      fileBrowserNewFolderOpen: false,
      fileBrowserNewFolderName: "",
      fileBrowserOverwritePath: null,
    }));
  },
  fileBrowserSelectIndex: (index) =>
    set((state) => ({
      fileBrowserSelectedIndex: clamp(
        index,
        0,
        Math.max(0, state.fileBrowserEntries.length - 1),
      ),
    })),
  // Navigate into a folder entry. No-op if entry is a file — Sub-phase C
  // wires file selection / OPEN softkey behaviour.
  fileBrowserNavigateInto: async (entry) => {
    if (!entry.isDir) return;
    if (!isTauri()) return;
    const { invoke } = await import("@tauri-apps/api/core");
    const mode = get().fileBrowserMode;
    if (!mode) return;
    set({ fileBrowserLoading: true, fileBrowserError: null });
    try {
      const entries = await invoke<FsEntry[]>("fs_list_directory", {
        path: entry.path,
        extensions: extensionsForMode(mode),
      });
      set({
        fileBrowserPath: entry.path,
        fileBrowserEntries: entries,
        fileBrowserSelectedIndex: 0,
        fileBrowserLoading: false,
      });
    } catch (err) {
      set({
        fileBrowserLoading: false,
        fileBrowserError: err instanceof Error ? err.message : String(err),
      });
    }
  },
  // ".." parent navigation. Computed locally via string slice — Rust side
  // would canonicalise but for display purposes JS path math is fine.
  // No-op when already at a drive/mount root (parent would escape the
  // location). The UI hides the ".." row in that case.
  fileBrowserNavigateUp: async () => {
    if (!isTauri()) return;
    const state = get();
    const mode = state.fileBrowserMode;
    if (!mode) return;
    const parent = computeParentPath(state.fileBrowserPath);
    if (!parent) return;
    const { invoke } = await import("@tauri-apps/api/core");
    set({ fileBrowserLoading: true, fileBrowserError: null });
    try {
      const entries = await invoke<FsEntry[]>("fs_list_directory", {
        path: parent,
        extensions: extensionsForMode(mode),
      });
      set({
        fileBrowserPath: parent,
        fileBrowserEntries: entries,
        fileBrowserSelectedIndex: 0,
        fileBrowserLoading: false,
      });
    } catch (err) {
      set({
        fileBrowserLoading: false,
        fileBrowserError: err instanceof Error ? err.message : String(err),
      });
    }
  },
  fileBrowserNavigateToLocation: async (path) => {
    if (!isTauri()) return;
    const mode = get().fileBrowserMode;
    if (!mode) return;
    const { invoke } = await import("@tauri-apps/api/core");
    set({ fileBrowserLoading: true, fileBrowserError: null });
    try {
      const entries = await invoke<FsEntry[]>("fs_list_directory", {
        path,
        extensions: extensionsForMode(mode),
      });
      set({
        fileBrowserPath: path,
        fileBrowserEntries: entries,
        fileBrowserSelectedIndex: 0,
        fileBrowserLoading: false,
      });
    } catch (err) {
      set({
        fileBrowserLoading: false,
        fileBrowserError: err instanceof Error ? err.message : String(err),
      });
    }
  },
  fileBrowserRefreshLocations: async () => {
    if (!isTauri()) return;
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      const locations = await invoke<FsLocation[]>("fs_list_locations", {
        forceRefresh: true,
      });
      set({ fileBrowserLocations: locations });
    } catch (err) {
      set({ fileBrowserError: err instanceof Error ? err.message : String(err) });
    }
  },
  // ---------- File browser Sub-phase C ----------
  fileBrowserTogglePreview: () => {
    stopFileBrowserPreview();
    set((state) => ({ fileBrowserPreviewEnabled: !state.fileBrowserPreviewEnabled }));
  },
  fileBrowserSetSaveFilename: (name) => set({ fileBrowserSaveFilename: name }),
  // F1 OPEN — mode-dispatched read flow. LOAD_SAMPLE wraps the file bytes
  // in a synthetic File and routes through the existing importWavFile path
  // (which already handles decode + sample-library registration). LOAD_PROJECT
  // builds a Blob and routes through loadFile (which handles .lthief unzip,
  // project hydration, FX engine sync, etc.). On success the browser closes
  // and the return screen is shown.
  fileBrowserOpenSelected: async () => {
    if (!isTauri()) return;
    const state = get();
    const entry = state.fileBrowserEntries[state.fileBrowserSelectedIndex];
    if (!entry || entry.isDir) return;
    const mode = state.fileBrowserMode;
    if (mode !== "LOAD_SAMPLE" && mode !== "LOAD_PROJECT") return;
    set({ fileBrowserLoading: true, fileBrowserError: null });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const bytes = await invoke<number[] | Uint8Array>("fs_read_file_bytes", {
        path: entry.path,
      });
      // Tauri 2 returns Vec<u8> as a number[]; normalise to a fresh
      // Uint8Array backed by a non-shared ArrayBuffer (passes BlobPart type).
      const u8 = new Uint8Array(bytes as ArrayLike<number>);
      if (mode === "LOAD_SAMPLE") {
        const file = new File([u8 as BlobPart], entry.name, { type: "audio/wav" });
        await get().importWavFile(file);
      } else {
        const blob = new Blob([u8 as BlobPart], { type: "application/octet-stream" });
        await get().loadFile(blob);
      }
      // Persist the directory we loaded from so the next open of this mode
      // lands here. Captures the path AT THE MOMENT OF SUCCESS — cancel /
      // error paths don't fall through to this branch.
      persistFileBrowserPath(get, set, mode, state.fileBrowserPath);
      stopFileBrowserPreview();
      get().closeFileBrowser();
    } catch (err) {
      set({
        fileBrowserLoading: false,
        fileBrowserError: err instanceof Error ? err.message : String(err),
      });
    }
  },
  // PREVIEW playback for LOAD_SAMPLE. Reads bytes via fs_read_file_bytes,
  // decodes via samplerEngine's AudioContext, plays through a dedicated
  // BufferSource that connects to ctx.destination (bypassing sample-library
  // registration — preview is ephemeral, not a real import). Tracks the
  // active source for stop-on-next-select / stop-on-close.
  fileBrowserPreviewEntry: async (entry) => {
    if (!isTauri()) return;
    if (entry.isDir) return;
    const state = get();
    if (state.fileBrowserMode !== "LOAD_SAMPLE") return;
    if (!state.fileBrowserPreviewEnabled) return;
    if (!isWavName(entry.name)) return;
    stopFileBrowserPreview();
    // Capture the just-incremented token so we can detect if a NEWER call
    // ran during our awaits (fs_read_file_bytes + decodeAudioData). Without
    // this gate, two rapid clicks each fire their stop() before the other's
    // source-start, and both sources end up playing — only the latest gets
    // tracked in activeFileBrowserPreview, the earlier one plays untracked
    // until natural end. With this gate the earlier call detects the
    // token mismatch and stops its own source before publishing it.
    const myToken = fileBrowserPreviewToken;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const bytes = await invoke<number[] | Uint8Array>("fs_read_file_bytes", {
        path: entry.path,
      });
      if (fileBrowserPreviewToken !== myToken) return;
      const u8 = new Uint8Array(bytes as ArrayLike<number>);
      const buffer = await samplerEngine.decodeAudioData(u8.buffer as ArrayBuffer);
      if (fileBrowserPreviewToken !== myToken) return;
      const ctx = samplerEngine.getContext();
      if (!ctx) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        if (activeFileBrowserPreview === source) {
          activeFileBrowserPreview = null;
        }
      };
      source.start();
      // Final gate: if the token moved between decode and start, our source
      // is already obsolete — stop it immediately, don't publish.
      if (fileBrowserPreviewToken !== myToken) {
        try { source.stop(); } catch { /* not started */ }
        try { source.disconnect(); } catch { /* not connected */ }
        return;
      }
      activeFileBrowserPreview = source;
    } catch {
      // Best-effort preview — silently bail on decode failure. The list still
      // shows the file; user can try F1 OPEN to get the proper error path.
    }
  },
  // F1 SAVE — mode-dispatched serialize-and-write. Checks overwrite via
  // fs_path_exists before write. If file exists, sets fileBrowserOverwritePath
  // and bails; the UI shows the confirmation overlay; user F1 OVERWRITE or
  // F3 CANCEL resolves it.
  fileBrowserSave: async () => {
    if (!isTauri()) return;
    const state = get();
    const mode = state.fileBrowserMode;
    if (
      mode !== "SAVE_SAMPLE" &&
      mode !== "SAVE_PROJECT" &&
      mode !== "SAVE_MIXDOWN_WAV"
    ) {
      return;
    }
    const filename = sanitizeSaveFilename(state.fileBrowserSaveFilename);
    if (!filename) {
      set({ fileBrowserError: "Filename required" });
      return;
    }
    const extension = mode === "SAVE_PROJECT" ? "lthief" : "wav";
    const fullName = filename.toLowerCase().endsWith(`.${extension}`)
      ? filename
      : `${filename}.${extension}`;
    const fullPath = joinPath(state.fileBrowserPath, fullName);
    const { invoke } = await import("@tauri-apps/api/core");
    const exists = await invoke<boolean>("fs_path_exists", { path: fullPath })
      .catch(() => false);
    if (exists) {
      set({ fileBrowserOverwritePath: fullPath });
      return;
    }
    await performFileBrowserWrite(get, set, mode, fullPath);
  },
  fileBrowserConfirmOverwrite: async () => {
    const state = get();
    const target = state.fileBrowserOverwritePath;
    const mode = state.fileBrowserMode;
    if (!target || !mode) return;
    set({ fileBrowserOverwritePath: null });
    if (
      mode === "SAVE_SAMPLE" ||
      mode === "SAVE_PROJECT" ||
      mode === "SAVE_MIXDOWN_WAV"
    ) {
      await performFileBrowserWrite(get, set, mode, target);
    }
  },
  fileBrowserCancelOverwrite: () => set({ fileBrowserOverwritePath: null }),
  // F2 NEW FOLDER overlay — open / set name / confirm / cancel.
  fileBrowserOpenNewFolder: () =>
    set({ fileBrowserNewFolderOpen: true, fileBrowserNewFolderName: "" }),
  fileBrowserSetNewFolderName: (name) => set({ fileBrowserNewFolderName: name }),
  fileBrowserCancelNewFolder: () =>
    set({ fileBrowserNewFolderOpen: false, fileBrowserNewFolderName: "" }),
  fileBrowserConfirmNewFolder: async () => {
    if (!isTauri()) return;
    const state = get();
    const trimmed = state.fileBrowserNewFolderName.trim();
    if (!trimmed) return;
    // Block path-separator characters so the user can't accidentally create
    // a multi-level path (fs_create_folder refuses missing parents anyway,
    // but rejecting here gives a clearer error).
    if (/[\\/]/.test(trimmed)) {
      set({ fileBrowserError: "Folder name cannot contain / or \\" });
      return;
    }
    const newPath = joinPath(state.fileBrowserPath, trimmed);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke<void>("fs_create_folder", { path: newPath });
      set({ fileBrowserNewFolderOpen: false, fileBrowserNewFolderName: "" });
      await get().fileBrowserNavigateToLocation(newPath);
    } catch (err) {
      set({ fileBrowserError: err instanceof Error ? err.message : String(err) });
    }
  },
  hasAutosaveEntry: async () => {
    try {
      const { readAutosave } = await import("../disk");
      const blob = await readAutosave();
      return blob !== null;
    } catch {
      return false;
    }
  },
  setActiveScreen: (activeScreen) => set({ activeScreen }),
  togglePlay: () => {
    void samplerEngine.ensureReady();
    const state = get();
    if (state.isPlaying) {
      emitMidiTransportFromStore("STOP");
      activeRecordingNotes.clear();
      set({
        isPlaying: false,
        transportPhase: "IDLE",
        transportPendingAction: null,
        transportCountInBeatsRemaining: 0,
        transportAnnouncement: "",
      });
      return;
    }
    emitMidiTransportFromStore("START");
    requestTransportStartImpl("PLAY", set, get);
  },
  stopPlayback: () => {
    const now = performance.now();
    const isDoubleStop = now - lastStopAt < 500;
    lastStopAt = now;
    stopAllNoteRepeatLoops();
    // Transport STOP kills the FileBrowser sample preview too — users
    // expect a global STOP to silence everything audible regardless of
    // which screen owns the source. F2 PREVIEW toggle + close-browser
    // already invoke this; transport STOP joins the same call site.
    stopFileBrowserPreview();
    if (isDoubleStop) {
      samplerEngine.stopAllVoices();
    }
    emitMidiTransportFromStore("STOP");
    activeRecordingNotes.clear();
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
      if (!state.overdubEnabled) activeRecordingNotes.clear();
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
  setMetronomeCountInBars: (value) =>
    set((state) => {
      const metronomeCountInBars = clamp(Math.round(value), 0, 4);
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
  setMetronomeVolume: (value) =>
    set((state) => {
      const metronomeVolume = clamp(Math.round(value), 0, 100);
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
    const onLevel = (inputLevel: number) =>
      useAppStore.setState({ inputLevel: clamp(inputLevel * gain, 0, 1) });

    // Branch: Tauri runs through cpal/WASAPI (no permission popups, system
    // audio loopback by default, ~5-10ms IPC latency). Browser keeps the
    // legacy getDisplayMedia/getUserMedia path as documented fallback.
    if (isTauri()) {
      void (async () => {
        try {
          // Reset live waveform at start of recording.
          set({ liveRecordingWaveform: [] });
          // Threshold gating. dBFS → linear (Math.pow(10, dB/20)).
          // Tauri-only for Phase 2 — browser path threshold is Phase 3.
          const thresholdSetting = state.threshold;
          const thresholdLinear =
            thresholdSetting === "OFF" || typeof thresholdSetting !== "number"
              ? undefined
              : Math.pow(10, thresholdSetting / 20);
          const native = await startNativeRecording({
            onLevel,
            threshold: thresholdLinear,
            onThresholdArmed: () => {
              set({ importMessage: "WAITING FOR LEVEL..." });
            },
            onThresholdTriggered: () => {
              set({ importMessage: "RECORDING SYSTEM AUDIO" });
            },
            onFrame: (payload) => {
              // Downsample each chunk into a small number of bars
              // (max abs per segment), append to rolling waveform.
              const samples = payload.samples;
              if (samples.length === 0) return;
              const barsPerChunk = 4;
              const segLen = Math.max(1, Math.floor(samples.length / barsPerChunk));
              const newBars: number[] = [];
              for (let b = 0; b < barsPerChunk; b++) {
                let peak = 0;
                const start = b * segLen;
                const end = Math.min(samples.length, start + segLen);
                for (let i = start; i < end; i++) {
                  const v = Math.abs(samples[i]);
                  if (v > peak) peak = v;
                }
                newBars.push(Math.min(1, peak));
              }
              set((s) => {
                const next = s.liveRecordingWaveform.concat(newBars);
                const trimmed = next.length > 128 ? next.slice(next.length - 128) : next;
                return { liveRecordingWaveform: trimmed };
              });
            },
          });
          activeRecordingCapture = {
            stop: () => native.stop(),
            cancel: () => native.cancel(),
          };
          set({
            isSampling: true,
            isSamplingArmed: false,
            recordingMs: 0,
            sampleLength: "00:00.000",
            importStatus: "READY",
            importMessage: "RECORDING SYSTEM AUDIO",
          });
        } catch (error) {
          const message = error instanceof Error ? error.message.toUpperCase() : "CAPTURE FAILED";
          set({ isSampling: false, isSamplingArmed: false, inputLevel: 0, importStatus: "ERROR", importMessage: message });
        }
      })();
      return;
    }

    // Browser fallback — getDisplayMedia / getUserMedia → MediaRecorder
    // → Blob. Wrapped in UnifiedCaptureSession so keepSampling stays
    // identical regardless of backend.
    void startRecordingCapture(state.inputSource, onLevel)
      .then((capture) => {
        activeRecordingCapture = {
          stop: async () => {
            const blob = await capture.stop();
            const data = await blob.arrayBuffer();
            const buffer = await samplerEngine.decodeAudioData(data);
            return buffer;
          },
          cancel: async () => capture.cancel(),
        };
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
    // capture.stop() returns AudioBuffer in both Tauri and browser paths
    // (browser path wraps decodeAudioData inside the unified stop()).
    void capture
      .stop()
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
  setThreshold: (value) => set(() => ({ threshold: clamp(value, -60, -1) })),
  adjustInputGain: (delta) => set((state) => ({ inputGain: clamp(state.inputGain + delta, -24, 24) })),
  setInputGain: (value) => set(() => ({ inputGain: clamp(value, -24, 24) })),
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
  triggerPad: (selectedPad, velocityOverride) => {
    const padNumber = Number(selectedPad.slice(1));
    {
      const s = get();
      let v = velocityOverride ?? (s.fullLevelEnabled ? 127 : 100);
      if (s.activeScreen === "UTILITY_16_LEVELS" && s.sixteenLevelsParameter === "VELOCITY") {
        v = getSixteenLevelsValue(s, padNumber);
      }
      emitMidiPadNoteOn(s, selectedPad, v);
    }
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
        const recording16Active =
          state.isPlaying && (state.isSequenceRecording || state.overdubEnabled) && sourceAssigned;
        if (recording16Active) {
          const { absTick, stepIndex: pressStep, tickOffset: pressTick } = captureSnappedRecordingPosition(state);
          activeRecordingNotes.set(activeNoteKey(state.padBank, selectedPad), {
            startTickAbsolute: absTick,
            startStepIndex: pressStep,
            startTickOffset: pressTick,
            velocity: eventVelocity,
            bank: sourceBank,
            pad: sourcePadId,
            sourcePad: state.sixteenLevelsSourcePad,
            programId: state.currentProgramId,
            trackId: state.currentTrackId,
            trackName: getTrackName(getCurrentSequence(state), state.currentTrackId),
            sourceAssignment: sourceAssignment?.assignment === "---" ? undefined : sourceAssignment?.assignment,
            appliedParameter: state.sixteenLevelsParameter,
            appliedValue,
            parameterValue: appliedValue,
            appliedFilterType: sandboxFilterTypeForRecord,
            appliedFilterResonance: sandboxFilterResonanceForRecord,
          });
        }
        return {
          selectedPad,
          lastTriggeredPad: selectedPad,
          lastPadVelocity: state.fullLevelEnabled ? 127 : eventVelocity,
          lastSixteenLevelsValue: appliedValue,
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
      if (recordingActive) {
        const padAssignmentRec = state.padAssignments[state.padBank].find((p) => p.pad === selectedPad);
        const { absTick, stepIndex: pressStep, tickOffset: pressTick } = captureSnappedRecordingPosition(state);
        activeRecordingNotes.set(activeNoteKey(state.padBank, selectedPad), {
          startTickAbsolute: absTick,
          startStepIndex: pressStep,
          startTickOffset: pressTick,
          velocity,
          bank: state.padBank,
          pad: selectedPad,
          sourcePad: selectedPad,
          programId: state.currentProgramId,
          trackId: state.currentTrackId,
          trackName: getTrackName(getCurrentSequence(state), state.currentTrackId),
          sourceAssignment: padAssignmentRec?.assignment === "---" ? undefined : padAssignmentRec?.assignment,
        });
      }

      return {
        selectedPad,
        lastTriggeredPad: selectedPad,
        lastPadVelocity: velocity,
        lastAction: recordingActive
          ? (state.isSequenceRecording ? `REC HOLD ${selectedPad}` : `OVERDUB HOLD ${selectedPad}`)
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
    emitMidiPadNoteOff(get(), pad);
    const state = get();
    // In 16 LEVELS the released variation pad isn't what played the voice —
    // every variation routes through the SOURCE pad's voice group. Look up
    // mode and voice key from the source assignment so NOTE ON release stops
    // the right voices.
    let lookupBank = state.padBank;
    let lookupPad = pad;
    if (state.activeScreen === "UTILITY_16_LEVELS") {
      lookupBank = state.sixteenLevelsSourcePad.slice(0, 1) as PadBank;
      const srcNumber = Number(state.sixteenLevelsSourcePad.slice(1)) || 1;
      lookupPad = `P${String(srcNumber).padStart(2, "0")}`;
    }
    const assignment = state.padAssignments[lookupBank].find((item) => item.pad === lookupPad);
    if (assignment?.mode === "NOTE ON") {
      const releaseMs = assignment.decay >= 100 ? 0 : programValueToMs(assignment.decay);
      samplerEngine.stopVoiceGroup(
        mixerChannelKey(lookupBank, lookupPad, state.currentProgramId),
        releaseMs > 0 ? { releaseMs } : undefined,
      );
    }
    // Finalize the recording event for this physical press if one is active.
    // Duration = release tick − press tick (capped at sequence length from the
    // press point so a hold across the loop boundary truncates instead of
    // wrapping back over itself).
    const noteKey = activeNoteKey(state.padBank, pad);
    const active = activeRecordingNotes.get(noteKey);
    if (active) {
      activeRecordingNotes.delete(noteKey);
      const recordingStillActive =
        state.isPlaying && (state.isSequenceRecording || state.overdubEnabled);
      if (recordingStillActive) {
        const sequence = getCurrentSequence(state);
        const seqTotalTicks = getSequenceTotalTicks(sequence);
        const { absTick: endAbsTick } = captureSnappedRecordingPosition(state);
        let duration =
          endAbsTick >= active.startTickAbsolute
            ? endAbsTick - active.startTickAbsolute
            : seqTotalTicks - active.startTickAbsolute;
        duration = Math.max(1, Math.min(duration, Math.max(1, seqTotalTicks - active.startTickAbsolute)));
        const event = createStepEventAtPosition(
          active.startStepIndex,
          active.startTickOffset,
          active.pad,
          active.velocity,
          100,
          {
            sequence,
            trackId: active.trackId,
            trackName: active.trackName,
            sourcePad: active.sourcePad,
            sourceAssignment: active.sourceAssignment,
            padBank: active.bank,
            programId: active.programId,
            variation: "REC",
            duration,
            length: duration,
            appliedParameter: active.appliedParameter,
            appliedValue: active.appliedValue,
            parameterValue: active.parameterValue,
            appliedFilterType: active.appliedFilterType,
            appliedFilterResonance: active.appliedFilterResonance,
          },
        );
        set((current) => {
          const events = [...current.stepEvents, event].sort(
            (a, b) => eventStepIndex(a.step) - eventStepIndex(b.step),
          );
          return {
            stepEvents: events,
            sequences: updateCurrentSequenceEvents(current, events),
            triggeredPads: markPadTriggered(current.triggeredPads, current.padBank, pad, false),
            lastAction: current.isSequenceRecording
              ? `REC ADD ${active.pad}`
              : `OVERDUB ADD ${active.pad}`,
          };
        });
        return;
      }
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
  setGoToValue: (target, value) =>
    set((state) => {
      if (target === "BAR") {
        return { currentBar: clamp(Math.round(value), 1, state.sequenceLengthBars) };
      }
      if (target === "STEP") {
        return { currentStep: clamp(Math.round(value), 1, 16) };
      }
      if (target === "EVENT") {
        return { currentEvent: clamp(Math.round(value), 1, 999) };
      }
      const targetIndex = clamp(Math.round(value) - 1, 0, state.sequences.length - 1);
      return applyCurrentSequence(state, state.sequences[targetIndex].id);
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
  // Direct setter used by typed input (EditableNumber). Clamps to the same range
  // adjustSequenceLengthBars uses; no delta math.
  setSequenceLengthBars: (value) =>
    set((state) => {
      const sequenceLengthBars = clamp(Math.round(value), 1, 999);
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
      const bpm = clamp(Math.round((state.bpm + delta) * 100) / 100, 30, 300);
      return {
        bpm,
        sequences: state.sequences.map((sequence) =>
          sequence.id === state.currentSequence ? { ...sequence, bpm } : sequence,
        ),
        ...recordUndo(state, "BPM", `bpm:${state.currentSequence}`),
      };
    }),
  // Direct setter for typed input. MPC canonical range 30-300 (per MPC2000XL/5000 manuals).
  setBpm: (value) =>
    set((state) => {
      const bpm = clamp(Math.round(value * 100) / 100, 30, 300);
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
  setSwing: (value) =>
    set((state) => {
      const swing = clamp(Math.round(value), 50, 75);
      return {
        swing,
        ...recordUndo(state, "SWING", `swing:${state.currentSequence}`),
      };
    }),
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
      const sequence = getCurrentSequence(state);
      const targetTrackId = state.timingApplyTo === "CURRENT TRACK" ? state.currentTrackId : null;
      const stepEvents = state.stepEvents
        .map((event) => {
          if (targetTrackId && event.trackId !== targetTrackId) return event;
          // Sequence-aware tick math: in non-4/4 bars `eventStepToTicks` walks
          // per-bar tick counts so the snap boundary lines up with the actual
          // beat positions (e.g. 3/4 bar = 288 ticks, not 384).
          const realTicks = eventStepToTicks(event.step, sequence) + event.timingOffset;
          const snappedTicks = Math.round(realTicks / gridTicks) * gridTicks;
          return {
            ...event,
            step: ticksToStep(snappedTicks, sequence),
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
  setNoteRepeatGate: (value) =>
    set(() => ({ noteRepeatGate: clamp(Math.round(value), 1, 100) })),
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
  setSongStepRepeats: (index, value) =>
    set((state) => ({
      songSteps: state.songSteps.map((step, i) =>
        i === index ? { ...step, repeats: clamp(Math.round(value), 1, 99) } : step,
      ),
      ...recordUndo(state, "SONG REPEATS", `song-repeats:${index}`),
    })),
  setSongStepBars: (index, value) =>
    set((state) => {
      const step = state.songSteps[index];
      if (!step) return state;
      const sequence = state.sequences.find((s) => s.id === step.sequenceId);
      const len = sequence?.lengthBars ?? 1;
      const repeats = clamp(Math.round(Math.max(1, value) / len), 1, 99);
      return {
        songSteps: state.songSteps.map((s, i) => (i === index ? { ...s, repeats } : s)),
        ...recordUndo(state, "SONG BARS", `song-bars:${index}`),
      };
    }),
  setSongTotalBars: (value) =>
    set((state) => {
      if (state.songSteps.length === 0) return state;
      const otherBars = state.songSteps.reduce((sum, step, i) => {
        if (i === state.selectedSongStepIndex) return sum;
        const seq = state.sequences.find((s) => s.id === step.sequenceId);
        return sum + (seq?.lengthBars ?? 0) * step.repeats;
      }, 0);
      const selected = state.songSteps[state.selectedSongStepIndex];
      const selectedSeq = state.sequences.find((s) => s.id === selected.sequenceId);
      const selectedLen = selectedSeq?.lengthBars ?? 1;
      const targetForSelected = Math.max(1, Math.round(value - otherBars));
      const repeats = clamp(Math.round(targetForSelected / selectedLen), 1, 99);
      return {
        songSteps: state.songSteps.map((step, i) =>
          i === state.selectedSongStepIndex ? { ...step, repeats } : step,
        ),
        ...recordUndo(state, "SONG TOTAL BARS", `song-total:${Date.now()}`),
      };
    }),
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
  setLoopBars: (value) => set(() => ({ loopBars: clamp(Math.round(value), 1, 16) })),
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

      // Multi-bank distribution: starting from targetBank, fill into
      // A→B→C→D in order, NO wraparound from D back to A. Banks before
      // targetBank are never touched. Slices beyond the reachable banks
      // (e.g. 70 slices with targetBank=A → first 64 fill A+B+C+D, slices
      // 65-70 stay in the registry without pad assignment) are silently
      // left in the registry — per Marek's explicit decision.
      //
      // The createProgram flag continues to gate WHETHER any pad-
      // assignment writes happen at all (current semantics; not changed
      // in this pass). When ON, distribution proceeds; when OFF, only the
      // sample registry is updated.
      let padAssignments = state.padAssignments;
      if (createProgram) {
        const bankOrder: PadBank[] = ["A", "B", "C", "D"];
        const startIdx = Math.max(0, bankOrder.indexOf(targetBank));
        const reachableBanks = bankOrder.slice(startIdx);
        const maxSlots = reachableBanks.length * 16;
        const slotCount = Math.min(sliceSamples.length, maxSlots);

        // Build per-bank assignment maps first, then apply once per bank.
        // Avoids rebuilding padAssignments inside an inner loop.
        const perBank: Partial<Record<PadBank, Map<number, string>>> = {};
        for (let i = 0; i < slotCount; i += 1) {
          const bank = reachableBanks[Math.floor(i / 16)];
          const padIdx = i % 16;
          if (!perBank[bank]) perBank[bank] = new Map();
          perBank[bank]!.set(padIdx, sliceSamples[i].name);
        }

        padAssignments = { ...state.padAssignments };
        for (const bank of reachableBanks) {
          const padMap = perBank[bank];
          if (!padMap) continue;
          padAssignments = {
            ...padAssignments,
            [bank]: padAssignments[bank].map((pad, idx) =>
              padMap.has(idx) ? { ...pad, assignment: padMap.get(idx)! } : pad,
            ),
          };
        }
      }

      return {
        recordedSamples: [
          ...retainedSamples.map((item) =>
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
        : field === "muteGroup" ? "MUTE GRP"
        : `MIX ${(field as string).toUpperCase()}`;
      return {
        padAssignments,
        programs: syncCurrentProgram(state, { padAssignments }),
        ...recordUndo(state, `${labelGroup} ${state.selectedPad}`, `pad-param-${field}:${state.selectedPad}`),
      };
    }),
  // Direct setter for typed input. Same clamp + side effects as updateSelectedPadParam.
  setSelectedPadParam: (field, value) =>
    set((state) => {
      const padAssignments = updatePadAssignmentsForProgram(state, state.padBank, (pad) => {
          if (pad.pad !== state.selectedPad) return pad;
          const limits = getParamLimits(field);
          return {
            ...pad,
            [field]: clamp(value, limits.min, limits.max),
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
        : field === "muteGroup" ? "MUTE GRP"
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
  toggleSelectedPadLoop: () =>
    set((state) => {
      const padAssignments = updatePadAssignmentsForProgram(state, state.padBank, (pad) =>
          pad.pad === state.selectedPad ? { ...pad, loop: !pad.loop } : pad,
        );
      return {
        padAssignments,
        programs: syncCurrentProgram(state, { padAssignments }),
        ...recordUndo(state, `LOOP ${state.selectedPad}`, `loop:${state.selectedPad}:${Date.now()}`),
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
  // Direct setter for typed input. Same clamps as adjustSelectedEvent.
  setSelectedEvent: (field, value) =>
    set((state) => {
      const event = state.stepEvents[state.selectedEventIndex];
      if (!event) return state;
      const rounded = Math.round(value);
      const nextValue =
        field === "velocity"
          ? clamp(rounded, 1, 127)
          : field === "timingOffset"
            ? clamp(rounded, -24, 24)
            : field === "duration"
              ? clamp(rounded, 0, 96)
              : clamp(rounded, 0, 100);
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
  // Direct setter for typed input. Range comes from the event's applied parameter type.
  setSelectedEventAppliedValue: (value) =>
    set((state) => {
      const event = state.stepEvents[state.selectedEventIndex];
      if (!event || !event.appliedParameter) return state;
      const range = appliedValueRange(event.appliedParameter);
      const next = clamp(Math.round(value), range.min, range.max);
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
  // FX system actions (Phase 2 — 2 blocks per bus + chaining + reset)
  // ============================================================
  setFxBusBlockEffect: (busId, block, effect) =>
    set((state) => {
      const params: EffectParamMap = effect ? { ...EFFECT_DEFAULTS[effect] } : {};
      const fxBuses = state.fxBuses.map((b) => {
        if (b.id !== busId) return b;
        const updated = block === "A"
          ? { ...b, blockA: { ...b.blockA, effect, params } }
          : { ...b, blockB: { ...b.blockB, effect, params } };
        return updated;
      });
      fxEngine.setBusBlockEffect(busId, block, effect, params);
      return {
        fxBuses,
        lastAudioMessage: effect ? `FX${busId}${block} ${effect}` : `FX${busId}${block} OFF`,
        ...recordUndo(state, `FX BUS ${busId} BLOCK ${block} EFFECT`, `fx-effect:${busId}:${block}:${Date.now()}`),
      };
    }),
  toggleFxBusBlockBypass: (busId, block) =>
    set((state) => {
      const fxBuses = state.fxBuses.map((b) => {
        if (b.id !== busId) return b;
        return block === "A"
          ? { ...b, blockA: { ...b.blockA, bypass: !b.blockA.bypass } }
          : { ...b, blockB: { ...b.blockB, bypass: !b.blockB.bypass } };
      });
      const bus = fxBuses.find((b) => b.id === busId)!;
      const newBypass = block === "A" ? bus.blockA.bypass : bus.blockB.bypass;
      fxEngine.setBusBlockBypass(busId, block, newBypass);
      return {
        fxBuses,
        lastAudioMessage: `FX${busId}${block} BYPASS ${newBypass ? "ON" : "OFF"}`,
        ...recordUndo(state, `FX BUS ${busId} BLOCK ${block} BYPASS`, `fx-bypass:${busId}:${block}:${Date.now()}`),
      };
    }),
  adjustFxBusBlockParam: (busId, block, key, delta) =>
    set((state) => {
      const fxBuses = state.fxBuses.map((b) => {
        if (b.id !== busId) return b;
        const blk = block === "A" ? b.blockA : b.blockB;
        const cur = blk.params[key] ?? 0;
        const newBlk = { ...blk, params: { ...blk.params, [key]: cur + delta } };
        return block === "A" ? { ...b, blockA: newBlk } : { ...b, blockB: newBlk };
      });
      const bus = fxBuses.find((b) => b.id === busId)!;
      const value = (block === "A" ? bus.blockA : bus.blockB).params[key];
      fxEngine.setBusBlockParam(busId, block, key, value);
      return {
        fxBuses,
        ...recordUndo(state, `FX ${key.toUpperCase()}`, `fx-param:${busId}:${block}:${key}`),
      };
    }),
  setFxBusBlockParam: (busId, block, key, value) =>
    set((state) => {
      const fxBuses = state.fxBuses.map((b) => {
        if (b.id !== busId) return b;
        const blk = block === "A" ? b.blockA : b.blockB;
        const newBlk = { ...blk, params: { ...blk.params, [key]: value } };
        return block === "A" ? { ...b, blockA: newBlk } : { ...b, blockB: newBlk };
      });
      fxEngine.setBusBlockParam(busId, block, key, value);
      return {
        fxBuses,
        ...recordUndo(state, `FX ${key.toUpperCase()}`, `fx-param:${busId}:${block}:${key}`),
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
  toggleFxChain: (pair) =>
    set((state) => {
      if (pair === "FX1_FX2") {
        const next = !state.fxChainFX1ToFX2;
        fxEngine.setFxChain("FX1_FX2", next);
        return {
          fxChainFX1ToFX2: next,
          lastAudioMessage: `FX1>FX2 ${next ? "ON" : "OFF"}`,
          ...recordUndo(state, `FX CHAIN 1>2 ${next ? "ON" : "OFF"}`, `fx-chain:1-2:${Date.now()}`),
        };
      } else {
        const next = !state.fxChainFX3ToFX4;
        fxEngine.setFxChain("FX3_FX4", next);
        return {
          fxChainFX3ToFX4: next,
          lastAudioMessage: `FX3>FX4 ${next ? "ON" : "OFF"}`,
          ...recordUndo(state, `FX CHAIN 3>4 ${next ? "ON" : "OFF"}`, `fx-chain:3-4:${Date.now()}`),
        };
      }
    }),
  resetBusBlock: (busId, block) =>
    set((state) => {
      const fxBuses = state.fxBuses.map((b) => {
        if (b.id !== busId) return b;
        const blk = block === "A" ? b.blockA : b.blockB;
        // Reset SCOPE: only params. Preserve effect type + bypass.
        const params: EffectParamMap = blk.effect ? { ...EFFECT_DEFAULTS[blk.effect] } : {};
        const newBlk = { ...blk, params };
        return block === "A" ? { ...b, blockA: newBlk } : { ...b, blockB: newBlk };
      });
      const bus = fxBuses.find((b) => b.id === busId)!;
      const blk = block === "A" ? bus.blockA : bus.blockB;
      // Push reset params into the engine. If block has effect, rebuild with defaults; else no-op.
      if (blk.effect) {
        for (const [key, value] of Object.entries(blk.params)) {
          fxEngine.setBusBlockParam(busId, block, key, value);
        }
      }
      return {
        fxBuses,
        lastAudioMessage: `FX${busId}${block} RESET`,
        ...recordUndo(state, `FX RESET BUS ${busId} BLOCK ${block}`, `fx-reset:${busId}:${block}:${Date.now()}`),
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
  resetMasterEq: () =>
    set((state) => {
      const masterFx: MasterFX = {
        ...state.masterFx,
        eq: { ...state.masterFx.eq, params: { ...MASTER_EQ_DEFAULTS } },
      };
      // Push every band's defaults into the engine.
      for (const [key, value] of Object.entries(MASTER_EQ_DEFAULTS)) {
        applyMasterEqParamToEngine(masterFx.eq.params, key);
        void value;
      }
      return {
        masterFx,
        lastAudioMessage: "MASTER EQ RESET",
        ...recordUndo(state, "MASTER EQ RESET", `master-eq-reset:${Date.now()}`),
      };
    }),
  resetMasterComp: () =>
    set((state) => {
      const masterFx: MasterFX = {
        ...state.masterFx,
        compressor: { ...state.masterFx.compressor, params: { ...MASTER_COMP_DEFAULTS } },
      };
      for (const [key, value] of Object.entries(MASTER_COMP_DEFAULTS)) {
        fxEngine.setMasterCompParam(key, value);
      }
      return {
        masterFx,
        lastAudioMessage: "MASTER COMP RESET",
        ...recordUndo(state, "MASTER COMP RESET", `master-comp-reset:${Date.now()}`),
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
  // ============================================================
  // Sample Edit window (Phase A — destructive sample operations)
  // ============================================================
  openSampleEditWindow: (preselectedOp) =>
    set((state) => {
      const op: SampleEditOp = preselectedOp ?? state.sampleEditOp;
      const sourceIndex = state.chopSelectedSampleIndex;
      return {
        activeScreen: "SAMPLE_EDIT_WINDOW",
        utilityReturnScreen: isUtilityScreen(state.activeScreen) ? state.utilityReturnScreen : state.activeScreen,
        sampleEditSourceIndex: sourceIndex,
        sampleEditOp: op,
        sampleEditParams: { ...DEFAULT_OP_PARAMS[op] },
        pendingSampleEdit: null,
      };
    }),
  closeSampleEditWindow: () =>
    set((state) => ({
      activeScreen: state.utilityReturnScreen,
      pendingSampleEdit: null,
    })),
  setSampleEditOp: (op) =>
    set(() => ({
      sampleEditOp: op,
      sampleEditParams: { ...DEFAULT_OP_PARAMS[op] },
    })),
  setSampleEditParam: (key, value) =>
    set((state) => ({
      sampleEditParams: { ...state.sampleEditParams, [key]: value },
    })),
  applySampleEdit: async () => {
    const state = get();
    const source = state.recordedSamples[state.sampleEditSourceIndex];
    if (!source) {
      set({ lastAudioMessage: "NO SAMPLE SELECTED" });
      return;
    }
    const sourceBuffer = getSampleBuffer(source.audioBufferId);
    const ctx = samplerEngine.getContext();
    if (!sourceBuffer || !ctx) {
      set({ lastAudioMessage: "AUDIO NOT READY" });
      return;
    }
    set({ lastAudioMessage: `${state.sampleEditOp.replace(/_/g, " ")}...` });
    // Yield once so the "processing" message paints before we block.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    try {
      // Extract the CHOP active region first — Sample Edit ops apply to the active region only.
      const editState = source.editState;
      const regionStart = editState?.sampleStart ?? 0;
      const regionEnd = editState?.sampleEnd ?? 1;
      const regionBuffer = regionStart === 0 && regionEnd === 1
        ? sourceBuffer
        : extractRegion(ctx, sourceBuffer, regionStart, regionEnd);
      const newBuffer = applySampleOp(ctx, regionBuffer, state.sampleEditOp, state.sampleEditParams);
      const newId = createSampleId();
      registerSampleAudio(newId, newBuffer);
      const opLabel = state.sampleEditOp.replace(/_/g, " ");
      const proposedName = buildProposedSampleName(source.name, state.sampleEditOp, get().recordedSamples);
      const pending: PendingSampleEdit = {
        sourceSampleIndex: state.sampleEditSourceIndex,
        sourceSampleName: source.name,
        newAudioBufferId: newId,
        newDurationSec: newBuffer.duration,
        newDurationMs: Math.max(1, Math.round(newBuffer.duration * 1000)),
        newSampleRate: newBuffer.sampleRate,
        newChannelCount: newBuffer.numberOfChannels,
        newWaveform: createWaveformCache(newBuffer, 256),
        opLabel,
        proposedName,
      };
      set({
        pendingSampleEdit: pending,
        activeScreen: "SAMPLE_KEEP_RETRY",
        lastAudioMessage: `${opLabel} READY`,
      });
    } catch (error) {
      console.warn("[sample-edit] op failed:", error);
      set({ lastAudioMessage: "SAMPLE EDIT FAILED" });
    }
  },
  keepEditedSample: (name) =>
    set((state) => {
      const pending = state.pendingSampleEdit;
      if (!pending) return {};
      const finalName = sanitizeSampleName(name ?? pending.proposedName, state.recordedSamples);
      const newEditState: SampleEditState = {
        sampleStart: 0,
        sampleEnd: 1,
        loopEnabled: false,
        loopStart: 0,
        loopEnd: 1,
        loopBars: 4,
        sliceMarkers: [],
      };
      const newSample: RecordedSample = {
        id: createSampleId(),
        name: finalName,
        audioBufferId: pending.newAudioBufferId,
        durationMs: pending.newDurationMs,
        duration: pending.newDurationSec,
        sampleRate: pending.newSampleRate,
        channelCount: pending.newChannelCount,
        waveform: pending.newWaveform,
        keptSlices: [],
        editState: newEditState,
      };
      const newIndex = state.recordedSamples.length; // appended at end
      return {
        recordedSamples: [...state.recordedSamples, newSample],
        pendingSampleEdit: null,
        // Post-KEEP navigation: jump to CHOP/TRIM with the new sample active so user can
        // immediately assign / continue editing without hunting in the disk view.
        activeScreen: "CHOP",
        ...loadChopStateForIndex(newIndex, newEditState),
        lastAudioMessage: `KEPT ${finalName}`,
        ...recordUndo(state, `SAMPLE ${pending.opLabel}`, `sample-edit-keep:${Date.now()}`),
      };
    }),
  overwriteEditedSample: () =>
    set((state) => {
      const pending = state.pendingSampleEdit;
      if (!pending) return {};
      const idx = pending.sourceSampleIndex;
      if (idx < 0 || idx >= state.recordedSamples.length) return {};
      const original = state.recordedSamples[idx];
      // Re-register the new buffer under the ORIGINAL sample's audioBufferId so all pads
      // referencing this sample play the new audio. The previously-created newAudioBufferId
      // entry becomes orphaned (sampleAudioRefs map keeps both, but only the original ID is referenced).
      const newBuffer = getSampleBuffer(pending.newAudioBufferId);
      if (newBuffer) {
        registerSampleAudio(original.audioBufferId, newBuffer);
      }
      const newEditState: SampleEditState = {
        sampleStart: 0,
        sampleEnd: 1,
        loopEnabled: false,
        loopStart: 0,
        loopEnd: 1,
        loopBars: 4,
        sliceMarkers: [],
      };
      const updated: RecordedSample = {
        ...original,
        durationMs: pending.newDurationMs,
        duration: pending.newDurationSec,
        sampleRate: pending.newSampleRate,
        channelCount: pending.newChannelCount,
        waveform: pending.newWaveform,
        editState: newEditState,
      };
      const recordedSamples = state.recordedSamples.map((s, i) => (i === idx ? updated : s));
      return {
        recordedSamples,
        pendingSampleEdit: null,
        // Post-OVERWRITE: same sample at same index, but waveform + edit state must refresh
        // to reflect the new buffer. activeScreen explicitly CHOP per Marek's spec.
        activeScreen: "CHOP",
        ...loadChopStateForIndex(idx, newEditState),
        lastAudioMessage: `OVERWROTE ${original.name}`,
        ...recordUndo(state, `SAMPLE ${pending.opLabel} OVERWRITE`, `sample-edit-overwrite:${Date.now()}`),
      };
    }),
  retryEditedSample: () =>
    set(() => ({
      pendingSampleEdit: null,
      activeScreen: "SAMPLE_EDIT_WINDOW",
      lastAudioMessage: "RETRY — adjust params and try again",
    })),
  previewEditedSample: () => {
    const state = get();
    const pending = state.pendingSampleEdit;
    if (!pending) return;
    const buffer = getSampleBuffer(pending.newAudioBufferId);
    if (!buffer) return;
    samplerEngine.play(
      {
        name: pending.proposedName,
        durationMs: pending.newDurationMs,
        waveform: pending.newWaveform,
        audioBufferId: pending.newAudioBufferId,
        sampleRate: pending.newSampleRate,
      },
      { gain: 1, pan: 0 },
    );
  },
  selectMixerPad: (selectedPad) => set({ selectedPad }),
  selectPad: (selectedPad) => set({ selectedPad }),
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
  setPadMuteMode: (padMuteMode) => set({ padMuteMode }),
  setPadGroup: (pad, group) =>
    set((state) => {
      const channels = state.padMixer[state.padBank].map((channel) =>
        channel.pad === pad ? { ...channel, group: clamp(Math.round(group), 0, 16) } : channel,
      );
      const padMixer = { ...state.padMixer, [state.padBank]: channels };
      return {
        padMixer,
        programs: syncCurrentProgram(state, { padMixer }),
      };
    }),
  applyPadMuteAction: (pad) =>
    set((state) => {
      const bank = state.padBank;
      const channels = state.padMixer[bank];
      const target = channels.find((channel) => channel.pad === pad);
      if (!target) return state;
      let next: MixerChannel[];
      if (state.padMuteMode === "SOLO") {
        const wasSolo = target.solo;
        next = channels.map((channel) => ({
          ...channel,
          muted: wasSolo ? false : channel.pad !== pad,
          solo: wasSolo ? false : channel.pad === pad,
        }));
      } else if (state.padMuteMode === "GROUP") {
        // GROUP = pure assignment. Click always cycles 0 → 1 → … → 16 → 0.
        // Mute state untouched.
        const nextGroup = ((target.group ?? 0) + 1) % 17;
        next = channels.map((channel) =>
          channel.pad === pad ? { ...channel, group: nextGroup, solo: false } : { ...channel, solo: false },
        );
      } else if (state.padMuteMode === "UNGROUP") {
        // UNGROUP = direct reset of clicked pad's group to 0.
        next = channels.map((channel) =>
          channel.pad === pad ? { ...channel, group: 0, solo: false } : { ...channel, solo: false },
        );
      } else {
        // MUTE mode: if pad is in a group, propagate to whole group.
        const targetGroup = target.group ?? 0;
        if (targetGroup > 0) {
          const nextMuted = !target.muted;
          next = channels.map((channel) =>
            (channel.group ?? 0) === targetGroup
              ? { ...channel, muted: nextMuted, solo: false }
              : { ...channel, solo: false },
          );
        } else {
          next = channels.map((channel) =>
            channel.pad === pad ? { ...channel, muted: !channel.muted, solo: false } : { ...channel, solo: false },
          );
        }
      }
      syncMixerBankToAudio(bank, next, state.currentProgramId);
      const padMixer = { ...state.padMixer, [bank]: next };
      return {
        padMixer,
        programs: syncCurrentProgram(state, { padMixer }),
        ...recordUndo(state, `PAD MUTE ${pad}`, `pad-mute:${pad}:${Date.now()}`),
      };
    }),
  clearPadMutes: () =>
    set((state) => {
      const bank = state.padBank;
      const channels = state.padMixer[bank].map((channel) => ({ ...channel, muted: false, solo: false }));
      syncMixerBankToAudio(bank, channels, state.currentProgramId);
      const padMixer = { ...state.padMixer, [bank]: channels };
      return {
        padMixer,
        programs: syncCurrentProgram(state, { padMixer }),
        ...recordUndo(state, "CLEAR PAD MUTES", `clear-pad-mutes:${Date.now()}`),
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
            ? "GROUP"
            : "MUTE",
    })),
  setTrackMuteMode: (trackMuteMode) => set({ trackMuteMode }),
  setTrackGroup: (index, group) =>
    set((state) => ({
      performanceTracks: state.performanceTracks.map((track, i) =>
        i === index ? { ...track, group: clamp(Math.round(group), 0, 16) } : track,
      ),
    })),
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
      // performanceTracks NO LONGER re-emitted every tick. The old code
      // rebuilt the whole array per tick to refresh a decorative `activity`
      // field — but `activity` is read by zero consumers in src/. The
      // allocation churned 8 × /s during playback and re-rendered every
      // subscriber of state.performanceTracks (PerformanceScreen,
      // StepScreen, SongScreen, UTILITY_TRACK_MUTE) for nothing.
      // performancePulse is the only field actually consumed downstream
      // (LED viz in PerformanceScreen). performanceTracks reference now
      // changes ONLY when mute/solo/membership genuinely changes via
      // toggleTrackMute / setTrackMute / sequence load etc.
      if (atBarBoundary && state.queuedSequence) {
        return {
          ...applyCurrentSequence(state, state.queuedSequence),
          performancePulse,
          queuedSequence: null,
          queuedSequenceBarsRemaining: 0,
        };
      }
      return {
        performancePulse,
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
  exportSelectedMemorySample: async () => {
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
    const safeName = sample.name.replace(/\.wav$/i, "");
    const result = await saveBlobAsync(new Blob([wav], { type: "audio/wav" }), {
      defaultName: safeName,
      extension: "wav",
      filterName: "WAV Audio",
      mimeType: "audio/wav",
    });
    if (!result.ok) {
      set({
        importStatus: result.reason === "cancelled" ? "READY" : "ERROR",
        importMessage:
          result.reason === "cancelled" ? "EXPORT CANCELLED" : `EXPORT FAILED: ${result.reason}`,
      });
      return;
    }
    set({ importStatus: "READY", importMessage: `EXPORTED ${sample.name}` });
  },
  exportSongToWav: async (filename: string) => {
    const state = get();
    if (state.songSteps.length === 0) {
      return { ok: false as const, reason: "Song is empty — add steps with sequences first" };
    }
    try {
      const buffer = await renderSongOffline(state, { sampleRate: 48000, tailSeconds: 3 });
      if (buffer.length === 0) {
        return { ok: false as const, reason: "Rendered an empty buffer — check sequence content" };
      }
      const bytes = encodeAudioBufferToWav(buffer);
      const safeName = (filename || "song_export").replace(/[^A-Za-z0-9._-]/g, "_");
      const result = await saveBlobAsync(new Blob([bytes], { type: "audio/wav" }), {
        defaultName: safeName,
        extension: "wav",
        filterName: "WAV Audio",
        mimeType: "audio/wav",
      });
      if (!result.ok) {
        return { ok: false as const, reason: result.reason };
      }
      return { ok: true as const, filename: `${safeName}.wav` };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown render error";
      return { ok: false as const, reason };
    }
  },
  setActiveSettingsCategory: (activeSettingsCategoryId) =>
    set({ activeSettingsCategoryId, selectedSettingIndex: 0 }),
  selectSetting: (selectedSettingIndex) => set({ selectedSettingIndex }),
  // Direct setter used by typed input (EditableNumber) on numeric settings.
  // Clamps to setting's metadata min/max; runs same side effects as adjustSelectedSetting.
  setSelectedSetting: (value) =>
    set((state) => {
      const category = state.settingsCategories.find((item) => item.id === state.activeSettingsCategoryId);
      const setting = category?.settings[state.selectedSettingIndex];
      if (!setting || setting.kind !== "numeric") return state;
      const min = setting.min ?? value;
      const max = setting.max ?? value;
      const nextValue = clamp(value, min, max);
      if (setting.key === "masterVolume") samplerEngine.setMasterVolume(nextValue);
      return {
        ...metronomeSettingPatch(setting.key, nextValue),
        settingsValues: {
          ...state.settingsValues,
          [setting.key]: nextValue,
        },
      };
    }),
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
  persistSettingsNow: () => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("loopthief.settings", JSON.stringify(get().settingsValues));
    } catch {
      /* localStorage unavailable */
    }
  },
  hydrateSettings: (values) =>
    set((state) => ({
      settingsValues: { ...state.settingsValues, ...values },
    })),
  setMidiAvailable: (midiAvailable) => set({ midiAvailable }),
  setMidiInputs: (midiInputs) => set({ midiInputs }),
  setMidiOutputs: (midiOutputs) => set({ midiOutputs }),
  setMidiInputDevice: (id) =>
    set((state) => ({
      settingsValues: { ...state.settingsValues, midiInputDeviceId: id },
    })),
  setMidiOutputDevice: (id) =>
    set((state) => ({
      settingsValues: { ...state.settingsValues, midiOutputDeviceId: id },
    })),
  setMidiPadMapping: (preset) =>
    set((state) => ({
      settingsValues: { ...state.settingsValues, midiPadMapping: preset },
    })),
  setMidiAutoBankSwitch: (value) =>
    set((state) => ({
      settingsValues: { ...state.settingsValues, midiAutoBankSwitch: value },
    })),
  setMidiSyncIn: (mode) =>
    set((state) => ({
      settingsValues: { ...state.settingsValues, midiSyncIn: mode },
    })),
  setMidiSyncOut: (mode) =>
    set((state) => ({
      settingsValues: { ...state.settingsValues, midiSyncOut: mode },
    })),
  setMidiPadOut: (value) =>
    set((state) => ({
      settingsValues: { ...state.settingsValues, midiPadOut: value },
    })),
  handleMidiInputMessage: (message) => {
    const state = get();
    const settings = state.settingsValues;
    if (message.type === "NOTE_ON" && message.channel === 1) {
      const padAddress = noteToPad(message.note, settings.midiPadMapping);
      if (!padAddress) return;
      const padId = `P${String(padAddress.padIndex + 1).padStart(2, "0")}`;
      if (settings.midiAutoBankSwitch && padAddress.bank !== state.padBank) {
        set({ padBank: padAddress.bank });
      }
      get().triggerPad(padId, message.velocity);
      return;
    }
    if (message.type === "NOTE_OFF" && message.channel === 1) {
      const padAddress = noteToPad(message.note, settings.midiPadMapping);
      if (!padAddress) return;
      const padId = `P${String(padAddress.padIndex + 1).padStart(2, "0")}`;
      get().releasePad(padId);
      return;
    }
    if (message.type === "CC" && message.channel === 1) {
      applyMidiCcToSelectedPad(get, set, message.controller, message.value);
      return;
    }
    if (settings.midiSyncIn === "CLOCK") {
      if (message.type === "START" || message.type === "CONTINUE") {
        if (!state.isPlaying) get().togglePlay();
      } else if (message.type === "STOP") {
        if (state.isPlaying) get().togglePlay();
      } else if (message.type === "CLOCK") {
        handleMidiClockPulse(set);
      }
    }
  },
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
      fxChainFX1ToFX2: state.fxChainFX1ToFX2,
      fxChainFX3ToFX4: state.fxChainFX3ToFX4,
      resolveAudioBuffer: (id) => getSampleBuffer(id),
    });
    const blob = await writeProjectZip(manifest, sampleEntries);
    const result = await saveBlobAsync(blob, {
      defaultName: sanitized,
      extension: "lthief",
      filterName: "LoopThief Project",
      mimeType: "application/octet-stream",
    });
    if (!result.ok) {
      set({
        lastAudioMessage:
          result.reason === "cancelled" ? "SAVE CANCELLED" : `SAVE FAILED: ${result.reason}`,
      });
      return result;
    }
    set((current) => ({
      lastAudioMessage: `SAVED: ${sanitized}.lthief`,
      lastSavedProjectVersion: current.projectVersion,
    }));
    void (await import("../disk")).clearAutosave();
    return result;
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
    if (blank.fxBuses && blank.masterFx) {
      syncFxEngine(blank.fxBuses, blank.masterFx, blank.fxChainFX1ToFX2 ?? false, blank.fxChainFX3ToFX4 ?? false);
    }
    const { clearAutosave } = await import("../disk");
    await clearAutosave().catch(() => {});
  },
  loadFile: async (file: Blob, _options) => {
    // Sub-phase D: .lthief-all / .lthief-seq formats dropped. loadFromBlob
    // only ever returns a "project" bundle now (legacy files throw inside
    // loadFromBlob with a friendly error). `targetSequenceId` from options
    // is no longer consulted — kept in the parameter signature for caller
    // compat but unused.
    const bundle = await loadFromBlob(file, {
      decodeAudio: (bytes) => samplerEngine.decodeAudioData(bytes),
      onProgress: (progress) => {
        set({ lastAudioMessage: progress.message });
      },
    });
    hydrateProjectBundle(bundle, set);
    return { type: "project", name: bundle.manifest.name };
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
  // Seed a usable starter project: one sequence + one track + one program so
  // the user lands on MAIN with non-empty SEQ/TRACK/PROGRAM selectors and can
  // hit REC immediately. Truly empty arrays here used to be the onboarding
  // killer — user had to manually NEW SEQ, NEW TRACK, NEW PROGRAM first.
  const sequences = createSequences([]);
  return {
    sequences,
    currentSequence: "01",
    sequence: "01",
    sequenceName: "SEQ01",
    sequenceLengthBars: 4,
    timeSignature: "4/4",
    bpm: 96,
    stepEvents: [],
    programs: createPrograms(),
    currentProgramId: "PRG01",
    activeProgram: "PRG01",
    currentTrackId: "TRACK01",
    activeTrack: formatTrackName("TRACK01", 0),
    padAssignments: createPadAssignments(),
    padMixer: createPadMixer(),
    recordedSamples: [],
    songSteps: [],
    currentSongStepIndex: 0,
    selectedSongStepIndex: 0,
    fxBuses: createDefaultFxBuses(),
    masterFx: createDefaultMasterFx(),
    fxChainFX1ToFX2: false,
    fxChainFX3ToFX4: false,
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
    group: 0,
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
  const manifestExt = bundle.manifest as unknown as {
    fxBuses?: unknown;
    masterFx?: unknown;
    fxChainFX1ToFX2?: unknown;
    fxChainFX3ToFX4?: unknown;
  };
  const fxBuses = ensureFxBusesFromManifest(manifestExt.fxBuses);
  const masterFx = ensureMasterFxFromManifest(manifestExt.masterFx);
  const chainFX1ToFX2 = typeof manifestExt.fxChainFX1ToFX2 === "boolean" ? manifestExt.fxChainFX1ToFX2 : false;
  const chainFX3ToFX4 = typeof manifestExt.fxChainFX3ToFX4 === "boolean" ? manifestExt.fxChainFX3ToFX4 : false;
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
    fxChainFX1ToFX2: chainFX1ToFX2,
    fxChainFX3ToFX4: chainFX3ToFX4,
    ...applyGlobalSettings(bundle.manifest.globalSettings),
    lastAudioMessage: `LOADED: ${bundle.manifest.name}.lthief`,
  });
  syncFxEngine(fxBuses, masterFx, chainFX1ToFX2, chainFX3ToFX4);
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
    fxChainFX1ToFX2: state.fxChainFX1ToFX2,
    fxChainFX3ToFX4: state.fxChainFX3ToFX4,
  };
}

function restoreSnapshot(snapshot: UndoSnapshot): Partial<AppState> {
  // activeScreen intentionally NOT restored — undo/redo stay in current screen.
  // snapshot.activeScreen is captured for possible future "jump to edit site" feature.
  const fxBuses = structuredClone(snapshot.fxBuses ?? createDefaultFxBuses());
  const masterFx = structuredClone(snapshot.masterFx ?? createDefaultMasterFx());
  const chainFX1ToFX2 = snapshot.fxChainFX1ToFX2 ?? false;
  const chainFX3ToFX4 = snapshot.fxChainFX3ToFX4 ?? false;
  // Push restored FX state into the audio engine; restoreSnapshot is consumed by undo/redo
  // which calls set() with this partial. Side effect is acceptable here — audio nodes
  // must reflect the restored state.
  syncFxEngine(fxBuses, masterFx, chainFX1ToFX2, chainFX3ToFX4);
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
    fxChainFX1ToFX2: chainFX1ToFX2,
    fxChainFX3ToFX4: chainFX3ToFX4,
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

// "BAR.BEAT.TICK" string ↔ absolute-tick conversions. The optional `sequence`
// argument enables non-4/4 awareness by walking actual per-bar time signatures
// (`getBarTickCount` + `getTimeSignatureAtBar`). Without it the helpers fall
// back to the hardcoded 4/4 grid (384 ticks/bar, 96 ticks/beat) so existing
// callers that don't carry a sequence reference keep their previous behaviour.
function eventStepToTicks(step: string, sequence?: Sequence): number {
  const [bar, beat, tick] = step.split(".").map(Number);
  if (!sequence) {
    return (bar - 1) * 384 + (beat - 1) * 96 + tick;
  }
  let total = 0;
  const barIndex = Math.max(0, Math.min(bar - 1, sequence.lengthBars - 1));
  for (let i = 0; i < barIndex; i += 1) {
    total += getBarTickCount(sequence, i);
  }
  const { den } = getTimeSignatureAtBar(sequence, barIndex);
  const ticksPerBeat = Math.round((96 * 4) / den);
  return total + (beat - 1) * ticksPerBeat + tick;
}

function ticksToStep(ticks: number, sequence?: Sequence): string {
  const bounded = Math.max(0, Math.round(ticks));
  if (!sequence) {
    const bar = Math.floor(bounded / 384) + 1;
    const tickInBar = bounded % 384;
    const beat = Math.floor(tickInBar / 96) + 1;
    const tick = tickInBar % 96;
    return `${String(bar).padStart(3, "0")}.${String(beat).padStart(2, "0")}.${String(tick).padStart(2, "0")}`;
  }
  let remaining = bounded;
  let barIndex = 0;
  while (barIndex < sequence.lengthBars) {
    const barTicks = getBarTickCount(sequence, barIndex);
    if (remaining < barTicks) break;
    remaining -= barTicks;
    barIndex += 1;
  }
  if (barIndex >= sequence.lengthBars) {
    // Tick past sequence end — clamp to last tick of last bar.
    barIndex = Math.max(0, sequence.lengthBars - 1);
    remaining = Math.max(0, getBarTickCount(sequence, barIndex) - 1);
  }
  const { den } = getTimeSignatureAtBar(sequence, barIndex);
  const ticksPerBeat = Math.round((96 * 4) / den);
  const beat = Math.floor(remaining / ticksPerBeat) + 1;
  const tick = remaining % ticksPerBeat;
  return `${String(barIndex + 1).padStart(3, "0")}.${String(beat).padStart(2, "0")}.${String(tick).padStart(2, "0")}`;
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

// Pure tick→tick snap to the current TC grid. TC=OFF returns the raw tick
// (preserves human timing). All other values round to the nearest grid
// boundary. Operates in absolute sequence-tick space.
function snapTickToTC(absTick: number, timingCorrect: AppState["timingCorrect"]): number {
  if (timingCorrect === "OFF") return absTick;
  const gridTicks = timingCorrectGridTicks(timingCorrect);
  return Math.round(absTick / gridTicks) * gridTicks;
}

// Press/release capture for live recording. Applies TC snap on top of the
// raw captureAbsoluteTick() reading, then wraps within the sequence's total
// tick count so a snap that rounds past the end of the loop lands on the
// downbeat of bar 1 (next loop iteration) instead of an out-of-range step.
// TC=OFF preserves raw timing — same shape as `captureAbsoluteTick`.
function captureSnappedRecordingPosition(state: AppState): { absTick: number; stepIndex: number; tickOffset: number } {
  const raw = captureAbsoluteTick(state);
  if (state.timingCorrect === "OFF") return raw;
  const snapped = snapTickToTC(raw.absTick, state.timingCorrect);
  const sequence = getCurrentSequence(state);
  const sequenceTicks = getSequenceTotalTicks(sequence);
  const bounded = sequenceTicks > 0
    ? ((snapped % sequenceTicks) + sequenceTicks) % sequenceTicks
    : 0;
  return {
    absTick: bounded,
    stepIndex: Math.floor(bounded / 24),
    tickOffset: bounded % 24,
  };
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

// Single unified cycle list, MPC-style: coarse → fine, with each non-triplet
// value followed immediately by its triplet equivalent. PREV/NEXT walks one
// step at a time through every value. The previous two-list design (gated on
// `state.tripletMode`) hid triplets behind a separate toggle that only lived
// in NOTE REPEAT screen — surfaced never in the TC screen. Removed in favour
// of this single visible cycle.
function cycleTimingCorrectPatch(
  state: AppState,
  delta: number,
  options: { includeOff: boolean },
): Partial<AppState> {
  const values: AppState["timingCorrect"][] = options.includeOff
    ? ["OFF", "1/4", "1/4T", "1/8", "1/8T", "1/16", "1/16T", "1/32", "1/32T"]
    : ["1/4", "1/4T", "1/8", "1/8T", "1/16", "1/16T", "1/32", "1/32T"];
  const currentIdx = values.indexOf(state.timingCorrect);
  const startIdx = currentIdx === -1 ? 0 : currentIdx;
  const nextIdx = (startIdx + delta + values.length) % values.length;
  const timingCorrect = values[nextIdx];
  const tripletMode = timingCorrect.endsWith("T");
  return {
    timingCorrect,
    tcEnabled: timingCorrect !== "OFF",
    tripletMode,
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

/** Build a default name for an edited sample. Appends OP-specific suffix and resolves collisions with a numeric suffix. */
function buildProposedSampleName(originalName: string, op: SampleEditOp, samples: RecordedSample[]): string {
  const base = originalName.replace(/_(stretched|pitched|warped|reversed|normalized|crushed|fadein|fadeout)(_\d+)?$/i, "");
  const suffix = OP_NAME_SUFFIX[op];
  const candidate = `${base}${suffix}`.toUpperCase().slice(0, 24);
  if (!samples.some((s) => s.name === candidate)) return candidate;
  for (let n = 2; n < 100; n += 1) {
    const numbered = `${candidate}_${n}`.slice(0, 24);
    if (!samples.some((s) => s.name === numbered)) return numbered;
  }
  return candidate;
}

/** Normalize a user-provided sample name (uppercase, safe chars, collision-resolved). */
function sanitizeSampleName(raw: string, samples: RecordedSample[]): string {
  const cleaned = createSampleName(raw);
  if (!samples.some((s) => s.name === cleaned)) return cleaned;
  for (let n = 2; n < 100; n += 1) {
    const numbered = `${cleaned}_${n}`.slice(0, 24);
    if (!samples.some((s) => s.name === numbered)) return numbered;
  }
  return cleaned;
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

// Persist the FileBrowser's current path for a given mode into settingsValues.
// Writes through hydrateSettings + persistSettingsNow so the value lands in
// localStorage in the same tick (no 500 ms debounce window). Called by the
// LOAD F1 OPEN success path and SAVE F1 SAVE success path — NOT on CANCEL.
function persistFileBrowserPath(
  get: () => AppState,
  _set: (patch: Partial<AppState>) => void,
  mode: FileBrowserMode,
  path: string,
): void {
  if (!path) return;
  const state = get();
  const nextPaths = { ...state.settingsValues.fileBrowserPaths, [mode]: path };
  get().hydrateSettings({ fileBrowserPaths: nextPaths });
  get().persistSettingsNow();
}

// FileBrowser preview-source tracker (Sub-phase C). Module scope because
// AudioBufferSourceNode is non-serialisable and only one preview plays at a
// time. `stopFileBrowserPreview` is called on toggle-off / select-change /
// close / transport STOP, with try/catch wrap because `.stop()` on an
// already-stopped source throws InvalidStateError.
let activeFileBrowserPreview: AudioBufferSourceNode | null = null;
// Generation token (Sub-phase D fix). The preview flow has two awaits
// between "stop previous" and "start new" (fs_read_file_bytes + decodeAudio).
// A rapid second click can race past the first call's stop and end up with
// two sources playing in parallel because the second call's stop ran while
// `activeFileBrowserPreview` was still null. Each call increments the token
// at entry; before publishing its source to `activeFileBrowserPreview`, the
// call checks whether a newer token has been issued — if so, the call stops
// its own source and bails.
let fileBrowserPreviewToken = 0;
function stopFileBrowserPreview(): void {
  // Invalidate any in-flight previews by bumping the token. Without this,
  // a stop() called between a click and the source-start that the click
  // triggered would still let the source land in activeFileBrowserPreview
  // and play. With it, the in-flight call sees the token mismatch and
  // stops its own source before it's published.
  fileBrowserPreviewToken += 1;
  if (!activeFileBrowserPreview) return;
  try {
    activeFileBrowserPreview.stop();
  } catch {
    /* already stopped */
  }
  try {
    activeFileBrowserPreview.disconnect();
  } catch {
    /* already disconnected */
  }
  activeFileBrowserPreview = null;
}

// Filename suggestion seed when openFileBrowser is called in a SAVE_* mode.
// LOAD_* modes get an empty seed (filename input is hidden anyway). Sample
// save reuses the currently-selected memory sample name; project save uses
// either the loaded project name or a fallback. Mixdown uses a timestamped
// default per the spec.
function suggestSaveFilename(mode: FileBrowserMode, state: AppState): string {
  switch (mode) {
    case "SAVE_SAMPLE": {
      const sample = state.recordedSamples[state.selectedDiskItemIndex];
      const base = sample?.name?.replace(/\.wav$/i, "") ?? "sample_export";
      return base;
    }
    case "SAVE_PROJECT": {
      // No project-name field exists in state today (sanitizeProjectName is
      // applied at save time by saveProjectFile); fall back to "untitled".
      return "untitled";
    }
    case "SAVE_MIXDOWN_WAV": {
      const stamp = new Date()
        .toISOString()
        .replace(/[^0-9]/g, "")
        .slice(0, 14);
      return `Mixdown_${stamp}`;
    }
    case "LOAD_SAMPLE":
    case "LOAD_PROJECT":
    default:
      return "";
  }
}

// Sanitize the user's filename input to OS-safe characters before joining
// with a directory path. Strips path separators + characters Windows rejects
// (`<>:"\\/|?*`). Trims whitespace. Empty string after sanitisation is the
// "invalid" signal that the save action surfaces as an error.
function sanitizeSaveFilename(name: string): string {
  return name.trim().replace(/[<>:"\\/|?*]/g, "_");
}

// Join a directory path + filename with the host's path separator. Detects
// separator from the directory (Windows uses backslash, Linux/mac use /).
// Both Tauri-native and JS-side fs_browser commands accept either separator,
// but matching the directory's style keeps display strings consistent.
function joinPath(dir: string, name: string): string {
  if (!dir) return name;
  const usesBackslash = dir.includes("\\");
  const trimmed = dir.replace(/[\\/]+$/, "");
  const sep = usesBackslash ? "\\" : "/";
  return `${trimmed}${sep}${name}`;
}

// True if `name` ends with `.wav` (case-insensitive). Pre-condition for
// preview playback — non-WAV file selection in LOAD_SAMPLE shouldn't trip
// `decodeAudioData`.
function isWavName(name: string): boolean {
  return /\.wav$/i.test(name);
}

// Serialize-and-write helper shared by fileBrowserSave + fileBrowserConfirmOverwrite.
// Encapsulates the mode-dispatched serialization (project / sample / mixdown
// → bytes) and the fs_write_file_bytes call. On success closes the browser.
// On failure surfaces to fileBrowserError.
async function performFileBrowserWrite(
  get: () => AppState,
  set: (patch: Partial<AppState>) => void,
  mode: FileBrowserMode,
  fullPath: string,
): Promise<void> {
  set({ fileBrowserLoading: true, fileBrowserError: null });
  try {
    const state = get();
    let bytes: Uint8Array;
    if (mode === "SAVE_PROJECT") {
      const sequence = getCurrentSequence(state);
      const { manifest, sampleEntries } = serializeProject({
        name: sanitizeProjectName(state.fileBrowserSaveFilename),
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
        programs: state.programs,
        sequences: state.sequences,
        songs: state.songSteps,
        globalSettings: collectGlobalSettings(state),
        fxBuses: state.fxBuses,
        masterFx: state.masterFx,
        fxChainFX1ToFX2: state.fxChainFX1ToFX2,
        fxChainFX3ToFX4: state.fxChainFX3ToFX4,
        resolveAudioBuffer: (id) => getSampleBuffer(id),
      });
      void sequence;
      const blob = await writeProjectZip(manifest, sampleEntries);
      bytes = new Uint8Array(await blob.arrayBuffer());
    } else if (mode === "SAVE_SAMPLE") {
      const sample = state.recordedSamples[state.selectedDiskItemIndex];
      if (!sample) throw new Error("No sample selected");
      const audioRef = getSampleAudioRef(sample.audioBufferId);
      if (!audioRef) throw new Error("Sample PCM buffer missing");
      const region = getSampleRegion(sample);
      // encodeWavRegion / encodeAudioBufferToWav return ArrayBuffer; wrap to
      // Uint8Array so the fs_write_file_bytes serialisation path is uniform.
      bytes = new Uint8Array(encodeWavRegion(audioRef, region.start, region.end));
    } else {
      // SAVE_MIXDOWN_WAV
      if (state.songSteps.length === 0) {
        throw new Error("Song is empty — add steps with sequences first");
      }
      const buffer = await renderSongOffline(state, { sampleRate: 48000, tailSeconds: 3 });
      if (buffer.length === 0) {
        throw new Error("Rendered an empty buffer");
      }
      bytes = new Uint8Array(encodeAudioBufferToWav(buffer));
    }
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke<void>("fs_write_file_bytes", {
      path: fullPath,
      bytes: Array.from(bytes),
    });
    // Persist the directory we just wrote to. Same as LOAD persistence —
    // only on success; overwrite-cancel / error paths don't reach here.
    persistFileBrowserPath(get, set, mode, get().fileBrowserPath);
    set({
      lastAudioMessage: `SAVED: ${fullPath}`,
      lastSavedProjectVersion: get().projectVersion,
    });
    get().closeFileBrowser();
  } catch (err) {
    set({
      fileBrowserLoading: false,
      fileBrowserError: err instanceof Error ? err.message : String(err),
    });
  }
}

// Compute the parent directory for a file-browser path. Returns null when
// the input IS a root (drive letter on Windows, "/" on Linux) so the UI
// can hide the ".." row. Lightweight JS path math — Rust would canonicalise
// more precisely, but for display + the next fs_list_directory call the
// path string returned here is good enough; the Rust side rejects anything
// non-existent.
function computeParentPath(path: string): string | null {
  if (!path) return null;
  // Windows drive root: "C:\" or "C:/"
  if (/^[A-Za-z]:[\\/]?$/.test(path)) return null;
  // Linux root: "/"
  if (path === "/") return null;
  // Strip trailing slash/backslash so the parent split sees the leaf.
  const trimmed = path.replace(/[\\/]+$/, "");
  // Pick the rightmost separator that exists in the path.
  const lastSlash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (lastSlash <= 0) {
    // No separator past index 0 → already at filesystem root. Bail.
    return null;
  }
  let parent = trimmed.slice(0, lastSlash);
  // Windows: collapse "C:" → "C:\" so fs_list_directory gets a valid root.
  if (/^[A-Za-z]:$/.test(parent)) {
    parent = `${parent}\\`;
  }
  // Linux: empty parent means "we're under /" → restore the slash.
  if (parent === "") parent = "/";
  return parent;
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
    loopOverride?: boolean;
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
  // Same-bank CHOKE + explicit muteTargets (legacy). Hard-stop, no release.
  samplerEngine.stopVoiceGroups(getMuteStopGroups(state, assignment, context.pad, context.bank, padAssignments, program?.id));
  // Cross-bank Mute Group cut (independent of CHOKE). Soft 8 ms release to
  // avoid clicks on the cut voices. No-op if assignment.muteGroup === 0.
  const muteGroupTargets = getMuteGroupStopGroups(assignment, context.pad, context.bank, padAssignments, program?.id);
  if (muteGroupTargets.length > 0) {
    samplerEngine.stopVoiceGroups(muteGroupTargets, { releaseMs: 8 });
  }
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
    loop: context.loopOverride ?? assignment.loop,
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

/**
 * Returns the partial state required for the CHOP screen to display a specific sample
 * by index. Used by post-Sample-Edit navigation (KEEP / OVERWRITE) so the user lands
 * on CHOP/TRIM with the right waveform + edit state.
 */
function loadChopStateForIndex(targetIndex: number, editState: SampleEditState): Partial<AppState> {
  return {
    chopSelectedSampleIndex: targetIndex,
    waveformZoom: 1,
    waveformOffset: 0,
    chopEditMode: "TRIM",
    chopSliceMode: editState.sliceMarkers.length > 0 ? "MANUAL" : "AUTO",
    selectedMarker: "sampleStart",
    sampleStart: editState.sampleStart,
    sampleEnd: editState.sampleEnd,
    loopEnabled: editState.loopEnabled,
    loopStart: editState.loopStart,
    loopEnd: editState.loopEnd,
    loopBars: editState.loopBars,
    sliceMarkers: editState.sliceMarkers,
    chopMarkers: editState.sliceMarkers,
    selectedSlice: 1,
    chopCursor: editState.sliceMarkers[0] ?? editState.sampleStart,
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

// Mute Group cross-bank cut. Independent of CHOKE / muteTargets — returns
// the voice-group keys of every other pad (current program, ALL banks) that
// shares `assignment.muteGroup`. CHOKE remains same-bank only; this is the
// MPC convention where mute groups span the whole program. Empty array when
// muteGroup is 0 (OFF) so the trigger path is a no-op for un-grouped pads.
function getMuteGroupStopGroups(
  assignment: PadAssignment,
  pad: string,
  bank: PadBank,
  padAssignments: Record<PadBank, PadAssignment[]>,
  programId?: string,
) {
  if (assignment.muteGroup === 0) return [];
  const targets: string[] = [];
  const banks: PadBank[] = ["A", "B", "C", "D"];
  for (const otherBank of banks) {
    const pads = padAssignments[otherBank];
    if (!pads) continue;
    for (const candidate of pads) {
      const samePadSameBank = otherBank === bank && candidate.pad === pad;
      if (samePadSameBank) continue;
      if (candidate.muteGroup !== assignment.muteGroup) continue;
      targets.push(mixerChannelKey(otherBank, candidate.pad, programId));
    }
  }
  return targets;
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
    loop: false,
    muteGroup: 0,
  }));
}

function createDefaultFxBuses(): FXBus[] {
  return ([1, 2, 3, 4] as BusId[]).map((id) => ({
    id,
    direct: true,
    blockA: { effect: null, bypass: false, params: {} },
    blockB: { effect: null, bypass: false, params: {} },
  }));
}

function createDefaultBlock(): FXBlock {
  return { effect: null, bypass: false, params: {} };
}

function createDefaultMasterFx(): MasterFX {
  return {
    eq: { bypass: true, params: { ...MASTER_EQ_DEFAULTS } },
    compressor: { bypass: true, params: { ...MASTER_COMP_DEFAULTS } },
  };
}

function ensurePadAssignmentFxFields(pa: PadAssignment): PadAssignment {
  let next = pa;
  if (typeof (next as PadAssignment & { fxBus?: number }).fxBus !== "number" ||
      typeof (next as PadAssignment & { fxSendLevel?: number }).fxSendLevel !== "number") {
    next = { ...next, fxBus: 0 as const, fxSendLevel: typeof next.fxSend === "number" ? next.fxSend : 0 };
  }
  if (typeof (next as PadAssignment & { loop?: boolean }).loop !== "boolean") {
    next = { ...next, loop: false };
  }
  return next;
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

function parseEffectType(raw: unknown): EffectType | null {
  return raw === "REVERB" || raw === "DELAY" || raw === "EQ" || raw === "FLANGER"
    || raw === "CHORUS" || raw === "BITCRUSHER" || raw === "COMPRESSOR"
    ? raw
    : null;
}

function ensureBlockFromManifest(raw: unknown): FXBlock {
  if (!raw || typeof raw !== "object") return createDefaultBlock();
  const r = raw as Record<string, unknown>;
  const effect = parseEffectType(r.effect);
  return {
    effect,
    bypass: typeof r.bypass === "boolean" ? r.bypass : false,
    params: (r.params && typeof r.params === "object")
      ? { ...(r.params as EffectParamMap) }
      : (effect ? { ...EFFECT_DEFAULTS[effect] } : {}),
  };
}

function ensureFxBusesFromManifest(input: unknown): FXBus[] {
  if (!Array.isArray(input) || input.length === 0) return createDefaultFxBuses();
  const ids: BusId[] = [1, 2, 3, 4];
  const result: FXBus[] = ids.map((id) => {
    const found = (input as Array<Record<string, unknown>>).find((b) => b && b.id === id);
    if (!found) {
      return { id, direct: true, blockA: createDefaultBlock(), blockB: createDefaultBlock() };
    }
    // v3 shape: blockA + blockB present.
    if (found.blockA || found.blockB) {
      return {
        id,
        direct: typeof found.direct === "boolean" ? found.direct : true,
        blockA: ensureBlockFromManifest(found.blockA),
        blockB: ensureBlockFromManifest(found.blockB),
      };
    }
    // v2 shape fallback (single effect/params/bypass on bus): collapse into blockA.
    return {
      id,
      direct: typeof found.direct === "boolean" ? found.direct : true,
      blockA: {
        effect: parseEffectType(found.effect),
        bypass: typeof found.bypass === "boolean" ? found.bypass : false,
        params: (found.params && typeof found.params === "object")
          ? { ...(found.params as EffectParamMap) }
          : {},
      },
      blockB: createDefaultBlock(),
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
function syncFxEngine(
  fxBuses: FXBus[],
  masterFx: MasterFX,
  chainFX1ToFX2: boolean,
  chainFX3ToFX4: boolean,
) {
  for (const bus of fxBuses) {
    // Block A
    fxEngine.setBusBlockEffect(bus.id, "A", bus.blockA.effect, bus.blockA.params);
    fxEngine.setBusBlockBypass(bus.id, "A", bus.blockA.bypass);
    for (const [key, value] of Object.entries(bus.blockA.params)) {
      fxEngine.setBusBlockParam(bus.id, "A", key, value);
    }
    // Block B
    fxEngine.setBusBlockEffect(bus.id, "B", bus.blockB.effect, bus.blockB.params);
    fxEngine.setBusBlockBypass(bus.id, "B", bus.blockB.bypass);
    for (const [key, value] of Object.entries(bus.blockB.params)) {
      fxEngine.setBusBlockParam(bus.id, "B", key, value);
    }
  }
  fxEngine.setFxChain("FX1_FX2", chainFX1ToFX2);
  fxEngine.setFxChain("FX3_FX4", chainFX3ToFX4);
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
    | "muteGroup"
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
    case "muteGroup":
      return { min: 0, max: 16 };
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
    createSequence("01", "SEQ01", 96, firstSequenceEvents),
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
    performanceTracks: [...state.performanceTracks, { id: currentTrackId, name: nextTrack.name, muted: false, solo: false, activity: 28, group: 0 }],
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
  const target = tracks[targetIndex];
  if (!target) return tracks;

  if (mode === "SOLO") {
    return tracks.map((track, index) => ({
      ...track,
      muted: index !== targetIndex,
      solo: index === targetIndex,
    }));
  }

  if (mode === "GROUP") {
    // GROUP mode is pure assignment — click always cycles the target's group
    // 0 → 1 → … → 16 → 0. Mute state is unaffected.
    const nextGroup = ((target.group ?? 0) + 1) % 17;
    return tracks.map((track, index) =>
      index === targetIndex ? { ...track, group: nextGroup, solo: false } : { ...track, solo: false },
    );
  }

  if (mode === "UNGROUP") {
    // UNGROUP mode resets the clicked target's group to 0.
    return tracks.map((track, index) =>
      index === targetIndex ? { ...track, group: 0, solo: false } : { ...track, solo: false },
    );
  }

  // MUTE mode: if the target is in a group, mute propagates to every track in
  // the same group (MPC-canonical "hitting one pad affects the others in the
  // same group" behaviour). Ungrouped targets toggle only themselves.
  const targetGroup = target.group ?? 0;
  if (targetGroup > 0) {
    const nextMuted = !target.muted;
    return tracks.map((track) =>
      (track.group ?? 0) === targetGroup
        ? { ...track, muted: nextMuted, solo: false }
        : { ...track, solo: false },
    );
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
    group: 0,
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
  return screen.startsWith("UTILITY_") || screen === "COUNT_IN" || screen === "GO_TO" || screen === "ERASE" || screen === "UNDO" || screen === "SEQUENCE_EDIT" || screen === "SONG" || screen === "TIMING_CORRECT" || screen === "TIME_SIG_WINDOW" || screen === "BAR_EDITOR" || screen === "FX_SEND_WINDOW" || screen === "SAMPLE_EDIT_WINDOW" || screen === "SAMPLE_KEEP_RETRY";
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

// ============================================================================
// MIDI helpers — CC routing to selected pad + external clock BPM estimation.
// ============================================================================

function applyMidiCcToSelectedPad(
  get: () => AppState,
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void,
  controller: number,
  value: number,
): void {
  const state = get();
  const selectedPad = state.selectedPad;
  const bank = state.padBank;

  if (controller === 7) {
    // CC 7 — MAIN VOLUME → pad mixer level (0-127).
    const channels = state.padMixer[bank].map((channel) =>
      channel.pad === selectedPad ? { ...channel, level: clamp(value, 0, 127) } : channel,
    );
    syncMixerBankToAudio(bank, channels, state.currentProgramId);
    const padMixer = { ...state.padMixer, [bank]: channels };
    set({ padMixer, programs: syncCurrentProgram(state, { padMixer }) });
    return;
  }
  if (controller === 10) {
    // CC 10 — PAN (0-127 → -50..+50).
    const pan = Math.round(((value / 127) * 100) - 50);
    const channels = state.padMixer[bank].map((channel) =>
      channel.pad === selectedPad ? { ...channel, pan: clamp(pan, -50, 50) } : channel,
    );
    syncMixerBankToAudio(bank, channels, state.currentProgramId);
    const padMixer = { ...state.padMixer, [bank]: channels };
    set({ padMixer, programs: syncCurrentProgram(state, { padMixer }) });
    return;
  }
  if (controller === 91) {
    // CC 91 — FX SEND level (0-127 → 0-100).
    const send = Math.round((value / 127) * 100);
    get().setPadFxSendLevel(selectedPad, clamp(send, 0, 100));
    return;
  }
  // CC 74 (CUTOFF), 71 (RESONANCE), 73 (ATTACK), 75 (DECAY) → selected pad
  // params (0-127 → 0-100). ATTACK/DECAY feed `playAssignedPadWithContext`'s
  // envelope on next trigger; CUTOFF/RESONANCE also sync to live audio graph.
  const ccToField: Record<number, "filterCutoff" | "filterResonance" | "attack" | "decay"> = {
    74: "filterCutoff",
    71: "filterResonance",
    73: "attack",
    75: "decay",
  };
  const field = ccToField[controller];
  if (!field) return;
  const scaled = clamp(Math.round((value / 127) * 100), 0, 100);
  const padAssignments = state.padAssignments[bank].map((assignment) =>
    assignment.pad === selectedPad ? { ...assignment, [field]: scaled } : assignment,
  );
  const nextAll = { ...state.padAssignments, [bank]: padAssignments };
  set({
    padAssignments: nextAll,
    programs: syncCurrentProgram(state, { padAssignments: nextAll }),
  });
  if (field === "filterCutoff" || field === "filterResonance") {
    syncSelectedPadFilterToAudio(get(), nextAll);
  }
}

function emitMidiPadNoteOn(state: AppState, padId: string, velocity: number = 100): void {
  const s = state.settingsValues;
  if (!s.midiPadOut || !s.midiOutputDeviceId) return;
  const note = padToNote(state.padBank, padIdToIndex(padId), s.midiPadMapping);
  if (note === null) return;
  const clamped = Math.max(1, Math.min(127, Math.round(velocity)));
  midiNoteOn(s.midiOutputDeviceId, 1, note, clamped);
}

function emitMidiPadNoteOff(state: AppState, padId: string): void {
  const s = state.settingsValues;
  if (!s.midiPadOut || !s.midiOutputDeviceId) return;
  const note = padToNote(state.padBank, padIdToIndex(padId), s.midiPadMapping);
  if (note === null) return;
  midiNoteOff(s.midiOutputDeviceId, 1, note);
}

export function emitMidiTransportFromStore(kind: "START" | "STOP" | "CONTINUE"): void {
  const state = useAppStore.getState();
  const s = state.settingsValues;
  if (s.midiSyncOut !== "CLOCK" || !s.midiOutputDeviceId) return;
  midiSendTransport(s.midiOutputDeviceId, kind);
}

export function emitMidiClockFromStore(): void {
  const state = useAppStore.getState();
  const s = state.settingsValues;
  if (s.midiSyncOut !== "CLOCK" || !s.midiOutputDeviceId) return;
  midiSendClock(s.midiOutputDeviceId);
}

export function subscribeMidiInput(): void {
  const id = useAppStore.getState().settingsValues.midiInputDeviceId;
  midiSubscribeToInput(id, (message) => {
    useAppStore.getState().handleMidiInputMessage(message);
  });
}

let midiClockLastTick: number | null = null;
let midiClockIntervals: number[] = [];

function handleMidiClockPulse(
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void,
): void {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (midiClockLastTick !== null) {
    midiClockIntervals.push(now - midiClockLastTick);
    if (midiClockIntervals.length > 24) midiClockIntervals.shift();
  }
  midiClockLastTick = now;
  // After collecting one beat worth of pulses (24 PPQN), recompute BPM.
  if (midiClockIntervals.length >= 24) {
    const averageMs = midiClockIntervals.reduce((sum, ms) => sum + ms, 0) / midiClockIntervals.length;
    const bpm = 60000 / (averageMs * 24);
    set({ bpm: clamp(Math.round(bpm * 100) / 100, 30, 300) });
  }
}

function createSettingsCategories(): SettingsCategory[] {
  return [
    {
      id: "masterVolume",
      label: "MASTER VOLUME",
      settings: [
        { key: "masterVolume", label: "MASTER VOL", kind: "numeric", min: 0, max: 200, step: 5 },
      ],
    },
    {
      id: "audio",
      label: "AUDIO",
      settings: [],
    },
    {
      id: "autosave",
      label: "AUTOSAVE",
      settings: [
        { key: "autoSave", label: "AUTO SAVE", kind: "toggle" },
        { key: "autosaveIntervalSec", label: "INTERVAL SEC", kind: "numeric", min: 15, max: 600, step: 15 },
      ],
    },
    {
      id: "midi",
      label: "MIDI",
      settings: [],
    },
    {
      id: "keyboard",
      label: "KEYBOARD REFERENCE",
      settings: [],
    },
    {
      id: "system",
      label: "SYSTEM INFO",
      settings: [],
    },
  ];
}

// ============================================================================
// Song WAV export — offline render of the current song into a single buffer.
//
// MVP scope (per Marek's spec):
//   - Walks state.songSteps, expands repeats, schedules every StepEvent at the
//     correct offset from song start.
//   - Each event is voiced via a simple OfflineAudioContext graph that mirrors
//     samplerEngine.playInternal: BufferSource → envelope gain → channel gain
//     → pan → (optional) filter → master gain → destination.
//   - Respects per-pad level (mixer), pan, tune (semitones + cents → playback
//     rate), filter (type / cutoff / resonance), envelope (attack/decay),
//     LOOP flag (source.loop + loopStart/loopEnd + gain ramp-off at duration
//     end), event velocity, 16 LEVELS appliedParameter overrides.
//   - Master volume applied at the end of the chain.
//   - Adds `tailSeconds` of silence at the end so envelope decays / loop
//     fade-outs aren't cut.
//
// Not in MVP scope:
//   - FX bus rendering — fxEngine is tied to a concrete `AudioContext`. A
//     proper offline path needs fxEngine to accept `BaseAudioContext`. Punted.
//   - Mixed time-signature sequences: ticks-per-sequence is computed as
//     lengthBars * 384 (assuming 4/4). Variable-meter sequences will drift.
//   - Probability gating uses Math.random() at render time, so each export is
//     a different "take" for probability < 100 events. Acceptable.
// ============================================================================

type RenderSongOptions = { sampleRate?: number; tailSeconds?: number };

type RenderDiagSample = {
  event: string;
  pad: string;
  bank: PadBank;
  velocity: number;
  gainFromVelocity: number;
  mixLevel: number;
  mixPan: number;
  channelGain: number;
  sourceSampleRate: number;
  sourceChannels: number;
  sourcePeak: number;
};

async function renderSongOffline(state: AppState, opts: RenderSongOptions = {}): Promise<AudioBuffer> {
  const sampleRate = opts.sampleRate ?? 48000;
  const tailSeconds = opts.tailSeconds ?? 3;
  const ticksPerSecond = 96 * state.bpm / 60;
  const diagSamples: RenderDiagSample[] = [];

  // Total song length in ticks (sum of every step's sequence length × repeats).
  let totalTicks = 0;
  for (const step of state.songSteps) {
    const seq = state.sequences.find((s) => s.id === step.sequenceId);
    if (!seq) continue;
    totalTicks += seq.lengthBars * 384 * Math.max(1, step.repeats);
  }
  if (totalTicks <= 0) {
    throw new Error("Empty song — add steps with sequences first");
  }
  const songSec = totalTicks / ticksPerSecond + tailSeconds;
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(sampleRate * songSec)), sampleRate);

  // Build a fresh offline FX engine bound to this context, mirroring the live
  // graph (4 buses, master EQ + Compressor, FX1↔FX2 / FX3↔FX4 chains). Voices
  // connect their dry path to `fxMasterIn`; voices with assignment.fxBus !== 0
  // additionally route through the bus inputs map. The FX master out feeds the
  // master gain so the offline output reflects everything live playback hears.
  const offlineFx = new FxEngine();
  const fxMasterIn = offlineFx.ensureReady(ctx);
  // Preload AudioWorklet processors (BitCrusher, more coming in FX upgrade
  // sub-phases B/C) onto the OfflineAudioContext BEFORE configuring the FX
  // graph from state. Without this, a bus using BITCRUSHER would silently
  // construct as passthrough and the export would lose the effect.
  await offlineFx.preloadWorklets(ctx);
  configureOfflineFxFromState(offlineFx, state);

  const master = ctx.createGain();
  master.gain.value = (state.settingsValues.masterVolume ?? 100) / 100;
  const fxMasterOut = offlineFx.getMasterOutput();
  if (fxMasterOut) fxMasterOut.connect(master);
  master.connect(ctx.destination);

  const busInputs = new Map<number, GainNode>();
  for (const bus of state.fxBuses) {
    const input = offlineFx.getBusInput(bus.id);
    if (input) busInputs.set(bus.id, input);
  }

  // Voice dry path now feeds the FX master chain (fxMasterIn) instead of the
  // bare master gain. That way master EQ + Compressor are applied in the export.
  let cursorTicks = 0;
  let eventsScheduled = 0;
  let eventsSkipped = 0;
  // Choke / mute-target tracking: when a voice triggers, any prior scheduled
  // source on the same voice group OR on a mute-target voice group is stopped
  // at the new voice's start time. Mirrors `samplerEngine.stopVoiceGroups(
  // getMuteStopGroups(...))` semantics that live playback applies on each trigger.
  const scheduledVoices = new Map<string, AudioBufferSourceNode[]>();
  for (const step of state.songSteps) {
    const seq = state.sequences.find((s) => s.id === step.sequenceId);
    if (!seq) continue;
    const seqTicks = seq.lengthBars * 384;
    const repeats = Math.max(1, step.repeats);
    for (let r = 0; r < repeats; r += 1) {
      const baseTicks = cursorTicks;
      for (const event of seq.events) {
        if (event.muted) {
          eventsSkipped += 1;
          continue;
        }
        if (event.probability < 100 && Math.random() * 100 >= event.probability) {
          eventsSkipped += 1;
          continue;
        }
        const captured = scheduleSongEvent(ctx, fxMasterIn, state, event, baseTicks, ticksPerSecond, busInputs, scheduledVoices);
        if (captured) {
          eventsScheduled += 1;
          if (diagSamples.length < 5) diagSamples.push(captured);
        } else {
          eventsSkipped += 1;
        }
      }
      cursorTicks += seqTicks;
    }
  }

  const buffer = await ctx.startRendering();

  // Diagnostic dump — Marek can inspect browser console to see per-stage gain
  // for the first 5 events and the final buffer peak. Helps localize any
  // "render is quieter than expected" issue.
  try {
    let peak = 0;
    for (let c = 0; c < buffer.numberOfChannels; c += 1) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i += 1) {
        const v = Math.abs(data[i]);
        if (v > peak) peak = v;
      }
    }
    const peakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
    console.groupCollapsed(
      `[WAV export] buffer ${buffer.numberOfChannels}ch × ${buffer.length} frames @ ${buffer.sampleRate}Hz`,
    );
    console.log("scheduled events:", eventsScheduled);
    console.log("skipped events:", eventsSkipped);
    console.log("buffer peak (Float32 max |x|):", peak.toFixed(4), `(${peakDb.toFixed(2)} dBFS)`);
    console.log("master gain value:", master.gain.value);
    console.log("offline ctx sampleRate:", ctx.sampleRate);
    diagSamples.forEach((d, i) => {
      console.log(`event #${i + 1}`, d);
    });
    console.groupEnd();
  } catch {
    /* console may be unavailable in some environments */
  }

  return buffer;
}

function scheduleSongEvent(
  ctx: OfflineAudioContext,
  destination: AudioNode,
  state: AppState,
  event: StepEvent,
  baseTicks: number,
  ticksPerSecond: number,
  fxBusInputs?: Map<number, GainNode>,
  scheduledVoices?: Map<string, AudioBufferSourceNode[]>,
): RenderDiagSample | null {
  // Swing: real-time playback applies a per-step delay on odd 1/16th positions
  // when timingCorrect is a swingable grid. Mirror here so exported audio has
  // the same groove as live. `currentSwingTicks(state, eventStepIndex)` would
  // be the engine helper but isn't exported; inline minimal logic instead.
  const swingTicks = computeOfflineSwingTicks(state, event.step);
  const eventTicks =
    baseTicks + eventStepToTicks(event.step) + (event.timingOffset ?? 0) + swingTicks;
  const eventTimeSec = Math.max(0, eventTicks / ticksPerSecond);

  // Resolve the source assignment exactly like live playback does
  // (playStepEventFromState → padFromEvent). For 16 LEVELS-recorded events the
  // legacy `event.sourcePad` field is in "A04" bank+number format, NOT the
  // "P04" id format used by padAssignments, so we cannot use it as a lookup
  // key. `padFromEvent` derives "P{padNumber}" from event.padNumber which is
  // always the source pad id.
  const lookupPad = padFromEvent(event);
  const lookupBank = (event.padBank ?? "A") as PadBank;
  const program = getProgramForPlayback(state, event.programId);
  const padAssignments = program?.padAssignments ?? state.padAssignments;
  const padMixer = program?.padMixer ?? state.padMixer;
  const assignment = padAssignments[lookupBank]?.find((p) => p.pad === lookupPad);
  const mix = padMixer[lookupBank]?.find((p) => p.pad === lookupPad);
  if (!assignment || assignment.assignment === "---" || !mix) return null;

  const resolved = resolveAssignedSample(state, assignment.assignment);
  if (!resolved) return null;
  const buffer = getSampleBuffer(resolved.audioBufferId);
  if (!buffer) return null;

  // Choke / mute-target enforcement: stop any prior scheduled source on this
  // voice group AND on the assignment's mute target groups, at the new event's
  // start time. Mirrors live `samplerEngine.stopVoiceGroups(getMuteStopGroups(
  // ...))` behaviour. Without this, hi-hat-closed wouldn't cut hi-hat-open in
  // the export.
  if (scheduledVoices) {
    const voiceKey = mixerChannelKey(lookupBank, lookupPad, assignment ? event.programId : undefined);
    const stopGroups = getMuteStopGroups(state, assignment, lookupPad, lookupBank, padAssignments, event.programId);
    // Cross-bank Mute Group: mirror the live `getMuteGroupStopGroups` call so
    // the offline WAV render produces the same audible cut as live playback.
    const muteGroupTargets = getMuteGroupStopGroups(assignment, lookupPad, lookupBank, padAssignments, event.programId);
    const keysToStop: string[] = [
      voiceKey,
      ...stopGroups.filter((k) => k !== voiceKey),
      ...muteGroupTargets.filter((k) => k !== voiceKey),
    ];
    const eventStartSec = Math.max(0, eventTicks / ticksPerSecond);
    for (const key of keysToStop) {
      const priors = scheduledVoices.get(key);
      if (!priors) continue;
      for (const prior of priors) {
        try { prior.stop(eventStartSec); } catch { /* prior may already be scheduled past this time */ }
      }
      scheduledVoices.delete(key);
    }
  }

  // 16 LEVELS parameter overrides on the event take precedence over assignment defaults.
  const tuneOverride = event.appliedParameter === "TUNE" ? event.parameterValue ?? event.appliedValue : undefined;
  const filterCutoffOverride = event.appliedParameter === "FILTER" ? event.parameterValue ?? event.appliedValue : undefined;
  const filterTypeOverride = event.appliedParameter === "FILTER" ? event.appliedFilterType : undefined;
  const filterResonanceOverride = event.appliedParameter === "FILTER" ? event.appliedFilterResonance : undefined;
  const attackOverride = event.appliedParameter === "ATTACK" ? event.parameterValue ?? event.appliedValue : undefined;
  const decayOverride = event.appliedParameter === "DECAY" ? event.parameterValue ?? event.appliedValue : undefined;
  const gainFromVelocity = clamp(event.velocity ?? 100, 0, 127) / 127;

  // Compute playback rate from semitones + cents.
  const tuneSemis = tuneOverride ?? assignment.tune;
  const fineCents = assignment.fineTune;
  const playbackRate = Math.pow(2, (tuneSemis + fineCents / 100) / 12);

  // Sample region [start, end] as fractions of the source buffer.
  const startFrac = clamp(resolved.sampleStart, 0, 1);
  const endFrac = clamp(resolved.sampleEnd, startFrac + 0.0001, 1);
  const offset = startFrac * buffer.duration;
  const duration = Math.max(0.001, (endFrac - startFrac) * buffer.duration);

  // Envelope timings (attack/decay are 0..100 program units; programValueToMs cubic curve).
  const attackMs = programValueToMs(attackOverride ?? assignment.attack);
  const decayMs = programValueToMs(decayOverride ?? assignment.decay);

  // Event-side gate-off (NOTE ON gate, or recorded duration for any mode).
  const eventDurationTicks = event.duration ?? 0;
  const sustainSec = eventDurationTicks > 0 ? eventDurationTicks / ticksPerSecond : undefined;

  // Build the per-voice graph.
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = playbackRate;
  if (assignment.loop) {
    source.loop = true;
    source.loopStart = offset;
    source.loopEnd = offset + duration;
  }

  const envelopeGain = ctx.createGain();
  const channelGain = ctx.createGain();
  const pan = ctx.createStereoPanner();
  channelGain.gain.value = gainFromVelocity * (mix.level / 100);
  pan.pan.value = clamp(mix.pan / 64, -1, 1);

  const filterType = filterTypeOverride ?? assignment.filterType;
  let filter: BiquadFilterNode | null = null;
  // Choose the per-voice tail destination: dry → master OR voice → FX bus per
  // assignment.fxBus + .fxSendLevel. Mirrors fxEngine.routeVoice() semantics:
  //   • SEND mode (bus.direct): voice → master (dry) AND voice → sendGain → bus.input
  //   • INSERT mode (!bus.direct): voice → bus.input only (no dry)
  //   • bus 0 / OFF: voice → master directly
  const fxBusId = (assignment.fxBus ?? 0) as 0 | BusId;
  const fxBus = fxBusId !== 0 ? state.fxBuses.find((b) => b.id === fxBusId) : undefined;
  const fxSendLevel = clamp(assignment.fxSendLevel ?? 0, 0, 100) / 100;
  const dryTarget = destination;

  // Build the dry path: source → [filter?] → envelopeGain → channelGain → pan → dryTarget
  if (filterType !== "OFF") {
    const cutoff01 = clamp((filterCutoffOverride ?? assignment.filterCutoff) / 100, 0, 1);
    const resonance01 = clamp((filterResonanceOverride ?? assignment.filterResonance) / 100, 0, 1);
    filter = ctx.createBiquadFilter();
    filter.type =
      filterType === "LOWPASS" ? "lowpass" : filterType === "HIGHPASS" ? "highpass" : "bandpass";
    filter.frequency.value = 60 + cutoff01 * (ctx.sampleRate / 2 - 60);
    filter.Q.value = 0.0001 + resonance01 * 18;
    source.connect(filter).connect(envelopeGain).connect(channelGain).connect(pan);
  } else {
    source.connect(envelopeGain).connect(channelGain).connect(pan);
  }

  // Route the post-pan signal to dry destination and/or FX bus.
  if (fxBus && fxBusInputs && fxBusInputs.has(fxBusId as number)) {
    const busInput = fxBusInputs.get(fxBusId as number)!;
    if (fxBus.direct) {
      // SEND mode: dry to master + send to bus at sendLevel.
      pan.connect(dryTarget);
      const sendGain = ctx.createGain();
      sendGain.gain.value = fxSendLevel;
      pan.connect(sendGain);
      sendGain.connect(busInput);
    } else {
      // INSERT mode: all signal through bus, no dry.
      pan.connect(busInput);
    }
  } else {
    pan.connect(dryTarget);
  }

  // Apply envelope. Two distinct shapes mirroring samplerEngine.applyEnvelope:
  //   • NOTE ON: attack ramp 0→1; HOLD at 1 until release event (no auto-decay).
  //   • ONE SHOT (default): attack ramp 0→1; immediate decay ramp 1→0.
  // Recorded event.duration > 0 schedules an additional gate-off at duration end
  // (mirrors real-time softStopVoice: gain ramp 1→0 over releaseRamp + source.stop).
  //
  // Critical asymmetry with real-time, mirrored here: when attack=0 AND decay≥100
  // (the engine's "no envelope / play through" sentinel), real-time `playAssignedPadWithContext`
  // sets `envelope: undefined`, which makes `voice.envelopeDecayMs = 0` in samplerEngine.
  // The sustainMs softStop then falls back to a 4 ms release ramp (MIN_RAMP_MS × 4)
  // because the OR fallback `envelopeDecayMs > 0 ? envelopeDecayMs : MIN_RAMP_MS * 4`
  // picks the 4 ms path. Without this branch, the offline render would interpret
  // decay=100 as a 5-second linear release (programValueToMs cubic curve), making
  // bass NOTE ON events appear to "play full sample length ignoring duration."
  const startTime = eventTimeSec;
  const effectiveAttack = attackOverride ?? assignment.attack;
  const effectiveDecay = decayOverride ?? assignment.decay;
  const skipEnvelope = effectiveAttack === 0 && effectiveDecay >= 100;
  const attackSec = skipEnvelope ? 0 : Math.max(0.001, attackMs / 1000);
  const decaySec = Math.max(0.005, decayMs / 1000);
  const releaseRampSec = skipEnvelope ? 0.004 : decaySec;

  if (skipEnvelope) {
    envelopeGain.gain.setValueAtTime(1, startTime);
  } else {
    envelopeGain.gain.setValueAtTime(0, startTime);
    envelopeGain.gain.linearRampToValueAtTime(1, startTime + attackSec);
  }

  let scheduledStopTime: number | null = null;
  if (sustainSec !== undefined) {
    // Event has a recorded duration → gate off at duration end. Release ramp
    // length matches real-time samplerEngine softStop semantics.
    const releaseStart = startTime + Math.max(attackSec, sustainSec);
    envelopeGain.gain.setValueAtTime(1, releaseStart);
    envelopeGain.gain.linearRampToValueAtTime(0, releaseStart + releaseRampSec);
    scheduledStopTime = releaseStart + releaseRampSec + 0.005;
  } else if (!skipEnvelope && assignment.mode === "ONE SHOT") {
    // ONE SHOT without recorded duration: standard AD envelope (real-time engine
    // ramps 1→0 right after attack when holdMode !== NOTE ON and decayMs > 0).
    if (decayMs > 0) {
      envelopeGain.gain.linearRampToValueAtTime(0, startTime + attackSec + decaySec);
    }
  }
  // NOTE ON or skipEnvelope without recorded duration: hold at 1 indefinitely (sample runs to end).

  // Source start/stop. Looping voices must omit the duration arg on start()
  // (otherwise the loop would self-terminate before its envelope gate-off);
  // non-loop voices that have a gate-off (recorded duration) also omit
  // duration so source.stop() controls when they end — mirrors real-time
  // softStopVoice which calls source.stop(now + ramp).
  if (assignment.loop) {
    source.start(startTime, offset);
    if (scheduledStopTime !== null) source.stop(scheduledStopTime);
  } else if (scheduledStopTime !== null) {
    source.start(startTime, offset);
    source.stop(scheduledStopTime);
  } else {
    source.start(startTime, offset, duration);
  }

  // Register the scheduled source so future events on the same voice-group key
  // (or on this assignment's mute targets) can stop it before they start.
  if (scheduledVoices) {
    const voiceKey = mixerChannelKey(lookupBank, lookupPad, event.programId);
    const list = scheduledVoices.get(voiceKey) ?? [];
    list.push(source);
    scheduledVoices.set(voiceKey, list);
  }

  // Diagnostic snapshot for the caller. Full-buffer peak scan — sparse scan
  // (every 46th sample at 48 kHz × 1 s) was under-reporting transients in
  // kick/snare samples by 10–30 dB, masking the true source peak. Full scan
  // costs ~50k ops per event for a 1-second 48 kHz sample, capped at 5 diag
  // samples per render. Negligible.
  let sourcePeak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i += 1) {
      const v = Math.abs(data[i]);
      if (v > sourcePeak) sourcePeak = v;
    }
  }
  return {
    event: event.step,
    pad: lookupPad,
    bank: lookupBank,
    velocity: event.velocity,
    gainFromVelocity,
    mixLevel: mix.level,
    mixPan: mix.pan,
    channelGain: channelGain.gain.value,
    sourceSampleRate: buffer.sampleRate,
    sourceChannels: buffer.numberOfChannels,
    sourcePeak,
  };
}

// ============================================================================
// Offline FX configuration — walks live store state and applies the same
// per-bus block effects, params, bypass, FX1↔FX2 / FX3↔FX4 chains, master EQ,
// and master Compressor settings to a fresh FxEngine instance bound to the
// offline AudioContext.
// ============================================================================

function configureOfflineFxFromState(engine: FxEngine, state: AppState): void {
  // Per-bus block effects + bypass + params
  for (const bus of state.fxBuses) {
    for (const block of ["A", "B"] as BusBlockId[]) {
      const blockState = block === "A" ? bus.blockA : bus.blockB;
      if (blockState.effect) {
        engine.setBusBlockEffect(bus.id, block, blockState.effect, blockState.params);
        for (const [key, value] of Object.entries(blockState.params)) {
          engine.setBusBlockParam(bus.id, block, key, value);
        }
      }
      if (blockState.bypass) engine.setBusBlockBypass(bus.id, block, true);
    }
  }
  // Bus chains
  if (state.fxChainFX1ToFX2) engine.setFxChain("FX1_FX2" as ChainPair, true);
  if (state.fxChainFX3ToFX4) engine.setFxChain("FX3_FX4" as ChainPair, true);

  // Master EQ — 4 bands (low/lowMid/highMid/high), each with freq/gain/q.
  const eqParams = state.masterFx.eq.params;
  const eqBandSpecs: Array<[0 | 1 | 2 | 3, string, string, string]> = [
    [0, "lowFreq", "lowGain", "lowQ"],
    [1, "lowMidFreq", "lowMidGain", "lowMidQ"],
    [2, "highMidFreq", "highMidGain", "highMidQ"],
    [3, "highFreq", "highGain", "highQ"],
  ];
  for (const [idx, fKey, gKey, qKey] of eqBandSpecs) {
    if (typeof eqParams[fKey] === "number") engine.setMasterEqBand(idx, "freq", eqParams[fKey]);
    if (typeof eqParams[gKey] === "number") engine.setMasterEqBand(idx, "gain", eqParams[gKey]);
    if (typeof eqParams[qKey] === "number") engine.setMasterEqBand(idx, "q", eqParams[qKey]);
  }
  engine.setMasterEqBypass(state.masterFx.eq.bypass);

  // Master Compressor
  const compParams = state.masterFx.compressor.params;
  for (const key of ["threshold", "ratio", "attack", "release", "makeupGain"]) {
    if (typeof compParams[key] === "number") engine.setMasterCompParam(key, compParams[key]);
  }
  engine.setMasterCompBypass(state.masterFx.compressor.bypass);
}

// ============================================================================
// Offline swing — applies per-step delay matching the live `currentSwingTicks`
// helper used by the live sequencer's `tickStepPlayback`. Real-time delays odd
// 1/16th positions by (swing - 50)% of the 1/16th tick length when timingCorrect
// is a swingable grid. For mixed-grid sequences only the dominant grid is
// approximated here — full MPC-precise per-bar TS swing is out of MVP scope.
// ============================================================================

function computeOfflineSwingTicks(state: AppState, eventStep: string): number {
  if (!swingApplicable(state.timingCorrect)) return 0;
  const swingAmount = (state.swing - 50) / 100; // -0.5 .. +0.5
  if (swingAmount === 0) return 0;
  // For the default 1/16 grid (24-tick step), shift odd 16ths by swing% of 24.
  // For 1/8 grid (48-tick step), shift odd 8ths by swing% of 48.
  // swingApplicable above narrowed the type to "1/16" | "1/8" so OFF is not possible here.
  const gridTicks = timingCorrectGridTicks(state.timingCorrect);
  const eventTickFromBarStart = eventStepToTicks(eventStep) % 384;
  const stepIndex = Math.floor(eventTickFromBarStart / gridTicks);
  if (stepIndex % 2 === 0) return 0; // even-numbered grid positions don't shift
  return Math.round(swingAmount * gridTicks);
}

// ============================================================================
// Application window close — Tauri-aware.
//
// Tauri path: destroy() skips the Rust-side CloseRequested intercept (which
// would otherwise re-open the QUIT dialog). Requires `core:window:allow-destroy`
// in src-tauri/capabilities/default.json — without it destroy() throws and we
// let the error propagate so callers surface it.
//
// Browser path: window.close() only works for pages opened by script. For
// pages opened manually (e.g. localhost dev tab), the browser silently
// ignores it. We give the page a short tick to teardown and check `closed`
// to confirm — if still open after the grace window, the caller treats it as
// a soft failure and shows an error.
//
// In neither case do we throw "blocked" ourselves; throw means a real API
// failure (permission, exception). Soft block (browser silently ignored) is
// signalled by returning normally without the page actually unmounting.
// ============================================================================
async function closeApplicationWindow(): Promise<void> {
  if (isTauri()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().destroy();
    return;
  }
  if (typeof window !== "undefined") {
    window.close();
  }
}
