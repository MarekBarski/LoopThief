# LoopThief Disk Schema — v1

LoopThief project files are ZIP containers with three flavors:

| Extension | Type | Contents |
|---|---|---|
| `.lthief` | `project` | Full project: samples (embedded WAV) + programs + sequences + songs + global settings |
| `.lthief-all` | `all` | All sequences + songs + global settings (NO samples, NO programs) |
| `.lthief-seq` | `seq` | Single sequence + its metadata (NO samples, NO programs) |

All three are ZIP files containing at minimum `manifest.json`. `.lthief` additionally contains a `samples/` folder with one WAV file per sample.

## Schema versioning

Every manifest carries a `schemaVersion: number`. Current value is **1**.

On load, the file goes through `applyMigrations(manifest)` (`src/disk/migrations/index.ts`) which chains `vN -> vN+1` migration functions until reaching `CURRENT_SCHEMA_VERSION`. Migrations are registered in order in the `MIGRATIONS` array.

If a manifest's `schemaVersion` is greater than what this build supports, load fails fast.

If no migration exists for a given version step, load fails with a clear error.

## ZIP layout

```
project.lthief
├── manifest.json              (UTF-8 JSON, pretty-printed)
└── samples/                   (only for type="project")
    ├── 000_kick.wav
    ├── 001_snare.wav
    └── ...                    (16-bit PCM WAV, sample path matches manifest.samples[].path)
```

ZIP compression: DEFLATE level 6. JSZip generates browser-compatible output that re-opens cleanly on Windows / macOS / Linux.

## Common header (every type)

```json
{
  "schemaVersion": 1,
  "type": "project" | "all" | "seq",
  "appVersion": "0.1.0",
  "savedAt": "2026-05-20T14:30:00.000Z",
  "name": "user-provided name"
}
```

- `schemaVersion`: number. Required. Must match a known migration target.
- `type`: discriminator. One of `"project"`, `"all"`, `"seq"`.
- `appVersion`: app version that wrote the file. Free-form string for debugging; not used by migrations.
- `savedAt`: ISO 8601 UTC timestamp.
- `name`: human-readable name. Sanitized at save time.

## type: "project"

```json
{
  "schemaVersion": 1,
  "type": "project",
  "appVersion": "0.1.0",
  "savedAt": "2026-05-20T14:30:00.000Z",
  "name": "my-beat-tape",
  "samples": [
    {
      "id": "sample-abc-123",
      "name": "kick",
      "path": "000_kick.wav",
      "durationMs": 824.5,
      "duration": 0.8245,
      "sampleRate": 44100,
      "channelCount": 1,
      "waveform": [0.12, 0.34, ...],
      "keptSlices": [],
      "editState": {
        "sampleStart": 0,
        "sampleEnd": 0.8245,
        "loopEnabled": false,
        "loopStart": 0,
        "loopEnd": 0.8245,
        "loopBars": 4,
        "sliceMarkers": []
      }
    }
  ],
  "programs": [/* Program[] from store */],
  "sequences": [/* Sequence[] from store */],
  "songs":     [/* SongStep[] from store */],
  "globalSettings": {
    "bpm": 90,
    "swing": 50,
    "timingCorrect": "1/16",
    "tripletMode": false,
    "timeSignature": "4/4",
    "sequenceLengthBars": 4,
    "metronomeEnabled": true,
    "metronomeDuringRecord": true,
    "metronomeCountInBars": 1,
    "metronomeVolume": 70
  }
}
```

`samples[].path` is the filename inside the `samples/` folder of the ZIP. On load, the loader fetches the bytes by this path and decodes them via Web Audio `decodeAudioData`.

`samples[].id` doubles as the audio buffer registry key after load — `registerSampleAudio(id, buffer)`.

`waveform` is pre-computed for instant rendering on load. If absent, `createWaveformCache(buffer)` recomputes after decode.

`programs`, `sequences`, `songs` are passed through as opaque arrays (typed at the store boundary, not at the disk layer).

## type: "all"

```json
{
  "schemaVersion": 1,
  "type": "all",
  "appVersion": "0.1.0",
  "savedAt": "2026-05-20T14:30:00.000Z",
  "name": "live-set-march",
  "sequences": [/* Sequence[] */],
  "songs":     [/* SongStep[] */],
  "globalSettings": { /* same shape as project */ }
}
```

Same as `project` minus `samples` and `programs`. On load, replaces sequences + songs + settings only — samples + programs remain.

## type: "seq"

```json
{
  "schemaVersion": 1,
  "type": "seq",
  "appVersion": "0.1.0",
  "savedAt": "2026-05-20T14:30:00.000Z",
  "name": "verse-loop",
  "sequence": { /* single Sequence object */ }
}
```

The `sequence` field carries one full sequence (events + tracks + bpm + lengthBars + timeSignature). On load, target slot is chosen by caller (default = current sequence ID).

## Loader pipeline

`src/disk/loader.ts` `loadFromBlob(blob, { decodeAudio, onProgress })`:

1. `readProjectZip(blob)` → parse ZIP, extract `manifest.json` + sample ArrayBuffers.
2. `applyMigrations(manifest)` → chain `vN -> v(N+1)` until reaching current.
3. Validate `type` field.
4. For `project`: iterate `samples[]`, call `decodeAudio(bytes)` for each, emit progress.
5. Return discriminated union `LoadedBundle` (project | all | seq).

Decode is async and runs sequentially (one sample at a time). For projects with many samples this serializes WAV decoding to avoid Web Audio thrashing.

`onProgress` callbacks: `{ phase: "READ" | "MIGRATE" | "DECODE" | "DONE", completed, total, message }`.

## Autosave

A reduced form of `type: "project"` is auto-saved to IndexedDB.

- DB name: `loopthief`. Object store: `autosave`. Key: `current`. Value: `Blob` (the full ZIP).
- Debounce: 10 seconds after last project mutation. Mutation = anything that bumps `state.projectVersion`.
- Schedule: `requestIdleCallback` (fallback `setTimeout(50)`). Never on hot path — never on `triggerPad` or `tickStepPlayback`.
- Resume: on app boot, `App.tsx` calls `readAutosave()` and prompts via `window.confirm`. YES → load via `loadFile(blob)`. NO → `clearAutosave()`.
- Explicit save (any of 3 formats) clears autosave after success (project format) so the resume prompt doesn't appear redundantly. ALL/SEQ saves do NOT clear autosave because they're partial saves.

## Sanitization

Filenames are sanitized via `[^A-Za-z0-9_.-]+ → _` and truncated to 80 chars. Empty input becomes `"untitled"`.

Sample filenames inside the ZIP follow pattern `${NNN}_${sanitized_name}.wav` where `NNN` is the zero-padded index. This avoids collisions when multiple samples share a name.

## What is NOT in the schema

- AudioBuffer instances — these are runtime-only, rebuilt from WAV bytes on load.
- Audio nodes, gain values currently applied to the graph — these come from store state.
- UI state (active screen, selected pad, scroll position) — intentionally not persisted; load returns to MAIN screen.
- Note Repeat live state — runtime only.
- Recorded session pending REC take — runtime only.

## What's reserved for future versions

- CHOP slice non-destructive edits are persisted via `samples[].editState.sliceMarkers`. Per AKAI MPC Sample manual, slice editing itself is NOT under undo, but the slice positions ARE part of the saved project.
- Settings (master volume etc.) are intentionally not in `globalSettings` yet — they're app preferences, not project data. May be split into a separate `appPreferences` object in v2 if user feedback demands.
- Program FX / filter settings are inside the `Program` shape (opaque to disk layer).
