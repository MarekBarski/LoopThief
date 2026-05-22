// Native (Tauri/cpal) capture bridge. Mirrors the public surface of the
// browser fallback in `src/audio/recordingCapture.ts` so callers can swap
// implementations transparently.
//
// Data path:
//   1. `audio_start_capture` opens the input stream + pre-roll ring buffer.
//      cpal pumps frames continuously; nothing reaches JS until we hit
//      `audio_start_recording`.
//   2. `audio_start_recording` drains the last 250 ms of the pre-roll into
//      the recording accumulator (Rust side) and flips a flag so the cpal
//      callback starts forwarding frames into a crossbeam channel.
//   3. A Rust forwarder thread batches 10 ms chunks and emits `audio:frame`
//      Tauri events; this module listens and concatenates frames into an
//      AudioBuffer for the live waveform.
//   4. `audio_stop_recording` returns the final Float32 buffer assembled
//      in Rust. We use this as the authoritative result; the JS-side
//      accumulation is only for the live waveform.

import { defaultAudioConfig, type AudioConfig, type AudioDevice, type AudioFramePayload, type NativeRecordingResult } from "./types";

export interface NativeCaptureSession {
  /** Stops the recording and returns an AudioBuffer of the captured audio. */
  stop: () => Promise<AudioBuffer>;
  /** Discards the recording without returning a buffer. */
  cancel: () => Promise<void>;
}

let currentLevelListener: (() => void) | null = null;
let frameUnlisten: (() => void) | null = null;
let captureRunning = false;

/**
 * One-time init: open the input stream + start the pre-roll buffer. Call on
 * app boot (or on first RECORD screen entry). Idempotent.
 */
export async function ensureCaptureRunning(config: Partial<AudioConfig> = {}): Promise<void> {
  if (captureRunning) return;
  const { invoke } = await import("@tauri-apps/api/core");
  const running = await invoke<boolean>("audio_is_running");
  if (running) {
    captureRunning = true;
    return;
  }
  // Merge against the default config so partial callers can't trip the Rust
  // serde validator with missing fields (e.g. missing wasapiMode bug from
  // the first runtime test — Marek's manual DevTools invoke).
  const completeConfig: AudioConfig = { ...defaultAudioConfig(), ...config };
  await invoke("audio_start_capture", { config: completeConfig });
  captureRunning = true;
}

export async function stopCaptureCompletely(): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("audio_stop_capture");
  captureRunning = false;
}

export async function listAudioDevices(): Promise<AudioDevice[]> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<AudioDevice[]>("audio_list_devices");
}

/** Hot-swap input device. Rebuilds the input stream on the new device. */
export async function setInputDevice(deviceId: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("audio_set_input_device", { deviceId });
}

/** Output device setter. Phase 2: no-op on Rust side (monitor routing
 *  is JS-side via Web Audio); future native low-latency monitor will
 *  consume this. Exposed now so callers don't need to branch. */
export async function setOutputDevice(deviceId: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("audio_set_output_device", { deviceId });
}

/** Monitor mode setter. Rust stores intent; actual routing is JS-side. */
export async function setMonitorMode(mode: "off" | "direct" | "throughfx"): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("audio_set_monitor_mode", { mode });
}

/** Full engine restart with new config — used by SETTINGS AUDIO APPLY. */
export async function restartEngine(config: AudioConfig): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  const completeConfig: AudioConfig = { ...defaultAudioConfig(), ...config };
  await invoke("audio_restart_engine", { config: completeConfig });
}

/**
 * Begin a recording session. Returns handles to stop or cancel.
 *
 * onFrame: invoked for every batch of captured frames (~10 ms chunks)
 *          during the recording, for live waveform / level UI.
 * onLevel: invoked at ~30 Hz with the current peak level (0..1).
 * threshold: when set (linear 0..1), the recording is gated. The capture
 *            engine runs immediately so the pre-roll buffer fills, but the
 *            Rust `audio_start_recording` call is deferred until the level
 *            crosses the threshold for the first time. Mimics MPC threshold
 *            sampling: user arms, source crosses threshold → recording
 *            begins WITH 250 ms pre-roll.
 *            Pass `undefined` (default) for immediate recording.
 * onThresholdArmed: invoked once when the watch loop is started (so UI
 *                   can show "WAITING FOR LEVEL").
 * onThresholdTriggered: invoked once when the threshold is crossed.
 */
