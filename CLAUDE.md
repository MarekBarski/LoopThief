# LoopThief — Claude Code Session Guide

This file orients Claude Code at the start of every session. Read it first, then read the documents linked in **Required Reading** below.

---

## What LoopThief Is

LoopThief is an **MPC/SP-inspired sampler-sequencer workstation**.

Sweet spot:
- **workflow + philosophy** = MPC2000XL / MPC2500 (fast, mechanical, sampler-sequencer hybrid)
- **UI aesthetic + button density** = MPC4000 / MPC5000 (large LCD, lots of visible buttons, nothing buried in submenus)
- **interaction model** = mouse-first (no encoder emulation, no jog wheels)

LoopThief is **NOT a DAW**. It is **NOT an all-in-one workstation**. It is a focused sampling instrument.

Core workflow: **CAPTURE → CHOP → PLAY → RESAMPLE**

---

## Required Reading

Before making ANY code changes, read in this order:

1. `docs/SESSION_BOOT.md` — quick boot rules, summary of architectural constraints
2. `docs/00_project_vision/LOOPTHIEF_DESIGN_BIBLE.md` — product vision, UX principles, screen architecture
3. `docs/01_development/DEVELOPMENT_ROADMAP.md` — stages, MVP definition
4. `docs/02_ai_rules/AI_WORKFLOW_RULES.md` — hard rules for AI edits
5. `docs/02_ai_rules/CODEX_COLLABORATION_RULES.md` — applies to Claude Code identically
6. `docs/02_ai_rules/MAREK_COLLABORATION_RULES.md` — how to communicate with Marek
7. `docs/Loopthief_Handoff_Document.pdf` — current state of code, architecture decisions, known WIP. **This is the most up-to-date description of what actually works in the codebase** — read it carefully.

### Other reference folders inside `docs/`

You don't need to read these on every session, but you should know they exist and consult them when relevant:

- `docs/03_ui/` — UI specifications and notes
- `docs/04_audio/` — audio engine notes and references
- `docs/05_research/` — research notes (sampler history, workflow analysis, etc.)
- `docs/ui_iterations/` — UI design iterations and explorations
- `docs/99_archive/` — archived/superseded docs (consult only if context demands it, treat as historical)
- `docs/references/manuals/` — original Akai service/user manuals (see below)

### Akai manuals

When in doubt about MPC workflow semantics, consult original Akai manuals in `docs/references/manuals/` (SP-1200, MPC2000XL, 3000, 4000, 5000, MPC Sample, MPC Standalone OS v3.4, MPC Live III/XL).

Manuals are **referential, not prescriptive** — LoopThief takes inspiration, not literal copies.

---

## Tech Stack

- **Vite 6** + **React 19** + **TypeScript 5**
- **Zustand 5** — state management (new `create<T>()(...)` API)
- **Tailwind 4** with `@tailwindcss/vite` plugin (CSS-first config, NO `tailwind.config.js` in old format)
- **Tauri 2** — installed and scaffolded (`src-tauri/` exists) but **NOT currently integrated** — app runs in browser
- **Web Audio API** native — no Tone.js, no howler, no audio wrapper libs

No ESLint, no Prettier, no Vitest/Jest in the project. Do not assume lint scripts exist.

---

## Build & Validation Commands

```
npm run dev          # Vite dev server (browser) — current development mode
npm run build        # tsc + vite build — PRIMARY VALIDATION STEP, run after changes
npm run preview      # preview the production build in browser
npm run tauri dev    # Tauri native shell (rarely used currently)
npm run tauri build  # Full .exe build (do NOT run routinely — slow, only on demand)
```

**Validation rule:** After every implementation, run `npm run build` to catch TypeScript errors. This is the primary correctness check. No lint, no tests — just `tsc` + Vite.

**Do not assume `npm run lint` exists.** It does not. Do not invoke it.

---

## Current State vs Future State

### Current (web-first prototype)
- Browser-based React app
- Web Audio API for playback
- Browser capture APIs (`getDisplayMedia`, etc.) for system audio sampling
- Sample import/export via browser file APIs
- PCM buffers runtime-only (not persisted)

### Planned (Tauri native, **later**)
- Tauri `.exe` desktop app
- WASAPI loopback for system audio capture
- Native filesystem for project save/load
- Native MIDI
- Persistent audio devices

### What this means for Claude Code

- **DO NOT** add `@tauri-apps/api` imports unless explicitly requested
- **DO NOT** suggest migrating to native APIs prematurely
- **DO NOT** try to "fix" PCM-buffers-runtime-only by adding complex IndexedDB schemes — this is intentional and will be solved by Tauri filesystem later
- **DO NOT** start the Tauri integration work without explicit request from Marek
- The current priority is: workflow polish, save/load (browser-acceptable for now), FX engine, MIDI prep, stability

The web-first → native-later trajectory is **deliberate and correct**. Architecture must stabilize before native complications enter.

---

## Sacred Zones — Do Not Touch Without Explicit Request

