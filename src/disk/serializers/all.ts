import type { AllManifest, GlobalSettings } from "../types";
import { CURRENT_SCHEMA_VERSION } from "../types";

export type AllSerializationInput = {
  name: string;
  appVersion: string;
  sequences: unknown[];
  songs: unknown[];
  globalSettings: GlobalSettings;
};

export function serializeAll(input: AllSerializationInput): AllManifest {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    type: "all",
    appVersion: input.appVersion,
    savedAt: new Date().toISOString(),
    name: input.name,
    sequences: input.sequences,
    songs: input.songs,
    globalSettings: input.globalSettings,
  };
}
