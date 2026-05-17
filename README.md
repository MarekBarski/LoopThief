# LoopThief

LoopThief is a modern sampling instrument inspired by MPC/SP workflow.

Core workflow:

CAPTURE → CHOP → PLAY → RESAMPLE

LoopThief is not a DAW.

Main goals:
- fast system audio capture
- sample chopping
- pad-based playback
- tracker-inspired sequencing
- live performance workflow

## Current foundation

- Tauri desktop shell
- React + TypeScript frontend
- TailwindCSS styling
- Zustand app state
- Placeholder navigation and screens for the core LoopThief workflow

## Run locally

1. Install frontend dependencies:
   `npm install`
2. Start the browser-based UI shell:
   `npm run dev`
3. Install Rust with `rustup` if it is not already available on your machine.
4. Start the desktop app:
   `npm run tauri dev`