### AppShell
- Never replace or restructure AppShell
- Hardware shell is **persistent** and **frozen** — buttons do not move, do not get added, do not get removed
- All screens render **only inside the LCD viewport** (`LcdContent`)
- No fullscreen overlays, no floating windows, no DAW panels

### Layout Editor (F2)
- F2 toggles a dev-only layout editor mode (used by Marek to position UI manually)
- Ctrl+S saves the layout
- This system stays active **throughout development**
- It will be removed/disabled in the final `.exe` release build
- **Do not extend, refactor, or "improve" this system** unless asked

### Sequencer
- Sequencer logic is **global and persistent**
- Playback must NOT depend on currently open screen, STEP visibility, or UI focus
- PPQ timing has been stabilized — do not casually rewrite timing math

### Programs & Banks
- **Programs are real ownership containers** — they own pad assignments, mixer state, tune/fine-tune, filter params, choke groups
- Switching program (`PROGRAM <>`) actually swaps state
- **Banks DO NOT cycle**. Click A → A, click B → B. The old A→B→C→D rotation was removed deliberately. Do not "fix" this back.
- Pad identity is **bank-aware** (e.g., `A01`, `B04`, `D16`), not global 0-15

### CHOP
- CHOP edits are **non-destructive**
- Active-region mapping, slice preview, shared waveform/marker coordinate space
- Do not rewrite PCM buffers in place unless explicitly requested

### Tracks
- Tracks are structured objects: `id`, `name`, `programId`, `mute`, `solo`, `type`, `output`
- Events reference **stable track identity** — do not refactor to anonymous indexes

### Softkeys (F1–F6)
- Must always map to **real actions**
- No placeholder labels, no fake functionality
- If a softkey has nothing real to do in a given screen, leave it blank/disabled

---

## Fake UI Policy

Every clickable control must either:
- do something real, OR
- be removed or visibly disabled

**No fake knobs, no fake buttons, no decorative interactive elements.** This is non-negotiable.

If you find fake controls left over from earlier prototyping, surface them to Marek rather than wiring them up speculatively.

---

## Known Important Files

These are confirmed central files. Inspect them before editing related systems:

- `src/store/useAppStore.ts` — central Zustand store (HIGH RISK — touches almost everything)
- `src/audio/sampleLibrary.ts` — sample storage / registry
- `src/audio/samplerEngine.ts` — playback / voice management
- `src/screens/` — one folder per LCD screen (MAIN, RECORD, CHOP, PROGRAM, STEP, PERFORMANCE, MIX, DISK, SETTINGS)

Other paths (AppShell internals, layout system files, Vite aliases, helper modules) may evolve — **inspect the actual file tree before editing** rather than assuming paths.

Also worth knowing on first read:
- `vite.config.ts` — Vite config, possible path aliases
- `tsconfig.json` — TypeScript strictness, module resolution, path mapping
- `package.json` — exact scripts, dependency versions
- `src-tauri/` — Tauri scaffolding (Rust side), currently inactive

---

## Performance Rules

Avoid:
- unnecessary rerenders
- storing PCM arrays in React/Zustand state (use refs / out-of-state caches)
- rebuilding waveform caches every frame
- expensive runtime allocations during playback

Prefer:
- cached waveform summaries
- lightweight reactive state
- reusable audio nodes where possible

---

## Editing Style

- **Inspect first, edit second.** Read existing systems before changing them.
- **Preserve naming conventions** of the existing codebase.
- **Preserve current state shape** in `useAppStore.ts` unless a change is explicitly requested.
- **No duplicate systems.** If functionality exists, extend it; do not create parallel implementations.
- **Small, isolated commits.** No giant refactors. No "while I'm here" bonus edits.
- When fixing a bug: **diagnose first**, do not speculatively rewrite.
- Run `npm run build` after changes and fix any TypeScript errors before reporting completion.

---

## Communication Style with Marek

Marek prefers:
- direct, concrete, technical answers
- short answers for short questions
- no motivational filler, no corporate tone, no "game-changer" hype
- one clear question when info is missing, not assumptions
- YAGNI over enterprise patterns
- readable code over clever code

For longer discussions, see `docs/02_ai_rules/MAREK_COLLABORATION_RULES.md`.

---

## Development Environment

Primary dev environment: **Windows 11 + VSCode + npm**

Prefer cross-platform commands when possible (forward slashes in paths, no `rm -rf`, no Bash-isms). Code itself should be OS-agnostic — the future `.exe` ships on Windows but Tauri builds run cross-platform.

---

## Priority Order (when trading off)

1. Stability
2. Workflow feel
3. Audio correctness
4. Performance
5. UX polish
6. Visual polish

---

## The One Rule That Matters Most

> **The greatest danger to LoopThief is feature creep.**
>
> Every feature request must answer: *"Does this improve sampling workflow meaningfully?"*
>
> If not — do not prioritize it. If unsure — ask Marek.

LoopThief is an instrument, not a software suite. Keep it that way.