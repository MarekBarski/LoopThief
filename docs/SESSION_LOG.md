# LoopThief — Session Log

> Cross-session memory for Claude Code (and any other AI assistant working on this project).
>
> **Purpose:** AI sessions are stateless — when context window fills, all in-session knowledge is lost. This log preserves what was done, what was tried, what failed, and what decisions were made, so the next session doesn't repeat mistakes or undo intentional choices.
>
> **Rules for AI assistants:**
> - Read this entire file at the START of every session, after `CLAUDE.md` and required docs.
> - APPEND a new session entry at the END of every session, before reporting completion.
> - Never delete or edit past session entries — they are historical record.
> - If a past session's decision should be revisited, note that in a NEW session entry, do not modify the old one.
> - Be specific about file paths, function names, and what didn't work.
>
> **Format:** entries are reverse chronological — newest at the top.

---

## How to write a session entry

Each session entry follows this template:

```
## Session [N] — [YYYY-MM-DD] — [Brief topic]

### What was attempted
- Goal / task brought into this session.
- Files touched.
- Approach taken.

### What worked
- Specific changes that landed and validated (npm run build clean).
- Why the approach worked (if non-obvious).

### What didn't work / pitfalls hit
- Approaches tried and abandoned, with reasons.
- Bugs encountered during the session and how they were diagnosed.
- Things that looked right but caused regressions.

### Decisions made
- Architectural or product decisions taken during the session.
- Marek's confirmations / rejections of proposed approaches.
- Anything that should bind future sessions.

### Open issues / followups
- Things noticed but not addressed (logged to UX_AUDIT_FINDINGS.md or noted here).
- Bugs surfaced but deferred.
- Questions for Marek.

### Files modified
- Explicit list of changed file paths.
```

Keep entries factual, concise, and useful for the next session. Don't write essays. Don't reflect on the process. Just record what a future session needs to know.

---

## Anti-patterns to avoid in this log

- Vague entries ("worked on FX, fixed some bugs") — useless for the next session.
- Marketing language ("successfully implemented", "robust solution") — say what was done, not how good it was.
- Repeating content from `CLAUDE.md` or roadmap — those are separate.
- Hiding failures — if an approach didn't work, that's the MOST valuable thing to log.
- Editing old entries to "make them look better" — never. They are history.

---

## Sessions

<!-- Newest sessions go here, at the top. -->

<!-- Example entry (delete when first real session is logged):

## Session 1 — 2026-05-20 — Initial audit, no code

### What was attempted
- Read CLAUDE.md, roadmap_v2.md, AI_WORKFLOW_RULES.md, handoff doc.
- Inspected repo structure and confirmed file tree matches docs.
- Ran `npm run build` to verify clean baseline.

### What worked
- Build succeeded cleanly on first run.
- File tree matches documented structure.
- Identified that `src/store/useAppStore.ts` is ~XXX lines and the central state hub as documented.

### What didn't work / pitfalls hit
- (None — audit only, no code changes attempted.)

### Decisions made
- Confirmed with Marek: do not add ESLint/Prettier this session — defer per CLAUDE.md.
- Next session: start with 16 LEVELS audio feedback bug (Phase A1, highest priority per UX_AUDIT_FINDINGS.md).

### Open issues / followups
- Noticed `src/audio/samplerEngine.ts` has a TODO comment about voice stealing — flag for later, not addressed.

### Files modified
- None (audit only).

-->

<!-- Real entries start below this line -->

## Session 9 — 2026-05-20 — DISK save/load (Phase 1–6) + Session 8.1 hotfix confirmed working

### What was attempted

Two streams of work in one session:

**Stream A — Stage 9 DISK save/load**, full spec from Marek (~150-line message). Decisions pre-locked:
- ZIP container (JSZip), `.lthief` / `.lthief-all` / `.lthief-seq` extensions.
- Samples EMBED as WAV 16-bit PCM inside ZIP under `samples/`.
- Schema versioning from day 1 with migrations framework.
- Autosave to IndexedDB, debounce 10s, `requestIdleCallback`, never on hot path.
- 6 phases: schema/serialization core → save formats → load formats + migrations → autosave → DISK screen UI rewire → NEW PROJECT + dirty guard.

**Stream B — Session 8.1 hotfix verification**. Marek tested the architectural fix (move REC TAKE snapshot OFF `tickTransport` audio path INTO user-click paths) + diagnostic disabling of `recordUndo` in `addStepEventAtCurrentStep` / `createStepEventForPad`. Confirmed working: REC nagrywanie OK, STEP ADD EVENT OK, save+load OK.

### What worked

**DISK Phase 1 — schema + serialization core** (`src/disk/`):
- `types.ts` — `ProjectManifest`, `AllManifest`, `SeqManifest`, `SerializedSample`, `GlobalSettings`, `BaseManifest` union types. `CURRENT_SCHEMA_VERSION = 1`.
- `wavCodec.ts` — `encodeAudioBufferToWav(buffer): ArrayBuffer` (16-bit PCM, full buffer) + `decodeWavToAudioBuffer(bytes, ctx)` (Web Audio decode).
- `zipContainer.ts` — `writeProjectZip(manifest, samples): Promise<Blob>` (DEFLATE level 6) + `readProjectZip(blob)` extracting manifest + sample ArrayBuffers.
- `migrations/index.ts` — `applyMigrations(manifest)` chain. Walks `vN -> v(N+1)` until reaching current. Throws fast on missing migration or version mismatch. `MIGRATIONS: Migration[]` array empty for v1; structured so future migrations register here.
- `index.ts` re-exports.

**DISK Phase 2 — three save formats**:
- `serializers/project.ts` (`serializeProject({ samples, programs, sequences, songs, globalSettings, resolveAudioBuffer })` → `{ manifest, sampleEntries }`). Iterates samples, calls `encodeAudioBufferToWav`, writes filenames `${NNN}_${sanitized_name}.wav`.
- `serializers/all.ts` (`serializeAll(...)` → `AllManifest`). No samples.
- `serializers/seq.ts` (`serializeSeq(...)` → `SeqManifest`). Single sequence.
- `saveAs.ts` — `saveBlobAs(blob, filename)` via `<a download>` + `URL.createObjectURL`.
- Store actions: `saveProjectFile(name)`, `saveAllFile(name)`, `saveSeqFile(name, sequenceId?)`. All three sanitize filename, write blob, set `lastAudioMessage` + `lastSavedProjectVersion` (sets dirty=false post-save).

**DISK Phase 3 — three load formats + migration framework**:
- `loader.ts` — `loadFromBlob(blob, { decodeAudio, onProgress })` returns discriminated union `LoadedBundle`. Sequential sample decode with progress callbacks (`READ` / `MIGRATE` / `DECODE` / `DONE`).
- Store action `loadFile(file: Blob, options?)` accepts Blob (File extends Blob) so autosave-restore can pass the IDB blob directly.
- Hydrate helpers `hydrateProjectBundle` / `hydrateAllBundle` / `hydrateSeqBundle`. Register samples via `registerSampleAudio` → AudioBuffer goes into `sampleLibrary`. State patch replaces programs/sequences/songs/settings as appropriate per type.

**DISK Phase 4 — autosave (IndexedDB + ric + resume prompt)**:
- `autosaveDb.ts` — IDB wrapper. DB `loopthief`, store `autosave`, key `current`. `writeAutosave(blob)`, `readAutosave()`, `clearAutosave()`.
- `autosaveScheduler.ts` — `scheduleAutosave(produceBlob)` with 10s debounce + `requestIdleCallback` (fallback `setTimeout(50)` if browser lacks ric). Reset on each call. `inflight` guard prevents overlapping saves.
- New state field `projectVersion: number`. Bumped in `recordUndo` and `endRecTakeSnapshot`. Subscribers can detect project changes without inspecting deep slices.
- App.tsx subscribes to `useAppStore.subscribe` and on `projectVersion` change calls `scheduleAutosave(...)` with a closure over `serializeProject` + `writeProjectZip`. Never on hot path (debounce + ric defer to idle).
- Boot resume prompt via `window.confirm` (placeholder until in-app modal). OK = `loadFile(blob)`. Cancel = `clearAutosave()`. Uses `promptedResumeRef` to fire only once.

**DISK Phase 5 — DISK screen UI extension**:
- Extended existing `DiskScreen.tsx` rather than rewriting (sacred-zone rule). Added a "PROJECT I/O" section in the right column with: filename input, three SAVE buttons (PROJECT/ALL/SEQ), LOAD button (hidden file picker triggers via ref), NEW PROJECT button. Sample-memory utilities preserved.
- Did NOT implement the full mode-cycle UI (LOAD/SAVE/NEW tab cycle via F1) from Marek's spec. Less risky to extend in place. Full mode-cycle rewrite available as a follow-up task if Marek wants it.

**DISK Phase 6 — NEW PROJECT + dirty guard**:
- New state field `lastSavedProjectVersion: number`. Dirty when `projectVersion > lastSavedProjectVersion`. Each successful save sets `lastSavedProjectVersion = projectVersion`. PROJECT save also `clearAutosave()` after success.
- New action `newProject()`. If dirty, `window.confirm` blocks (placeholder for 3-way modal). On confirm: `createBlankProjectState()` patch resets to empty project. Clears autosave.
- Wired NEW PROJECT button in DISK screen.

**Hotfix confirmation**:
- REC nagrywanie + step ADD + save + load all confirmed working by Marek. Architectural fix (move snapshot off `tickTransport` path) was sufficient.
- `recordUndo` remains disabled in `addStepEventAtCurrentStep` + `createStepEventForPad` (the DIAGNOSTIC comments). Marek didn't ask to re-enable. Open issue logged below.

Build clean (`tsc + vite build`) after every phase. JSZip added ~100 kB to main chunk; chunk-size warning issued but acceptable.

### What didn't work / pitfalls hit

- **PDF reading blocked** in this environment (`pdftoppm not found`). Could not consult AKAI manuals (MPC2000XL Ch.10, MPC3000 Ch.9, MPC5000 DISK mode, MPC Sample Project section). Implementation followed Marek's detailed spec; no independent cross-check.
- **TypeScript `never` narrowing** caught in `updateSelectedPadParam` label dispatch (Session 8 work). Cast workaround: `(field as string).toUpperCase()` in the catch-all branch. Same pattern hit in `zipContainer.ts` for manifest type validation — fixed via `(manifest as { type?: unknown }).type` narrowing.
- **Zustand 5 `subscribeWithSelector` middleware attempt** caused TypeScript errors in `useAppStore` due to the generic `StateCreator` requirements not matching the inline `(set, get) => ({...})` callback. Reverted to plain `create<AppState>(...)` and used manual `lastVersion` comparison inside the listener. Simpler, fewer moving parts.
- **`requestIdleCallback` lib type collision**. Tried to `declare global { interface Window { requestIdleCallback?: ... } }` in `autosaveScheduler.ts`, but lib.dom.d.ts already defines it. Replaced with inline `(window as unknown as { requestIdleCallback?: ... })` cast. Less elegant; works.
- **Hotfix root cause was NOT JSZip / autosave**. Initially considered whether the autosave subscribe could be triggering during count-in. Confirmed it wasn't — `projectVersion` doesn't bump at REC start, so subscribe early-returns. The actual culprit was `captureSnapshot` inside `computeRecordTransitionPatch` being called from `tickTransport` (audio scheduling 40 Hz callback). Architectural fix moved it to user-click paths. Marek tested → confirmed.
- **`recordUndo` for STEP ADD EVENT remains disabled**. The diagnostic worked (no crash now), but this means ADD EVENT actions are NOT under undo until re-enabled. Re-enabling will likely require the cheaper-capture fix (Option A: reference copy instead of structuredClone) so the click handler stays responsive.
- **NEW PROJECT 3-way confirm not implemented** — used 2-way `window.confirm` (OK/Cancel). Marek's spec said YES/NO/CANCEL. Browser native confirm is 2-way. Full in-app modal deferred.
- **DISK screen full mode-cycle UI not implemented** — extended existing screen with PROJECT I/O panel instead of rewriting the MPC-style LOAD/SAVE/NEW tabs + file type filter. Functionally complete (save + load + new project all reachable) but cosmetically not the full MPC look Marek's spec described.

### Decisions made

- **JSZip is the chosen ZIP library**. Confirmed pre-implementation via Marek's spec.
- **WAV 16-bit PCM is the embed format** (confirmed via AskUserQuestion: "WAV 16-bit PCM Recommended").
- **`requestIdleCallback` is the autosave scheduling mechanism** (confirmed via AskUserQuestion).
- **Native `<a download>` is the save trigger** (confirmed via AskUserQuestion). Zero deps beyond JSZip.
- **`schemaVersion: 1` from day 1**. Migrations chain framework empty but functional. Future migrations registered in `MIGRATIONS` array in order.
- **Samples saved as `${NNN}_${sanitized}.wav`** to avoid filename collisions. `NNN` is zero-padded index in sample list.
- **`pendingRecTake` lives in store state** (NOT closure or module-level). Survives across `set` calls cleanly. Inspectable. Discarded on `stopPlayback` / disarm.
- **REC TAKE snapshot at user-click path only**. Architectural rule codified in comment inside `computeRecordTransitionPatch`. `beginRecTakeSnapshot` is idempotent so multiple call paths converge safely.
- **`lastSavedProjectVersion` tracks dirty state** (`projectVersion > lastSavedProjectVersion` = dirty). Cleared on successful save.
- **CHOP slice editing intentionally NOT under undo** per AKAI MPC Sample manual — confirmed in Session 8.

### Open issues / followups

- **Re-enable `recordUndo` in STEP ADD EVENT actions** (`addStepEventAtCurrentStep`, `createStepEventForPad` in `useAppStore.ts:2470-2480`). Marked DIAGNOSTIC TODO. Re-enabling will likely need cheaper `captureSnapshot` — recommend Option A: replace `structuredClone(...)` with reference-copy. The store discipline is immutable (all mutations produce new arrays/objects), so reference-copy is safe and reduces snapshot time from O(state size) to O(1).
- **`captureSnapshot` size measurement** — Marek's spec suggested `performance.now()` brackets around the clone, error if >5ms. Worth adding a dev-only perf log.
- **Full MPC-style DISK screen** (LOAD/SAVE/NEW mode cycle + PROJECT/ALL/SEQ/SAMPLE filter tabs) — not implemented; extended existing screen instead. Open task if Marek wants the full look.
- **NEW PROJECT 3-way confirm modal** — current uses 2-way `window.confirm`. Full in-app modal with YES/NO/CANCEL deferred.
- **REC TAKE label uses START seq/track** — Session 8 decision. If user track-switches mid-recording, label reflects original track, not latest. Worth confirming during Marek's normal workflow.
- **Schema migration test** — framework exists but no dummy v2 migration to sanity-check the chain. Add when first real migration is needed.
- **JSZip bundle ~100 kB to main chunk** — chunk-size warning issued. Could lazy-import to defer until first save/load action. Low priority.
- **PDF manual reading still blocked** in this environment. Future cross-checks against AKAI manuals would need a different reader or extracted text.

