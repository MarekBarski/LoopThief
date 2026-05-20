import { applyMigrations } from "./migrations";
import { readProjectZip } from "./zipContainer";
import type { AllManifest, AnyManifest, ProjectManifest, SeqManifest, SerializedSample } from "./types";

export type LoadedSample = {
  metadata: SerializedSample;
  buffer: AudioBuffer;
};

export type LoadProgress = {
  phase: "READ" | "MIGRATE" | "DECODE" | "DONE";
  completed: number;
  total: number;
  message: string;
};

export type LoadOptions = {
  decodeAudio: (bytes: ArrayBuffer) => Promise<AudioBuffer>;
  onProgress?: (progress: LoadProgress) => void;
};

export type LoadedProject = {
  type: "project";
  manifest: ProjectManifest;
  samples: LoadedSample[];
};

export type LoadedAll = {
  type: "all";
  manifest: AllManifest;
};

export type LoadedSeq = {
  type: "seq";
  manifest: SeqManifest;
};

export type LoadedBundle = LoadedProject | LoadedAll | LoadedSeq;

export async function loadFromBlob(blob: Blob, options: LoadOptions): Promise<LoadedBundle> {
  const { decodeAudio, onProgress } = options;
  onProgress?.({ phase: "READ", completed: 0, total: 1, message: "Reading ZIP..." });
  const { manifest: rawManifest, samples: sampleBlobs } = await readProjectZip(blob);
  onProgress?.({ phase: "MIGRATE", completed: 0, total: 1, message: "Applying migrations..." });
  const migrated = applyMigrations(rawManifest) as AnyManifest;
  if (migrated.type === "project") {
    const projectManifest = migrated;
    const total = projectManifest.samples.length;
    const loadedSamples: LoadedSample[] = [];
    for (let index = 0; index < projectManifest.samples.length; index += 1) {
      const sampleMeta = projectManifest.samples[index];
      const bytes = sampleBlobs.get(sampleMeta.path);
      if (!bytes) {
        throw new Error(`ZIP missing sample bytes for path "${sampleMeta.path}"`);
      }
      onProgress?.({
        phase: "DECODE",
        completed: index,
        total,
        message: `Loading samples: ${index}/${total}`,
      });
      const buffer = await decodeAudio(bytes);
      loadedSamples.push({ metadata: sampleMeta, buffer });
    }
    onProgress?.({ phase: "DONE", completed: total, total, message: "Loaded" });
    return { type: "project", manifest: projectManifest, samples: loadedSamples };
  }
  if (migrated.type === "all") {
    onProgress?.({ phase: "DONE", completed: 1, total: 1, message: "Loaded" });
    return { type: "all", manifest: migrated };
  }
  if (migrated.type === "seq") {
    onProgress?.({ phase: "DONE", completed: 1, total: 1, message: "Loaded" });
    return { type: "seq", manifest: migrated };
  }
  throw new Error(`Unknown manifest type: ${String((migrated as { type?: unknown }).type)}`);
}
