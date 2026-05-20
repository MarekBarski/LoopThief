# LoopThief — UX Audit Findings (Screen Review Session)

> Captured from a screen-by-screen review session with Marek.
> These are issues found visually / by description, not from running the app.
> Most are small polish; a few are core feature bugs (16 LEVELS).
>
> **NOT for Phase A backlog yet — this is a holding list.**
> Merge into Phase A1 (close current backlog) when prioritizing CC sessions.

---

## CRITICAL — Feature is broken / silent

### PROGRAM screen — ATTACK/DECAY are fake UI (CRITICAL)

PROGRAM screen has per-pad ATTACK and DECAY parameter fields, but changing their values has no audible effect on playback. This violates the project's own Fake UI Policy.

Root cause: sampler engine has no ADSR envelope generator. Only static gain stage exists between sample buffer and output. `PadAssignment.attack` is never read in any playback path. `PadAssignment.decay` is read only for visual triggered-pad flash timeout (`useAppStore.ts:3019`), not for audio shaping.

Fix scope (NOT for the current session):
- Add ADSR envelope generator module
- Integrate with `samplerEngine.play()` per-voice
- Connect PROGRAM screen ATTACK/DECAY values to envelope
- Connect 16 LEVELS ATTACK/DECAY parameters to envelope override
- Re-enable ATTACK/DECAY in 16 LEVELS PARAMETER cycle

This belongs to Phase A8 (Sampling foundation features) — dedicated session for ADSR engine work. Should also be evaluated for impact on choke behavior, mono voice management, step playback.

Until fixed, ATTACK/DECAY fields in PROGRAM screen and 16 LEVELS are hidden / disabled with clear "—" labelling.

---

### 16 LEVELS — no audio feedback (FLAGSHIP BUG)

The whole feature is currently unusable because there's no sound. MPC 16 LEVELS is a **live performance feature** — clicking should always produce sound.

