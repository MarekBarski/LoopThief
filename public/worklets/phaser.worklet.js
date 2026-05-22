// Phaser — N-stage all-pass chain with shared LFO modulating cutoff,
// optional feedback from last stage to input.
//
// Reference: Phase 90 / Small Stone topology. Classic 1st-order allpass
// filter cascade. The signature "swooshing notch sweep" comes from
// summing the dry signal with the phase-shifted wet — frequencies where
// the phase shift equals 180° subtract, producing notches that move as
// the LFO sweeps the allpass cutoff.
//
// Allpass coefficient from desired cutoff frequency:
//   a = (1 - tan(π·f/sr)) / (1 + tan(π·f/sr))
//
// Stage difference equation:
//   y[n] = -a·x[n] + x[n−1] + a·y[n−1]
//
// State per stage: previous input + previous output.

const MAX_STAGES = 8;

class PhaserProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "rate", defaultValue: 0.5, minValue: 0.05, maxValue: 10, automationRate: "k-rate" },
      { name: "depth", defaultValue: 0.7, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "stages", defaultValue: 6, minValue: 2, maxValue: 8, automationRate: "k-rate" },
      { name: "feedback", defaultValue: 0.3, minValue: 0, maxValue: 0.95, automationRate: "k-rate" },
      { name: "mix", defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    this._xPrev = new Float32Array(MAX_STAGES);
    this._yPrev = new Float32Array(MAX_STAGES);
    this._lfoPhase = 0;
    this._feedbackSample = 0;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const input = inputs[0];

    const rate = parameters.rate[0];
    const depth = parameters.depth[0];
    const stages = Math.max(2, Math.min(MAX_STAGES, Math.round(parameters.stages[0])));
    const feedback = parameters.feedback[0];
    const mix = parameters.mix[0];

    const sr = sampleRate;
    const phaseInc = (2 * Math.PI * rate) / sr;

    // LFO sweeps the allpass centre frequency between MIN_FREQ and MAX_FREQ.
    // DEPTH scales how far the sweep travels — 0 freezes at MIN_FREQ,
    // 1 sweeps full range.
    const MIN_FREQ = 200;
    const MAX_FREQ = 2200;

    const frameCount = output[0].length;
    const inCh0 = input && input.length > 0 ? input[0] : null;

    for (let f = 0; f < frameCount; f++) {
      const dry = inCh0 ? inCh0[f] : 0;

      this._lfoPhase += phaseInc;
      if (this._lfoPhase > 2 * Math.PI) this._lfoPhase -= 2 * Math.PI;
      const lfo01 = 0.5 + 0.5 * Math.sin(this._lfoPhase);
      const freq = MIN_FREQ + (MAX_FREQ - MIN_FREQ) * (lfo01 * depth);
      const t = Math.tan((Math.PI * freq) / sr);
      const a = (1 - t) / (1 + t);

      // Inject feedback at the head of the chain.
      let s = dry + this._feedbackSample * feedback;
      for (let i = 0; i < stages; i++) {
        const y = -a * s + this._xPrev[i] + a * this._yPrev[i];
        this._xPrev[i] = s;
        this._yPrev[i] = y;
        s = y;
      }
      this._feedbackSample = s;

      const result = dry * (1 - mix) + s * mix;
      for (let ch = 0; ch < output.length; ch++) {
        output[ch][f] = result;
      }
    }

    return true;
  }
}

registerProcessor("phaser-processor", PhaserProcessor);