export async function startNativeRecording(callbacks: {
  onFrame?: (payload: AudioFramePayload) => void;
  onLevel?: (level: number) => void;
  threshold?: number;
  onThresholdArmed?: () => void;
  onThresholdTriggered?: () => void;
}): Promise<NativeCaptureSession> {
  await ensureCaptureRunning();

  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");

  // Subscribe to audio:frame BEFORE flipping the recording flag so we
  // don't miss the first batches (which contain the pre-roll).
  if (callbacks.onFrame) {
    if (frameUnlisten) frameUnlisten();
    const off = await listen<AudioFramePayload>("audio:frame", (event) => {
      callbacks.onFrame!(event.payload);
    });
    frameUnlisten = off;
  }

  // 30 Hz polling for VU meter — much cheaper than streaming through
  // events. The Rust side keeps a running peak that resets on each read.
  if (callbacks.onLevel) {
    if (currentLevelListener) currentLevelListener();
    const handle = window.setInterval(async () => {
      try {
        const level = await invoke<number>("audio_get_current_level");
        callbacks.onLevel!(level);
      } catch {
        // Ignore — likely engine torn down mid-poll.
      }
    }, 33);
    currentLevelListener = () => window.clearInterval(handle);
  }

  // Threshold gating. When `callbacks.threshold` is set, we DEFER the
  // audio_start_recording call. The capture engine keeps running so the
  // pre-roll ring buffer fills; a JS-side watch loop polls the level and
  // engages recording the moment it crosses. This mirrors MPC threshold
  // sampling: the level-cross moment is captured complete, including the
  // 250 ms BEFORE the cross (pre-roll).
  if (callbacks.threshold === undefined) {
    await invoke("audio_start_recording");
  } else {
    const thresholdValue = callbacks.threshold;
    callbacks.onThresholdArmed?.();
    let triggered = false;
    const watchHandle = window.setInterval(async () => {
      if (triggered) return;
      try {
        const level = await invoke<number>("audio_get_current_level");
        if (level >= thresholdValue) {
          triggered = true;
          window.clearInterval(watchHandle);
          await invoke("audio_start_recording");
          callbacks.onThresholdTriggered?.();
        }
      } catch {
        // Engine torn down mid-poll — stop watching.
        window.clearInterval(watchHandle);
      }
    }, 20);
    thresholdWatchHandles.add(watchHandle);
  }

  return {
    stop: async () => {
      clearAllThresholdWatches();
      const result = await invoke<NativeRecordingResult>("audio_stop_recording");
      detachListeners();
      return await assembleAudioBuffer(result);
    },
    cancel: async () => {
      clearAllThresholdWatches();
      // Cancel = stop recording but discard the result.
      try {
        await invoke<NativeRecordingResult>("audio_stop_recording");
      } catch {
        // Ignore.
      }
      detachListeners();
    },
  };
}

const thresholdWatchHandles = new Set<number>();
function clearAllThresholdWatches() {
  for (const handle of thresholdWatchHandles) window.clearInterval(handle);
  thresholdWatchHandles.clear();
}

function detachListeners() {
  if (frameUnlisten) {
    frameUnlisten();
    frameUnlisten = null;
  }
  if (currentLevelListener) {
    currentLevelListener();
    currentLevelListener = null;
  }
}

async function assembleAudioBuffer(result: NativeRecordingResult): Promise<AudioBuffer> {
  const { samples, sampleRate, channels } = result;
  const frameCount = Math.floor(samples.length / channels);
  // Reuse a shared AudioContext rather than creating per-recording. The
  // existing samplerEngine has one; for now create a transient context for
  // the AudioBuffer factory (browsers allow this without permission).
  const ctx = new AudioContext({ sampleRate });
  const buffer = ctx.createBuffer(channels, frameCount, sampleRate);

  // Samples arrive interleaved (L, R, L, R, ...) from Rust. Deinterleave
  // into per-channel Float32Arrays for the AudioBuffer.
  for (let ch = 0; ch < channels; ch++) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = samples[i * channels + ch];
    }
  }

  // The transient AudioContext can be closed — its sole purpose was the
  // AudioBuffer factory. The buffer remains valid independently.
  void ctx.close();

  return buffer;
}
