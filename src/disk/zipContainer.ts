import JSZip from "jszip";
import type { AnyManifest, SampleEntry, ZipReadResult } from "./types";

export async function writeProjectZip(
  manifest: AnyManifest,
  samples: SampleEntry[] = [],
): Promise<Blob> {
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  if (samples.length > 0) {
    const samplesFolder = zip.folder("samples");
    if (!samplesFolder) throw new Error("Failed to create samples folder in ZIP");
    for (const entry of samples) {
      samplesFolder.file(entry.path, entry.bytes);
    }
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export async function readProjectZip(blob: Blob): Promise<ZipReadResult> {
  const zip = await JSZip.loadAsync(blob);
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) throw new Error("ZIP missing manifest.json");
  const manifestText = await manifestFile.async("string");
  const manifest = JSON.parse(manifestText) as AnyManifest;
  if (typeof manifest.schemaVersion !== "number") {
    throw new Error("manifest.json missing or invalid schemaVersion");
  }
  const manifestType = (manifest as { type?: unknown }).type;
  if (manifestType !== "project" && manifestType !== "all" && manifestType !== "seq") {
    throw new Error(`manifest.json has unknown type "${String(manifestType)}"`);
  }
  const samples = new Map<string, ArrayBuffer>();
  const samplesFolder = zip.folder("samples");
  if (samplesFolder) {
    const fileEntries: { name: string; file: JSZip.JSZipObject }[] = [];
    samplesFolder.forEach((relativePath, file) => {
      if (!file.dir) fileEntries.push({ name: relativePath, file });
    });
    for (const entry of fileEntries) {
      samples.set(entry.name, await entry.file.async("arraybuffer"));
    }
  }
  return { manifest, samples };
}
