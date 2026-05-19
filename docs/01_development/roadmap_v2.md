# LoopThief — Roadmap v2

> Replaces the long-term feature list with a phased, decision-locked plan.
> Anti-features list at the bottom defines what LoopThief deliberately is NOT.

---

## Identity (re-statement, for context)

LoopThief is an **MPC/SP-inspired sampler-sequencer workstation**, mouse-first.

Sweet spot:
- **workflow + philosophy** = MPC2000XL / MPC2500 (fast, mechanical, sampler-sequencer hybrid)
- **UI density + aesthetic** = MPC4000 / MPC5000 (large LCD, buttons on the surface)

Core loop: **CAPTURE → CHOP → PLAY → RESAMPLE**

LoopThief is NOT a DAW. LoopThief is NOT an all-in-one workstation. LoopThief is NOT a SaaS.

---

## PHASE A — Rest of MVP

Goal: bring LoopThief to a state where it functions as a real, complete sampling instrument that you'd actually want to use to make beats.

### A1. Close current backlog (bugs / fake controls / polish)

These are the items from the live audit — finish them before moving to systemic work.

- DISK: wire device list, surface save/load buttons (project / program / sequence), export/mixdown to WAV
- RECORD: clean up browser permission UX (until WASAPI in Phase B)
- CHOP: LOOP mode loops the region, BPM calculator visible, ASSIGN UX clearer
- STEP: velocity `< >`, random velocity / humanize as separate function, NOTE ON duration verified, probability described and tested
- TRACK MUTE: GROUP wired or removed
- PROGRAM: FX SEND wired (depends on A3), SAVE PGM real (depends on A4), ASSIGN pad/source/source-type UX
- SETTINGS: real or removed (everything except MASTER VOL is placeholder today)
- MIX: PAD MIX clarified, BANK tested, FX SEND wired (depends on A3), OUTPUT real routing
- MAIN / TC / SONG: WINDOW wired or disabled, position display visual tweak, TC effect on groove verified, SONG `SEQ -` if missing
- ERASE / UNDO: verify ERASE TRACK behavior, accept that UNDO may remain a log for now (real undo lives in Phase B)
- NEXT SEQ: UX verified

### A2. Sample browser / preview (NEW)

Core MPC feature, currently missing.

- folder browser inside LCD viewport
- click / hover preview
- mini waveform preview
- fast assign to pad
- drag-drop assign
- recent / favorites (optional, if cheap)

Without this, sampling at scale becomes painful.

### A3. Real FX engine (basic set)

- reverb
- delay
- flanger
- chorus
- compressor
- EQ
- bitcrusher

Plus routing:

- per-pad insert FX
- FX sends (real, not visual)
- master FX
- performance FX hooks (for Phase A6)

**Constraint:** basic effects, instrument-grade quality, not mastering-grade. Quality bar = MPC4000 internal effects, not Waves bundle.

### A4. Save / load (real)

- full project save / load
- program save / load
- sequence save / load
- recent projects list
- import / export of:
  - program
  - sequence
  - song
  - project
- autosave (background, like MPC Sample autosave)

Browser-based persistence is acceptable for Phase A (IndexedDB or download blobs). Native filesystem migration lives in Phase B.

### A5. One-button resample (NEW)

Essence of MPC/SP workflow.

Flow:

```
master out → record internal buffer → new sample → auto-assign to pad
```

Must be:

- one click / one keystroke
- fast
- optional auto-normalize
- visible feedback during capture

This is a flagship workflow feature. It belongs in the MVP, not the wishlist.

### A6. Recall buffer 25s / 30s (NEW)

From the Design Bible. Currently missing.

- continuous ring buffer of the last 25–30 seconds of internal audio
- user presses RECALL → last X seconds become a new sample
- assigns to next free pad

This is an instrument-instinct feature, not a DAW feature. Critical for jamming, accidental discovery, sound design. A real LoopThief differentiator.

### A7. Note Repeat polish (NEW)

Currently inconsistent (per handoff doc). Needs:

- cleaner toggle workflow
- proper visual feedback
- consistent integration in Performance screen
- proper timing feel
- latch mode (probably)

Pressure / velocity modes can wait for hardware controller phase.

### A8. Sampling foundation features

- timestretch (pitch-independent and pitch-locked variants)
- normalize
- reverse
- fade in / out
- transient detect (classical DSP, no ML)
- better BPM detect

### A9. MIDI (in / out / sync)

- MIDI IN from external pad controllers (USB MIDI class-compliant, MPK-style devices, generic keyboards with pads)
- MIDI OUT to external gear
- MIDI sync (external clock + send clock)
- MIDI learn (assign external CC to internal control)

No MIDI CC automation lanes (that lives in Phase C as parameter locks / knob recording, see A10).

### A10. Volume + pan automation (MIX screen)

Inspired by MPC4000/5000 HD MIX track automation. NOT DAW automation lanes.

