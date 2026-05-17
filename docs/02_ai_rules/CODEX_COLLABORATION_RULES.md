# LOOPTHIEF — CODEX COLLABORATION RULES v0.1

# PURPOSE

This document defines how Codex/AI assistants should collaborate with Marek during LoopThief development.

The goal is:
- stable architecture,
- fast iteration,
- minimal chaos,
- preserving workflow philosophy,
- avoiding DAW feature creep.

---

# GENERAL PHILOSOPHY

LoopThief is NOT a DAW.

LoopThief IS:
- a sampling instrument,
- a groovebox-style workstation,
- a performance sampler,
- a loop chopping tool.

Core workflow:

CAPTURE → CHOP → PLAY → RESAMPLE

Every implementation decision must support this workflow.

---

# COMMUNICATION STYLE

## 1. Be direct

Avoid:
- motivational filler,
- hype language,
- excessive enthusiasm,
- vague corporate wording.

Use:
- concrete explanations,
- direct technical reasoning,
- practical implementation details.

---

## 2. Short answers for short questions

If the user asks:
- "where should this go?"
- "is this good?"
- "which is better?"

Answer directly.

Avoid:
- essays,
- repeated context,
- unnecessary summaries.

---

## 3. Ask before major architecture changes

DO NOT:
- rewrite architecture suddenly,
- introduce new frameworks,
- reorganize project structure massively,
- replace core technologies without explanation.

Always explain:
- why,
- pros,
- cons,
- impact.

---

## 4. Simplicity first

Prefer:
- stable,
- readable,
- maintainable solutions.

Avoid:
- overengineering,
- premature optimization,
- abstraction hell,
- enterprise architecture patterns.

YAGNI applies strongly.

---

# UX RULES

## 1. Workflow over features

A feature is valuable ONLY if it improves:
- speed,
- groove,
- creativity,
- sampling workflow.

DO NOT add features because:
- "modern DAWs have it"
- "it may be useful later"
- "it looks professional"

---

## 2. Avoid DAW mentality

DO NOT slowly transform LoopThief into:
- Ableton,
- Cubase,
- FL Studio,
- Logic.

Avoid:
- timeline obsession,
- automation lane overload,
- giant mixers,
- plugin window chaos,
- floating UI systems.

---

## 3. One screen = one task

Screens should remain focused.

Examples:
- CHOP = slicing
- RECORD = recording
- STEP = sequencing

Avoid:
- multipurpose cluttered screens.

---

## 4. UI must remain readable

Use:
- large text labels,
- clear hierarchy,
- permanent navigation,
- fixed button locations.

Avoid:
- icon-only UX,
- hidden menus,
- tiny controls,
- modern mobile app aesthetics.

---

# AUDIO ENGINE RULES

## 1. Stability over complexity

Prioritize:
- low latency,
- reliable playback,
- stable timing,
- predictable behavior.

Avoid:
- experimental DSP complexity early,
- unnecessary audio abstractions,
- giant plugin systems in MVP.

---

## 2. Effects are secondary

LoopThief competes on:
- workflow,
- immediacy,
- chopping.

NOT on:
- advanced DSP,
- analog emulation accuracy,
- mastering quality.

Basic effects are enough for MVP.

---

## 3. Resampling is core

Resampling is a primary workflow feature.

It should remain:
- fast,
- accessible,
- central,
- performance-friendly.

---

# TRACKER RULES

## 1. Tracker-inspired, not retro DOS clone

The sequencer should:
- feel fast,
- feel machine-like,
- support groove experimentation.

Avoid:
- unreadable hexadecimal tracker complexity,
- tiny dense text,
- oldschool aesthetic for its own sake.

---

## 2. Piano roll is NOT primary

Primary sequencing workflow:
- tracker/event based.

Piano roll may exist later,
but should never dominate the UX philosophy.

---

# CODE QUALITY RULES

## 1. Avoid giant files

Prefer:
- modular components,
- focused responsibilities,
- readable architecture.

---

## 2. Avoid magic systems

Avoid:
- hidden state mutations,
- excessive metaprogramming,
- complicated dependency injection,
- unnecessary reactive chains.

Readable code is preferred.

---

## 3. Preserve architecture consistency

Before introducing:
- new state systems,
- new rendering systems,
- new audio pipelines,

check if the project already has:
- equivalent functionality,
- established patterns.

Avoid duplication.

---

# GIT RULES

## 1. Small commits

Commits should be:
- isolated,
- understandable,
- reversible.

Avoid:
- giant mixed commits.

---

## 2. Branch experimental work

Potentially unstable systems:
- should be isolated,
- tested separately.

---

## 3. Never destroy working systems casually

Before refactors:
- preserve backups,
- preserve working implementations,
- verify replacements.

---

# IMPLEMENTATION PRIORITIES

Priority order:

1. Stable workflow
2. Readable UX
3. Low latency
4. Fast interaction
5. Simplicity
6. Visual polish
7. Advanced features

---

# PERFORMANCE PHILOSOPHY

LoopThief should feel:
- immediate,
- tactile,
- musical,
- playful.

NOT:
- technical,
- bureaucratic,
- overloaded.

---

# MASCOT RULES

The thief mascot:
- adds personality,
- should remain subtle,
- should never obstruct workflow.

Mascot behavior:
- blinking
- idle movement
- headphone mode during recording
- subtle reactions

Avoid:
- excessive animation,
- meme behavior,
- distraction.

---

# IMPORTANT WARNING

The greatest danger to LoopThief is:

FEATURE CREEP.

Every feature request must answer:

"Does this improve sampling workflow meaningfully?"

If not:
do not prioritize it.

---

# MVP SUCCESS CONDITION

LoopThief succeeds when user can:

1. Capture audio instantly
2. Chop samples quickly
3. Assign slices effortlessly
4. Build grooves rapidly
5. Perform loops live
6. Stay in creative flow

Everything else is secondary.

---

# FINAL PHILOSOPHY

LoopThief should feel like:

"A modern sampler from an alternate timeline where DAWs never became dominant."
