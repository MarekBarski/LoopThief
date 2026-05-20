export const CURRENT_SCHEMA_VERSION = 1 as const;

export type ManifestType = "project" | "all" | "seq";

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
};

export type AllManifest = BaseManifest & {
  type: "all";
  sequences: unknown[];
  songs: unknown[];
  globalSettings: GlobalSettings;
};

export type SeqManifest = BaseManifest & {
  type: "seq";
  sequence: unknown;
};

export type AnyManifest = ProjectManifest | AllManifest | SeqManifest;

export type SampleEntry = {
  path: string;
  bytes: ArrayBuffer;
};

export type ZipReadResult = {
  manifest: AnyManifest;
  samples: Map<string, ArrayBuffer>;
};
