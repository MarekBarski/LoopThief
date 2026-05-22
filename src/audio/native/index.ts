// Public surface for the native (Tauri/cpal) audio capture path. Mirrors
// the browser-side `recordingCapture.ts` so the store can swap backends
// transparently based on `isTauri()`.
//
// Phase 1 implements the bare minimum: start/stop a recording session,
// returns AudioBuffer compatible with the existing samplerEngine.
// Phase 2 will add hot device swap, monitor routing, threshold detection
// (currently still JS-side from the browser path), and SETTINGS AUDIO UI.

export {
  ensureCaptureRunning,
  listAudioDevices,
  startNativeRecording,
  stopCaptureCompletely,
  setInputDevice,
  setOutputDevice,
  setMonitorMode,
  restartEngine,
} from "./nativeCapture";
export { startMonitor, stopMonitor, isMonitorActive } from "./monitor";
export type { NativeCaptureSession } from "./nativeCapture";
export type {
  AudioConfig,
  AudioDevice,
  AudioFramePayload,
  DeviceKind,
  MonitorMode,
  NativeRecordingResult,
} from "./types";
export { defaultAudioConfig } from "./types";
