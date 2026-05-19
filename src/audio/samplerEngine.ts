import { getSampleBuffer } from "./sampleLibrary";

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
  gain: GainNode;
  pan: StereoPannerNode;
  filter?: BiquadFilterNode;
  startedAt: number;
  channelKey?: string;
  previewGroup?: string;
  voiceGroup?: string;
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
};

class SamplerEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterVolume = 100;
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
      this.ensureMasterGain();
      if (this.context.state === "suspended") await this.context.resume();
      this.setStatus("READY");
      return true;
    } catch {
      this.setStatus("ERROR");
      return false;
    }
  }

  async decodeAudioData(data: ArrayBuffer) {
    if (!(await this.ensureReady()) || !this.context) throw new Error("Audio engine is not ready");
    return this.context.decodeAudioData(data.slice(0));
  }

  play(sample: PlayableSample, options: PlayOptions) {
    void this.playInternal(sample, options);
  }

  stopVoiceGroup(voiceGroup: string) {
    this.stopVoices((voice) => voice.voiceGroup === voiceGroup);
  }

  stopVoiceGroups(voiceGroups: string[]) {
    if (voiceGroups.length === 0) return;
    const groups = new Set(voiceGroups);
    this.stopVoices((voice) => Boolean(voice.voiceGroup && groups.has(voice.voiceGroup)));
  }

  updateChannelMix(channelKey: string, options: { gain: number; pan: number; audible: boolean }) {
    for (const voice of this.voices) {
      if (voice.channelKey !== channelKey) continue;
      voice.gain.gain.value = options.audible ? clamp(options.gain, 0, 2) : 0;
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
    const gain = this.context.createGain();
    const pan = this.context.createStereoPanner();
    const filterOptions = options.filter;
    const filter = filterOptions ? this.context.createBiquadFilter() : null;
    source.buffer = buffer;
    source.playbackRate.value = sample.playbackRate ?? 1;
    gain.gain.value = clamp(options.gain, 0, 2);
    pan.pan.value = clamp(options.pan, -1, 1);
    if (filter && filterOptions) {
      filter.type = filterOptions.type;
      filter.frequency.value = clamp(filterOptions.frequency, 20, this.context.sampleRate / 2);
      filter.Q.value = clamp(filterOptions.q, 0.0001, 30);
      source.connect(filter).connect(gain).connect(pan).connect(this.ensureMasterGain());
    } else {
      source.connect(gain).connect(pan).connect(this.ensureMasterGain());
    }

    const voice: Voice = {
      source,
      gain,
      pan,
      filter: filter ?? undefined,
      startedAt: this.context.currentTime,
      channelKey: options.channelKey,
      previewGroup: options.previewGroup,
      voiceGroup: options.voiceGroup,
    };
    this.voices.add(voice);
    source.onended = () => this.voices.delete(voice);
    source.start(0, offset, duration);
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
    try {
      oldest.source.stop();
    } catch {
      // already ended
    }
    this.voices.delete(oldest);
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
        voice.source.connect(voice.gain);
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
        voice.source.connect(filter).connect(voice.gain);
        voice.filter = filter;
      } catch {
        // voice may have ended while the UI changed
      }
    }
  }

  private stopVoices(predicate: (voice: Voice) => boolean) {
    for (const voice of [...this.voices]) {
      if (!predicate(voice)) continue;
      try {
        voice.source.stop();
      } catch {
        // already ended
      }
      this.voices.delete(voice);
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
