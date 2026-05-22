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
  // v2 → v3: Phase 2 FX — 2 effect blocks per bus (blockA/blockB) + chaining flags.
  // The v2 single-effect-per-bus shape collapses into blockA, blockB defaults to OFF.
  // chainFX1ToFX2 + chainFX3ToFX4 default to false (no chaining).
  {
    from: 2,
    to: 3,
    apply: (m) => {
      if (m.type === "project") {
        const v2Project = m as typeof m & { fxBuses?: unknown };
        const oldBuses = Array.isArray(v2Project.fxBuses) ? v2Project.fxBuses as Array<Record<string, unknown>> : [];
        const newBuses = ([1, 2, 3, 4] as const).map((id) => {
          const old = oldBuses.find((b) => b && b.id === id);
          const oldEffect = (old?.effect as string | null | undefined) ?? null;
          const oldParams = (old?.params && typeof old.params === "object") ? old.params : {};
          const oldBypass = typeof old?.bypass === "boolean" ? old.bypass : false;
          const oldDirect = typeof old?.direct === "boolean" ? old.direct : true;
          return {
            id,
            direct: oldDirect,
            blockA: { effect: oldEffect, bypass: oldBypass, params: oldParams },
            blockB: { effect: null, bypass: false, params: {} },
          };
        });
        return {
          ...m,
          schemaVersion: 3,
          fxBuses: newBuses,
          fxChainFX1ToFX2: false,
          fxChainFX3ToFX4: false,
        };
      }
      return { ...m, schemaVersion: 3 };
    },
  },
  // v3 → v4: Session 27 FX upgrade. New AudioWorklet-backed Reverb (FDN),
  // Flanger (Hermite), Chorus (multi-voice stereo), BitCrusher (proper
  // worklet), new Phaser effect. Delay gains tape voice (drive + tone),
  // ping-pong mode, tempo sync. Migration fills new parameter keys with
  // EFFECT_DEFAULTS for each effect type, maps legacy keys:
  //   BITCRUSHER.sampleRateReduction → srReduce (same division semantic)
  //   DELAY.lpCut                    → tone (same LP-cutoff semantic)
  // Old keys are KEPT in the params object so re-saving an upgraded project
  // and loading it in an older build doesn't crash — the runtime chains
  // prefer the new key but read legacy as fallback.
  {
    from: 3,
    to: 4,
    apply: (m) => {
      if (m.type !== "project") return { ...m, schemaVersion: 4 };

      // Per-effect default fillers. Mirrors EFFECT_DEFAULTS in fxEngine.ts
      // — duplicated here so the migration doesn't import the FX engine
      // (which would pull AudioContext + worklet code into the loader).
      const fillEffectParams = (effect: string | null, params: Record<string, unknown>): Record<string, unknown> => {
        if (!effect) return params;
        const next = { ...params };
        const defaults: Record<string, Record<string, number>> = {
          REVERB: {
            size: 70, damping: 50, diffusion: 70, wetDry: 100,
            preDelay: 20, hpCut: 100, lpCut: 8000,
          },
          DELAY: {
            timeMs: 250, sync: 0, mode: 0, feedback: 30, wetDry: 30,
            tone: 8000, drive: 0, hpCut: 100, lpCut: 8000,
          },
          FLANGER: { rate: 0.5, depth: 50, feedback: 30, manual: 25, wetDry: 50 },
          CHORUS: { rate: 1, depth: 30, voices: 4, width: 50, mix: 50 },
          BITCRUSHER: { bits: 12, srReduce: 4, drive: 0, wetDry: 100 },
          PHASER: { rate: 0.5, depth: 70, stages: 6, feedback: 30, wetDry: 50 },
          EQ: {
            lowFreq: 100, lowGain: 0, lowQ: 0.7,
            lowMidFreq: 400, lowMidGain: 0, lowMidQ: 1,
            highMidFreq: 2000, highMidGain: 0, highMidQ: 1,
            highFreq: 8000, highGain: 0, highQ: 0.7,
          },
          COMPRESSOR: {
            threshold: -20, ratio: 4, attack: 5, release: 50, makeupGain: 0,
          },
        };
        const eff = defaults[effect];
        if (!eff) return next;
        for (const [k, v] of Object.entries(eff)) {
          if (next[k] === undefined) next[k] = v;
        }
        // Specific legacy → new key mappings (preserve legacy in params too).
        if (effect === "BITCRUSHER" && typeof next.sampleRateReduction === "number" && next.srReduce === undefined) {
          next.srReduce = next.sampleRateReduction;
        }
        if (effect === "DELAY" && typeof next.lpCut === "number" && next.tone === undefined) {
          next.tone = next.lpCut;
        }
        return next;
      };

      const v3Project = m as typeof m & { fxBuses?: unknown };
      const oldBuses = Array.isArray(v3Project.fxBuses) ? (v3Project.fxBuses as Array<Record<string, unknown>>) : [];
      const newBuses = oldBuses.map((bus) => {
        const blockA = (bus.blockA as Record<string, unknown>) ?? { effect: null, params: {} };
        const blockB = (bus.blockB as Record<string, unknown>) ?? { effect: null, params: {} };
        return {
          ...bus,
          blockA: {
            ...blockA,
            params: fillEffectParams(
              (blockA.effect as string | null) ?? null,
              (blockA.params as Record<string, unknown>) ?? {},
            ),
          },
          blockB: {
            ...blockB,
            params: fillEffectParams(
              (blockB.effect as string | null) ?? null,
              (blockB.params as Record<string, unknown>) ?? {},
            ),
          },
        };
      });

      return {
        ...m,
        schemaVersion: 4,
        fxBuses: newBuses,
      };
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
