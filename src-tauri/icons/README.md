# LoopThief icons

Tauri requires platform-specific icons (32×32, 128×128, 128×128@2x, .ico for Windows). The current `icon.png` is the source LoopThief logo (1536×1024 — not square; Tauri will pad).

## Regenerate all sizes from the source

From the repo root:

```
npx tauri icon src-tauri/icons/icon.png
```

This writes `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.ico` (multi-resolution) and `icon.png` (square master) into this directory. Tauri config (`tauri.conf.json` → `bundle.icon`) references those filenames.

## If the logo needs to be square first

For best visual quality, crop/pad `assets/ui/logo/loopthief_logo.png` to a square in an image editor (Photoshop / GIMP / similar), save as a square PNG (e.g. 1024×1024), then run the `tauri icon` command on that file.

A non-square source produces icons with a transparent gutter; functional but not as polished.

## Files referenced by tauri.conf.json

- `32x32.png`
- `128x128.png`
- `128x128@2x.png`
- `icon.ico`
- `icon.png`
