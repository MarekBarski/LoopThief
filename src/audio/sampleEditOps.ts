// Sample Edit operations — destructive AudioBuffer transforms used by the Sample Edit window.
// Each op consumes an input AudioBuffer + params and returns a NEW AudioBuffer.
// The Sample Edit window registers the result with sampleLibrary and offers Keep/Retry.

import { SoundTouch, SimpleFilter, WebAudioBufferSource } from "soundtouchjs";

export type SampleEditOp =
  | "TIME_STRETCH"
  | "PITCH_SHIFT"
  | "WARP"
  | "REVERSE"
  | "NORMALIZE"
  | "BIT_REDUCE"
  | "FADE_IN"
  | "FADE_OUT";

export type FadeCurve = "LINEAR" | "LOG" | "EXP";

export type SampleEditParams = {
  // TIME_STRETCH
  stretchMode?: "RATIO" | "BPM_MATCH";
  stretchRatio?: number;       // percent 50..200 (100 = unchanged)
  originalBpm?: number;
  newBpm?: number;
  // PITCH_SHIFT
  semitones?: number;          // -12..+12
  cents?: number;              // -100..+100
  // WARP
  warpSpeed?: number;          // percent 50..200 (100 = unchanged)
  // NORMALIZE
  targetDb?: number;           // -60..0 (default -0.3)
  // BIT_REDUCE
  bitDepth?: number;           // 1..16
  reducedSampleRate?: number;  // 1000..48000
  // FADE_IN / FADE_OUT
  fadeMs?: number;             // length of fade in ms
  fadeCurve?: FadeCurve;
};

const SAMPLE_RATE_FLOOR = 1000;
const SAMPLE_RATE_CEILING = 192000;

/** Suffix appended to auto-generated names per op. */
export const OP_NAME_SUFFIX: Record<SampleEditOp, string> = {
  TIME_STRETCH: "_stretched",
  PITCH_SHIFT: "_pitched",
  WARP: "_warped",
  REVERSE: "_reversed",
  NORMALIZE: "_normalized",
  BIT_REDUCE: "_crushed",
  FADE_IN: "_fadein",
  FADE_OUT: "_fadeout",
};

/** Default params per op (used to seed UI on op switch). */
export const DEFAULT_OP_PARAMS: Record<SampleEditOp, SampleEditParams> = {
  TIME_STRETCH: { stretchMode: "RATIO", stretchRatio: 100, originalBpm: 120, newBpm: 120 },
  PITCH_SHIFT: { semitones: 0, cents: 0 },
  WARP: { warpSpeed: 100 },
  REVERSE: {},
  NORMALIZE: { targetDb: -0.3 },
  BIT_REDUCE: { bitDepth: 12, reducedSampleRate: 26040 },
  FADE_IN: { fadeMs: 50, fadeCurve: "LINEAR" },
  FADE_OUT: { fadeMs: 50, fadeCurve: "LINEAR" },
};

export type BitReducePreset = "SP-1200" | "MPC60" | "NES" | "ATARI" | "CUSTOM";

export const BIT_REDUCE_PRESETS: Record<Exclude<BitReducePreset, "CUSTOM">, { bitDepth: number; reducedSampleRate: number }> = {
  "SP-1200": { bitDepth: 12, reducedSampleRate: 26040 },
  "MPC60": { bitDepth: 12, reducedSampleRate: 40000 },
  "NES": { bitDepth: 7, reducedSampleRate: 22050 },
  "ATARI": { bitDepth: 8, reducedSampleRate: 22050 },
};

// ====================================================================
// Region extraction — Sample Edit ops act on the CHOP active region only.
// ====================================================================

/** Extract a [start..end] region (0..1 normalized positions) of a buffer into a fresh AudioBuffer. */
export function extractRegion(ctx: AudioContext, input: AudioBuffer, startNorm: number, endNorm: number): AudioBuffer {
  const start = Math.max(0, Math.min(1, startNorm));
  const end = Math.max(start + 0.0001, Math.min(1, endNorm));
  const startSample = Math.floor(start * input.length);
  const endSample = Math.min(input.length, Math.floor(end * input.length));
  const length = Math.max(1, endSample - startSample);
  const out = ctx.createBuffer(input.numberOfChannels, length, input.sampleRate);
  for (let ch = 0; ch < input.numberOfChannels; ch += 1) {
    const data = input.getChannelData(ch).subarray(startSample, endSample);
    out.copyToChannel(data, ch);
  }
  return out;
}

// ====================================================================
// Operations
// ====================================================================

export function reverse(ctx: AudioContext, input: AudioBuffer): AudioBuffer {
  const out = ctx.createBuffer(input.numberOfChannels, input.length, input.sampleRate);
  for (let ch = 0; ch < input.numberOfChannels; ch += 1) {
    const src = input.getChannelData(ch);
    const dst = new Float32Array(src.length);
    for (let i = 0; i < src.length; i += 1) {
      dst[i] = src[src.length - 1 - i];
    }
    out.copyToChannel(dst, ch);
  }
  return out;
}

