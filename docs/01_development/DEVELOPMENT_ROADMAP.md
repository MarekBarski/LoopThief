# LOOPTHIEF — DEVELOPMENT ROADMAP v0.1

# PROJECT STATUS

Current Phase:
PRE-PRODUCTION COMPLETE

Project Direction:
STABLE

Core Vision:
DEFINED

Main Risk:
FEATURE CREEP

Primary Goal:
Fast sample capture and chopping workflow.

---

# DEVELOPMENT PHILOSOPHY

LoopThief is NOT a DAW.

LoopThief IS:
- a sampling instrument,
- a groove workstation,
- a loop manipulation tool,
- a performance sampler.

Every feature must support:

CAPTURE → CHOP → PLAY → RESAMPLE

---

# STAGE 0 — PREPRODUCTION

STATUS: COMPLETE

Completed:
- product vision
- UX philosophy
- sampler research
- MPC/SP workflow analysis
- UI layout concept
- mascot concept
- MVP definition
- anti-feature definition
- screen architecture
- tracker direction
- project structure planning

Deliverables:
- Design Bible
- UI structure plan
- feature philosophy
- product identity

---

# STAGE 1 — TECH FOUNDATION

Goal:
Create stable project architecture.

Tasks:
- create GitHub private repository
- initialize Tauri project
- configure React + TypeScript
- configure Tailwind
- configure Zustand
- setup ESLint + Prettier
- create folder structure
- setup branch strategy
- setup commit conventions

Suggested Folder Structure:

/src
    /audio
    /components
    /engine
    /features
    /screens
    /store
    /styles
    /utils
/assets
/docs
/public

Goal Result:
Stable technical base.

---

# STAGE 2 — UI SHELL

Goal:
Build fully navigable fake UI.

NO REAL AUDIO YET.

Tasks:
- main layout
- top bar
- mode buttons
- transport controls
- pad section
- screen routing
- dark industrial theme
- mascot placeholder
- responsive scaling
- fake waveform
- fake tracker

Screens:
- MAIN
- RECORD
- CHOP
- PROGRAM
- STEP
- PERFORMANCE
- MIX
- DISK
- SETTINGS

Goal Result:
Clickable prototype.

---

# STAGE 3 — AUDIO FOUNDATION

Goal:
Basic sampler playback engine.

Tasks:
- WAV loading
- sample playback
- polyphony
- low latency triggering
- transport timing
- stop/start
- volume
- pan

NOT INCLUDED:
- timestretch
- VST
- advanced FX

Goal Result:
Pads can play samples reliably.

---

# STAGE 4 — SYSTEM AUDIO CAPTURE

Goal:
Core LoopThief feature.

Tasks:
- system audio recording
- waveform recording
- threshold recording
- audio monitoring
- recording buffer
- recall mode
- normalize after record

Important:
This is a flagship feature.

Goal Result:
User can sample directly from system audio.

---

# STAGE 5 — CHOP ENGINE

Goal:
Core sample workflow.

Tasks:
- waveform rendering
- zoom
- markers
- manual slicing
- transient detection
- auto chop
- assign slices to pads
- reverse
- normalize
- fades
- region editing

Goal Result:
Complete chop workflow.

---

# STAGE 6 — PROGRAM SYSTEM

Inspired by:
MPC3000 program philosophy.

Tasks:
- pad programs
- choke groups
- poly/mono
- tuning
- attack
- decay
- filters
- FX sends
- pad colors

Goal Result:
Reusable playable kits.

---

# STAGE 7 — STEP SEQUENCER

Goal:
Tracker-inspired sequencing.

Tasks:
- tracker grid
- event editing
- velocity
- swing
- probability
- microshift
- repeat
- copy/paste
- humanize

Important:
NO piano roll dependency.

Goal Result:
Fast rhythm editing workflow.

---

# STAGE 8 — PERFORMANCE SYSTEM

Goal:
Instrument feeling.

Tasks:
- track mute
- pad mute
- next sequence
- quantized launching
- note repeat
- live resampling
- performance shortcuts

Goal Result:
Playable live groove workflow.

---

# STAGE 9 — PROJECT SYSTEM

Goal:
Reliable save/load workflow.

Tasks:
- project serialization
- sample collection
- autosave
- project export
- stem export
- backup recovery

Project Structure:

Project.loopthief/
    project.json
    /samples
    /programs
    /sequences
    /renders
    /cache

Goal Result:
Portable self-contained projects.

---

# STAGE 10 — BASIC FX

Goal:
Sampler-essential effects only.

Included:
- reverb
- echo
- lowpass
- highpass
- compressor
- normalize
- reverse
- fade

NOT INCLUDED:
- advanced mastering suite
- modular FX graph
- giant plugin chains

Goal Result:
Basic sound shaping.

---

# STAGE 11 — POLISH

Goal:
Refinement.

Tasks:
- mascot animations
- blinking
- recording states
- UI transitions
- keyboard shortcuts
- compact layouts
- accessibility
- optimization

Goal Result:
Professional feeling product.

---

# STAGE 12 — TESTING

Goal:
Workflow validation.

Focus:
- speed
- usability
- groove flow
- readability
- latency
- stability

Critical Question:
"Does it still feel like an instrument?"

---

# FUTURE FEATURES (POST-MVP)

Optional:
- VST support
- MIDI controller integration
- timestretch
- AI transient detection
- stem separation
- online sample browser
- cloud sync
- collaboration

These are NOT MVP features.

---

# CRITICAL WARNING

DO NOT:
- turn LoopThief into a DAW,
- overload UI,
- add features without workflow justification,
- copy Ableton workflow blindly.

The project succeeds ONLY if:
workflow remains immediate and tactile.

---

# MVP DEFINITION

LoopThief MVP is complete when user can:

1. Record system audio
2. Create slices
3. Assign slices to pads
4. Sequence patterns
5. Save project
6. Perform loops live

Everything else is secondary.
