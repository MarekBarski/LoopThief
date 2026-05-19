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