export function normalize(ctx: AudioContext, input: AudioBuffer, targetDb: number): AudioBuffer {
  // Find peak across all channels.
  let peak = 0;
  for (let ch = 0; ch < input.numberOfChannels; ch += 1) {
    const data = input.getChannelData(ch);
    for (let i = 0; i < data.length; i += 1) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
  }
  if (peak === 0) return cloneBuffer(ctx, input);
  const targetLinear = Math.pow(10, targetDb / 20);
  const gain = targetLinear / peak;
  const out = ctx.createBuffer(input.numberOfChannels, input.length, input.sampleRate);
  for (let ch = 0; ch < input.numberOfChannels; ch += 1) {
    const src = input.getChannelData(ch);
    const dst = new Float32Array(src.length);
    for (let i = 0; i < src.length; i += 1) {
      dst[i] = src[i] * gain;
    }
    out.copyToChannel(dst, ch);
  }
  return out;
}

export function fadeIn(ctx: AudioContext, input: AudioBuffer, fadeMs: number, curve: FadeCurve): AudioBuffer {
  const fadeSamples = Math.min(input.length, Math.max(1, Math.floor(fadeMs * input.sampleRate / 1000)));
  const out = ctx.createBuffer(input.numberOfChannels, input.length, input.sampleRate);
  for (let ch = 0; ch < input.numberOfChannels; ch += 1) {
    const src = input.getChannelData(ch);
    const dst = new Float32Array(src);
    for (let i = 0; i < fadeSamples; i += 1) {
      const t = i / fadeSamples;
      dst[i] = src[i] * curveValue(t, curve);
    }
    out.copyToChannel(dst, ch);
  }
  return out;
}

export function fadeOut(ctx: AudioContext, input: AudioBuffer, fadeMs: number, curve: FadeCurve): AudioBuffer {
  const fadeSamples = Math.min(input.length, Math.max(1, Math.floor(fadeMs * input.sampleRate / 1000)));
  const out = ctx.createBuffer(input.numberOfChannels, input.length, input.sampleRate);
  for (let ch = 0; ch < input.numberOfChannels; ch += 1) {
    const src = input.getChannelData(ch);
    const dst = new Float32Array(src);
    for (let i = 0; i < fadeSamples; i += 1) {
      const t = (fadeSamples - i) / fadeSamples;
      const idx = src.length - fadeSamples + i;
      dst[idx] = src[idx] * curveValue(t, curve);
    }
    out.copyToChannel(dst, ch);
  }
  return out;
}

function curveValue(t: number, curve: FadeCurve): number {
  // t goes 0..1 (start of fade → end of fade, i.e., 0 = silent, 1 = full).
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (curve === "LINEAR") return t;
  if (curve === "LOG") return Math.log10(1 + 9 * t); // 0..1
  return (Math.exp(t) - 1) / (Math.E - 1);            // EXP, 0..1
}

export function bitReduce(ctx: AudioContext, input: AudioBuffer, bitDepth: number, reducedRate: number): AudioBuffer {
  const bits = Math.max(1, Math.min(16, bitDepth));
  const targetRate = Math.max(SAMPLE_RATE_FLOOR, Math.min(input.sampleRate, reducedRate));
  // Quantization step: signal is in -1..+1 range. 2^(bits-1) levels per side.
  const levels = Math.pow(2, bits - 1);
  // Sample-and-hold for sample-rate reduction: hold every Nth sample where N = ceil(origRate / targetRate).
  const holdLength = Math.max(1, Math.floor(input.sampleRate / targetRate));
  const out = ctx.createBuffer(input.numberOfChannels, input.length, input.sampleRate);
  for (let ch = 0; ch < input.numberOfChannels; ch += 1) {
    const src = input.getChannelData(ch);
    const dst = new Float32Array(src.length);
    let held = 0;
    for (let i = 0; i < src.length; i += 1) {
      if (i % holdLength === 0) {
        held = Math.round(src[i] * levels) / levels;
      }
      dst[i] = held;
    }
    out.copyToChannel(dst, ch);
  }
  return out;
}

export function warp(ctx: AudioContext, input: AudioBuffer, speedPercent: number): AudioBuffer {
  // Vinyl-style: change effective playback rate by altering the buffer's stored sample rate.
  // speed 50% → output sampleRate = origRate/2 → plays 2x longer + 1 octave down.
  // speed 200% → output sampleRate = origRate*2 → plays 2x shorter + 1 octave up.
  const speed = Math.max(0.01, speedPercent / 100);
  const newRate = Math.max(SAMPLE_RATE_FLOOR, Math.min(SAMPLE_RATE_CEILING, Math.round(input.sampleRate * speed)));
  const out = ctx.createBuffer(input.numberOfChannels, input.length, newRate);
  for (let ch = 0; ch < input.numberOfChannels; ch += 1) {
    out.copyToChannel(input.getChannelData(ch), ch);
  }
  return out;
}

// ====================================================================
// Time Stretch & Pitch Shift (SoundTouchJS)
// ====================================================================

