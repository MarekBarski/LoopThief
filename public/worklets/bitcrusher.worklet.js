// BitCrusher AudioWorklet processor.
//
// Two-stage degradation, SP-1200 / MPC style:
//   1. Bit-depth quantization: round each sample to the nearest of 2^bits
//      steps. Default 12 bits (SP-1200 spec).
//   2. Sample-rate reduction: sample-and-hold every N input frames, where
//      N = ceil(contextSampleRate / targetSampleRate). Default target
//      26040 Hz (SP-1200 spec).
//
// Optional DRIVE gain stage before quantization makes the effect more
// audible on quiet material (and adds gentle saturation when the driven
// signal clips against the [-1, 1] domain of the quantizer).
//
// MIX is a wet/dry crossfade so the effect can sit on a send bus without
// the bus going full-effect.
//
// Reference: SP-1200 sample rate = 26040 Hz, bit depth = 12. The aliasing
// at that rate is the famous gritty "lo-fi" character — we don't filter
// it out post-quantization (would defeat the point). The optional analog
// reconstruction filter that the real SP-1200 has after its DAC is not
// modelled here; per Marek's quality bar this gets us 90 % of the way.
//
// Stereo: per-channel hold buffers, shared counter — both channels swap
// to a new sample on the same frame, preserving stereo image.

class BitCrusherProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bits', defaultValue: 12, minValue: 1, maxValue: 16, automationRate: 'k-rate' },
      { name: 'sampleRateHz', defaultValue: 26040, minValue: 100, maxValue: 192000, automationRate: 'k-rate' },
      { name: 'drive', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'mix', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this._counter = 0;
    this._held = new Float32Array(2);
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const bits = parameters.bits[0];
    const targetRate = parameters.sampleRateHz[0];
    const drive = parameters.drive[0];
    const mix = parameters.mix[0];

    // Sample-and-hold ratio: how many input frames per output update.
    // sampleRate is a worklet global (the context's rate).
    const ratio = Math.max(1, Math.floor(sampleRate / targetRate));
    // Steps for bit-depth quantization. bits=12 → 2048 steps per side of zero.
    const steps = Math.pow(2, Math.max(1, Math.min(16, bits)) - 1);
    // Drive: 0 = no boost, 1 = +12 dB into the quantizer. Soft-clipped at ±1.
    const driveGain = 1 + drive * 3;

    const numChannels = Math.min(input ? input.length : 0, output.length);
    const frameCount = output[0].length;
    const heldBuffer = this._held;

    for (let f = 0; f < frameCount; f++) {
      const updateHold = (this._counter % ratio) === 0;
      for (let ch = 0; ch < output.length; ch++) {
        const inCh = input && ch < numChannels ? input[ch] : null;
        const dry = inCh ? inCh[f] : 0;
        if (updateHold) {
          // Drive + clip + bit-depth quantize, store in hold buffer.
          const driven = Math.max(-1, Math.min(1, dry * driveGain));
          const heldIdx = ch < heldBuffer.length ? ch : 0;
          heldBuffer[heldIdx] = Math.round(driven * steps) / steps;
        }
        const heldIdx = ch < heldBuffer.length ? ch : 0;
        const wet = heldBuffer[heldIdx];
        output[ch][f] = dry * (1 - mix) + wet * mix;
      }
      this._counter++;
    }

    return true;
  }
}

registerProcessor('bitcrusher-processor', BitCrusherProcessor);
