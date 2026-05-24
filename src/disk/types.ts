export const CURRENT_SCHEMA_VERSION = 5 as const;

// Project is the only supported manifest. The `"all"` (.lthief-all) and
// `"seq"` (.lthief-seq) formats were dropped in Sub-phase D — they offered
// no functional value over a full project save and were never officially
// shipped. Loader rejects them with a friendly error.
export type ManifestType = "project";

export type SerializedSample = {
  id: string;
  name: string;
  path: string;
  durationMs: number;
  duration: number;
  sampleRate: number;
  channelCount: number;
  waveform: number[];
  keptSlices: string[];
  editState?: {
    sampleStart: number;
    sampleEnd: number;
    loopEnabled: boolean;
    loopStart: number;
    loopEnd: number;
    loopBars: number;
    sliceMarkers: number[];
  };
};

export type GlobalSettings = {
  bpm: number;
  swing: number;
  timingCorrect: string;
  tripletMode: boolean;
  timeSignature: string;
  sequenceLengthBars: number;
  metronomeEnabled: boolean;
  metronomeDuringRecord: boolean;
  metronomeCountInBars: number;
  metronomeVolume: number;
};

export type BaseManifest = {
  schemaVersion: number;
  type: ManifestType;
  appVersion: string;
  savedAt: string;
  name: string;
};

export type ProjectManifest = BaseManifest & {
  type: "project";
  samples: SerializedSample[];
  programs: unknown[];
  sequences: unknown[];
  songs: unknown[];
  globalSettings: GlobalSettings;
  fxBuses?: unknown[];           // Phase A: single effect per bus (v2). Phase 2: blockA/blockB shape (v3).
  masterFx?: unknown;            // Master EQ + Compressor.
  fxChainFX1ToFX2?: boolean;     // Phase 2: FX1 → FX2 chain routing.
  fxChainFX3ToFX4?: boolean;     // Phase 2: FX3 → FX4 chain routing.
};

export type AnyManifest = ProjectManifest;

export type SampleEntry = {
  path: string;
  bytes: ArrayBuffer;
};

export type ZipReadResult = {
  manifest: AnyManifest;
  samples: Map<string, ArrayBuffer>;
};
