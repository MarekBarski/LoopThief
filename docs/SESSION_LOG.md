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