/** Time-stretch (pitch-preserving). ratio > 1 = faster/shorter; < 1 = slower/longer. */
export function timeStretch(ctx: AudioContext, input: AudioBuffer, ratio: number): AudioBuffer {
  return processWithSoundTouch(ctx, input, ratio, 1.0);
}

/** Pitch-shift (length-preserving). semitones + cents → frequency ratio. */
export function pitchShift(ctx: AudioContext, input: AudioBuffer, semitones: number, cents: number): AudioBuffer {
  const pitchRatio = Math.pow(2, semitones / 12) * Math.pow(2, cents / 1200);
  return processWithSoundTouch(ctx, input, 1.0, pitchRatio);
}

/**
 * Runs SoundTouch on the input buffer.
 * tempo: > 1 compresses time (faster), < 1 stretches (slower). Affects duration only.
 * pitch: > 1 raises pitch, < 1 lowers pitch. Affects pitch only.
 * Always returns a stereo buffer (SoundTouch processes interleaved L+R).
 */
function processWithSoundTouch(ctx: AudioContext, input: AudioBuffer, tempo: number, pitch: number): AudioBuffer {
  const soundtouch = new SoundTouch();
  // SoundTouchJS: tempo = duration multiplier semantics — tempo=2 → output is 0.5× length.
  // Our `ratio` matches that semantic.
  soundtouch.tempo = Math.max(0.1, Math.min(10, tempo));
  soundtouch.pitch = Math.max(0.1, Math.min(10, pitch));

  // WebAudioBufferSource interleaves L+R (uses left for both if mono).
  const source = new WebAudioBufferSource(input);
  const filter = new SimpleFilter(source, soundtouch);

  const bufferSize = 4096;
  const interleaved = new Float32Array(bufferSize * 2);
  const outL: number[] = [];
  const outR: number[] = [];
  let extracted = 0;
  do {
    extracted = filter.extract(interleaved, bufferSize);
    for (let i = 0; i < extracted; i += 1) {
      outL.push(interleaved[i * 2]);
      outR.push(interleaved[i * 2 + 1]);
    }
  } while (extracted > 0);

  if (outL.length === 0) {
    // Edge case: input was too short for SoundTouch to produce output. Return original (cloned).
    return cloneBuffer(ctx, input);
  }
  const channels = input.numberOfChannels >= 2 ? 2 : 1;
  const out = ctx.createBuffer(channels, outL.length, input.sampleRate);
  out.copyToChannel(new Float32Array(outL), 0);
  if (channels === 2) {
    out.copyToChannel(new Float32Array(outR), 1);
  }
  return out;
}

function cloneBuffer(ctx: AudioContext, input: AudioBuffer): AudioBuffer {
  const out = ctx.createBuffer(input.numberOfChannels, input.length, input.sampleRate);
  for (let ch = 0; ch < input.numberOfChannels; ch += 1) {
    out.copyToChannel(input.getChannelData(ch), ch);
  }
  return out;
}

// ====================================================================
// Dispatch
// ====================================================================

/** Apply the chosen operation to an input buffer. Returns the new AudioBuffer. */
export function applyOp(
  ctx: AudioContext,
  input: AudioBuffer,
  op: SampleEditOp,
  params: SampleEditParams,
): AudioBuffer {
  switch (op) {
    case "TIME_STRETCH": {
      let ratio = 1;
      if (params.stretchMode === "BPM_MATCH") {
        const origin = params.originalBpm ?? 120;
        const target = params.newBpm ?? 120;
        // ratio < 1 = slower (longer); > 1 = faster (shorter)
        ratio = origin > 0 ? target / origin : 1;
      } else {
        ratio = (params.stretchRatio ?? 100) / 100;
      }
      // MPC2000XL / MPC5000 canonical range: 50–200% → ratio 0.5..2.0.
      ratio = Math.max(0.5, Math.min(2.0, ratio));
      return timeStretch(ctx, input, ratio);
    }
    case "PITCH_SHIFT": {
      // MPC canonical range: ±12 semitones, ±100 cents.
      const semitones = Math.max(-12, Math.min(12, params.semitones ?? 0));
      const cents = Math.max(-100, Math.min(100, params.cents ?? 0));
      return pitchShift(ctx, input, semitones, cents);
    }
    case "WARP": {
      // MPC canonical range: 50–200%.
      const speed = Math.max(50, Math.min(200, params.warpSpeed ?? 100));
      return warp(ctx, input, speed);
    }
    case "REVERSE":
      return reverse(ctx, input);
    case "NORMALIZE":
      return normalize(ctx, input, params.targetDb ?? -0.3);
    case "BIT_REDUCE":
      return bitReduce(ctx, input, params.bitDepth ?? 12, params.reducedSampleRate ?? 26040);
    case "FADE_IN":
      return fadeIn(ctx, input, params.fadeMs ?? 50, params.fadeCurve ?? "LINEAR");
    case "FADE_OUT":
      return fadeOut(ctx, input, params.fadeMs ?? 50, params.fadeCurve ?? "LINEAR");
    default:
      return cloneBuffer(ctx, input);
  }
}
