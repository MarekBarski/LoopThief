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
    // Strict: a sample listed in the manifest MUST have its WAV bytes in the
    // archive. Previously a missing buffer silently dropped the bytes while
    // still recording the path → a .lthief that claimed more samples than it
    // contained (Session 39 data-loss bug). Now we abort the whole save, the
    // same strictness as single-sample export (useAppStore.ts SAVE_SAMPLE).
    if (!buffer) {
      throw new Error(
        `Cannot save project: sample '${sample.name}' has no audio buffer. ` +
          `Sample may be corrupted or still loading.`,
      );
    }
    const filename = `${String(index).padStart(3, "0")}_${sanitizeFilename(sample.name)}.wav`;
    const path = filename;
    sampleEntries.push({ path, bytes: encodeAudioBufferToWav(buffer) });
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

  // Integrity guard: every sample referenced in the manifest must point at a
  // WAV actually written into the archive. Count-equality is the wrong
  // invariant (a later commit may dedupe shared buffers, so N samples can map
  // to fewer files) — the real invariant is "no dangling path". This catches
  // any future code path that lists a sample without queuing its bytes.
  const writtenPaths = new Set(sampleEntries.map((entry) => entry.path));
  const dangling = serializedSamples.filter((sample) => !writtenPaths.has(sample.path));
  if (dangling.length > 0) {
    throw new Error(
      `Cannot save project: ${dangling.length} sample(s) missing WAV data in archive ` +
        `(${dangling.map((sample) => sample.name).join(", ")}).`,
    );
  }

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
