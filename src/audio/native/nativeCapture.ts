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

/**
 * Begin a recording session. Returns handles to stop or cancel.
 *
 * onFrame: invoked for every batch of captured frames (~10 ms chunks)
 *          during the recording, for live waveform / level UI.
 * onLevel: invoked at ~30 Hz with the current peak level (0..1).
 */
export async function startNativeRecording(callbacks: {
  onFrame?: (payload: AudioFramePayload) => void;
  onLevel?: (level: number) => void;
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

  await invoke("audio_start_recording");

  return {
    stop: async () => {
      const result = await invoke<NativeRecordingResult>("audio_stop_recording");
      detachListeners();
      return await assembleAudioBuffer(result);
    },
    cancel: async () => {
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
