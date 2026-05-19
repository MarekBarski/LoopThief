export type SampleAudioRef = {
  id: string;
  buffer: AudioBuffer;
  channels: Float32Array[];
};

const sampleAudioRefs = new Map<string, SampleAudioRef>();

export function createSampleId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `sample-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function registerSampleAudio(id: string, buffer: AudioBuffer) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  sampleAudioRefs.set(id, { id, buffer, channels });
}

export function getSampleBuffer(id: string) {
  return sampleAudioRefs.get(id)?.buffer ?? null;
}

export function getSampleAudioRef(id: string) {
  return sampleAudioRefs.get(id) ?? null;
}

export function createWaveformCache(buffer: AudioBuffer, pointCount = 1024) {
  const points = Math.max(1, pointCount);
  const channelCount = buffer.numberOfChannels;
  const framesPerPoint = Math.max(1, Math.floor(buffer.length / points));
  const waveform: number[] = [];

  for (let point = 0; point < points; point += 1) {
    const start = point * framesPerPoint;
    const end = point === points - 1 ? buffer.length : Math.min(buffer.length, start + framesPerPoint);
    let peak = 0;

    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const channel = buffer.getChannelData(channelIndex);
      for (let frame = start; frame < end; frame += 1) {
        const value = Math.abs(channel[frame] ?? 0);
        if (value > peak) peak = value;
      }
    }

    waveform.push(Math.min(1, peak));
  }

  return waveform;
}

export function encodeWavRegion(audioRef: SampleAudioRef, start: number, end: number) {
  const sampleRate = audioRef.buffer.sampleRate;
  const channelCount = audioRef.buffer.numberOfChannels;
  const startFrame = clamp(Math.floor(start * audioRef.buffer.length), 0, Math.max(0, audioRef.buffer.length - 1));
  const endFrame = clamp(Math.ceil(end * audioRef.buffer.length), startFrame + 1, audioRef.buffer.length);
  const frameCount = endFrame - startFrame;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataSize = frameCount * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let frame = startFrame; frame < endFrame; frame += 1) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sample = clamp(audioRef.channels[channelIndex]?.[frame] ?? 0, -1, 1);
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  return buffer;
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
