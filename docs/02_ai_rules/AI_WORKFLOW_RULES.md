# AI_WORKFLOW_RULES.md

# LoopThief AI Workflow Rules

## General Philosophy

LoopThief is a focused MPC/SP-inspired sampling workstation, not a generic DAW.

AI changes must preserve:

* fast workflow,
* tactile sampler feeling,
* compact LCD-style UX,
* performance-oriented interaction,
* and stable architecture.

Do not redesign systems unless explicitly requested.

---

# Core Rules

## 1. Preserve Existing Architecture

Do not rewrite large systems unless necessary.

Prefer:

* small targeted edits,
* isolated fixes,
* incremental improvements.

Avoid:

* giant refactors,
* replacing working systems,
* introducing parallel architectures.

---

## 2. LCD-Only Rendering

All workstation UI must remain:

* inside LCD safe areas,
* visually constrained,
* MPC-inspired.

Do not create floating modern UI panels unless requested.

---

## 3. AppShell Stability

Never modify:

* hardware layout system,
* F2 layout editor,
* Ctrl+S layout save workflow,
  unless explicitly requested.

---

## 4. Audio Rules

Preserve:

* PCM sample architecture,
* waveform cache system,
* sampler voice routing,
* polyphony/choke behavior,
* mixer routing.

Avoid rebuilding audio systems unnecessarily.

---

## 5. Sequencer Rules

Sequencer logic must remain global and persistent.

Playback must NOT depend on:

* currently open screen,
* STEP visibility,
* UI focus.

The sequencer always exists globally.

---

## 6. CHOP/TRIM Rules

CHOP is a core workflow.

Preserve:

* non-destructive editing,
* active-region mapping,
* slice preview,
* waveform/marker shared coordinate space,
* real PCM playback.

Do not destructively rewrite sample buffers unless explicitly requested.

---

## 7. UI/UX Philosophy

LoopThief prioritizes:

* immediacy,
* readability,
* tactile feel,
* low-friction workflows.

Avoid:

* excessive confirmations,
* hidden submenu chains,
* unnecessary modal workflows.

---

## 8. AI Editing Style

AI should:

* inspect existing systems first,
* preserve naming conventions,
* preserve current state shape,
* avoid duplicate systems.

When fixing bugs:

* diagnose first,
* avoid speculative rewrites.

---

## 9. Performance Rules

Avoid:

* unnecessary rerenders,
* storing PCM arrays in React state,
* rebuilding waveform caches every frame,
* expensive runtime allocations during playback.

Prefer:

* cached waveform summaries,
* lightweight state,
* reusable audio nodes where possible.

---

## 10. Build Discipline

After every implementation:

* run npm run build
* fix TypeScript errors
* preserve existing workflows

Never leave project in broken state.

---

# Current Product Direction

LoopThief currently targets:

* desktop sampler workstation,
* MPC/SP-style beatmaking,
* real-time loop chopping,
* performance sequencing,
* retro hardware-inspired UX.

It is NOT intended to become:

* a full DAW replacement,
* a node editor,
* a plugin host,
* a modern floating-window workstation.

---

# Development Priority Order

1. Stability
2. Workflow feel
3. Audio correctness
4. Performance
5. UX polish
6. Visual polish

---

# Preferred Development Style

* Small safe commits
* Feature isolation
* Architecture continuity
* Minimal regression risk
* Preserve existing workflows whenever possible