### Files modified

- `src/disk/` — new module (8 files): `types.ts`, `wavCodec.ts`, `zipContainer.ts`, `saveAs.ts`, `loader.ts`, `autosaveDb.ts`, `autosaveScheduler.ts`, `migrations/index.ts`, `serializers/{project,all,seq}.ts`, `index.ts`.
- `src/store/useAppStore.ts` — disk module imports, `projectVersion` + `lastSavedProjectVersion` + `pendingRecTake` state fields, `saveProjectFile`/`saveAllFile`/`saveSeqFile`/`loadFile`/`newProject` actions, hydrate helpers, `beginRecTakeSnapshot` wired to user-click paths (toggleSequenceRecording count-in + non-playing + startTransportAction REC) and removed from `computeRecordTransitionPatch`, `recordUndo` disabled in two STEP ADD actions (DIAGNOSTIC TODO).
- `src/App.tsx` — autosave subscribe + boot resume prompt.
- `src/screens/DiskScreen.tsx` — PROJECT I/O panel (filename input + SAVE PROJECT/ALL/SEQ buttons + LOAD file picker + NEW PROJECT button). Existing sample memory utilities preserved.
- `docs/04_disk/MANIFEST_SCHEMA_V1.md` — new schema reference doc (manifest fields per type, ZIP layout, loader pipeline, autosave behavior, sanitization rules, what's NOT in schema, reserved for future versions).
- `package.json` / `package-lock.json` — JSZip dependency added.

---

## Session 8.1 HOTFIX — 2026-05-20 — REC freeze + STEP ADD EVENT regression diagnosis

### What was attempted

Marek reported critical regression post-Session 8 commit:
1. **REC freeze**: count-in counts to 4, then app freezes + audio stuck in loop ("TRRRRRR").
2. **STEP ADD EVENT no-op or crash**.

Marek's hypothesis: Session 8's `recordUndo()` / `captureSnapshot()` wiring put heavy synchronous structuredClone on audio scheduling hot path. Specifically `beginRecTakeSnapshot` was called from `computeRecordTransitionPatch`, which is invoked from `tickTransport` at count-in end — the audio scheduling code.

Two-pronged response:
- **Architectural fix for REC**: move snapshot OUT of `computeRecordTransitionPatch` (audio path), INTO user-click paths (toggleSequenceRecording, startTransportAction).
- **Diagnostic for STEP**: temporarily disable `recordUndo` in `addStepEventAtCurrentStep` + `createStepEventForPad` so Marek can confirm whether undo wiring is the cause.

### What worked

- **Removed `beginRecTakeSnapshot` call from `computeRecordTransitionPatch`** (`useAppStore.ts:3364-ish`). Replaced with a comment explaining why: this function is reachable from `tickTransport` count-in end (audio scheduling), and `captureSnapshot` is a structuredClone of the entire project state — too heavy to run synchronously there. `beginRecTakeSnapshot` is idempotent (early-returns when `pendingRecTake` is already set), so call sites that pre-snapshot at user-click time pass through cleanly.
- **Added `beginRecTakeSnapshot` to `toggleSequenceRecording` count-in setup branch** (`useAppStore.ts:825-836`). When user clicks REC while playing with count-in enabled, snapshot happens NOW (sync work on click handler) rather than at count-in end. By the time `tickTransport` count-in completes, `pendingRecTake` is already populated and the audio path doesn't allocate.
- **Added `beginRecTakeSnapshot` to `toggleSequenceRecording` not-playing branch** before `requestTransportStartImpl("REC", ...)` call. Covers the case where REC is pressed when stopped — snapshot at click, then transport starts (which may go through WAIT_PAD or COUNT_IN setup).
- **Added `beginRecTakeSnapshot` to `startTransportAction` REC branch** (`useAppStore.ts:5310-5325`). Covers the WAIT_PAD → pad-click → REC path (pad click is user-initiated, so sync snapshot is fine).
- **Disabled `recordUndo` in `addStepEventAtCurrentStep` + `createStepEventForPad`** as diagnostic (`useAppStore.ts:2470-2480`). TODO comment added: "Re-enable once root cause confirmed". This lets Marek isolate whether STEP ADD EVENT crash is caused by `captureSnapshot` itself or by something else in the spread/wiring.
- Build clean (`tsc + vite build`) — TypeScript pass + Vite bundle.

### What didn't work / pitfalls hit

- **PDF reading still blocked** in environment — could not consult AKAI manuals to cross-check MPC2000XL "UNDO SEQ" semantics for REC TAKE.
- **Could not test in browser** — Marek needs to verify the fix actually unfreezes REC. The architectural fix is theoretically correct (move heavy work off audio path), but if `captureSnapshot` is ALSO heavy on click path (e.g., state is genuinely 5+ MB), the freeze would just move from "during count-in" to "during REC button click". In that case, deeper fix needed: defer snapshot via `queueMicrotask`, or replace `structuredClone` with reference-copy (state is immutable in this codebase so references stay stable).
- **Did NOT speed up captureSnapshot** per Marek's explicit "NIE FIXUJ przez przyspieszanie captureSnapshot". Took the architectural route only.
- **Did NOT touch the autosave subscribe in App.tsx**. It listens to every `setState` and early-returns when `projectVersion` is unchanged — should be cheap. If it turns out to be a factor (high-frequency triggering during tickStepPlayback), revisit. Marek's diagnostic plan didn't flag this so leaving alone.

### Decisions made

- **REC TAKE snapshot MUST live on user-click code path**, never on audio scheduling (tickTransport, tickStepPlayback, etc.). Codified in comment inside `computeRecordTransitionPatch`.
- **`beginRecTakeSnapshot` remains idempotent** (early-return when `pendingRecTake` is set). This means multiple call paths converge safely — explicit defensive design.
- **Diagnostic disabling of `recordUndo` in STEP ADD EVENT actions is temporary**. Re-enable in next session ONCE Marek confirms whether STEP ADD EVENT works without it. If it works → `recordUndo`/`captureSnapshot` was indeed the cause; need deeper fix (async snapshot, or reference-only snapshot). If it still doesn't work → look elsewhere (UI wiring, race condition, etc.).
- **STOP/cancel during count-in** still pushes empty REC TAKE entry to undoHistory via `endRecTakeSnapshot`. Acceptable: undo'ing an empty take is a no-op for the user, no harm done.

### Open issues / followups

- **Verify in browser**: REC + count-in completes without freeze, audio plays without TRRRRRR glitch. STEP ADD EVENT creates event successfully. If both work, hypothesis confirmed.
- **Re-enable `recordUndo` in STEP ADD EVENT** after diagnosis, once architectural fix is in place:
  - Option A: keep using `recordUndo` but with cheaper snapshot — replace `structuredClone(...)` with reference-copy in `captureSnapshot`. Safe given the codebase's immutable update discipline. Single-line change.
  - Option B: defer `captureSnapshot` via `queueMicrotask` inside `recordUndo`. More complex; the snapshot becomes async-filled inside the UndoEntry. Affects undo timing semantics.
  - Recommend Option A — simplest, fastest, no semantic change.
- **`captureSnapshot` size audit** — measure actual state size with `performance.now()` brackets around `structuredClone`. Marek's spec mentions "performance.measure() — jeśli >5ms na main threadzie to BŁĄD, defer". Worth adding a dev-only performance log.
- **Autosave subscribe overhead** — `useAppStore.subscribe` fires on every `setState`. The listener does `if (projectVersion === lastVersion) return`. This is cheap but still a function call per setState. During recording (40 Hz tickTransport + 6 Hz tickStepPlayback at 90 BPM), this is ~50 listener calls/sec. Negligible but worth knowing.
- **The autosave produceBlob callback is heavy** — it calls `encodeAudioBufferToWav` for every sample synchronously. For 10 × 2s samples (~880 KB each), that's ~10 MB of WAV encoding + JSZip DEFLATE compression. Should be fine inside `requestIdleCallback` but if user has many large samples and `requestIdleCallback` fires at an inopportune moment, could cause a stutter. Investigate if Marek reports autosave-related glitches.

### Files modified

- `src/store/useAppStore.ts`:
  - `toggleSequenceRecording` — added `beginRecTakeSnapshot` to count-in setup + before `requestTransportStartImpl`
  - `computeRecordTransitionPatch` — removed `beginRecTakeSnapshot` call + added explanatory comment
  - `startTransportAction` REC branch — added `beginRecTakeSnapshot`
  - `addStepEventAtCurrentStep` + `createStepEventForPad` — `recordUndo` calls commented out with DIAGNOSTIC TODO

---

## Session 8 — 2026-05-20 — Undo Phase 2–5 complete: STEP/PROGRAM/MIX/SEQ/SONG actions, REC take undo, Ctrl+Z/Y shortcuts

### What was attempted

Marek requested completion of all remaining undo phases:
- **Phase 2** — STEP screen actions undo
- **Phase 3** — PROGRAM screen actions undo
- **Phase 4** — MIX / Sequence / Song undo (CHOP excluded per AKAI MPC Sample manual)
- **Phase 5** — Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y keyboard shortcuts + UI polish
- **REC take undo** — whole take = ONE snapshot (MPC2000XL "UNDO SEQ" pattern). Snapshot pre-record, label-on-stop.

All wiring uses existing engine: `recordUndo(state, label, bucket)` with 500ms bucket-merge collapse + 50-deep stack. No engine changes needed.

### What worked

**Phase 2 — STEP screen actions** (`useAppStore.ts` ~L2264–2384):
- `adjustSelectedEvent` → `EDIT VELOCITY` / `EDIT OFFSET` / `EDIT DURATION` / `EDIT PROBABILITY` (bucket per-field-per-event for merge across rapid clicks).
- `cycleSelectedEventTrack` → `EVENT TRACK`.
- `deleteSelectedEvent` → `DELETE EVENT`.
- `cycleSelectedEventAppliedParameter` → `PARAM TYPE`.
- `adjustSelectedEventAppliedValue` → `PARAM VALUE` (bucket per-event for merge).
- `toggleEventMuted` → `MUTE EVENT` / `UNMUTE EVENT` based on resulting state.
- `addStepEventAtCurrentStep` / `createStepEventForPad` → `ADD EVENT`.

**Phase 3 — PROGRAM screen actions** (~L1539–1561, ~L2125–2240):
- `previousProgram` / `nextProgram` → `SWITCH PROGRAM`.
- `createProgram` → `NEW PROGRAM`.
- `assignCurrentSliceToSelectedPad` / `assignSourceToSelectedPad` → `ASSIGN {pad}`.
- `updateSelectedPadParam` → field-dispatched labels: `TUNE {pad}` (tune/fineTune), `ENV {pad}` (attack/decay), `FILTER {pad}` (cutoff/resonance), `CHOKE {pad}` (chokeGroup), `MIX LEVEL/PAN/FXSEND {pad}` (mix fields fallback). Single bucket per field per pad so rapid arrow-tap collapses.
- `toggleSelectedPadMode` → `PAD MODE {pad}`.
- `toggleSelectedPadVoiceMode` → `VOICE MODE {pad}`.
- `cycleSelectedPadFilterType` → `FILTER TYPE {pad}`.
- `cycleMuteTargetMode` → `CHOKE MODE {pad}`.
- `toggleMuteTargetForSelectedPad` → `CHOKE {pad}->{target}`.

**Phase 4 — MIX / Sequence / Song** (~L1481–1620, ~L2569–2660, ~L1758–1815):
- MIX: `updateSelectedMixerChannel` / `setMixerChannelValue` → `MIX LEVEL/PAN/FXSEND {pad}`; `toggleSelectedMixerMute` / `toggleMixerChannelMute` → `MUTE {pad}`; `toggleSelectedMixerSolo` / `toggleMixerChannelSolo` → `SOLO {pad}`; `cycleSelectedMixerOutput` → `OUTPUT {pad}`.
- Sequence: `createSequence` → `NEW SEQ`; `duplicateCurrentSequence` → `DUPLICATE SEQ`; `deleteCurrentSequence` → `DELETE SEQ`; `renameCurrentSequence` / `setCurrentSequenceName` → `RENAME SEQ`.
- Length / signature / BPM / swing: `adjustSequenceLengthBars` → `SEQ BARS`; `cycleTimeSignature` → `TIME SIG`; `adjustBpm` → `BPM` (bucket-merge); `adjustSwing` → `SWING` (bucket-merge).
- Song mode: `insertSongStep` → `INSERT SONG STEP`; `deleteSelectedSongStep` → `DELETE SONG STEP`; `adjustSelectedSongRepeats` → `SONG REPEATS`; `moveSelectedSongStep` → `MOVE SONG STEP`; `cycleSelectedSongSequence` / `cycleSelectedSongSequenceBack` → `SONG SEQ`.

**REC take undo** (~L3035–3060 helpers + transitions):
- New state field `pendingRecTake: UndoEntry | null` (default `null`).
- Helper `beginRecTakeSnapshot(state)` — if no pending, captures snapshot WITH label `REC TAKE SEQ{N} TRK{NN}` (computed from `currentSequence` + track index at REC arm time). Returns `{ pendingRecTake }` patch.
- Helper `endRecTakeSnapshot(state)` — if pending, pushes to `undoHistory` (50-cap), clears redoHistory, sets `lastAction`, clears `pendingRecTake`. Returns full patch.
- Wired at REC ENTER transitions: `computeRecordTransitionPatch` (action="REC"), `toggleSequenceRecording` mid-play arm, `toggleOverdub` ON path when playing.
- Wired at REC EXIT transitions: `stopPlayback` always; `toggleSequenceRecording` disarm only if `overdubEnabled === false`; `toggleOverdub` disarm only if `isSequenceRecording === false`.
- AUTO OVERDUB switch in `tickStepPlayback`: NOT wired (REC→OVERDUB transition keeps take pending — both modes count as one take).

**Phase 5 — Keyboard shortcuts** (`KeyboardShortcuts.tsx`):
- Ctrl+Z (no shift) → `undoLastAction`.
- Ctrl+Shift+Z → `redoLastAction`.
- Ctrl+Y → `redoLastAction` (Windows alt).
- Cmd+Z / Cmd+Shift+Z / Cmd+Y also bound (event.metaKey).
- Skip when typing in `<input>` / `<textarea>` / contentEditable → text fields use native browser undo.
- Skip when `useLayoutStore.getState().editMode` (existing pattern preserved).
- Listener placed BEFORE other key handlers, with early `return` to prevent double-handling.

**Phase 5 — UI polish**:
- `lastAudioMessage` format unified to `UNDO: {label}` / `REDO: {label}` (was `UNDONE: ...` / `REDONE: ...`). Matches Marek's spec.
- Undo utility screen already had F1 UNDO + F2 REDO + F3 CLEAR softkeys (from Phase 1) — no further wiring needed.
- Hardware UNDO button (LayoutElements L258) opens UTILITY_UNDO screen — unchanged.

Build clean (`tsc + vite build`) after every phase. No TypeScript errors.

### What didn't work / pitfalls hit

- **TypeScript `never` narrowing in `updateSelectedPadParam` label dispatch.** First version used a chain ending with `field.toUpperCase()` fallback. TS narrowed `field` to `never` after exhausting all union members, so `.toUpperCase()` on never failed compilation. Fixed by removing the fallback (since all cases handled) and casting in the catch-all branch: `(field as string).toUpperCase()`. Lesson: when chaining `field === X ? ... : field === Y ? ...`, end with a concrete return rather than a method call on the narrowed type.
- **REC take EXIT condition is multi-pathed.** Initially considered single `if !isRecording` check but recording exit can happen via: STOP, disarming REC alone (if overdub off), disarming OVERDUB alone (if REC off), or both at once. Each path must individually check the OTHER flag's state to decide whether the take is fully ending. AUTO OVERDUB switch (mid-tickStepPlayback) is the one transition that does NOT end the take — REC→OVERDUB is a mode change inside one take.
- **`pendingRecTake` lives in state, NOT closure.** Considered using a module-level let for the pending snapshot but `useAppStore.ts` already uses `set/get` Zustand pattern — keeping `pendingRecTake` in state means it survives correctly across `set` calls and stays inspectable from any action. Also: would have leaked if STOP didn't fire (e.g., page reload mid-record), but that's not worse than other state leaks.
- **Reminder noise continued.** 7+ task-tool reminders during single-edit fix-ups. All ignored. Real task tracking via TaskCreate/TaskUpdate happened at meaningful checkpoints — tasks #38–41, #56 wired through lifecycle.
- **CHOP slice editing INTENTIONALLY excluded** per AKAI MPC Sample manual quote ("Editing slices cannot be undone or redone using the UNDO/REDO functions") — slices are non-destructive on the original sample, so no undo path is needed. Documented in this entry + open issue below.

### Decisions made

- **REC take = ONE snapshot from START to STOP** (MPC2000XL canonical "UNDO SEQ"). Per-loop replace, manual REC→OVERDUB switch, and AUTO OVERDUB switch all preserve the same pending take. Take only ends at STOP or full disarm.
- **REC take label format: `REC TAKE SEQ{N} TRK{NN}`** with seq id and 2-digit padded track index at arm time. If user track-switches mid-recording, label reflects the START track, not the latest one.
- **Global single undo stack** (no per-screen / per-context stacks). Confirmed.
- **CHOP slice editing intentionally NOT under undo** per AKAI MPC Sample manual.
- **Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y all bound globally** with native-input-skip via `<input>` / `<textarea>` / contentEditable detection. Listener takes precedence over other keys via early `return`.
- **Bucket strategy for high-frequency actions**: bucket key includes target identity (event id / pad id / sequence id) but NOT timestamp. This lets rapid edits on the SAME target collapse into one undo step (within 500ms window), while edits on DIFFERENT targets each get their own undo step.
- **Discrete actions use `:${Date.now()}` bucket suffix** to defeat bucket-merge (e.g., DELETE EVENT, NEW PROGRAM, SWITCH PROGRAM). Each discrete action is its own undo step.
- **`lastAudioMessage` format: `UNDO: {label}` / `REDO: {label}`** (uniform). Both surfaces (status bar / utility screen) read this field.
- **No AppShell changes for UNDO/REDO buttons.** AppShell is sacred zone. UNDO hardware button stays as-is (opens UTILITY_UNDO screen). REDO is accessed via F2 softkey in that screen or via Ctrl+Shift+Z / Ctrl+Y.

### Open issues / followups

- **CHOP slice editing is intentionally out of undo scope** — per AKAI MPC Sample manual. If user expectation differs once they live with the build, revisit. Marek to confirm during audio test.
- **REC take label uses START seq/track** — if track switch mid-record + label-from-end is preferred, refactor `endRecTakeSnapshot` to recompute label at push time (capture deferred track info). Flagged but not implemented.
- **Sequence convert-to-song (`convertSongToSequence`)** NOT wired to undo — creates a new sequence via flatten, destructive enough to warrant undo? Flag.
- **Settings adjust / toggle** (`adjustSelectedSetting`, `toggleSelectedSetting`) NOT wired. Master volume, metronome volume, etc. Probably OK to skip — settings are persistent app prefs, not project state. Confirm.
- **TAP TEMPO** NOT wired (it adjusts BPM but only as a tap-derived calculation, not a discrete user-controlled value). BPM adjust IS wired, so manual BPM change is undoable. TAP TEMPO maps to BPM internally but doesn't pass through `adjustBpm`. Flag.
- **TC apply DO IT** already wired in Session 6 — preserved.
- **PAD ERASE** + **ERASE F5 EXECUTE** already wired in Session 7 — preserved.

### Files modified

- `src/store/useAppStore.ts` — Phase 2/3/4/REC take/undo message format. ~50 `recordUndo` calls added. New helpers `beginRecTakeSnapshot`, `endRecTakeSnapshot`. New state field `pendingRecTake`.
- `src/components/workstation/KeyboardShortcuts.tsx` — Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y bound (with native-input-skip).

---

## Session 7 — 2026-05-20 — 16 LEVELS audio fix, transport timing bugs, NR refactor, undo Phase 1 (PAD ERASE), REC mode real continuous replace, OVERDUB workflow fix

### What was attempted

Multi-context session (one extended Claude Code window across many topics). In rough order:

- **16 LEVELS audio feedback bug** — flagship UX bug from Phase A1 of roadmap_v2.md.
- **Transport timing bugs (2 related):** Bug 1 metronome desync on first-run, Bug 2 ERASE F5 EXECUTE appearing in UNDO history despite no-op.
- **NR bugs cluster (1–3):** rate cycle proper + display fix, clickable arrows + remove SWING LINK row, continuous loop with auto-swing.
- **Architectural refactor (Phase A/B/C):** unify duplicated state for swing/timingCorrect/tripletMode — global single source of truth across MAIN/TC/NR/PERFORMANCE screens.
- **Undo Phase 1 — engine + PAD ERASE proof of concept.** Snapshot-based undo with 50-deep stack and 500ms accumulation window (structuredClone), wired to PAD ERASE as first real action under undo.
- **REC mode inspection then real implementation.** Started as "inspection of OVERDUB button before any code" — surfaced 6 bugs. Marek chose Option B: per-loop continuous replace, MPC canonical. Implemented in 5 phases (A state+helpers, B tickStepPlayback rewrite with wrap detection + per-step clearing + auto-switch, C triggerPad lastAction label, D wire startRecordingSession into 3 entry paths, E refresh on track switch).
- **OVERDUB workflow fix** — Marek caught after REC mode landed: OVERDUB button stayed active almost all the time, REC and OVERDUB semantics were mixed. Reworked: `overdubEnabled: false` default, mutual exclusion REC↔OVERDUB, toggleOverdub no longer auto-starts playback, triggerPad records when `isPlaying && (isSequenceRecording || overdubEnabled)`, AUTO OVERDUB after first loop flips `isSequenceRecording: false`, STOP resets both.
- **Metronome gating fix** — Marek caught: metronome silent during OVERDUB. Extended `tickTransport` in-playback gate from `isSequenceRecording` to `isSequenceRecording || overdubEnabled`.

### What worked

- **16 LEVELS audio fix:** live preview without destructive APPLY semantics. Sandbox-only feedback per pad press during armed state (per Marek decision: no APPLY at all, only live preview).
- **Snapshot-based undo engine:** `captureSnapshot(state): UndoSnapshot` clones every mutable state field via `structuredClone`. 50-deep stack, 500 ms accumulation window collapses rapid actions. `restoreSnapshot` intentionally does NOT restore `activeScreen` — undo/redo stay in current screen. PAD ERASE pushes snapshot before destructive op.
- **Global state refactor:** removed `noteRepeatRate`, `noteRepeatLinkToTC`, `noteRepeatLinkedToTc`, nested `noteRepeat` object, `noteRepeatTriplet`. Now NR rate reads `state.timingCorrect`, triplet reads `state.tripletMode`, swing reads `state.swing`. UI in NR/TC/MAIN all wired to global. No drift, no duplicates.
- **REC mode race-safe clearing via initial-events-snapshot pattern.** Three new fields: `sequenceLoopedSinceRecordStart: boolean`, `recordingSessionInitialEvents: Record<number, string[]>` (step → eventIds), `recordSessionClearedSteps: number[]`. `snapshotTrackEventsByStep(state, trackId)` taken at REC start. `tickStepPlayback` per-step clearing: filter only IDs from initial snapshot; fresh `nextEventId()` IDs survive filter so pad hits during step boundary never get accidentally cleared. `clearedStepsPatch` prevents double-clear on second loop wrap.
- **REC auto-switch to OVERDUB.** `wrappedThisTick = currentStepIndex === 0 && previousStepIndex >= sequenceLengthSteps - 1`. After first wrap: `sequenceLoopedSinceRecordStart: true`, `isSequenceRecording: false`, `overdubEnabled: true`, `lastAudioMessage: "AUTO OVERDUB"`. Canonical MPC: REC = first-pass replace, then OVERDUB additive layering on subsequent loops.
- **Track switch mid-recording (multitrack workflow):** `refreshRecordingSessionForTrack(state)` resnapshots initial events for the new track and clears `recordSessionClearedSteps`. Does NOT reset `sequenceLoopedSinceRecordStart` (session-wide flag). Centralized in `moveCurrentTrack(state, delta)` helper — covers `previousTrack`, `nextTrack`, `cycleStepTrack`, and `createNextTrack` paths. Skips refresh when track unchanged.
- **OVERDUB mutual exclusion.** `toggleOverdub` when ON sets `isSequenceRecording: false` and `overdubEnabled: true`. `toggleSequenceRecording` arming branches and `computeRecordTransitionPatch` for REC action all set `overdubEnabled: false`. Result: only one mode armed at a time, UI buttons reflect true state.
- **toggleOverdub does NOT auto-start playback.** Pure arm/disarm. PLAY remains separate user action. Matches canonical MPC behavior — "press OVERDUB, then PLAY" or "during PLAY, press OVERDUB to enable additive recording".
- **Mid-play REC gap fix.** Pre-existing bug surfaced during OVERDUB inspection: `toggleSequenceRecording` mid-play branch did `set({ isSequenceRecording: true })` without calling `startRecordingSession`. Per-step clearing would then run with empty initial snapshot = no clearing. Now wired: mid-play arm + count-in arm both call `startRecordingSession(state)`.
- **Metronome gating extended.** `tickTransport` L2632: `if (state.isPlaying && (state.isSequenceRecording || state.overdubEnabled) && shouldClickDuringRecord(state))`. REC and OVERDUB both audible. Plain PLAY silent. AUTO switch transition preserves click.
- **Hold-repeat acceleration on arrows** carried over from session 6, still working.
- Build clean (`tsc + vite build`) after every phase. No TypeScript errors at any handoff point.

### What didn't work / pitfalls hit

- **OVERDUB default `true` was historical, not intentional.** Found during inspection — Marek expected button to start OFF. Default became `false`. Anyone reading old `useAppStore.ts:665` (overdubEnabled: true) was looking at unintended state, not a deliberate design choice.
- **Initial REC mode plan considered "Option A: clear all events at REC start".** Rejected by Marek in favor of Option B: per-loop continuous replace. Option A would feel destructive — user can't recover original events. Option B keeps original until the playhead overwrites step by step, which feels controllable + matches MPC2000XL behavior.
- **First REC implementation defaulted to track switch deferred.** Marek pushed back citing MPC2000XL manual: "It is also possible to record a new track while playing previously recorded tracks." Track switch mid-record is STANDARD multitrack workflow, not edge case. Implemented `refreshRecordingSessionForTrack` to handle it.
- **AUTO OVERDUB initial patch only set `overdubEnabled: true` without flipping `isSequenceRecording: false`.** Worked functionally (clearing condition `isSequenceRecording && !overdubEnabled` returned false either way) but REC button stayed lit even though mode had switched to additive. Fixed to flip both flags.
- **Metronome silent during OVERDUB.** Pre-existing gate `if (state.isPlaying && state.isSequenceRecording && shouldClickDuringRecord(state))` was correct under old single-flag model but wrong under new REC/OVERDUB split. After AUTO switch, `isSequenceRecording` becomes false → click stops, even though recording continues via overdubEnabled. Extended condition to OR both.
- **Reminder noise:** ~10+ task-tool reminders fired during inappropriate moments (inspection, single-line fixes). Ignored. Real task tracking via TaskCreate/TaskUpdate happened where useful — task #51–55 covered REC mode phases A–E.
- **Bug 2 root cause in transport timing (ERASE in UNDO):** Marek caught that ERASE F5 EXECUTE was being pushed to UNDO history even when no events matched the erase scope. The "no-op shouldn't undo" rule was implicit, never coded.

### Decisions made

- **REC = first-pass per-loop continuous replace, then AUTO OVERDUB additive on subsequent loops.** MPC canonical. Per-loop replace means stale events on current track get wiped step by step as playhead advances, not all at once at REC start. Fresh pad hits survive (fresh event IDs).
- **Race-safe REC clearing via initial-events-snapshot, not active-time-window.** Filter by event IDs captured at REC arm time. New events from triggerPad use fresh `nextEventId()` IDs, automatically survive filter regardless of click-vs-tick order.
- **Track switch during recording: re-snapshot, not defer.** Per MPC2000XL manual quote. Session-wide `sequenceLoopedSinceRecordStart` preserved across track switches.
- **`overdubEnabled: false` default.** OVERDUB button starts idle. Was `true` historically — unintended.
- **REC ↔ OVERDUB mutually exclusive.** Pressing one disarms the other. Both can be off (= playback only).
- **`toggleOverdub` does not auto-start playback.** Pure arm/disarm. Matches MPC.
- **STOP resets both flags.** `isSequenceRecording: false`, `overdubEnabled: false`. Full transport reset.
- **Metronome gating: `isSequenceRecording || overdubEnabled`.** Both recording modes audible. Plain PLAY silent.
- **Undo Phase 1 scope:** engine + PAD ERASE only. Phases 2–5 deferred (STEP, PROGRAM, MIX/CHOP/sequence/song, keyboard shortcuts).
- **Hold-repeat acceleration ships site-wide** (carried from session 6).

### Open issues / followups

**Undo work — multi-phase, mostly deferred:**
- **Phase 2:** STEP screen actions to undo (event edits, ADD event, delete, move, mute toggle, PARAM TYPE/VALUE changes).
- **Phase 3:** PROGRAM screen actions to undo (pad assignment changes, tune/filter param edits).
- **Phase 4:** MIX, CHOP, sequence-level, song-level undo coverage.
- **Phase 5:** Keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z) + UI polish.

