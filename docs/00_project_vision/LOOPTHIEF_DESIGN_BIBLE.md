# LOOPTHIEF — DESIGN BIBLE v0.1

## Project Vision

LoopThief is NOT a DAW.

LoopThief is:
- a sampling instrument,
- a loop chopping workstation,
- a performance sampler,
- a modern reinterpretation of MPC/SP workflow,
- designed for mouse-first interaction.

Main inspirations:
- MPC2000XL
- MPC3000
- MPC4000
- SP-1200
- MPC3
- tracker workflows
- modern grooveboxes

---

# CORE PHILOSOPHY

## Main Goal

Fastest possible workflow from:

CAPTURE → CHOP → PLAY → RESAMPLE

NOT:
- full music production,
- orchestral arrangement,
- mixing/mastering suite,
- plugin ecosystem monster.

---

# UX PRINCIPLES

## 1. Instrument, not software

The app should feel like:
- a machine,
- a workstation,
- a musical instrument.

NOT:
- a website,
- a generic desktop app,
- a DAW clone.

---

## 2. No hidden functionality

Important functions must:
- have visible buttons,
- have fixed locations,
- use text labels,
- avoid icon-only UI.

User should READ the interface.

---

## 3. One screen = one task

Examples:
- RECORD screen = recording
- CHOP screen = slicing
- STEP screen = sequencing

Avoid:
- floating windows,
- nested modal chaos,
- multi-purpose overloaded screens.

---

## 4. Mouse-first workflow

Do NOT emulate:
- jog wheels,
- encoders,
- hardware cursor systems.

Use:
- direct waveform dragging,
- contextual clicking,
- scroll zoom,
- drag slicing.

---

## 5. Immediate creativity

The software should encourage:
- experimentation,
- groove creation,
- resampling,
- loop manipulation.

Avoid:
- technical friction,
- configuration overload,
- DAW bureaucracy.

---

# VISUAL STYLE

## General Aesthetic

Dark industrial hardware-inspired interface.

Inspired by:
- MPC3000 front panel
- MPC4000
- old rack samplers
- vintage studio gear

Avoid:
- mobile app look,
- glossy gradients,
- modern flat SaaS UI,
- gaming UI.

---

## Layout Philosophy

Large central screen.

Permanent mode buttons.

Permanent transport controls.

Permanent pad section.

Minimal screen switching.

---

# MAIN UI STRUCTURE

---

# TOP BAR

Contains:
- LoopThief logo
- Project name
- BPM
- Swing
- CPU meter
- Audio status
- Save state
- REC indicator
- Theme switch

Right side:
Mascot thief character.

Mascot behaviors:
- blinking eyes
- idle animations
- headphone mode during recording
- subtle movement only

Mascot should NEVER dominate UI.

---

# LEFT MODE COLUMN

Permanent vertical button column.

Buttons:
- MAIN
- RECORD
- CHOP
- PROGRAM
- STEP
- PERFORMANCE
- MIX
- DISK
- SETTINGS

Style:
- large text buttons
- industrial
- readable
- MPC-inspired

---

# CENTER SCREEN

Main work area.

This area changes based on active mode.

Contains:
- waveform editor
- tracker
- sequence overview
- mixer
- sample editor

Should resemble:
modern MPC LCD philosophy.

NOT desktop windows.

---

# BOTTOM PERFORMANCE STRIP

Permanent bottom area.

Contains:

## Transport
- REC
- OVERDUB
- STOP
- PLAY
- PLAY START

## Performance
- NOTE REPEAT
- FULL LEVEL
- 16 LEVELS
- ERASE

## Timing
- Timing Correct
- Swing

## Recall Buffer
- RECALL 25s

---

# PAD SECTION

16 MPC-style pads.

Located bottom-right.

Includes:
- pad banks A/B/C/D
- visual velocity feedback
- active slice indicators
- color states

Pads are mouse clickable.

Keyboard shortcuts later.

---

# SCREEN DEFINITIONS

---

# MAIN SCREEN

