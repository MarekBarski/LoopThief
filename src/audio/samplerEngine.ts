export type PlayableSample = {
  name: string;
  durationMs: number;
  waveform: number[];
  sampleStart?: number;
  sampleEnd?: number;
  playbackRate?: number;
};

type Voice = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  pan: StereoPannerNode;
  startedAt: number;
  channelKey?: string;
};

class SamplerEngine {
  private context: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private voices = new Set<Voice>();
  private readonly maxVoices = 32;
  private status: "IDLE" | "READY" | "ERROR" = "IDLE";
  private statusListener: ((status: "IDLE" | "READY" | "ERROR") => void) | null = null;

  onStatusChange(listener: (status: "IDLE" | "READY" | "ERROR") => void) {
    this.statusListener = listener;
  }

  getStatus() {
    return this.status;
  }

  async ensureReady() {
    try {
      this.context ??= new AudioContext();
      if (this.context.state === "suspended") await this.context.resume();
      this.setStatus("READY");
      return true;
    } catch {
      this.setStatus("ERROR");
      return false;
    }
  }

  play(sample: PlayableSample, options: { gain: number; pan: number; channelKey?: string }) {
    void this.playInternal(sample, options);
  }

  updateChannelMix(channelKey: string, options: { gain: number; pan: number; audible: boolean }) {
    for (const voice of this.voices) {
      if (voice.channelKey !== channelKey) continue;
      voice.gain.gain.value = options.audible ? clamp(options.gain, 0, 2) : 0;
      voice.pan.pan.value = clamp(options.pan, -1, 1);
    }
  }

  private async playInternal(sample: PlayableSample, options: { gain: number; pan: number; channelKey?: string }) {
    if (!(await this.ensureReady()) || !this.context) return;
    const buffer = this.getBuffer(sample);
    const start = clamp(sample.sampleStart ?? 0, 0, 1);
    const end = clamp(sample.sampleEnd ?? 1, start + 0.0001, 1);
    const offset = start * buffer.duration;
    const duration = Math.max(0.001, (end - start) * buffer.duration);

    if (this.voices.size >= this.maxVoices) this.stealOldestVoice();

    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const pan = this.context.createStereoPanner();
    source.buffer = buffer;
    source.playbackRate.value = sample.playbackRate ?? 1;
    gain.gain.value = clamp(options.gain, 0, 2);
    pan.pan.value = clamp(options.pan, -1, 1);
    source.connect(gain).connect(pan).connect(this.context.destination);

    const voice: Voice = { source, gain, pan, startedAt: this.context.currentTime, channelKey: options.channelKey };
    this.voices.add(voice);
    source.onended = () => this.voices.delete(voice);
    source.start(0, offset, duration);
  }

  private getBuffer(sample: PlayableSample) {
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

  private stealOldestVoice() {
    let oldest: Voice | null = null;
    for (const voice of this.voices) {
      if (!oldest || voice.startedAt < oldest.startedAt) oldest = voice;
    }
    if (!oldest) return;
    try {
      oldest.source.stop();
    } catch {
      // already ended
    }
    this.voices.delete(oldest);
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