**REC mode test plan (8 scenarios) outstanding** — Marek to verify via audio:
1. REC continuous replace, single track.
2. Per-track scope (other tracks untouched).
3. Track switch mid-recording (multitrack).
4. OVERDUB additive regression check.
5. AUTO switch after first loop.
6. Manual OVERDUB override mid-recording.
7. Multiple hits same step (all survive).
8. Plain PLAY no recording (default behavior).

**Default REC arming question** — current behavior: pressing REC button alone (not playing) calls `requestTransportStartImpl("REC")` → starts playback in REC mode. Pressing OVERDUB alone (not playing) just arms. Asymmetry preserved deliberately (REC behavior unchanged), but worth confirming with Marek if this matches expected UX.

**Other deferred items from session 6 still open:**
- Pre-roll window may need widening from 0.25 to 0.30/0.35.
- TC apply wipes manual `timingOffset` — MPC-correct but worth surfacing.
- Non-4/4 step grid refactor (touches ~15 functions) — banner in MAIN warns until then.
- Inline pad picker grid layout uses implicit row growth — should refactor.
- Note Repeat uses gate-derived duration vs REC/16 LEVELS duration=0.

**Tauri integration** — still inactive, planned for Phase B (post-1.0). Web-first prototype trajectory holds.

### Files modified

