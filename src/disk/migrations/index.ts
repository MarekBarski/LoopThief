import type { AnyManifest } from "../types";
import { CURRENT_SCHEMA_VERSION } from "../types";

export type Migration = {
  from: number;
  to: number;
  apply: (manifest: AnyManifest) => AnyManifest;
};

const MIGRATIONS: Migration[] = [
  // Future migrations registered here in order:
  //   { from: 1, to: 2, apply: (m) => ({ ...m, schemaVersion: 2, /* transform */ }) },
];

export function applyMigrations(input: AnyManifest): AnyManifest {
  let manifest = input;
  let safety = 0;
  while (manifest.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const migration = MIGRATIONS.find((m) => m.from === manifest.schemaVersion);
    if (!migration) {
      throw new Error(
        `No migration registered from schema v${manifest.schemaVersion} to v${CURRENT_SCHEMA_VERSION}`,
      );
    }
    manifest = migration.apply(manifest);
    if (manifest.schemaVersion !== migration.to) {
      throw new Error(
        `Migration v${migration.from}->v${migration.to} produced manifest with wrong version ${manifest.schemaVersion}`,
      );
    }
    safety += 1;
    if (safety > 100) throw new Error("Migration chain exceeded 100 hops; aborting");
  }
  if (manifest.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Manifest is schema v${manifest.schemaVersion}; this build supports up to v${CURRENT_SCHEMA_VERSION}`,
    );
  }
  return manifest;
}