Expected behavior:
1. Clicking Source Pad → immediately plays the source sample (so user hears what they're editing)
2. Entering 16 LEVELS screen with source pad set → 16 hardware pads *immediately* play parameter variations as live preview, no APPLY needed
3. Changing PARAMETER (velocity / tuning / attack / decay / filter) → instantly updates what pads play
4. APPLY commits the mapping permanently to the current program
5. EXIT without APPLY discards changes
6. ACTIVE state should reflect ARMED (live preview on) / APPLIED (committed) / OFF (no source)
7. Hardware reference: MPC2000XL/4000 16 LEVELS was always-live, no confirmation step

**Principle:** every click = sound. No silence. No "load and pray."

---

## STEP screen — event navigation issues

### Stepping through bars/steps doesn't trigger audio
- Changing `< event >` plays the event (good).
- Changing `< step >` or `< bar >` does NOT play anything.
- Marek's expectation: stepping through bars/steps should also fire whatever event is at that position (or stay silent if empty).

### Adding events from the current position
- There used to be a way to add an event at the current step position (probably via STEP INPUT button on hardware shell, but the exact workflow is forgotten).
- Currently no clear way to add events from this screen.
- Needs to be re-implemented or re-documented.

---

## PROGRAM ASSIGN — UX cycle

- Three-column layout (SOURCE TYPE → AVAILABLE SOURCES → TARGET) is excellent.
- Missing: way to cycle through pads on the TARGET side without exiting the screen. Currently to change TARGET PAD you have to go back to main PROGRAM screen, pick a pad, come back.
- Add pad cycling (UP/DOWN or pad picker) in TARGET column.

---

## PROGRAM CHOKE — copy fix

- Note text says "*In PAIR mode, press hardware pads to add/remove up to two mute targets.*"
- LoopThief is mouse-first. Change "hardware pads" → "pads".

---

## SONG screen — missing SEQ -

- SONG screen has SEQ + / REP + / REP - / UP / DOWN buttons in the edit panel.
- `SEQ -` button is missing (asymmetric with SEQ +).
- Easy add.

---

## NEXT SEQ — multiple issues

### Inconsistent softkey labels
- All other screens use `F1 LABEL` / `F2 LABEL` etc. format.
- NEXT SEQ uses bare labels: SELECT PAD / BAR END / ACTIVE / QUEUED / [empty] / F6 EXIT.
- Either add F-prefixes here OR strip them everywhere. Pick one and apply consistently.

### Sequence list shows only active
- Left panel shows only the currently active sequence (SEQ01).
- Should show grid of all 16 sequences so user can queue any of them, like SEQUENCE screen does.

### CHANGE AT timing options
- Currently only "BAR END" is implied via softkey.
- MPC offers: instant / next beat / bar end / phrase end / pattern end.
- Add these timing options if true queue behavior is intended.

---

## NOTE REPEAT — missing features

- No LATCH option (classic MPC: hold note repeat to keep it on after releasing pad).
- No visual feedback when NOTE REPEAT is active (pad pulse animation? indicator?).
- Could show tempo hint (e.g., "1/16 @ 94 BPM ≈ 6.27 Hz" or a visual pulse).

---

## PAD MUTE / TRACK MUTE — visual state

- All pads currently show "LIVE" in the same visual style.
- No clear visual difference for a MUTED pad (red border? dim background? "MUTED" label instead of "LIVE"?).
- In live performance you must see mute state at a glance.

### HOLD mode clarity
- F4 HOLD — what does it actually do? Held-mute mode (MPC style, where you hold a pad to select mute targets)?
- Either clarify in UI text or rename.

### GROUP doesn't work
- Already on the main backlog (TRACK MUTE GROUP and PAD MUTE GROUP both broken).

---

## 16 LEVELS — minor UX (in addition to the critical bug above)

- PARAMETER field shows VELOCITY but it's not clear it's cyclable through (VELOCITY / TUNING / ATTACK / DECAY / FILTER).
- Add `< VELOCITY >` arrows or a "(1/5)" indicator so users know it's cyclable.

---

## TC (TIMING CORRECT) — copy

- F4 button labeled "DO IT".
- In MPC lineage "DO IT" is typically used for destructive operations after parameter setup.
- For applying timing settings, "APPLY" reads cleaner.
- Optional rename.

---

## MAIN screen — visual polish

- Giant POSITION display `002.04.24` dominates the screen.
- Already on Marek's list — confirm: dim / smaller / move to corner.

---

## RECORD — verify FREE MEM is real

- FREE MEM shows `25:00`.
- Is this a real memory limit (like MPC4000 RAM), or a display-only placeholder?
- If display-only → it's a fake control per project's own Fake UI Policy. Either wire to real memory tracking or remove.

---

## SETTINGS — MASTER VOL scale bug

- MASTER VOL shows `1500%`.
- This is almost certainly a display or scale bug. Should probably be 100% or 0 dB.
- Investigate the scale: is the slider mapping 0-15 to 0-1500% incorrectly?

---

## CHOP — LOOP BPM EST sanity

- For a 433ms sample with LOOP BARS = 4, LOOP BPM EST shows `2217.09`.
- Math is correct given the inputs but the result is nonsensical.
- Suggestion: clamp display when BPM estimate falls outside a musical range (e.g., 40–300 BPM), or show "—" when LOOP BARS doesn't match sample length plausibly.
- Alternatively: auto-suggest LOOP BARS based on detected sample length so the user doesn't get nonsense values by default.

---

## UNDO screen — empty F4/F5

- F4 and F5 softkeys are blank (no labels).
- Either remove the slots visually so it doesn't look like missing labels, or fill with something useful (HISTORY, DETAIL, GO TO, etc.).

---

## SYSTEMIC — audio feedback audit

Marek's intuition during review: 16 LEVELS bug may be one example of a broader pattern. Possible systemic issue: places where clicking should auto-preview but currently doesn't.

Suggested CC task — full audit of click-to-sound consistency across all screens:

- 16 LEVELS — source pad selection, pad clicks (CONFIRMED BROKEN)
- PROGRAM ASSIGN — source selection, preview
- DISK — F2 PREVIEW (appears to work)
- CHOP — sample selection, slice triggers (mostly works per Marek)
- STEP — clicking event in list (preview the event?)
- RECORD — last sample preview
- SETTINGS — any sample preview spots

Run this as a single sweep task, fix anywhere preview should fire automatically.

---

## GO TO screen — minor

- TARGET panel is empty when no category is selected on the left.
- Add hint text "Select category on the left" or auto-select the first option.

---

## COUNT IN / METRONOME — visual beat indicators (CONFIRMED WORKING)

Four rectangular slots below the "METRONOME" header in the right column.

**Confirmed by Marek:** these pulse with the metronome in 4/4 time (beat 1, 2, 3, 4 cycle). This is the MPC-style hardware LED indicator translated to the LCD. Working feature, not a bug.

Minor cosmetic suggestion (low priority):
- In static state (metronome off), the empty slots can read as broken placeholders.
- Consider adding a subtle muted dot or `1` `2` `3` `4` labels inside each slot at low opacity, so the resting state visually communicates "armed beat counter" rather than "empty boxes".
- Optional — this is polish, not a bug.

### COUNT IN / METRONOME — label clarity

- `WAIT PAD COMPAT` is unclear. What does COMPAT refer to? Legacy WAIT PAD mode? Hardware MPC compatibility? Consider:
  - Rename to something self-explanatory (e.g., `LEGACY WAIT PAD`, `WAIT PAD MODE`, or simply explain what it toggles).
  - Or add a one-line inline description like the one in PROGRAM CHOKE.
- `TC COUNT` — probably means "count-in respects current Timing Correct". OK as label but a brief help text would help.

### COUNT IN / METRONOME — unit consistency

- `CLICK VOL: 70` has no unit. Is it 0–100%, 0–127 (MIDI), or dB?
- Decide on a project-wide convention for volume values (suggest 0–100 to match MPC tradition) and apply consistently to MASTER VOL, CLICK VOL, pad LVL, etc.

---

## TC screen — quantizeStrength removed from UI (was fake)

`quantizeStrength` field (0–100) was edit-controllable from TC screen (STR +/- actions and F3 STRENGTH softkey) but never read in the snap math (`getRecordedEventPosition` uses hard `Math.round`-based 100% snap). Removed from UI in foundation session 2026-05-20. State field retained for future partial-strength snap (advanced MPC behavior).

Future feature: partial-strength snap interpolates between raw position and quantized position by `quantizeStrength / 100`. Common in MPC4000/5000 for "human" feel. When implementing, restore UI controls and wire into `getRecordedEventPosition`.

---

## STEP screen — editable appliedParameter / appliedValue (follow-up)

After 16 LEVELS iter 2, recorded events carry `appliedParameter` (VELOCITY/TUNE/FILTER) and `appliedValue`. STEP screen now displays `PARAM TYPE` and `PARAM VALUE` rows (read-only, formatted), but they are not yet editable from STEP.

Future work (not blocking — deferred):
- New `eventEditMode` value(s) for editing applied parameter type and value
- Softkey(s) for cycling parameter type on selected event (NONE / VELOCITY / TUNE / FILTER)
- Adjust appliedValue with `<` `>` controls respecting parameter type's natural range
- Visual feedback consistent with existing F1 VEL / F2 OFFSET / F3 DUR / F4 PROB pattern

This was scoped out of the 16 LEVELS sesssion to keep core feature delivery focused. Pick up when STEP screen UX gets next polish pass.

---

## RECORDING CHAIN — soft clipper needed (future)

Current input chain: stream → InputGain → MediaRecorder. Loud source material can still cause brick wall clipping despite conservative default gain (+9 dB).

Hardware samplers (MPC, SP-1200) had natural soft clipping via input transformers. Software equivalent: WaveShaperNode with tanh curve placed between InputGain and MediaRecorder.

Suggested implementation:
- Threshold: ~-0.5 dBFS
- Soft knee: 6 dB
- Curve type: tanh
- Optional bypass toggle in SETTINGS

Not urgent — current +9 dB default works for most browser captures. Add when doing recording chain polish pass.

---

## CSS — proportional units audit (Phase B preparation)

Codebase currently mixes fixed `px` values with proportional units (`vw`, `vh`, `%`, `clamp`, `fr`). For Phase B window scaling to work properly (see `roadmap_v2.md` B6), all layout-relevant CSS must use proportional units.

Audit task (do NOT do this during Phase A unless touching a screen for another reason — this is a Phase B preparation task):

1. Sweep `src/**/*.tsx` and `src/**/*.css` for hardcoded `px` values
2. Categorize each occurrence:
   - **Keep**: hairline borders (1–2px), decorative shadows
   - **Refactor**: layout dimensions, fonts, padding/margin on layout containers
   - **Review with Marek**: edge cases that aren't clearly one or the other
3. Refactor identified items to `vw` / `vh` / `%` / `clamp` / `fr` / `rem` as appropriate
4. Verify each screen renders correctly at 1280×720, 1600×900, 1920×1080, and 3840×2160

This is a significant task. Estimate: dedicated session for the audit, then 2–3 sessions for refactor depending on scope. Better to do after Phase A1 backlog is closed but before starting Phase B Tauri integration.

**Rule in effect now (per CLAUDE.md):** all NEW CSS written from this point uses proportional units. Existing code is audited later.

---

## Aesthetic / global observations

These are positive findings from the review, captured here for reference:

- Phosphor green LCD aesthetic is consistent across all 24 screens reviewed — strong design language.
- Header pattern (`ACTIVE SCREEN` / TITLE / utility subtitle) is uniform — good.
- F1–F6 softkey layout is mostly consistent — fix NEXT SEQ inconsistency.
- Three-column layouts (PROGRAM ASSIGN, DISK, SETTINGS) work well.
- Fake UI policy is being honored — explicit `VISUAL ONLY` / `Future workflow` labels seen in PROGRAM FX SEND and ERASE. Continue this pattern.
- `roadmap_v2.md` Phase A is consistent with what the screens reveal as missing.

---

## How to use this list

- This is a **holding list**, not the prioritized backlog.
- When planning a CC session, pull items from here into a focused task (e.g., "fix 16 LEVELS audio feedback", or "audio feedback sweep across all screens").
- Critical items (16 LEVELS, STEP event nav) should go into Phase A1 of `roadmap_v2.md`.
- Cosmetic items (copy fixes, empty softkeys, dim position display) can batch into a single "polish pass" session.