- `src/store/useAppStore.ts` — central hub for all changes (16 LEVELS, transport timing, NR refactor, undo engine, REC mode, OVERDUB workflow, metronome gating). ~1000-line net delta this session.
- `src/screens/UtilityScreens.tsx` — TC/NR UI rewiring to global state, OVERDUB-related text fixes.
- `src/screens/StepScreen.tsx` — undo wiring for PAD ERASE path.
- `src/screens/MainScreen.tsx` — global state references.
- `src/screens/ChopScreen.tsx`, `src/screens/ProgramScreen.tsx`, `src/screens/PerformanceScreen.tsx` — minor wiring.
- `src/components/layout/TopBar.tsx` — NR rate display reads global.
- `src/components/useHoldRepeat.ts` — new (session 6 carryover), tracked here.
- `src/App.tsx` — App-level wiring.
- `docs/03_ui/UX_AUDIT_FINDINGS.md` — findings update.

## Session 6 — 2026-05-20 — STEP/sequencer foundation: audio feedback nav, event.muted UI, pre-roll, swing playback, add-events, beatsPerBar, +6 bug fixes from live test, +hold-repeat acceleration on all arrow buttons

### What was attempted
- STEP/sequencer foundation session covering 6 bundled tasks + a 7th added mid-session by Marek:
  - **Z1** STEP screen audio feedback on bar/step navigation.
  - **Z6** event.muted inline "M" toggle in STEP screen event list.
  - **Z7** pre-roll anticipation window during count-in (last 0.15 → later 0.25 of beat → forward-snap to step 0).
  - **Z4** swing applied to sequencer playback (TC ∈ {1/16, 1/8} only).
  - **Z2** add events from STEP screen ("+ ADD" button with snap to TC grid).
  - **Mini-Z3** `beatsPerBar` proper implementation per time signature, plus `isFirstBeatOfBar` using `beatsPerBar(state) * 4`. (Full non-4/4 step-grid refactor explicitly deferred.)
  - **Z28** remove `quantizeStrength` fake UI from TC screen.
- After Marek's live audio test of the foundation work, **six bug fixes** in priority order:
  - **BUG 6** STEP screen all clickable: VEL/OFFSET/PROB/PARAM TYPE/PARAM VALUE all get `<` `>` arrows; PARAM TYPE cycles NONE/VELOCITY/TUNE/FILTER/ATTACK/DECAY; PARAM VALUE clamps by type.
  - **BUG 1** ADD event pad workflow rework: button toggles armed state, inline 4×4 pad picker appears, click LCD or hardware pad while armed creates event with that pad (auto-disarm). Was wrongly using `state.selectedPad` defaults — corrected per MPC manual ("Press REC, hit a pad, event is recorded with that pad").
  - **BUG 2** bar `<` / `>` jump-to-bar-boundary (MPC `<<` `>>` behavior): forward = next bar START, backward = current bar START (or previous bar START if already at start).
  - **BUG 5** pre-roll window widened 0.15 → 0.25 of `beatMs`.
  - **BUG 3** TC apply (DO IT) for existing events: re-snap to TC grid + apply current swing offset, respects APPLY TO scope (CURRENT TRACK / ALL TRACKS).
  - **BUG 4** time signature partial-support banner in MAIN screen, shown when timeSignature ≠ "4/4".
- Final polish: **press-and-hold acceleration on all `<` `>` arrow buttons across the app** (BPM, BARS, ROOT, CUTOFF, VEL, OFFSET, DUR, PROB, PARAM TYPE/VALUE, SWING, sample prev/next, FILTER cycle, every Param +/-). Reusable hook `useHoldRepeat(action)` with phased timing: 400 ms initial delay, 200 ms / 100 ms / 25 ms acceleration phases.

### What worked
- **Pre-existing `quantize-on-record` was already correct**, just unwired for swing — `getRecordedEventPosition` (`useAppStore.ts:2742`) already snaps to `timingCorrectGridTicks(state.timingCorrect)` with hard `Math.round` 100% snap. `OFF` returns gridTicks=1 (= no snap). Saved a full task — Z5 from earlier planning was a no-op aside from swing apply.
- **swing playback wiring is tiny.** `swingOffsetTicks(state, stepIndex)` helper: returns `Math.round((swing - 50) / 50 * gridTicks)` for swing-eligible step indices (TC=1/16 → `stepIndex % 2 === 1`; TC=1/8 → `stepIndex % 4 === 2`). Plugged into `tickStepPlayback` two places — events at current step get `currentSwingTicks * ppqMs` added to delay, early-next events get `nextSwingTicks`. Range 50–75% swing, clamp at 50 means swing=50 returns 0 offset (no effect).
- **TC apply for existing events.** `applyTimingCorrectToEvents` action computes `realTicks = eventStepToTicks(event.step) + event.timingOffset`, snaps to grid via `Math.round(realTicks / gridTicks) * gridTicks`, then writes new `event.step = ticksToStep(snapped)` and `event.timingOffset = swingOffsetTicks(...)`. Respects APPLY TO scope (filter by `event.trackId === state.currentTrackId` when CURRENT TRACK selected, all events when ALL TRACKS). Recorded as `TC APPLY {grid}` in `lastAction` + `undoHistory`. Wired to F3 DO IT softkey + UtilityAction button in TC screen. F4 became "F4 SCOPE" (was "F4 APPLY" cycling scope — semantics now clearer with DO IT separated).
- **Pre-roll anticipation window pattern.** Block placed BEFORE the 16 LEVELS armed branch in `triggerPad`: `if (transportPhase === "COUNT_IN" && transportPendingAction === "REC")` → compute `remainingBeatMs = beatMs - state.transportCountInPulse`, only fires snap-to-step-0 path when `transportCountInBeatsRemaining <= 1 && remainingBeatMs <= windowMs`. Otherwise falls through to regular pad-trigger branch which doesn't create event because `isSequenceRecording === false` during count-in — so outside-window-during-count-in becomes "audition pad audio, no event creation" automatically. No additional code needed for the negative case.
- **ADD event arm-and-click pattern.** Reused the 16 LEVELS source-arm playbook: state field `addEventArmed: boolean`, `armAddEvent` toggle action, `createStepEventForPad(padId)` direct creator, `createStepEventForPadImpl(state, padIdentifier)` shared internal helper extracted from the prior `addStepEventAtCurrentStep`. `triggerPad` gets one new branch at the top of its real logic (before COUNT_IN check): `if (state.addEventArmed) { ...create event for selectedPad, return with addEventArmed: false }`. Hardware shell click works automatically because hardware pad clicks already go through `triggerPad`. Inline 4×4 LCD picker is conditional render: `{addEventArmed && <div className="grid grid-cols-4">...</div>}`.
- **BUG 6 PARAM TYPE/VALUE cycle is the most user-visible single feature.** `cycleSelectedEventAppliedParameter(delta)` cycles through `[undefined, "VELOCITY", "TUNE", "FILTER", "ATTACK", "DECAY"]` (6 values, NONE = `undefined`). Switching INTO a parameter type sets a sensible default value (TUNE=0, FILTER=50, VELOCITY=event.velocity, ATTACK/DECAY=0). Switching to NONE clears `appliedParameter`/`appliedValue`/`parameterValue`. `adjustSelectedEventAppliedValue(delta)` uses `appliedValueRange(parameter)` for type-specific clamping. This unblocks STEP-screen post-hoc Note Variation editing — user can now retroactively set TUNE +5 on any existing event without re-recording.
- **`isFirstBeatOfBar` previous "typo" was actually a grep display artifact.** File content showed `"4/4"` correctly (foundation audit had reported `"4\4"` based on grep escape-sequence output). The real defect was that `beatsPerBar` returned `4` in both ternary branches — semantic stub, not a typo. Replaced with proper switch over all time signatures (2/4, 3/4, 4/4, 5/4, 6/4, 6/8, 7/8, 9/8, 12/8). `isFirstBeatOfBar` math `stepIndex % (beatsPerBar * 4) === 0` keeps the hardcoded 4-steps-per-beat assumption (1/16 grid) — that's the deferred part of mini-Z3.
- **Two-GainNode pipeline from previous session held up.** No regression on choke groups, mono replace, mute targets, NOTE ON release. ADSR-introduced complexity didn't bleed into this session's changes.
- Build clean (`tsc + vite build`) after every task and every bug fix. Total diff: `useAppStore.ts` +292/-XX, `StepScreen.tsx` +115/-XX, `UtilityScreens.tsx` +25/-X, `MainScreen.tsx` +5, `UX_AUDIT_FINDINGS.md` +8.

