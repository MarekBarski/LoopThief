import { applyMigrations } from "./migrations";
import { readProjectZip } from "./zipContainer";
import type { AnyManifest, ProjectManifest, SerializedSample } from "./types";

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

// Sub-phase D — `.lthief-all` and `.lthief-seq` formats removed. The loader
// only returns a `LoadedProject` shape now; legacy formats trigger an error
// from `loadFromBlob`.
export type LoadedBundle = LoadedProject;

export async function loadFromBlob(blob: Blob, options: LoadOptions): Promise<LoadedBundle> {
  const { decodeAudio, onProgress } = options;
  onProgress?.({ phase: "READ", completed: 0, total: 1, message: "Reading ZIP..." });
  const { manifest: rawManifest, samples: sampleBlobs } = await readProjectZip(blob);
  onProgress?.({ phase: "MIGRATE", completed: 0, total: 1, message: "Applying migrations..." });
  const migrated = applyMigrations(rawManifest) as AnyManifest;

  if (migrated.type !== "project") {
    // .lthief-all and .lthief-seq legacy formats reach this branch via the
    // `(migrated as { type?: unknown }).type` escape hatch — neither type
    // is in the union anymore but old files on disk still carry them in
    // their manifest JSON.
    const legacyType = (migrated as { type?: unknown }).type;
    if (legacyType === "all" || legacyType === "seq") {
      throw new Error(
        "Unsupported format. .lthief-all and .lthief-seq were dropped — use .lthief project files.",
      );
    }
    throw new Error(`Unknown manifest type: ${String(legacyType)}`);
  }

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
