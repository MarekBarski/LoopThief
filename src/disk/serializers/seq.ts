import type { SeqManifest } from "../types";
import { CURRENT_SCHEMA_VERSION } from "../types";

export type SeqSerializationInput = {
  name: string;
  appVersion: string;
  sequence: unknown;
};

export function serializeSeq(input: SeqSerializationInput): SeqManifest {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    type: "seq",
    appVersion: input.appVersion,
    savedAt: new Date().toISOString(),
    name: input.name,
    sequence: input.sequence,
  };
}
