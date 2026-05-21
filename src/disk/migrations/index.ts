import type { AnyManifest } from "../types";
import { CURRENT_SCHEMA_VERSION } from "../types";

export type Migration = {
  from: number;
  to: number;
  apply: (manifest: AnyManifest) => AnyManifest;
};

const MIGRATIONS: Migration[] = [
  // v1 → v2: Phase A FX system. PROJECT manifests gain `fxBuses` + `masterFx` defaults
  // (4 empty buses + flat-bypassed master EQ/Comp). ALL/SEQ manifests just bump version
  // (no FX payload — FX state is project-level only).
  {
    from: 1,
    to: 2,
    apply: (m) => {
      if (m.type === "project") {
        return {
          ...m,
          schemaVersion: 2,
          fxBuses: [
            { id: 1, effect: null, direct: true, bypass: false, params: {} },
            { id: 2, effect: null, direct: true, bypass: false, params: {} },
            { id: 3, effect: null, direct: true, bypass: false, params: {} },
            { id: 4, effect: null, direct: true, bypass: false, params: {} },
          ],
          masterFx: {
            eq: { bypass: true, params: {} },
            compressor: { bypass: true, params: {} },
          },
        };
      }
      return { ...m, schemaVersion: 2 };
    },
  },
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