- record volume knob moves through the sequence
- record pan knob moves through the sequence
- per-pad or per-track
- visible and editable in MIX screen
- ON/OFF toggle for playback

Scope is intentionally limited to volume and pan. No filter automation, no FX parameter automation in Phase A. That can grow later if needed.

### A11. Real undo / redo

Upgrade from current "visual undo" / log to real state history. Required before users trust the app with real work.

### A12. Stability pass

- crash recovery (autosave on crash)
- project validation on load
- corruption protection (don't trash a project on broken load)
- memory management for sample buffers
- audio edge case handling (sample rate mismatch, broken WAVs, empty buffers, etc.)

---

## PHASE B — Productization

Goal: ship as a real desktop application.

### B1. Tauri integration (real)

- migrate from browser dev to Tauri shell
- preserve all Phase A functionality
- replace browser-only APIs with Tauri equivalents

### B2. Native audio

- WASAPI loopback recording (replaces browser system audio capture)
- low-latency audio output
- proper audio device selection and persistence
- ASIO support (research first)

### B3. Native filesystem

- replace browser persistence with real disk I/O
- persistent settings
- proper project files on disk
- sample library on disk
- recent projects from filesystem

### B4. Installer & packaging

- Windows `.exe` installer
- file associations (`.lthp` or whatever project extension)
- desktop shortcut, start menu entry
- update mechanism (optional)

### B5. UX polish for shipping

- onboarding (first-run experience, demo project)
- tooltips / help system
- keyboard shortcuts cleanup and documentation
- accessibility pass (keyboard nav, contrast)
- loading / error states (proper, not just "..." spinners)
- theme polish (lock in the final look)

### B6. Remove dev-only tooling

- disable F2 layout editor in release builds
- disable Ctrl+S layout save in release builds
- strip debug logging

---

## PHASE C — Post-1.0

Things that may make sense after 1.0 lands, based on real user feedback. Not committed.

- mixing: real outputs, buses, subgrouping, sidechain, real metering
- performance: live FX expansion, real scene system, live macros, gesture performance
- advanced sequencer features: parameter locks (Elektron-style), real groove templates, sequence chaining improvements, live recording polish
- hardware controller mode (LoopThief as USB MIDI host for pad controllers — partial in A9)
- master FX chain expansion
- additional sample editing tools

---

## ANTI-FEATURES (deliberately NOT in LoopThief)

These are off the table. Do not implement, do not architect for, do not "leave hooks for."

### Anti-features — Software model

- **VST hosting** — LoopThief is an instrument, not a plugin host. Users who want VSTs use a DAW and sample LoopThief output into it.
- **Plugin API** — no third-party extension architecture. Closed product surface.
- **Cloud sample library** — crate digging is part of the workflow. App doesn't replace it.
- **Collaboration features** — single-user instrument. Not a SaaS.
- **AI chop detection** — humans cut samples. Creative decisions are not automated. Use transient detect (classical DSP), not ML.
- **AI drum separation / stem separation** — same reason.
- **Automation API for headless use** — instrument, not a service.

### Anti-features — DAW-isms

- **Piano roll** — tracker/step is the sequencing model. No piano roll, ever. (Confirmed by `CODEX_COLLABORATION_RULES.md`.)
- **Audio tracks** — resampling to pads is the LoopThief way. No DAW-style audio tracks on a timeline.
- **Automation lanes (DAW-style)** — volume + pan automation in MIX screen is recorded as MPC HD MIX, not displayed as a timeline lane.
- **Timeline arranger** — song mode chains sequences, MPC-style. No Ableton-style arrangement view.
- **Plugin window chaos / floating panels** — everything lives inside the LCD viewport.
- **Master timeline / linear arranger view** — same reason.

### Anti-features — Different product entirely

- **DJ workflow** — *"to nie technics i vestax tylko akai mpc"*. No crossfade, no beatmatch, no cue points, no decks. Beat repeat / stutter / scene system are instrument performance features and stay; DJ-specific features do not.
- **Mastering suite** — instrument, not finalization tool. Basic FX only.
- **Mobile / tablet version** — desktop instrument. Mouse-first interaction is core; touch would require a redesign.

### Anti-features — Process / architecture

- **Encoder / jog wheel emulation in UI** — mouse-first means direct manipulation, not faking hardware.
- **Hidden submenu chains for core features** — every important function has a visible button.
- **Icon-only UI** — text labels are mandatory.
- **Responsive / mobile-friendly layouts** — fixed hardware-workstation feel.
- **Adding buttons to the hardware shell** — frozen by design. New functionality goes inside the LCD as a screen / utility.

---

## Implementation priority order (when trading off)

1. Stability
2. Workflow feel
3. Audio correctness
4. Performance
5. UX polish
6. Visual polish

---

## The mantra

> The greatest danger to LoopThief is feature creep.
> Every feature request must answer: *"Does this improve sampling workflow meaningfully?"*
> If not — out. If unsure — ask Marek. Default to NO.