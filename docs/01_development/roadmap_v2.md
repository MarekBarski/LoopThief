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

- WASAPI loopback recording (replaces browser system audio capture) — **CRITICAL: see rationale below**
- low-latency audio output
- proper audio device selection and persistence
- ASIO support (research first)

#### Why WASAPI loopback is non-negotiable (product-defining requirement)

The flagship LoopThief workflow is **instant capture from system audio**. Hardware MPC philosophy: pressing REC starts recording in the same millisecond. No prompts, no friction, no "are you sure?". This is what makes a sampler feel like an instrument instead of an app.

The current browser implementation (`getDisplayMedia`) violates this in a fatal way:

1. User presses START
2. Browser shows permission popup: "Choose what to share — entire screen / window / browser tab"
3. User clicks selection
4. Browser shows second popup: "Share audio too?"
5. User clicks yes
6. **Only now** recording begins.

Between pressing START and actual recording: ~3–4 seconds of clicks and two permission dialogs. **The sound the user wanted to capture is long gone.** This destroys the spontaneity that defines a sampler. You hear something interesting in a YouTube video, you want to grab THAT moment — with popups, you're already too late.

**WASAPI loopback solves this:**

- User grants audio device permission once at first run (OS-level, not per-session)
- From then on, START = recording in the same frame
- No popups, no choices, no friction
- Whatever the system outputs (YouTube, Spotify, a game, another DAW) is already in the capture path

This is what makes LoopThief a real instrument for digital crate digging instead of a constrained web app. Without WASAPI loopback, LoopThief is "a nice sampler". With it, it's **a tool for instant capture from anywhere on the computer** — which is the actual product.

**Implementation constraint:** WASAPI loopback is Windows-only. macOS equivalent is BlackHole / virtual audio device (research needed). Linux equivalent is PulseAudio monitor source (also research). For 1.0 release Windows-only is acceptable; cross-platform native audio is a separate decision for later.

**Fallback strategy:** if WASAPI loopback fails (driver issues, unusual hardware), fall back to ASIO loopback or a virtual cable device. Never fall back to browser `getDisplayMedia` in the native build — that would defeat the entire point.

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

### B6. Window scaling & multi-monitor support

LoopThief must work on every common desktop monitor without requiring a specific resolution. The scaling strategy is **proportional, aspect-ratio locked**.

#### Core principle

The entire UI — hardware shell, LCD viewport, pads, transport — scales as a single unit when the window resizes. Nothing breaks layout. Nothing collapses or rearranges based on size. The hardware shell is persistent and unified at all sizes.

This is NOT responsive design in the web sense (no breakpoints, no element reflow). It is **proportional scaling** like resizing a photo — everything stays in the same relative position, just bigger or smaller.

#### Aspect ratio: 16:9 locked

- Window enforces 16:9 aspect ratio at all times.
- Resizing the window resizes both dimensions proportionally.
- On non-16:9 monitors (ultrawide 21:9, 16:10, etc.), the app renders at native 16:9 with letterboxing (centered with bars). Never stretched, never cropped.

#### Window size limits

- **Minimum window size**: 1280×720 (HD). Below this, UI becomes unreadable.
- **Maximum window size**: unlimited. App scales to fill 4K (3840×2160), 5K, 8K without quality loss.
- **Default startup size**: 1600×900 (good fit for most laptops and 1080p monitors with room around the window).
- **Fullscreen mode**: supported. App fills the largest 16:9 area available on the monitor.

#### DPI scaling

- Respect Windows DPI scaling settings (100%, 125%, 150%, 175%, 200%).
- Tauri handles DPI awareness natively — the app already gets DPI-correct dimensions from the OS.
- At 150% DPI on a 1920×1080 monitor, the app effectively renders at 1280×720 logical pixels — still above minimum.

#### Multi-monitor

- App can be moved between monitors. Window remembers last position and size on next launch (persistent setting).
- Moving from a 1080p monitor to a 4K monitor: window stays the same logical size but renders sharper (DPI handled by OS).
- Moving to fullscreen on the destination monitor: respects that monitor's resolution and DPI.

#### Implementation requirements (apply throughout development, not just Phase B)

All CSS must use proportional units instead of fixed pixels:
- `vw`, `vh` for viewport-relative sizing
- `%` for parent-relative sizing
- `clamp(min, preferred, max)` for fluid scaling with bounds
- `fr` units in CSS Grid for proportional column/row layouts
- `rem` for typography (scales with root font size, which scales with viewport)

**Anti-patterns to avoid:**
- Hardcoded `px` values for component sizes, positions, or fonts (except for hairline borders 1-2px)
- Fixed-width containers that don't scale
- Manually positioned absolute elements with pixel coordinates (the F2 layout editor handles hardware shell positioning, but its output must store **proportions**, not pixel offsets)

**The current state of the codebase** uses a mix of fixed pixels and proportional units. A full audit and refactor to proportional units is required before Phase B ships. This is added to UX_AUDIT_FINDINGS.md as a deferred cleanup task.

#### F2 layout editor implications

The F2 layout editor (dev-only tool for positioning hardware shell elements) currently uses pixel positioning. Before B6 ships, it must be refactored to store positions as **percentages or viewport units** so layouts work at any window size.

This is a Phase B task, not Phase A. Document the requirement now; do not refactor F2 editor during Phase A unless a layout change is needed.

#### What this does NOT mean

- No responsive breakpoints (the app is a fixed instrument layout, not a website).
- No mobile/tablet layout (anti-feature per roadmap).
- No collapsing/hiding elements at small sizes (instead: minimum window size enforced).
- No "tablet mode" or "touch mode" (mouse-first remains absolute).

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