Purpose:
Main performance and sequence hub.

Contains:
- track list
- current sequence
- bars overview
- active program
- sample count
- playback info
- current pad
- transport state

Should resemble:
MPC3000 Main Screen philosophy.

---

# RECORD SCREEN

Purpose:
Fast audio capture.

Sources:
- system audio
- microphone
- audio interface

Features:
- live waveform
- threshold recording
- manual recording
- recall recording
- gain
- normalize
- monitor

Mascot:
wearing headphones during recording.

---

# CHOP SCREEN

Purpose:
Core sample slicing workflow.

Main element:
Large waveform display.

Functions:
- auto chop
- transient detect
- manual slicing
- region split
- normalize
- reverse
- fade
- zoom

Right side:
Pad assignment preview.

Mouse-first interaction mandatory.

---

# PROGRAM SCREEN

Purpose:
Pad/sample configuration.

Each pad contains:
- assigned sample
- poly/mono mode
- choke group
- tuning
- attack
- decay
- filter
- FX send

Inspired by:
MPC3000 Program system.

---

# STEP SCREEN

Purpose:
Tracker-style sequencing.

NOT piano roll focused.

Vertical event flow.

Columns:
- NOTE
- VELOCITY
- FX
- CHANCE
- MICROSHIFT
- SWING

Features:
- copy
- paste
- repeat
- randomize
- humanize

Should feel:
fast and machine-like.

---

# PERFORMANCE SCREEN

Purpose:
Live performance mode.

Features:
- track mute
- pad mute
- next sequence
- scene switching
- quantized launching
- live resampling

Large fullscreen buttons.

Performance confidence is critical.

---

# MIX SCREEN

Minimal mixer.

NOT DAW mixer.

Only:
- volume
- pan
- FX send
- mute
- solo

Maximum simplicity.

---

# DISK SCREEN

Purpose:
Project management.

Functions:
- save project
- load project
- export WAV
- export stems
- collect samples

MPC-style simplicity.

---

# SETTINGS SCREEN

Contains:
- audio device
- latency
- sample rate
- theme
- compact mode
- animation toggle
- autosave
- shortcuts

---

# PROJECT STRUCTURE

Suggested format:

MyBeat.loopthief/

Contains:
- project.json
- samples/
- sequences/
- programs/
- renders/
- cache/

---

# CORE FEATURES

## MVP PRIORITY

1. System audio recording
2. Waveform editor
3. Chop/slice workflow
4. Pad assignment
5. Step sequencer
6. Sequence playback
7. Project save/load
8. Resampling

---

# NON-GOALS

LoopThief should NOT become:
- Ableton clone
- Cubase clone
- full DAW
- plugin-first environment
- orchestral production suite

Avoid:
- automation lane hell
- floating plugin chaos
- timeline-first workflow
- giant mixer systems

---

# AUDIO CHARACTER

Primary focus:
workflow.

Not analog modeling perfection.

Optional flavor modes:
- Clean
- MPC-style 12-bit
- SP1200-style grit

But these are secondary features.

---

# TRACKER PHILOSOPHY

Step sequencing should:
- resemble trackers,
- remain readable,
- remain modern,
- support groove experimentation.

Avoid:
- old DOS aesthetics,
- dense hexadecimal complexity.

---

# PERFORMANCE PHILOSOPHY

Music creation should feel:
- playful,
- immediate,
- tactile,
- rhythmic.

Core inspiration:
old MPC and SP workflow.

---

# IMPORTANT DESIGN RULE

Every feature must answer:

"Does this help the user sample, chop or perform faster?"

If not:
the feature is probably unnecessary.

---

# MASCOT

French cartoon-inspired thief character.

Visual traits:
- black eye mask
- sneaky body language
- carrying vinyl records
- subtle noir energy

States:
- idle
- recording
- thinking
- reacting to operations

Should feel:
charming but not distracting.

---

# FINAL PHILOSOPHY

LoopThief should feel like:

"An alternate timeline where samplers evolved instead of DAWs."
