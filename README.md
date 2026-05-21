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

- Tauri 2 desktop shell (native Windows .exe via WebView2)
- React 19 + TypeScript 5 frontend
- Vite 6 build pipeline
- TailwindCSS 4 styling
- Zustand 5 app state
- Web MIDI + Web Audio in the browser; same APIs work in Tauri via WebView2

## Run locally

### Browser dev (fast iteration)

1. `npm install`
2. `npm run dev` — Vite dev server at http://localhost:1420
3. Open the URL in Chrome / Edge / Brave (Web MIDI required for MIDI support).

### Desktop dev (Tauri window)

Prerequisites — one-time setup:

- Rust toolchain via [rustup](https://rustup.rs/)
- Windows: Microsoft C++ Build Tools (Visual Studio Installer → "Desktop development with C++")
- macOS: Xcode Command Line Tools
- Linux: see [Tauri prerequisites](https://tauri.app/start/prerequisites/)

Then:

```
npm install
npm run tauri dev
```

The Tauri dev window opens with hot-reload identical to browser dev.

## Build a distributable .exe (Windows)

```
npm run tauri build
```

Outputs in `src-tauri/target/release/bundle/`:

- `msi/LoopThief_X.X.X_x64_en-US.msi` — Windows Installer package
- `nsis/LoopThief_X.X.X_x64-setup.exe` — NSIS installer (recommended for end users)
- raw `loopthief.exe` under `src-tauri/target/release/` if you want the bare binary

Window enforces a hard 1280×720 minimum via `tauri.conf.json` so the LCD layout never breaks; the browser build shows a viewport warning banner instead.

WebView2 runtime: bundled by Windows 11; Windows 10 normally ships it via update. Tauri's NSIS installer can include a WebView2 bootstrapper if Marek decides to ship offline-friendly builds (config option in `tauri.conf.json` → `bundle.windows.webviewInstallMode`).

## Icons

The Tauri bundler reads icons from `src-tauri/icons/`. To regenerate all required sizes from a single source PNG:

```
npx tauri icon src-tauri/icons/icon.png
```

See `src-tauri/icons/README.md` for details.

## Project structure

- `src/` — React frontend
- `src-tauri/` — Tauri 2 shell (Rust)
- `assets/` — image / sample assets bundled by Vite
- `docs/` — design bible, AI workflow rules, session log
- `dist/` — Vite build output (generated)
