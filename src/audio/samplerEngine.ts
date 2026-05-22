import { getSampleBuffer } from "./sampleLibrary";
import { fxEngine, type VoiceFxRouting } from "./fxEngine";

export type PlayableSample = {
  id?: string;
  name: string;
  durationMs: number;
  waveform: number[];
  audioBufferId?: string;
  sampleRate?: number;
  sampleStart?: number;
  sampleEnd?: number;
  playbackRate?: number;
};

type Voice = {
  source: AudioBufferSourceNode;
  envelopeGain: GainNode;
  channelGain: GainNode;
  pan: StereoPannerNode;
  filter?: BiquadFilterNode;
  startedAt: number;
  channelKey?: string;
  previewGroup?: string;
  voiceGroup?: string;
  hasEnvelope: boolean;
  envelopeDecayMs: number;
  sustainStopTimer?: number;
};

type Envelope = {
  attackMs: number;
  decayMs: number;
  holdMode?: "ONE SHOT" | "NOTE ON";
};

type PlayOptions = {
  gain: number;
  pan: number;
  channelKey?: string;
  previewGroup?: string;
  voiceGroup?: string;
  mono?: boolean;
  filter?: {
    type: BiquadFilterType;
    frequency: number;
    q: number;
  };
  envelope?: Envelope;
  sustainMs?: number;
  fxRouting?: VoiceFxRouting;
  loop?: boolean;
};

type StopOptions = { releaseMs?: number };

const MIN_RAMP_MS = 1;

class SamplerEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterVolume = 100;
  private buffers = new Map<string, AudioBuffer>();
  private voices = new Set<Voice>();
  private readonly maxVoices = 32;
  private status: "IDLE" | "READY" | "ERROR" = "IDLE";
  private statusListener: ((status: "IDLE" | "READY" | "ERROR") => void) | null = null;
  private fxBridged = false;

  onStatusChange(listener: (status: "IDLE" | "READY" | "ERROR") => void) {
    this.statusListener = listener;
  }

  getStatus() {
    return this.status;
  }

  async ensureReady() {
    try {
      this.context ??= new AudioContext();
      this.ensureMasterGain();
      // Initialize FX graph downstream of master gain on first use, then
      // preload AudioWorklet processors (BitCrusher, plus more in upcoming
      // FX upgrade sub-phases) so any bus that selects them constructs
      // synchronously without falling back to passthrough.
      fxEngine.ensureReady(this.context);
      await fxEngine.preloadWorklets(this.context);
      if (this.context.state === "suspended") await this.context.resume();
      this.setStatus("READY");
      return true;
    } catch {
      this.setStatus("ERROR");
      return false;
    }
  }

  /** Returns the shared AudioContext for FX engine wiring. */
  getContext(): AudioContext | null {
    return this.context;
  }

  async decodeAudioData(data: ArrayBuffer) {
    if (!(await this.ensureReady()) || !this.context) throw new Error("Audio engine is not ready");
    return this.context.decodeAudioData(data.slice(0));
  }

  play(sample: PlayableSample, options: PlayOptions) {
    void this.playInternal(sample, options);
  }

  stopVoiceGroup(voiceGroup: string, options: StopOptions = {}) {
    if (options.releaseMs && options.releaseMs > 0) {
      this.softStopVoices((voice) => voice.voiceGroup === voiceGroup, options.releaseMs);
    } else {
      this.stopVoices((voice) => voice.voiceGroup === voiceGroup);
    }
  }

  stopAllVoices() {
    this.stopVoices(() => true);
  }

  stopVoiceGroups(voiceGroups: string[], options: StopOptions = {}) {
    if (voiceGroups.length === 0) return;
    const groups = new Set(voiceGroups);
    const predicate = (voice: Voice) => Boolean(voice.voiceGroup && groups.has(voice.voiceGroup));
    if (options.releaseMs && options.releaseMs > 0) {
      this.softStopVoices(predicate, options.releaseMs);
    } else {
      this.stopVoices(predicate);
    }
  }

  updateChannelMix(channelKey: string, options: { gain: number; pan: number; audible: boolean }) {
    for (const voice of this.voices) {
      if (voice.channelKey !== channelKey) continue;
      voice.channelGain.gain.value = options.audible ? clamp(options.gain, 0, 2) : 0;
      voice.pan.pan.value = clamp(options.pan, -1, 1);
    }
  }

  updateChannelFilter(channelKey: string, filterOptions?: PlayOptions["filter"]) {
    for (const voice of this.voices) {
      if (voice.channelKey !== channelKey) continue;
      this.updateVoiceFilter(voice, filterOptions);
    }
  }

  setMasterVolume(masterVolume: number) {
    this.masterVolume = clamp(masterVolume, 0, 2000);
    this.applyMasterVolume();
  }

  private async playInternal(sample: PlayableSample, options: PlayOptions) {
    if (!(await this.ensureReady()) || !this.context) return;
    const buffer = this.getBuffer(sample);
    const start = clamp(sample.sampleStart ?? 0, 0, 1);
    const end = clamp(sample.sampleEnd ?? 1, start + 0.0001, 1);
    const offset = start * buffer.duration;
    const duration = Math.max(0.001, (end - start) * buffer.duration);

    if (options.previewGroup) this.stopPreviewGroup(options.previewGroup);
    if (options.mono && options.voiceGroup) this.stopVoiceGroup(options.voiceGroup);
    if (this.voices.size >= this.maxVoices) this.stealOldestVoice();

    const source = this.context.createBufferSource();
    const envelopeGain = this.context.createGain();
    const channelGain = this.context.createGain();
    const pan = this.context.createStereoPanner();
    const filterOptions = options.filter;
    const filter = filterOptions ? this.context.createBiquadFilter() : null;
    source.buffer = buffer;
    source.playbackRate.value = sample.playbackRate ?? 1;
    if (options.loop) {
      source.loop = true;
      source.loopStart = offset;
      source.loopEnd = offset + duration;
    }
    channelGain.gain.value = clamp(options.gain, 0, 2);
    pan.pan.value = clamp(options.pan, -1, 1);
    // Build source → [filter?] → envelopeGain → channelGain → pan
    if (filter && filterOptions) {
      filter.type = filterOptions.type;
      filter.frequency.value = clamp(filterOptions.frequency, 20, this.context.sampleRate / 2);
      filter.Q.value = clamp(filterOptions.q, 0.0001, 30);
      source.connect(filter).connect(envelopeGain).connect(channelGain).connect(pan);
    } else {
      source.connect(envelopeGain).connect(channelGain).connect(pan);
    }
    // Route pan into FX graph (bus + dry) per voice routing config.
    // routeVoice returns { dryConnected: true } when INSERT mode consumed the entire signal
    // (no dry-to-master needed). Otherwise we wire dry path explicitly.
    const masterInput = this.ensureFxMasterEntry();
    const routed = fxEngine.routeVoice(pan, options.fxRouting);
    if (!routed.dryConnected) {
      pan.connect(masterInput);
    }

    const hasEnvelope = !!options.envelope;
    const startTime = this.context.currentTime;
    if (hasEnvelope && options.envelope) {
      this.applyEnvelope(envelopeGain, options.envelope, startTime);
    } else {
      envelopeGain.gain.value = 1;
    }

    const voice: Voice = {
      source,
      envelopeGain,
      channelGain,
      pan,
      filter: filter ?? undefined,
      startedAt: startTime,
      channelKey: options.channelKey,
      previewGroup: options.previewGroup,
      voiceGroup: options.voiceGroup,
      hasEnvelope,
      envelopeDecayMs: options.envelope?.decayMs ?? 0,
    };
    this.voices.add(voice);
    source.onended = () => {
      if (voice.sustainStopTimer !== undefined) {
        window.clearTimeout(voice.sustainStopTimer);
      }
      this.voices.delete(voice);
    };
    if (options.loop) {
      // Looping voices play indefinitely; duration limit would override loop.
      source.start(0, offset);
    } else {
      source.start(0, offset, duration);
    }

    if (options.sustainMs && options.sustainMs > 0) {
      const releaseMs = voice.envelopeDecayMs > 0 ? voice.envelopeDecayMs : MIN_RAMP_MS * 4;
      voice.sustainStopTimer = window.setTimeout(() => {
        this.softStopVoice(voice, releaseMs);
      }, options.sustainMs);
    }
  }

  private applyEnvelope(envelopeGain: GainNode, envelope: Envelope, startTime: number) {
    const attackMs = Math.max(0, envelope.attackMs);
    const decayMs = Math.max(0, envelope.decayMs);
    const attackSec = Math.max(MIN_RAMP_MS, attackMs) / 1000;
    envelopeGain.gain.cancelScheduledValues(startTime);
    envelopeGain.gain.setValueAtTime(0, startTime);
    envelopeGain.gain.linearRampToValueAtTime(1, startTime + attackSec);
    if (envelope.holdMode !== "NOTE ON" && decayMs > 0) {
      const decaySec = decayMs / 1000;
      envelopeGain.gain.linearRampToValueAtTime(0, startTime + attackSec + decaySec);
    }
  }

  private getBuffer(sample: PlayableSample) {
    if (sample.audioBufferId) {
      const realBuffer = getSampleBuffer(sample.audioBufferId);
      if (realBuffer) return realBuffer;
    }
    const cached = this.buffers.get(sample.name);
    if (cached) return cached;
    if (!this.context) throw new Error("Audio context not ready");
    const durationSeconds = Math.max(sample.durationMs / 1000, 0.05);
    const length = Math.max(1, Math.floor(durationSeconds * this.context.sampleRate));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      const phase = index / length;
      const waveformIndex = Math.min(sample.waveform.length - 1, Math.floor(phase * sample.waveform.length));
      const envelope = sample.waveform[waveformIndex] ?? 0.2;
      const tone = Math.sin(index * 0.035) * 0.6 + Math.sin(index * 0.011) * 0.25;
      channel[index] = tone * envelope;
    }
    this.buffers.set(sample.name, buffer);
    return buffer;
  }

  private ensureMasterGain() {
    if (!this.context) throw new Error("Audio context not ready");
    if (!this.masterGain) {
      this.masterGain = this.context.createGain();
      this.masterGain.connect(this.context.destination);
    }
    this.applyMasterVolume();
    return this.masterGain;
  }

  /**
   * Ensures the FX master chain is wired to masterGain → destination, and returns the
   * entry node where voices should connect their dry signal. Idempotent.
   */
  private ensureFxMasterEntry(): GainNode {
    if (!this.context) throw new Error("Audio context not ready");
    fxEngine.ensureReady(this.context);
    const fxOut = fxEngine.getMasterOutput();
    const fxIn = fxEngine.getMasterInput();
    if (!fxIn || !fxOut) throw new Error("FX master chain not initialized");
    const masterGain = this.ensureMasterGain();
    if (!this.fxBridged) {
      fxOut.connect(masterGain);
      this.fxBridged = true;
    }
    return fxIn;
  }

  private applyMasterVolume() {
    if (!this.masterGain) return;
    this.masterGain.gain.value = clamp(this.masterVolume / 100, 0, 20);
  }

  private stealOldestVoice() {
    let oldest: Voice | null = null;
    for (const voice of this.voices) {
      if (!oldest || voice.startedAt < oldest.startedAt) oldest = voice;
    }
    if (!oldest) return;
    this.hardStopVoice(oldest);
  }

  private stopPreviewGroup(previewGroup: string) {
    this.stopVoices((voice) => voice.previewGroup === previewGroup);
  }

  private updateVoiceFilter(voice: Voice, filterOptions?: PlayOptions["filter"]) {
    if (!this.context) return;

    if (!filterOptions) {
      try {
        voice.source.disconnect();
        voice.filter?.disconnect();
        voice.source.connect(voice.envelopeGain);
        voice.filter = undefined;
      } catch {
        // voice may have ended while the UI changed
      }
      return;
    }

    const filter = voice.filter ?? this.context.createBiquadFilter();
    filter.type = filterOptions.type;
    filter.frequency.value = clamp(filterOptions.frequency, 20, this.context.sampleRate / 2);
    filter.Q.value = clamp(filterOptions.q, 0.0001, 30);

    if (!voice.filter) {
      try {
        voice.source.disconnect();
        voice.source.connect(filter).connect(voice.envelopeGain);
        voice.filter = filter;
      } catch {
        // voice may have ended while the UI changed
      }
    }
  }

  private hardStopVoice(voice: Voice) {
    if (voice.sustainStopTimer !== undefined) {
      window.clearTimeout(voice.sustainStopTimer);
      voice.sustainStopTimer = undefined;
    }
    try {
      voice.source.stop();
    } catch {
      // already ended
    }
    this.voices.delete(voice);
  }

  private softStopVoice(voice: Voice, releaseMs: number) {
    if (!this.context) {
      this.hardStopVoice(voice);
      return;
    }
    if (voice.sustainStopTimer !== undefined) {
      window.clearTimeout(voice.sustainStopTimer);
      voice.sustainStopTimer = undefined;
    }
    const now = this.context.currentTime;
    const ramp = Math.max(MIN_RAMP_MS, releaseMs) / 1000;
    try {
      voice.envelopeGain.gain.cancelScheduledValues(now);
      voice.envelopeGain.gain.setValueAtTime(voice.envelopeGain.gain.value, now);
      voice.envelopeGain.gain.linearRampToValueAtTime(0, now + ramp);
      voice.source.stop(now + ramp);
    } catch {
      this.hardStopVoice(voice);
    }
  }

  private stopVoices(predicate: (voice: Voice) => boolean) {
    for (const voice of [...this.voices]) {
      if (!predicate(voice)) continue;
      this.hardStopVoice(voice);
    }
  }

  private softStopVoices(predicate: (voice: Voice) => boolean, releaseMs: number) {
    for (const voice of [...this.voices]) {
      if (!predicate(voice)) continue;
      this.softStopVoice(voice, releaseMs);
    }
  }

  private setStatus(status: "IDLE" | "READY" | "ERROR") {
    if (this.status === status) return;
    this.status = status;
    this.statusListener?.(status);
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export const samplerEngine = new SamplerEngine();
