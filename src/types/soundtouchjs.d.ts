// Ambient module declaration for soundtouchjs.
// Library has no built-in types; minimal shape covering the parts we use.
declare module "soundtouchjs" {
  export class SoundTouch {
    tempo: number;
    pitch: number;
    rate: number;
    constructor();
  }

  export class WebAudioBufferSource {
    constructor(buffer: AudioBuffer);
    extract(target: Float32Array, numFrames: number, position?: number): number;
    readonly dualChannel: boolean;
    position: number;
  }

  export class SimpleFilter {
    constructor(sourceSound: WebAudioBufferSource, pipe: SoundTouch);
    extract(target: Float32Array, numFrames: number): number;
    readonly sourcePosition: number;
    onEnd(): void;
  }

  export class PitchShifter {
    constructor(context: AudioContext, buffer: AudioBuffer, bufferSize?: number);
    pitch: number;
    tempo: number;
    rate: number;
  }
}