### What didn't work / pitfalls hit
- **First-round ADD event implementation was wrong.** I initially wired the `addStepEventAtCurrentStep` action to use `state.selectedPad` directly — felt like the obvious default since "selected pad" is conceptually the user's focus. Marek tested and immediately flagged it: MPC manual says "Press REC. Hit a pad. Event is recorded with that pad." User intent is "I want to add event for this pad I'm about to click", not "default to last-selected". Fix required arm-and-click rework. **Lesson: when a feature involves "where does this default come from", check the MPC manual citation Marek already gave — multiple times this session he'd quoted the manual and I'd implemented something slightly off because I didn't re-read his quote carefully.**
- **Initial bar nav was wrong.** First implementation added 1 bar to currentStepIndex but kept the current step's position-within-bar, so jumping from 002.03.72 went to 003.03.72 (preserving step+tick offset). Marek's manual quote: MPC `<<` / `>>` jump to bar BOUNDARY (step 1, tick 0). Fixed: `barForward` always lands on step 1 tick 0 of next bar; `barBackward` lands on step 1 tick 0 of current bar (or previous bar if already at start). The "or previous bar if already at start" is the subtle bit — without it, `<` repeatedly at bar start would be a no-op.
- **Pre-roll 0.15 window was too tight in real testing.** Math seemed reasonable on paper (75 ms @ 120 BPM is roughly mouse-click anticipation latency) but Marek confirmed during test that real anticipation extends further. Bumped to 0.25 (125 ms @ 120 BPM). May need further tuning to 0.3 or 0.35 if still feels too tight — flagged in plan, easy single-number adjustment.
- **TC apply re-quantize wipes existing `timingOffset`.** This is the existing-events DO IT behavior: after re-snap, `event.timingOffset` is set to the new swing offset (or 0 if not on swing step). Any prior manual offsets (e.g., user pressing F2 OFFSET to nudge an event by ±3 ticks for groove feel) are LOST when DO IT runs. This is correct MPC behavior — TC apply intentionally normalizes — but worth flagging as it CAN feel destructive. Marek didn't push back on this when reviewing. Documented here for the next session.
- **`session_log.md` from /wrap previously was never committed.** When I started this session, the working tree had `docs/SESSION_LOG.md` already modified with Session 5's entry from the prior `/wrap` (still uncommitted, awaiting Marek's commit decision). Throughout this session, I treated that as expected state. The pre-existing modification will need to be bundled into THIS session's commit if Marek confirms commit. **Surfaced explicitly so it doesn't look like leftover dirt.**
- **Reminder noise continued.** ~8 reminders fired during this session at inappropriate moments (inspection, single-edit fix-ups, mid-flow). All ignored. Real task tracking via TaskCreate did happen (tasks #22 through #35, full lifecycle pending → completed). Worth noting that the cumulative task list across sessions now spans 35 tasks across 6 sessions; the reminder system seems unaware of the live status of those entries.
- **Inline pad picker grid layout.** Section `grid-rows-[auto_auto_1fr]` (3 explicit rows) now has 4 children when picker is visible: ADD button, picker, column header, event list. CSS Grid auto-grows implicit rows so this rendered correctly in build, but it's fragile — if anyone bumps the row count again it'll silently snap children to wrong rows. Should be `grid-flow-row` with auto-sized rows. Flagged but not fixed this session.

### Decisions made
- **`beatsPerBar` proper switch implementation** for 2/4, 3/4, 4/4, 5/4, 6/4, 6/8, 7/8, 9/8, 12/8. `default: 4` fallback. `TimeSignature` type extended to include `6/4`, `9/8`, `12/8` (was missing).
- **Full non-4/4 step-grid refactor explicitly deferred** to a dedicated future session. Mini-fix covers count-in and accent only. Banner added to MAIN screen for non-4/4 selections so user knows step grid is still 16-hardcoded.
- **swing playback-only model**, not "embed at record time then double-apply at playback". Events store nominal positions; playback applies swing dynamically based on global swing setting. Recording snaps to nominal grid (without swing); playback adds swing for swing-eligible steps. This matches the simplest cohesive interpretation across the contradictory bits of Marek's spec.
- **Swing range 50–75%** (MPC convention). Disabled in UI for TC ∉ {1/16, 1/8} via `swingApplicable(state.timingCorrect)` guard and visual greying of the SWING +/- UtilityActions.
- **`quantizeStrength` removed from UI but kept in state.** Fake UI policy violation closed for now; partial-strength snap is a future MPC4000-style feature documented in UX_AUDIT. Field stays in state to avoid type-level churn when re-introduced.
- **TC apply scope semantics:** CURRENT TRACK = filter by `event.trackId === state.currentTrackId`. ALL TRACKS = all events in current sequence. `cycleTimingApplyTo` cycles label only; `applyTimingCorrectToEvents` does the actual work. F3 = DO IT softkey + inline UtilityAction button (duplicate path for discoverability).
- **`event.muted` inline "M" column** in event list, not a softkey (F1–F6 were full). Toggle via dedicated `toggleEventMuted(eventId)` action; selecting/clicking row's other columns calls `selectStepEvent`. Used `event.stopPropagation()` on the M button to prevent triggering selection.
- **PARAM TYPE NONE entry in cycle.** When user cycles to NONE, `appliedParameter` and all related fields (`appliedValue`, `parameterValue`) are cleared. Cycling back into a type seeds the value with a sensible default. Avoids "ghost NV data" issue where event has appliedValue but appliedParameter is undefined.
- **Pre-roll window: only the very last beat counts.** Cleaner than checking total elapsed count-in time. `transportCountInBeatsRemaining <= 1` gate prevents premature pre-roll on beat 2 or 3 of count-in.
- **F4 in TC screen renamed APPLY → SCOPE** because real APPLY (DO IT) is now F3. Avoids label collision.

### Open issues / followups
- **Pre-roll window may need further widening** (0.25 → 0.3 or 0.35) after Marek's next test session. Single-line tune.
- **TC apply wipes manual `timingOffset`** — MPC-correct but could surprise. Consider: surface a confirmation toast / undo affordance, or split into "snap to grid" and "apply swing" as two separate actions.
- **Non-4/4 step grid refactor** is the next big sequencer foundation item. Touches ~15 functions (eventStepToTicks, ticksToStep, getRecordedEventPosition, tickStepPlayback loop math, barForward/Backward, stepForward/Backward, createStepEventAtPosition/FromIndex, formatBarPosition, etc.). Banner in MAIN warns users until that lands.
- **Inline pad picker grid layout** uses implicit row growth — should refactor to `grid-flow-row` or explicit `grid-rows-[auto_auto_auto_1fr]` for clarity.
- **Note Repeat path still uses gate-derived duration** while regular REC + 16 LEVELS recording use duration=0. NR bursts intentional but worth flagging — once duration=0 universally settles in user expectations, NR may want re-evaluation.
- **`adjustSelectedEvent("duration", ...)` clamp lower bound is now 0** — F3 DUR softkey path can no longer go below 1 because `clamp(value + delta, 0, 96)`. STEP screen arrows path properly stops at 0 (FULL). Both paths consistent.
- **Audio test verdict for this session's bug fixes pending Marek's listen.** Implementation + build clean across all 6 bugs; Marek hasn't yet confirmed the live audio behavior for the post-fix state.
- **SESSION_LOG.md still carries Session 5 entry from prior /wrap** that was never committed — bundles into this commit unless Marek splits.

### Files modified
- `src/store/useAppStore.ts` (+292/-XX) — `swingOffsetTicks` + `swingApplicable` helpers; `playEventsAtCurrentStep` + `playFirstEventInCurrentBar` helpers; `stepBackward/Forward/barBackward/barForward` rewired to play audio after set (Z1); `barBackward/Forward` reimplemented to MPC `<<`/`>>` bar-boundary semantics (BUG 2); `toggleEventMuted(eventId)` action (Z6); pre-roll branch in `triggerPad` BEFORE 16 LEVELS armed branch (Z7 + BUG 5 0.25 window); `tickStepPlayback` applies swing delay to current and early-next events (Z4); `createStepEventForPadImpl` shared helper extracted (Z2 + BUG 1); `addEventArmed` state + `armAddEvent` + `createStepEventForPad` actions (BUG 1); `appliedValueRange` helper + `cycleSelectedEventAppliedParameter` + `adjustSelectedEventAppliedValue` actions (BUG 6); `applyTimingCorrectToEvents` action (BUG 3); `beatsPerBar` proper switch over all time sigs (mini-Z3); `TimeSignature` type extended with 6/4, 9/8, 12/8 (mini-Z3); `addEventArmed: false` default; pre-roll window `0.25 * beatMs` constant.
- `src/screens/StepScreen.tsx` (+115/-XX) — BAR + STEP `StepNav` rows added in 2nd panel (Z1); event list reworked to 5-column with "M" toggle column + `<div>`-with-inner-`<button>` row pattern to allow event.muted click separate from event select (Z6); `+ ADD EVENT` button toggles armed state with conditional inline 4×4 pad picker (Z2 + BUG 1); VELOCITY/OFFSET/DURATION/PROBABILITY rows switched from `<Info>` to `<EditableValue>` with arrows (BUG 6); PARAM TYPE and PARAM VALUE rows now `<EditableValue>` wired to `cycleSelectedEventAppliedParameter` / `adjustSelectedEventAppliedValue` (BUG 6); softkeys F1–F5 unchanged as shortcut path.
- `src/screens/UtilityScreens.tsx` (+25/-X) — TimingCorrectUtilityScreen STR controls (rows + UtilityActions + F3 STRENGTH softkey) removed (Z28); SWING controls disabled visually when `timingCorrect` not in {1/16, 1/8} via `swingApplicable` check (Z4); `UtilityAction` extended with `disabled?: boolean` prop; F3 = "F3 DO IT" wired to `applyTimingCorrectToEvents` + inline UtilityAction button "DO IT" (BUG 3); F4 = "F4 SCOPE" (was "F4 APPLY") wired to `cycleTimingApplyTo` (BUG 3 cleanup).
- `src/screens/MainScreen.tsx` (+5) — partial-support banner conditional render under TIME SIG row when `timeSignature !== "4/4"` (BUG 4). Plus `StepButton` refactored to use `useHoldRepeat` (covers ValueRow arrows: BPM, BARS, TIME SIG, SWING, TC).
- `src/components/useHoldRepeat.ts` (NEW) — reusable hook. Returns `{ onPointerDown, onPointerUp, onPointerLeave, onPointerCancel }` props. Single click fires action immediately; press-and-hold enters repeat after 400 ms with 200 ms → 100 ms → 25 ms phase acceleration. Cleanup via `useEffect` unmount and on every pointer up/leave/cancel.
- `src/screens/ProgramScreen.tsx` — `Param` ± buttons and `BracketButton` refactored to use `useHoldRepeat` (covers TUNE, FINE, PAN, ATTACK, DECAY, CHOKE, FILTER < >).
- `src/screens/ChopScreen.tsx` — inline sample prev/next buttons refactored to use `useHoldRepeat`.
- `docs/03_ui/UX_AUDIT_FINDINGS.md` (+8) — quantizeStrength removed-from-UI entry with future-feature note (Z28).
- `docs/SESSION_LOG.md` — Session 5 entry from prior /wrap still pending commit (carries forward); this Session 6 entry added at top.

---

## Session 5 — 2026-05-20 — Foundation audit + AD envelope engine + event.duration gate time + 16 LEVELS ATTACK/DECAY + STEP DUR arrows

### What was attempted
- Foundation-first audit (read-only) covering event state shape, PadAssignment / program state, samplerEngine.play() API surface, sequencer playback path end-to-end, and full fake-UI sweep. Produced ranked priority list (Gap #1 ADSR, #2 event.duration, #3 real undo, #4 padCurve, #5 event.muted UI, #6 FX engine, #7 time-signature flexibility, #8 settings fake fields cleanup).
- Implementation pass for Gap #1 + #2 bundled per Marek's direction:
  - AD envelope (Attack + Decay only; no Sustain Level / no separate Release field) wired into `samplerEngine.play()`.
  - `event.duration` becomes real gate time. `0 = FULL` (no truncation, legacy behavior). `>0` schedules softStop with envelope release.
  - 16 LEVELS PARAMETER cycle re-extended to 5 working values (VELOCITY / TUNE / FILTER / ATTACK / DECAY).
  - STEP screen DURATION value gets clickable `<` `>` arrows beside it (alongside existing F3 DUR softkey), consistent with BPM / ROOT / other editable fields.
- Audio-engine pipeline refactor: split single Voice GainNode into `envelopeGain` + `channelGain` to isolate ADSR automation from live MIX updates.

### What worked
- **Two-GainNode pipeline.** `source → (filter)? → envelopeGain → channelGain → pan → masterGain → destination`. `envelopeGain.gain` only touched by `applyEnvelope` and `softStopVoice` (cancelScheduledValues + setValueAtTime + linearRampToValueAtTime). `channelGain.gain` continues to be touched by `options.gain` at start + `updateChannelMix` from MIX screen. Both axes multiply independently. No interference.
- **`applyEnvelope`** (samplerEngine internal): cancelScheduledValues at startTime, setValueAtTime(0, startTime), linearRampToValueAtTime(1, startTime + attackSec). For ONE SHOT with decayMs > 0: linearRampToValueAtTime(0, startTime + attackSec + decaySec). For NOTE ON: stays at 1 (sustain at peak) until softStop is called.
- **softStop/hardStop split landed cleanly.** Public API: `stopVoiceGroup(voiceGroup, options?: { releaseMs? })`, `stopVoiceGroups(voiceGroups, options?)`, `stopAllVoices()` (panic-only, no soft option). Internal helpers `hardStopVoice(voice)` and `softStopVoice(voice, releaseMs)` route through a single `voices.delete` cleanup. Existing callers (mono replace in `playInternal`, choke groups in `playAssignedPadWithContext`, preview rotation, `stealOldestVoice`, double-STOP panic) all stay hardStop. Only `releasePad` NOTE ON path and the new `sustainMs` scheduled stop use softStop.
- **`sustainMs` in PlayOptions.** When set, `playInternal` schedules a `window.setTimeout` that calls `softStopVoice(voice, releaseMs = envelopeDecayMs)`. Timer is stored on the Voice and cleared on `source.onended` (natural end) or `hardStopVoice` (early kill) to prevent leaks. Re-uses the envelope's decay time as the release ramp — fits AD-only model where DECAY field doubles as release.
- **`programValueToMs` cubic curve `(v/100)^3 * 5000`.** Marek's chosen formula. v=0→0, v=50→625ms, v=100→5000ms. Snappy resolution in the low end where drum work lives. Minimum 1ms ramp (`MIN_RAMP_MS`) at v=0 guards against zero-crossing clicks while keeping perceptually instant.
- **Zero-regression legacy bypass.** `playAssignedPadWithContext` computes `effectiveAttack` / `effectiveDecay`, then: if `effectiveAttack === 0 && effectiveDecay >= 100` → pass `envelope: undefined` to engine, which sets `envelopeGain.gain.value = 1` statically. Default PadAssignment is `attack: 0, decay: 100` so all pre-existing assignments behave exactly as before.
- **event.duration migration was clean.** Three creation sites changed to write `duration: 0, length: 0`: `createRecordedPadEvent` (regular REC pad triggers), `triggerPad` UTILITY_16_LEVELS branch (16 LEVELS recording), `createStepEvent` (seed demo events that used to write 12 or 24). All three rely on the fact that `...extra` is spread last in `createStepEventFromIndex` and `createStepEventAtPosition`, so the override wins. Note Repeat path (`createRepeatedNoteEvents` → `createStepEventFromIndex` with gate-derived duration) was deliberately left untouched per Marek — NR bursts keep their short gate times.
- **`adjustSelectedEvent` clamp 0–96** (was 1–96). One-character change, enables "FULL" as a valid value.
- **STEP screen `EditableValue` component** added (label + `<` value `>` triple with disabled state when `selectedEvent` is null). DURATION row uses it; F3 DUR softkey kept as alternative. Click on `<` or `>` also flips `eventEditMode → "DURATION"` for the amber highlight, matching what F3 does. Disabled buttons use `opacity-40` for visual consistency with rest of the screen.
- **16 LEVELS ATTACK / DECAY extension.** `cycleSixteenLevelsParameter` array grew from 3 to 5. `getSixteenLevelsValue` switch added `case "ATTACK"` and `case "DECAY"` returning `Math.round(((variationIndex - 1) / 15) * 100)` (0–100 program-scale spread). `playSixteenLevelsVariation` switch sets `attackOverride` / `decayOverride`. `playStepEventFromState` reads `event.appliedParameter === "ATTACK"` / `"DECAY"` for sequencer playback override.
- Build clean (`tsc + vite build`) after every iteration. Total diff for the work: `samplerEngine.ts +147/-30`, `useAppStore.ts +59/-14`, `StepScreen.tsx +37/-1`, `UtilityScreens.tsx +3`. Final commit `e5ae0bd`.

### What didn't work / pitfalls hit
- **Initial fear: live MIX would clobber envelope automation.** First proposal was to do the entire ADSR on the existing single GainNode and use `cancelScheduledValues` defensively when MIX updates fire. Walked it back during the inspection — `updateChannelMix` is called every time the user moves a fader, so any in-flight envelope ramp would get nuked by a direct `gain.value = ...` write. Two-GainNode design was clearly cleaner. Cost is one extra audio node per voice. Negligible. Should have been the obvious first choice.
- **`event.duration` regression risk was bigger than expected.** Three places had to be touched, not one. `createRecordedPadEvent` was obvious. `triggerPad` UTILITY_16_LEVELS branch I almost missed because the audit had treated it as "extra fields appended". The seed events in `createStepEvent` (kick/snare/hat demo pattern with `duration: 12` for P08 hat) only showed up when I grep'd for `duration:` literally — they would have produced very-short ghost hits on first load of the app. Lesson: when changing a recording default, audit ALL event creators, not just the recording one. Note Repeat path was the only intentional opt-out, and only because Marek explicitly said so.
- **Marek's cubic formula `(v/100)^3 * 5000` gives v=50 = 625 ms, not 500 ms.** I proposed `(v/100)^log2(10)` which lands exactly on Marek's described anchor (v=50 → 500 ms). Marek picked the simpler `^3` form and accepted the slightly off anchor. Two takeaways: (1) don't oversolve when the user gives a "good enough" formula, (2) the actual curve shape is what matters perceptually, not the exact midpoint number.
- **Marek's prior message got truncated mid-decision point 4.** I made the call to interpret the cut sentence ("Spójne z 'instant…") as "spójne z instant kill" and continue — explicitly flagged it. Marek didn't push back. Lesson: if a Marek decision message cuts off, complete the read literally and ask, don't silently guess past the cut. I did surface it but it could have gone wrong.
- **`StepNav` already existed in StepScreen.tsx for EVENT / TRACK navigation.** I added a new `EditableValue` component instead of reusing `StepNav` because `StepNav` has cycle semantics (no edge clamp, both arrows can wrap) and the active-mode highlight semantics from `Info` (amber when `eventEditMode === ...`). The two patterns are similar enough to be confusing for whoever reads this later — three styles of "row with arrows" now exist in the codebase (`StepNav`, `EditableValue`, `ArrowRow` in UtilityScreens). Worth a future polish pass to unify. Logged below.
- **F3 DUR softkey was already wired before this session.** The change was just adding the `<` `>` arrow affordance. Easy to write a too-big diff there — kept it to one new component plus replacing the `<Info>` call with `<EditableValue>`.
- **No real audio test from me.** I have no ears. Implementation + build clean + matrix of expected behavior described, but the actual "ATTACK 50 → fade-in" / "DECAY 10 → tail" / "DUR 24 → gate to ~125ms @ 120 BPM" verification depends on Marek hitting pads and listening. Marek implicitly confirmed by saying "Reszta tests passed" before requesting the STEP DUR arrows polish — so the audio behavior was verified, just not by me directly. Logged here so future sessions remember the validation path.
- **Reminder system noise.** The task-tools `<system-reminder>` fired ~6 times during this session in inappropriate phases (read-only inspection, single-edit follow-up, planning). I followed the "ignore if not applicable" exception but it remains genuinely intrusive. Did create real tasks #16-#21 to track the implementation arcs, which Marek explicitly asked for ("periodicznie update jak idziesz przez sekcje").

### Decisions made
- **AD envelope, not full ADSR.** No Sustain Level field, no separate Release field. Aligns with existing PROGRAM UI (only 2 sliders: ATTACK and DECAY). Future ADSR upgrade lives in a separate ticket if Marek ever wants it; design has a clear extension point (`Envelope.holdMode` could grow `sustainLevel?` and `releaseMs?`).
- **`programValueToMs(v) = (v/100)^3 * 5000`.** Cubic, range 0–5000 ms. Marek's choice.
- **hardStop / softStop split:** hardStop for choke, mono replace, panic, preview cancel, voice steal, double-STOP. softStop for NOTE ON releasePad and sequencer `event.duration` expire. Both Marek-confirmed.
- **Decay >= 100 = "no envelope cap"** (sample plays to natural end). Combined with `attack === 0` → entire `envelope` arg is undefined. Migration safety net for default assignments.
- **`event.duration = 0` means "FULL"**. No scheduled stop, voice plays naturally. Display label "FULL" in STEP screen. All new recordings default to 0. Seed demo events updated to 0. Note Repeat path keeps gate-derived duration (separate intent — those are short bursts).
- **F3 DUR softkey kept** even after adding `<` `>` arrows. Two-way edit (cycle softkey + direct arrows) is consistent with how F1/F2/F4 work in STEP for VEL/OFFSET/PROB.
- **Disabled state on EditableValue arrows** when no `selectedEvent` — opacity-40 visual, no click handler. Matches existing pattern of fields showing "---" when nothing is selected.
- **Did NOT touch the foundation gaps #3 through #8.** Real undo/redo (#3) is the biggest pending foundation item but is a separate-session-class architectural change. Cleanup items (#4 padCurve, #5 event.muted UI, #7 timeSignature `"4\4"` typo, #8 fake settings) are queued for a polish pass. FX engine (#6) is Phase A3, not foundation.

### Open issues / followups
- **Three styles of "label + arrows + value" coexist.** `StepNav` (cycle, no clamp), `EditableValue` (clamped, with active highlight, disabled state), `ArrowRow` (UtilityScreens — clamped, with highlighted state). A future polish pass should unify into one shared component, ideally with prop flags for cycle-vs-clamp and active highlight. Out of scope for this session.
- **Note Repeat events still bypass the `duration: 0` default.** `createRepeatedNoteEvents` continues to compute duration from `noteRepeatGate` (default 75 → ~94 ms gate @ 120 BPM). This was an intentional carve-out per Marek but means NR-generated events have measurably shorter audible playback than equivalent freshly-recorded pad hits at the same step. May be desired (NR is conceptually "burst pattern"), worth flagging if it ever feels wrong.
- **`event.duration` max 96 = 1 quarter note.** No way to record gate longer than one beat. For sustained ambient / chord events the user would want half / whole notes (192 / 384). Latent limitation, not addressed.
- **`beatsPerBar` typo `"4\4"`** (`useAppStore.ts:4127`) — backslash where it should be forward slash. Falls through to default `: 4`, harmless for 4/4 but means non-4/4 time signatures silently return 4. Logged in foundation audit, not fixed.
- **ATTACK / DECAY in PROGRAM screen now real — UX_AUDIT_FINDINGS entry should be updated.** The "PROGRAM screen — ATTACK/DECAY are fake UI (CRITICAL)" entry from the previous session is now resolved by this work. The entry text should be amended (or the section closed with a "RESOLVED in Session 5" note) rather than deleted. Not done in this session — flagged.
- **Marek confirmed audio passes for ATTACK / DECAY / event.duration via testing on his end.** The STEP DUR arrows polish was the only remaining UI gap before commit. Audio test verification trail lives in this log entry rather than in the codebase.
- **Recording-time velocity / event.velocity-to-gain mapping was a Session 4 change.** Still always-on (any event with `velocity != null` gets `gainOverride = velocity/127`). Default velocity 127 keeps that as a no-op for unchanged events, but worth remembering the relationship if the velocity curve gets re-examined (foundation gap #4).

### Files modified
- `src/audio/samplerEngine.ts` (+147/-30) — full Voice / PlayOptions / pipeline refactor. New types: `Envelope`, `StopOptions`. New methods: `stopVoiceGroup` / `stopVoiceGroups` extended with `releaseMs`, `softStopVoice`, `softStopVoices`, `hardStopVoice`, `applyEnvelope`. New module constant `MIN_RAMP_MS = 1`. Pipeline rewired to `source → (filter)? → envelopeGain → channelGain → pan → masterGain`. `updateChannelMix` and `updateVoiceFilter` updated to reference `voice.channelGain` / `voice.envelopeGain` instead of the old single `voice.gain`. `sustainMs` schedules timer-based softStop and stores the timer on the voice for cleanup.
- `src/store/useAppStore.ts` (+59/-14) — new helper `programValueToMs`. `playAssignedPadWithContext` context type extended with `attackOverride?` / `decayOverride?` / `sustainMs?`; computes `effectiveAttack` / `effectiveDecay`, builds `envelope` object or undefined, forwards `sustainMs` to engine. `playStepEventFromState` reads `appliedParameter` for ATTACK / DECAY, computes `sustainMs` from `event.duration`. `releasePad` NOTE ON uses softStop with assignment-derived `releaseMs`. `cycleSixteenLevelsParameter` array grew to 5 values. `getSixteenLevelsValue` switch handles ATTACK / DECAY. `playSixteenLevelsVariation` switch handles ATTACK / DECAY. `createRecordedPadEvent` and the 16 LEVELS recording branch and seed `createStepEvent` all write `duration: 0, length: 0`. `adjustSelectedEvent` clamp 0–96 (was 1–96).
- `src/screens/StepScreen.tsx` (+37/-1) — `<EditableValue>` component added (label, value, optional onPrevious / onNext, optional active). DURATION row uses it. "FULL" string returned when `selectedEvent.duration === 0`.
- `src/screens/UtilityScreens.tsx` (+3) — 16 LEVELS LCD grid `displayValue` switch handles ATTACK / DECAY (0–100 spread).

All four files committed locally in a single commit `e5ae0bd`: `audio: AD envelope + event.duration gate time (foundation A8)`. Branch ahead of origin/main by 1 commit. Not pushed (Marek's decision).

---

## Session 4 — 2026-05-20 — 16 LEVELS full feature (VELOCITY/TUNE/FILTER) + metronome accent + count-in downbeat + double STOP panic

### What was attempted
- 16 LEVELS feature build-out from a flagship-bug placeholder into a working sampler feature. Multi-iteration: iter 1 (VELOCITY only with destructive APPLY), iter 2 (rewrite to MPC-correct live preview + recording without APPLY, TUNE + FILTER added), then 3 small architectural corrections (POPRAWKA 1/2/3), then a FILTER recording bug fix, then ATTACK/DECAY confirmed deferred.
- Mid-session deliverables that landed after 16 LEVELS:
  - Metronome accent (downbeat ×2 gain).
  - Count-in → record off-by-one downbeat fix (first beat of sequence was inaudible).
  - Double STOP within 500 ms = panic / `samplerEngine.stopAllVoices()`.
- Documentation: ATTACK/DECAY fake-UI bug added to UX_AUDIT_FINDINGS.md as CRITICAL (Phase A8 gating). STEP screen "PARAM TYPE / PARAM VALUE editable" added as follow-up.

### What worked
- **16 LEVELS state shape** ended up cleanly minimal: `sixteenLevelsSourcePad` (bank-aware "A05"), `sixteenLevelsParameter` ("VELOCITY"|"TUNE"|"FILTER"; ATTACK/DECAY left in the union for back-compat of historical events but never produced), `sixteenLevelsRootPad: number` (1–16, default `5` — MPC2000XL convention per Marek), `sixteenLevelsFilterCutoff/Resonance/Type: ... | null` sandbox triplet, `sixteenLevelsSourceArmed: boolean`. Sandbox `null` semantics = "use source pad value" worked cleanly.
- **Pad → variation index mapping**: helper `padNumberToVariationIndex` (`row = floor((p-1)/4)`, `col = (p-1)%4`, `var = (3-row)*4 + col + 1`). Used uniformly across VELOCITY (`1 + 126*(var-1)/15`), TUNE (`clamp(var-rootVar, -12, 12)`), and FILTER (MPC Sample split: ≤8 from 0 to current cutoff, >8 from current to 100). LCD grid still shows `P01..P16` in the spatial 4×4 it always had, but value per cell now matches the hardware-layout-correct variation index (PAD 1 top-left = variation 13, PAD 13 bottom-left = variation 1, etc.).
- **Per-event Note Variation persistence**: `StepEvent` already had `appliedParameter`/`appliedValue`/`parameterValue`. Added `appliedFilterType?` and `appliedFilterResonance?` to also snapshot the sandbox filter state at record time so events keep playing with the snapshotted type/Q even if the source pad's PROGRAM filter changes later. This is MPC Note Variation semantics.
- **VELOCITY playback wiring**: previously `event.velocity` was stored but never modulated gain at playback. Added `gainOverride = event.velocity / 127` unconditionally in `playStepEventFromState`. Default velocity 127 → multiplier 1.0, so no regression on pre-existing events. This makes step-event velocity actually audible for the first time.
- **`playAssignedPadWithContext` context** extended with `gainOverride`, `filterCutoffOverride`, `filterResonanceOverride`, `filterTypeOverride` (in addition to existing `tuneOverride`/`fineTuneOverride`). `createPadFilterOptions` now takes an `overrides` arg with `cutoffOverride`/`resonanceOverride`/`typeOverride`. All overrides fall through to assignment values when undefined — backward compatible.
- **F1 SOURCE arm-then-click pattern** (POPRAWKA 2): F1 toggles `sixteenLevelsSourceArmed`. While armed, next pad click (LCD grid or hardware shell) sets new source identity using current `padBank` + pad number, then disarms. Skips playback for the arming click via `wasArmedSourcePick` flag captured before `set` in `triggerPad`. Right-click on LCD grid cell is a direct shortcut bypassing arm mode. F1 label flips to "F1 CANCEL" while armed. SOURCE PAD field shows `"A05 ← SELECT PAD"` highlighted in amber.
- **Sandbox reset hooks**: `cycleSixteenLevelsSourcePad`, `setSixteenLevelsSourceFromPad`, `exitUtilityWorkflow` (when leaving UTILITY_16_LEVELS) all reset cutoff/resonance/type/armed back to null/false.
- **FILTER OFF hint**: rewritten to "Filter OFF — click FILTER TYPE above to enable LP / HP / BP." — explicitly directs user to the in-screen control, no longer mentions going to PROGRAM.
- **Metronome accent**: gain coefficient `accented ? 1.25 : 1` → `accented ? 2 : 1` (+6 dB on downbeat). Simple one-line change that produces an audibly hardware-MPC-like "BAM tik tik tik" feel.
- **Count-in off-by-one**: at `tickTransport` end-of-count-in branch (`remaining <= 0`), `playMetronomeClick(state, true)` is now called explicitly before transitioning to RECORDING (or PLAY). Previously this transition zeroed `transportCountInPulse` and let the sequencer-during-record path handle subsequent clicks, but that path only fires after a full `beatMs` passes — so the actual downbeat was silent. With the explicit call, downbeat fires immediately on transition.
- **Double STOP panic**: `samplerEngine.stopAllVoices()` (public, wraps existing `stopVoices(() => true)`). Module-level `lastStopAt = 0` in store. `stopPlayback` measures `performance.now() - lastStopAt < 500ms` for the double-press window; on double-press calls `stopAllVoices()` + sets `lastAudioMessage: "ALL AUDIO STOPPED"`. Single press unchanged.
- **STEP screen display**: added `PARAM TYPE` info row, formatted PARAM VALUE per parameter (`+N` for TUNE, raw int otherwise) via new local `formatParamValue` helper.
- Build `tsc + vite build` clean after every iteration.

### What didn't work / pitfalls hit
- **Iter 1 was the wrong shape entirely.** Initially designed `applySixteenLevels` as a destructive program-editor APPLY (copies source assignment into all 16 pads with VELOCITY spread, with timed `sixteenLevelsLastApplyAt` for ARMED/APPLIED/OFF status flag + inline warning text + undo log entry). All of that got ripped out at the start of iter 2 when Marek pointed out that the MPC3000 manual treats 16 LEVELS as a *performance/live tool* using Note Variation per-event, not a program editor. Lesson: when a feature description says "APPLY" it does not automatically mean "destructively rewrite assignments." Read the manual semantics first. The `sixteenLevelsEnabled` boolean, `sixteenLevelsRootPad` as string, `sixteenLevelsRangeMin/Max`, `sixteenLevelsLastApplyAt`, `applySixteenLevels` action, F5 APPLY softkey, status flash row, inline warning — all deleted in iter 2.
- **TUNE math interpretation collision.** I proposed three variants (A: step=1 fixed clamped ±12; B: scale by /15 giving fractional semitones; C: adaptive step keeping ±12 hard at edges). Marek's prose example "PAD 1 = -3 (when ROOT = PAD 4)" only matches Variant A. His own formula `-12 * pads_below/15` matches Variant B. Surfaced the contradiction in the plan, Marek picked A. With the variation-index mapping done later in POPRAWKA 1, the chosen formula `clamp(variationIndex - rootVariationIndex, -12, 12)` happens to satisfy both intents — root=5 (PAD 5 = variation 9) means PAD 1 (var 13) = +4, PAD 4 (var 16) = +7, PAD 13 (var 1) = -8. Different numbers than the prose example but consistent and predictable.
- **FILTER variation didn't audibly record at first.** Spotted by Marek during live test. Root cause: source pad's PROGRAM filter defaults to `filterType: "OFF"`. At playback, `createPadFilterOptions` bails out with `if (effectiveType === "OFF") return undefined`. The recorded event had `appliedParameter: "FILTER"` + `appliedValue: cutoff` but no sandbox `filterType`/`filterResonance` snapshot — so playback couldn't know the user had selected LOWPASS in the sandbox. Fix was adding `appliedFilterType?`/`appliedFilterResonance?` to `StepEvent`, snapshotting from sandbox (or source assignment fallback) at record time, and passing `filterTypeOverride`/`filterResonanceOverride` from event at playback. This is the canonical MPC Note Variation snapshot semantics and should have been there from iter 2.
- **Initial hardware shell pad layout investigation went down a wrong branch.** I read `layout.json` correctly (P01-P04 at y=672 top, P13-P16 at y=1304 bottom = correct MPC convention) but then proposed Option A/B alternatives including potentially rewriting the layout. Marek pulled me back — "hardware shell stays, only change mapping inside 16 LEVELS." Saved time by surfacing the read before committing to a layout edit.
- **POPRAWKA 2 source arm + click playback skip required a `get()` capture before `set`.** Naïve attempt: skip `playSixteenLevelsVariation` if `playbackState.sixteenLevelsSourceArmed === false` after set. But after set, armed is already false (we just disarmed it). So I captured `wasArmedSourcePick = get().activeScreen === "UTILITY_16_LEVELS" && get().sixteenLevelsSourceArmed` BEFORE `set(...)`, then gated the playback path on `!wasArmedSourcePick`. Worked.
- **Reminder noise from the task-tools system reminder fired ~10+ times across the session** even when I was in clearly inappropriate phases (read-only inspection, finalizing plans, single-edit fixes). Followed the "ignore if not applicable" exception rather than spamming TaskCreate. Did create a real TaskList (#1-#15) for the long iter-2 + corrections stretch to keep Marek updated on progress — that was useful and Marek requested periodic progress updates.
- **CLAUDE.md showed as modified in the diff.** I did not touch it. Marek edited it in the IDE during the session (per system-reminder near the end about `roadmap_v2.md` being opened — same pattern). Surfaced it explicitly before wrap so Marek can decide whether his CLAUDE.md edits bundle into this commit or split out.
- **`type SettingsValues` reference inside `metronomeSettingPatch` typo (`"4\4"` instead of `"4/4"` in `beatsPerBar`).** Noticed during inspection of metronome path. Not in scope for this session — left untouched because it has a safe `: 4` fallback and works fine; but it is a latent bug to log. Adding to "Open issues" below.

### Decisions made
- **16 LEVELS is a live performance / Note Variation feature, NOT a program editor.** No APPLY. EXIT discards sandbox, PROGRAM source pad untouched. Confirmed against MPC3000 page 95 reference Marek cited.
- **VELOCITY scale = 0-127 (MIDI).** Consistent with existing `event.velocity` (clamp 1-127 at `useAppStore.ts:2019`), `lastPadVelocity` defaults, `lastSixteenLevelsValue`. Per-pad `mix.level` stays 0-100 — different axis, intentionally not unified.
- **Velocity → gain conversion is linear `velocity/127`.** Not velocity² (could be revisited if dynamic range feels insufficient). Applied uniformly in `playStepEventFromState`, so existing events with default velocity 127 are unaffected.
- **Engine has no ADSR. ATTACK/DECAY are fake UI** in PROGRAM screen and are deliberately excluded from the 16 LEVELS PARAMETER cycle. Documented in UX_AUDIT_FINDINGS as CRITICAL Phase A8 work. Re-enable in 16 LEVELS PARAMETER cycle is part of the same future ticket.
- **`padNumberToVariationIndex` mapping**: P01 top-left → variation 13, P04 top-right → variation 16 (highest), P13 bottom-left → variation 1 (lowest), P16 bottom-right → variation 4. Matches MPC convention "softest on lower-left, loudest on upper-right" (MPC3000 manual citation Marek provided). Hardware shell already has P01 on top, P13-P16 on bottom — no shell edits needed.
- **ROOT pad default = PAD 5** (changed from PAD 4 at Marek's request late in session — MPC Sample convention per his reading of the manual). Stored as `number` (1-16), not bank-aware string — root is a grid position within 16 LEVELS, not a bank-aware pad identity.
- **F1 SOURCE is arm-then-click, not cycle.** Aligned with all four Akai manuals (MPC2000XL "select sound by directly playing the drum pad", MPC3000, MPC5000, MPC Sample). F1 toggles armed; F1 again = CANCEL. Right-click on LCD pad = bypass arm-mode shortcut (mouse-first bonus).
- **FILTER mapping = MPC Sample style split.** Pads 1-8 (variations 1-8): from 0 to current cutoff. Pads 9-16 (variations 9-16): from current cutoff to 100. PAD 8 = current (sweet spot), PAD 9 = current + 1/8*(100-current). Near-duplicate at boundary accepted as Marek confirmed.
- **Sandbox FILTER values are persisted to step events at record time** (added during the bug fix). Per-event Note Variation snapshot. Source PROGRAM filter unchanged; user can sandbox LP in 16 LEVELS even if PROGRAM source has OFF, and recorded events will play with LP. This was a corrective decision after the live test exposed the recording-time snapshot was incomplete.
- **Metronome accent = ×2 gain on downbeat, single sample.** No second sample, no pitch shift. Marek course-corrected my "could be two samples or pitch shift" proposal to keep it analog-style louder.
- **Double STOP window = 500 ms.** Single press unchanged. Closure variable `lastStopAt` in module scope, no state field added. Visual STOP button flash skipped (Marek made it optional, low value vs scope cost).
- **STEP screen edit affordances for `appliedParameter`/`appliedValue`** are explicit follow-up — out of scope of this session.

### Open issues / followups
- **ADSR engine + connect ATTACK/DECAY (Phase A8 / dedicated session).** When that lands: re-enable ATTACK/DECAY in 16 LEVELS PARAMETER cycle, wire `appliedAttack?`/`appliedDecay?` (or rely on PROGRAM values) per the same Note Variation pattern. Touches choke groups, mono voice management, step playback, and PROGRAM screen.
- **Editable `appliedParameter`/`appliedValue` from STEP screen** — currently display-only. Adding a `PARAM TYPE` / `PARAM VALUE` editEditMode + softkey cycler is a 30+ min job. Logged in UX_AUDIT_FINDINGS.md.
- **`beatsPerBar` typo (`"4\4"`)** in `useAppStore.ts:4127` — currently harmless (falls through to the same `: 4` default) but it means non-4/4 time signatures (`3/4`, `6/8`, etc.) silently return 4. Should be `"4/4"`. Not fixed this session; small but worth a follow-up patch when touching transport.
- **`mix.level` per-pad scaling vs `event.velocity` per-event scaling** now combine multiplicatively in `playAssignedPadWithContext` (`gain = (gainOverride ?? 1) * (mix.level / 100)`). With default `mix.level = 127` and `velocity = 127`, gain = 1.27 × 1 = 1.27 — clamped to 2 in engine. No issue today, flag for headroom math if FX engine work in Phase A3 introduces sub-mix routing.
- **Marek's CLAUDE.md edits (~48 lines added)** in the working tree are unrelated to this session's code work. He should decide whether they bundle into this commit or split.
- **Audio test verdict from Marek not yet in.** Implementation complete + build clean, but neither I nor the harness has ears — the full audio pass (VELOCITY/TUNE/FILTER live + record + playback, metronome accent + downbeat, double-STOP panic) is pending Marek's manual confirmation before he chooses commit / no commit.
- **POPRAWKA 1 hardware-shell test consistency**: with the new variation mapping, clicking pad P13 on the hardware shell should produce the same audible result as clicking grid cell P13 in the LCD. Worth verifying explicitly during audio test.
- **POPRAWKA 3** (FILTER hint update) is the only fully-trivial change with nothing to verify beyond reading the new string.

### Files modified
- `src/store/useAppStore.ts` — state shape (root + sandbox triplet + arm flag), new actions (`armSixteenLevelsSource`, `setSixteenLevelsSourceFromPad`, `cycleSixteenLevelsRootPad`, `adjustSixteenLevelsFilterCutoff/Resonance`, `cycleSixteenLevelsFilterType`, `resetSixteenLevelsSandbox`), helpers (`padNumberToVariationIndex`, `computeSixteenLevelsTune`, `computeSixteenLevelsFilterCutoff`, `getSourceAssignment`/`Cutoff`/`Resonance`/`Type`), `triggerPad` UTILITY_16_LEVELS branch rewrite with arm path and record-with-snapshot path, `playSixteenLevelsVariation` per-parameter override dispatch, `playAssignedPadWithContext` extended context type and call, `createPadFilterOptions` extended with `overrides` arg, `playStepEventFromState` gain/filter override paths, `cycleSixteenLevelsParameter` restricted to 3 working values, `exitUtilityWorkflow` resets sandbox, `tickTransport` end-of-count-in downbeat click, `stopPlayback` double-press detection, metronome accent ×2 gain coefficient, ROOT default 4→5, new module-level `lastStopAt`. (Sums to ~400 net additions.)
- `src/screens/UtilityScreens.tsx` — full `SixteenLevelsScreen` rewrite: conditional Panel rows per parameter (ROOT for TUNE; FILTER TYPE clickable label + CUTOFF/RESONANCE arrow rows for FILTER, all with amber highlight when sandbox active), per-parameter LCD grid display value via `padToVariation` + `displayValue`, root pad amber highlight in TUNE mode, F1 SOURCE / F2 PARAM softkeys, F3-F5 em-dash, FILTER OFF in-screen hint, right-click direct-set source on LCD grid, arm visual cue on SOURCE PAD field. New `PanelRow` and `ArrowRow` local helper components.
- `src/screens/StepScreen.tsx` — added `PARAM TYPE` info row; replaced `PARAM VALUE` rendering with `formatParamValue` helper that signs TUNE values.
- `src/audio/samplerEngine.ts` — added public `stopAllVoices()` method.
- `src/components/layout/LayoutElements.tsx` — dropped `sixteenLevelsEnabled` subscription; 16 LEVELS pad-mode highlight now only `activeScreen === "UTILITY_16_LEVELS"`.
- `src/components/layout/TopBar.tsx` — dropped legacy `16LV` indicator (was tied to old `sixteenLevelsEnabled` flag).
- `docs/03_ui/UX_AUDIT_FINDINGS.md` — added "PROGRAM screen — ATTACK/DECAY are fake UI (CRITICAL)" section (Phase A8 work), added "STEP screen — editable appliedParameter / appliedValue (follow-up)" section.
- `CLAUDE.md` — modified by Marek in the IDE during the session (~48 lines added). Not edited by me. Bundle decision left to Marek.

---

## Session 3 — 2026-05-19 — Audio gain staging fix + CHOP BPM clamp + UNDO softkey polish

### What was attempted
- CHOP LOOP BPM EST clamping (UX_AUDIT_FINDINGS): clamp to 40–1000 BPM, out-of-range → `--.--` placeholder. Direct math fix.
- UNDO screen empty F4/F5 (UX_AUDIT_FINDINGS): propose a fix; chosen approach implemented after Marek's GO.
- **Diagnosis of MASTER VOL "1500% needed for normal loudness" issue.** Marek's hypothesis: ~15× signal loss somewhere in pipeline. Asked for diagnostic-only first, NO speculative fix.
- After diagnosis, **clean config change** (no new logic, no normalization, no sampler engine pipeline touch) — adjust defaults and slider range so that 100% master is the normal listening level.

### What worked
- **CHOP LOOP BPM clamp**: single-line addition in `ChopScreen.tsx:114` — split into `rawBpmEstimate` (math) and `bpmEstimate` (range gate). Out-of-range and "loop disabled" both fall back to the existing `--.--` display string. Range 40–1000 BPM, leaving headroom for gabber/speedcore per Marek.
- **UNDO F4/F5 → "—" + Softkeys key={index}**: small shared-component edit (`UtilityScreens.tsx:544`, one line). Two `"—"` labels no longer collide on React key. Sanctioned by CLAUDE.md "blank/disabled" pattern. Other utility screens unaffected (verified — `SequenceEditUtilityScreen` already had an unconnected F5 SONG, render unchanged).
- **MASTER VOL diagnosis**: traced full pipeline `buffer → gain → pan → masterGain → destination`. Findings:
  - No `× 0.5`/headroom attenuator anywhere. No polyphony division.
  - `samplerEngine.ts:43` and `useAppStore.ts:699` both default `masterVolume = 1500` → masterGain = 15× = +23.5 dB makeup.
  - StereoPanner at center is equal-power: mono input loses ~3 dB (cos(π/4) = 0.707 per channel).
  - Per-voice scale inconsistency: `level` stored 0–127 (default 127), divided by 100 → 1.27× (~+2 dB) at default.
  - **Root cause: samples enter the pipeline at low peak (typical browser capture ~-24 dBFS) because no normalization at import (`sampleLibrary.registerSampleAudio`) or after recording (`recordingCapture.ts`).** 1500% master was makeup gain for that.
- **Config change (final, after two empirical iterations — see pitfalls section below):**
  - INPUT GAIN default: 0 dB → **+9 dB** (≈2.82× — empirical sweet spot)
  - MASTER VOL default: 1500 → **100** (both store and `samplerEngine.ts:43`)
  - MASTER VOL slider range: 0–2000 → **0–200** (step 5 unchanged)
  - THRESHOLD: untouched per Marek
- Build clean after every iteration.

### Audio gain staging — final values determined empirically
- INPUT GAIN default: **+9 dB (multiplier 2.82×)**
- MASTER VOL default: **100% (was 1500%)**
- MASTER VOL slider range: **0–200% (was 0–2000%)**
- INPUT GAIN +23.5 dB and +12 dB tried first, both caused clipping on dynamic source material with bass content.
- 1500% master was masking the real input level problem — proper fix was at input stage, not output.
- Imported samples remain unmodified (not normalized) per Marek's design decision.
- Soft clipper (WaveShaperNode tanh) added to UX_AUDIT_FINDINGS as future improvement for proper handling of loud sources.

### What didn't work / pitfalls hit
- **INPUT GAIN +23.5 dB clipped Marek's test capture (visible brick-wall on waveform).** Math reasoning was right (15× = exact reverse of removed 1500% master makeup), but real-world captures aren't uniformly at -24 dBFS — anything with bass content or transient peaks hits the +0 dBFS ceiling at +23.5 dB makeup. Lesson: when reversing a hidden makeup gain, the new default must be conservative, not equivalent. Reversing 15× literally is wrong because the old setup was clipping everything but loud-enough material wasn't noticed against the quiet baseline.
- **Then tried +12 dB (4×) — still too aggressive.** Empirical testing landed on +9 dB (2.82×) which Marek confirmed as sweet spot.
- **+23.5 dB also failed the implicit step-grid invariant**: `adjustInputGain(±3)` jumps in 3 dB increments. +23.5 is off-grid (grid is …,18,21,24). First `+` click would have jumped to 24. Flagged this in proposal, Marek accepted — but moot because +9 dB is back on the grid anyway.
- **Plan-mode activation mid-edit from Session 1 carry-over noted again:** the working tree at start of Session 3 still had uncommitted Session 1 work (SEQ -) and Session 2 work (polish pass) because Marek never said "commit" on either prior wrap. Surfaced this at every diff stage. Not a pitfall in itself but worth recording: CC sessions can leave indefinitely-uncommitted work, and the next session must verify with `git status` instead of trusting the conversation's "approval" signals.
- **`docs/03_ui/UX_AUDIT_FINDINGS.md` and `docs/01_development/roadmap_v2.md` had modifications I didn't make** — Marek's own edits from the IDE between sessions / during this session. Surfaced before any commit attempt. No accidental overwrite.
- **Considered Option A "normalize at import" during diagnosis** — concluded it'd be the right architectural fix (matches roadmap A8) but ~30–50 lines, multi-path testing, semi-destructive choice. Marek rejected this path and went with config-only change. Documented in case the issue resurfaces.
- **Considered Option B (per-sample `peakScale` in `SampleAudioRef`)** — non-destructive but spreads new field through every play path. Rejected for same scope reason.

### Decisions made
- **Fix MASTER VOL at config layer only.** No normalization at import, no sampler engine pipeline change, no `sampleLibrary.ts` touch. Defaults + slider range only.
- **Imported samples stay unmodified** — Marek explicit: PCM buffers remain runtime-only and untouched at import time. This means users with quiet sources will sometimes need to bump INPUT GAIN manually; that's accepted tradeoff vs destructive normalization.
- **Engine internal clamp at `samplerEngine.ts:106` (`clamp(masterVolume, 0, 2000)`) left untouched** — defensive only, harmless since slider is constrained to 0–200. Marek's "ograniczenia" instruction interpreted as slider-facing config, not internal defense.
- **CHOP BPM range 40–1000** — Marek chose explicitly to leave headroom for gabber/speedcore. Tighter (40–300) would have been more typical but unnecessary.
- **UNDO F4/F5 → em dash, not "remove slots"** — Marek confirmed: keep `grid-cols-6` rhythm consistent with all other utility screens. Em dash reads as "intentionally empty / disabled", not "missing label".
- **Softkeys component `key={index}` change is acceptable** for the shared utility — softkey arrays are short, static, never reordered. No regression risk in other utility screens.
- **NOT changing per-voice gain `level/100` → `level/127` inconsistency** despite spotting it during diagnosis. Out of scope. Documented for future cleanup if it ever causes audible behavior changes (currently masked by clamp to 0–2).

### Open issues / followups
- **Recording chain soft clipper** added to `UX_AUDIT_FINDINGS.md` as future improvement (WaveShaperNode tanh between InputGain and MediaRecorder, threshold ~-0.5 dBFS, soft knee 6 dB, optional SETTINGS bypass).
- **Empirical verification needed**: Marek to re-record the same test material and confirm +9 dB / 100% / 0–200% feels sensible across multiple source types (browser capture, mic, line in).
- **`level/100` MIDI-scale mismatch in mixer-to-voice conversion** documented above. Not fixing now.
- **Per-pad volume default = 127 (MIDI max)** is consistent with MPC convention but means default per-voice gain is 1.27× (clamped to 2). May want to revisit if real headroom math becomes needed during Phase A3 (FX engine).
- **Marek's IDE edits to `roadmap_v2.md`** are in the same working tree — bundled into this commit if "commit" is approved. Confirm before commit that's intended.
- Still-pending UX_AUDIT items: 16 LEVELS flagship bug, STEP event nav, NEXT SEQ asymmetry, NOTE REPEAT latch/visual, PAD/TRACK MUTE visual state, MAIN POSITION "move to corner" (only "dim" done in Session 2), RECORD FREE MEM real-or-remove, NEXT SEQ CHANGE AT timing modes, GO TO empty TARGET hint, plus the new soft clipper item.

### Files modified
- `src/store/useAppStore.ts` — `inputGain: 0→9`, `masterVolume: 1500→100`, MASTER VOL slider `max: 2000→200` (the `cycleSelectedSongSequenceBack` interface + action are from Session 1, still in this tree).
- `src/audio/samplerEngine.ts` — `private masterVolume = 1500→100`.
- `src/screens/ChopScreen.tsx` — BPM EST clamp 40–1000.
- `src/screens/UtilityScreens.tsx` — UNDO F4/F5 labels `"F4"/"F5" → "—"/"—"`; `Softkeys` map uses `key={index}` instead of `key={label}`.
- `docs/03_ui/UX_AUDIT_FINDINGS.md` — added "RECORDING CHAIN — soft clipper needed (future)" section.

---

## Session 2 — 2026-05-19 — Polish pass: PROGRAM CHOKE copy, TC F4 rename, MAIN position dim

### What was attempted
- Three small zero-risk fixes from `docs/03_ui/UX_AUDIT_FINDINGS.md`:
  1. PROGRAM CHOKE help text: "hardware pads" → "pads" (LoopThief is mouse-first).
  2. TIMING CORRECT softkey F4: "DO IT" → "APPLY" (DO IT misreads as destructive).
  3. MAIN screen POSITION value: reduce visual prominence while keeping phosphor LCD aesthetic.

### What worked
- Task 1: single-line copy fix in `src/screens/ProgramScreen.tsx` (the help paragraph inside the PAIR mode panel). Build clean.
- Task 2: single-line label change in `src/screens/UtilityScreens.tsx` (TimingCorrectUtilityScreen softkey definition). Label only — `cycleTimingApplyTo` handler unchanged. Build clean.
- Task 3: proposed both size shrink + color dim (sole-vector changes wouldn't drop dominance enough). Marek confirmed both, with adjusted max font-size 48px instead of 38px for far-viewing legibility.
  - Final values in `src/screens/MainScreen.tsx`:
    - font-size: `clamp(38px,4.8vw,72px)` → `clamp(22px,2.6vw,48px)`
    - color: `#eef6d8` (brightest phosphor / primary value tier) → `#d8e3b7` (mid phosphor / softkey + secondary value tier)
  - Reused existing palette only — no new colors introduced.
- All three changes are single-spot, no logic touched, no styling tokens introduced.
- `npm run build` clean after every task individually.

### What didn't work / pitfalls hit
- None substantive. Initial Edit on `UtilityScreens.tsx` errored with "File has not been read yet" — only saw the file through Grep context (which doesn't satisfy the Read precondition). Resolved by reading the relevant lines explicitly before retrying the Edit. Note for future sessions: Grep -C context lines don't count as Read.

### Decisions made
- Marek confirmed the "both" approach (size + color) for POSITION display.
- Confirmed max font-size 48px (not 38px) to preserve far-viewing readability.
- Palette discipline: stay within existing phosphor tiers (`#eef6d8` / `#d8e3b7` / `#aab691` / `#91a477`). Do not invent new colors when dimming text — step down one tier.
- Mouse-first copy convention: avoid "hardware pads" phrasing in user-facing strings — just "pads".

### Open issues / followups
- Working tree at end of session contains three independent change groups:
  1. Yesterday's uncommitted SEQ - work (SongScreen.tsx, useAppStore.ts, Session 1 log entry).
  2. Today's polish pass (this session).
  3. Independent additions to `docs/03_ui/UX_AUDIT_FINDINGS.md` (COUNT IN / METRONOME findings) not made by CC — surfaced to Marek during wrap.
  Awaiting Marek's call on commit split.
- Plenty of other UX_AUDIT items still pending: NEXT SEQ softkey labels + asymmetry, NOTE REPEAT latch/visual feedback, PAD MUTE / TRACK MUTE visual state, 16 LEVELS minor UX (cyclable PARAMETER indicator), MAIN POSITION (this session covers the dim portion; "move to corner" was not done), RECORD FREE MEM real-or-remove, SETTINGS MASTER VOL 1500% scale bug, CHOP LOOP BPM EST clamping, UNDO empty F4/F5, GO TO empty TARGET hint, plus the new COUNT IN / METRONOME items added to the audit doc.

### Files modified
- `src/screens/ProgramScreen.tsx` — single string change (PAIR mode help text).
- `src/screens/UtilityScreens.tsx` — single label change ("DO IT" → "APPLY").
- `src/screens/MainScreen.tsx` — POSITION value font-size + color change (one line of class string).

---

## Session 1 — 2026-05-19 — SONG screen: add SEQ - button

### What was attempted
- First CC session under the new workflow (SESSION_LOG previously empty).
- Boot: read CLAUDE.md, SESSION_BOOT.md, design bible, roadmap_v2, AI/CODEX/MAREK rules, handoff PDF, UX_AUDIT_FINDINGS.
- Task: add a `SEQ -` button to the SONG screen as a symmetric counterpart to existing `SEQ +`. Same styling, same logic, reverse direction. From UX_AUDIT_FINDINGS.md "SONG screen — missing SEQ -".

### What worked
- Added `cycleSelectedSongSequenceBack` to the Zustand store as a direct mirror of `cycleSelectedSongSequence` — same shape, same `(currentIndex ± 1 + length) % length` wrap pattern.
- Wired `<Action label="SEQ -" ...>` in `SongScreen.tsx` immediately after `SEQ +`. The 2-column action grid now renders as symmetric pairs: SEQ+/SEQ-, REP+/REP-, UP/DOWN. Previous layout had 5 buttons with a half-empty last row.
- `npm run build` clean (tsc + vite, 942ms, no TS errors).

### What didn't work / pitfalls hit
- Plan mode was activated by Marek mid-edit, after the two store edits (interface entry + action implementation) had already landed. The system reminder said "MUST NOT make any edits". Interpreted this as: stop making further edits, write the plan file, then resume on ExitPlanMode. Did not revert the partial edits — they were already on disk and trivial to revert if rejected. Worth noting for future sessions: if the user activates plan mode mid-task, stop further writes immediately and document state-already-on-disk in the plan file rather than continuing.
- Placement decision: SEQ - inserted directly after SEQ + rather than appended at the end. This shifts the visual row-wrapping of REP+/REP-/UP/DOWN (they now pair up cleanly) but does not rename, restyle, or change logic of any existing control. Marek had said "Nie ruszaj niczego innego" — interpreted that as "no other features / no refactor", not "no positional shift caused by adding the new button". The alternative (append at end → DOWN | SEQ -) was uglier visually. If Marek wanted strict slot preservation, this would need a revisit.

### Decisions made
- Marek confirmed (via Q/A this session) several non-negotiables already in docs, useful to record concretely:
  - LoopThief will not have a piano roll. (anti-feature in roadmap_v2)
  - Banks do not cycle — click B → go to B. The old A→B→C→D rotation was deliberately removed.
  - Sweet spot: workflow/philosophy = MPC2000XL/2500, UI density/aesthetic = MPC4000/5000, interaction = mouse-first.
- Scope held strict: no auxiliary fixes, no "while I'm here" edits.

### Open issues / followups
- The rest of UX_AUDIT_FINDINGS.md remains untouched. Top candidates for next session:
  - 16 LEVELS audio feedback (FLAGSHIP BUG — CRITICAL in audit doc).
  - STEP screen: `< step >` and `< bar >` don't trigger audio (only `< event >` does); add-event-at-current-position workflow is unreachable.
  - Click-to-preview consistency sweep across 16 LEVELS / PROGRAM ASSIGN / STEP / RECORD / SETTINGS.
- NEXT SEQ has parallel asymmetry issues (softkey labels, sequence list, CHANGE AT timing) — separate session.
- Plan file `C:\Users\marek\.claude\plans\stateful-nibbling-kitten.md` was created when plan mode activated; can be deleted or kept as audit trail.

### Files modified
- `src/store/useAppStore.ts` — added `cycleSelectedSongSequenceBack` (interface + action).
- `src/screens/SongScreen.tsx` — added selector + `<Action label="SEQ -">` after `SEQ +`.
