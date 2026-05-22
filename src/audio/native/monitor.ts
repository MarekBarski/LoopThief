// Monitor routing for native capture.
//
// Subscribes to `audio:frame` Tauri events and plays each chunk through
// Web Audio. Two modes:
//   - Direct       — connect to AudioContext.destination (no FX)
//   - Through FX   — connect to fxEngine.getMasterInput() (route via FX)
//
// Each frame chunk arrives as Float32 interleaved (L, R, L, R, ...). We
// deinterleave into per-channel Float32Arrays, create an AudioBuffer,
// schedule it for playback at the next safe time. Scheduling pattern
// minimises gaps: each new chunk starts at the END of the previous
// scheduled chunk, with a small lead to absorb IPC jitter.
//
// Latency profile (Phase 2):
//   - Rust callback → forwarder batch (10 ms)
//   - Tauri event IPC (~5 ms)
//   - JS event handler → AudioBuffer create + schedule (~5 ms)
//   - Web Audio output (~50-100 ms depending on platform / driver)
//   Total: ~70-120 ms end-to-end. Acceptable for monitoring (the user
//   feedback type), not for real-time performance. Hardware direct
//   monitoring on the audio interface is the gold standard for that.
//
// Limitation (Phase 2): monitor only operates DURING a native recording
// session. To monitor without recording, the engine would need to keep
// capture+frame emission running independently of the recording flag.
// Phase 3 task — flagged in SESSION_LOG.

import type { AudioFramePayload, MonitorMode } from "./types";

type MonitorState = {
  ctx: AudioContext;
  routingTarget: AudioNode;
  unlisten: (() => void) | null;
  nextStartTime: number;
};

let active: MonitorState | null = null;

/**
 * Start monitoring with the given mode. If a monitor is already running,
 * stops it first (effectively a hot-swap).
 *
 * @param fxEngineMasterInput optional fxEngine input node for Through FX
 *                            routing. Pass `null` (or omit) to use the
 *                            default destination even in Through FX mode.
 */
export async function startMonitor(
  mode: MonitorMode,
  fxEngineMasterInput?: AudioNode | null,
): Promise<void> {
  await stopMonitor();
  if (mode === "off") return;

  const ctx = new AudioContext();
  const routingTarget: AudioNode =
    mode === "throughfx" && fxEngineMasterInput
      ? fxEngineMasterInput
      : ctx.destination;

  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<AudioFramePayload>("audio:frame", (event) => {
    if (!active) return;
    const { samples, channels, sampleRate } = event.payload;
    if (samples.length === 0) return;
    const frameCount = Math.floor(samples.length / channels);
    if (frameCount === 0) return;

    const buffer = active.ctx.createBuffer(channels, frameCount, sampleRate);
    for (let ch = 0; ch < channels; ch++) {
      const channelData = buffer.getChannelData(ch);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = samples[i * channels + ch];
      }
    }

    const source = active.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(active.routingTarget);

    const now = active.ctx.currentTime;
    // Schedule each chunk to start where the previous left off; lead by
    // a small buffer to absorb IPC jitter. If the scheduled time falls
    // in the past (we're behind), restart from now + lead.
    const lead = 0.02; // 20 ms scheduling head start
    const scheduledStart = Math.max(now + lead, active.nextStartTime);
    source.start(scheduledStart);
    active.nextStartTime = scheduledStart + buffer.duration;
  });

  active = {
    ctx,
    routingTarget,
    unlisten,
    nextStartTime: 0,
  };
}

export async function stopMonitor(): Promise<void> {
  if (!active) return;
  const { ctx, unlisten } = active;
  active = null;
  if (unlisten) unlisten();
  try {
    await ctx.close();
  } catch {
    /* already closed */
  }
}

export function isMonitorActive(): boolean {
  return active !== null;
}
