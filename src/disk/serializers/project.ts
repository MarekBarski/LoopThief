import { encodeAudioBufferToWav } from "../wavCodec";
import type { GlobalSettings, ProjectManifest, SampleEntry, SerializedSample } from "../types";
import { CURRENT_SCHEMA_VERSION } from "../types";

export type SampleSource = {
  id: string;
  name: string;
  audioBufferId: string;
  durationMs: number;
  duration: number;
  sampleRate: number;
  channelCount: number;
  waveform: number[];
  keptSlices: string[];
  editState?: SerializedSample["editState"];
};

export type ProjectSerializationInput = {
  name: string;
  appVersion: string;
  samples: SampleSource[];
  programs: unknown[];
  sequences: unknown[];
  songs: unknown[];
  globalSettings: GlobalSettings;
  fxBuses?: unknown[];
  masterFx?: unknown;
  fxChainFX1ToFX2?: boolean;
  fxChainFX3ToFX4?: boolean;
  resolveAudioBuffer: (audioBufferId: string) => AudioBuffer | null;
};

export type SerializedProjectBundle = {
  manifest: ProjectManifest;
  sampleEntries: SampleEntry[];
};

function sanitizeFilename(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 80) || "sample";
}

export function serializeProject(input: ProjectSerializationInput): SerializedProjectBundle {
  const sampleEntries: SampleEntry[] = [];
  const serializedSamples: SerializedSample[] = input.samples.map((sample, index) => {
    const buffer = input.resolveAudioBuffer(sample.audioBufferId);
    const filename = `${String(index).padStart(3, "0")}_${sanitizeFilename(sample.name)}.wav`;
    const path = filename;
    if (buffer) {
      sampleEntries.push({ path, bytes: encodeAudioBufferToWav(buffer) });
    }
    return {
      id: sample.id,
      name: sample.name,
      path,
      durationMs: sample.durationMs,
      duration: sample.duration,
      sampleRate: sample.sampleRate,
      channelCount: sample.channelCount,
      waveform: sample.waveform,
      keptSlices: sample.keptSlices,
      editState: sample.editState,
    };
  });

  const manifest: ProjectManifest = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    type: "project",
    appVersion: input.appVersion,
    savedAt: new Date().toISOString(),
    name: input.name,
    samples: serializedSamples,
    programs: input.programs,
    sequences: input.sequences,
    songs: input.songs,
    globalSettings: input.globalSettings,
    fxBuses: input.fxBuses,
    masterFx: input.masterFx,
    fxChainFX1ToFX2: input.fxChainFX1ToFX2,
    fxChainFX3ToFX4: input.fxChainFX3ToFX4,
  };

  return { manifest, sampleEntries };
}
