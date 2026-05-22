// Hermite-interpolated Flanger.
//
// Naive flanger implementations (DelayNode + LFO modulating delayTime)
// sound metallic because the underlying delay line read is linearly
// interpolated. Linear interpolation has a hard low-pass roll-off that
// changes with the fractional delay — modulation produces ringing /
// metallic artifacts.
//
// Hermite 4-point cubic interpolation is the standard fix. Smooth
// spectrum across the modulation sweep. Reference: any modern DSP plugin
// tutorial; the cubic Hermite formula is universal.
//
// Architecture:
//   - Single delay buffer (4096 samples — covers ~85ms at 48kHz, plenty
//     for flange depth + manual + feedback path)
//   - LFO modulates delay length: base = MANUAL (0.5..20ms), modulation
//     = DEPTH × ±4.5ms
//   - Feedback path: signed (-0.95..+0.95). Negative feedback gives the
//     "through-zero"-ish character classic to old Mu-Tron flangers
//   - Mono input, mono output (flanger doesn't naturally split stereo)

const BUFFER_SIZE = 4096;

class HermiteFlangerProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "rate", defaultValue: 0.5, minValue: 0.01, maxValue: 10, automationRate: "k-rate" },
      { name: "depth", defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "feedback", defaultValue: 0.3, minValue: -0.95, maxValue: 0.95, automationRate: "k-rate" },
      { name: "manual", defaultValue: 0.25, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "mix", defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    this._buffer = new Float32Array(BUFFER_SIZE);
    this._writePos = 0;
    this._lfoPhase = 0;
  }

  // 4-point cubic Hermite. p1 = previous, p2 = current floor, p3 = next,
  // p4 = next+1. `frac` is the sub-sample position (0..1) between p2 and p3.
  _hermite(p1, p2, p3, p4, frac) {
    const c0 = p2;
    const c1 = 0.5 * (p3 - p1);
    const c2 = p1 - 2.5 * p2 + 2.0 * p3 - 0.5 * p4;
    const c3 = 0.5 * (p4 - p1) + 1.5 * (p2 - p3);
    return ((c3 * frac + c2) * frac + c1) * frac + c0;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const input = inputs[0];

    const rate = parameters.rate[0];
    const depth = parameters.depth[0];
    const feedback = parameters.feedback[0];
    const manual = parameters.manual[0];
    const mix = parameters.mix[0];

    const sr = sampleRate;
    const phaseInc = (2 * Math.PI * rate) / sr;
    // Manual: 0..1 → 0.5..20 ms.
    const manualMs = 0.5 + manual * 19.5;
    const manualSamples = (manualMs / 1000) * sr;
    // Depth: 0..1 → 0..4.5 ms peak-to-peak.
    const depthSamples = depth * 4.5 * 0.001 * sr;

    const buf = this._buffer;
    const bsize = BUFFER_SIZE;

    const frameCount = output[0].length;
    const inCh0 = input && input.length > 0 ? input[0] : null;

    for (let f = 0; f < frameCount; f++) {
      const dry = inCh0 ? inCh0[f] : 0;

      // Advance LFO.
      this._lfoPhase += phaseInc;
      if (this._lfoPhase > 2 * Math.PI) this._lfoPhase -= 2 * Math.PI;
      const lfoSine = Math.sin(this._lfoPhase);
      // Map LFO −1..+1 onto 0..1, multiply by depth so DEPTH=0 ⇒ static delay.
      const lfoNorm = 0.5 + 0.5 * lfoSine;

      const delay = manualSamples + depthSamples * lfoNorm;
      const readPos = this._writePos - delay;
      const readInt = Math.floor(readPos);
      const frac = readPos - readInt;

      // Indices wrap-safe with positive modulo trick.
      const i1 = ((readInt - 1) % bsize + bsize) % bsize;
      const i2 = ((readInt) % bsize + bsize) % bsize;
      const i3 = ((readInt + 1) % bsize + bsize) % bsize;
      const i4 = ((readInt + 2) % bsize + bsize) % bsize;

      const interp = this._hermite(buf[i1], buf[i2], buf[i3], buf[i4], frac);

      // Write input + feedback into the buffer at the write head.
      buf[this._writePos] = dry + interp * feedback;
      this._writePos = (this._writePos + 1) % bsize;

      const result = dry * (1 - mix) + interp * mix;
      for (let ch = 0; ch < output.length; ch++) {
        output[ch][f] = result;
      }
    }

    return true;
  }
}

registerProcessor("hermite-flanger-processor", HermiteFlangerProcessor);
