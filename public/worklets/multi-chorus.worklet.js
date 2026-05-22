// Multi-voice stereo chorus.
//
// 4 voices share one delay buffer but read from independent fractional
// positions. Each voice has its own LFO with a unique phase offset
// (0°, 90°, 180°, 270°) and a small rate detuning per voice (×1.00,
// ×0.95, ×1.05, ×0.92). Voices are panned across the stereo field by
// WIDTH so the chorus opens up wide on lush settings.
//
// Reference: CE-1 / CE-2 style stompbox topology — multiple low-rate
// modulators around a 15–25 ms base delay, stereo split for image.
//
// Hermite interpolation everywhere (shared with the flanger) for clean
// modulation. Same alloc-free invariant as the FDN reverb worklet.

const BUFFER_SIZE = 4096;
const MAX_VOICES = 4;
// Per-voice phase offsets at startup so all 4 voices don't sing the same
// note initially.
const PHASE_OFFSETS = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
// Per-voice rate detuning so voices drift relative to each other.
const RATE_SCALES = [1.0, 0.95, 1.05, 0.92];

class MultiChorusProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "rate", defaultValue: 1.0, minValue: 0.05, maxValue: 5, automationRate: "k-rate" },
      { name: "depth", defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "voices", defaultValue: 4, minValue: 2, maxValue: 4, automationRate: "k-rate" },
      { name: "width", defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "mix", defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    this._buffer = new Float32Array(BUFFER_SIZE);
    this._writePos = 0;
    this._lfoPhases = new Float32Array(MAX_VOICES);
    for (let v = 0; v < MAX_VOICES; v++) this._lfoPhases[v] = PHASE_OFFSETS[v];
  }

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
    const voices = Math.max(2, Math.min(MAX_VOICES, Math.round(parameters.voices[0])));
    const width = parameters.width[0];
    const mix = parameters.mix[0];

    const sr = sampleRate;
    // Base delay 15ms (chorus sweet spot). Modulation depth scales 0..8ms.
    const baseDelay = 0.015 * sr;
    const modAmount = depth * 0.008 * sr;

    const buf = this._buffer;
    const bsize = BUFFER_SIZE;

    const frameCount = output[0].length;
    const inCh0 = input && input.length > 0 ? input[0] : null;
    const numOutChannels = output.length;

    // 1/voices normalisation so 4-voice chorus isn't louder than 2-voice.
    const invVoices = 1 / voices;

    for (let f = 0; f < frameCount; f++) {
      const dry = inCh0 ? inCh0[f] : 0;

      // Write the dry sample into the buffer first so all voice reads see it.
      buf[this._writePos] = dry;
      this._writePos = (this._writePos + 1) % bsize;

      let wetL = 0;
      let wetR = 0;
      for (let v = 0; v < voices; v++) {
        const phaseInc = (2 * Math.PI * rate * RATE_SCALES[v]) / sr;
        this._lfoPhases[v] += phaseInc;
        if (this._lfoPhases[v] > 2 * Math.PI) this._lfoPhases[v] -= 2 * Math.PI;
        const lfoNorm = 0.5 + 0.5 * Math.sin(this._lfoPhases[v]);
        const delay = baseDelay + modAmount * lfoNorm;
        // -1 because we already wrote dry into writePos.
        const readPos = this._writePos - 1 - delay;
        const readInt = Math.floor(readPos);
        const frac = readPos - readInt;
        const i1 = ((readInt - 1) % bsize + bsize) % bsize;
        const i2 = ((readInt) % bsize + bsize) % bsize;
        const i3 = ((readInt + 1) % bsize + bsize) % bsize;
        const i4 = ((readInt + 2) % bsize + bsize) % bsize;
        const interp = this._hermite(buf[i1], buf[i2], buf[i3], buf[i4], frac);

        // Pan: v=0 → -1, v=voices-1 → +1, multiplied by width.
        // Equal-power crossfade for natural stereo image.
        const panNorm = voices === 1 ? 0 : (v / (voices - 1)) * 2 - 1;
        const pan = panNorm * width;
        const ang = (pan + 1) * Math.PI * 0.25;
        const panL = Math.cos(ang);
        const panR = Math.sin(ang);

        wetL += interp * panL;
        wetR += interp * panR;
      }

      wetL *= invVoices;
      wetR *= invVoices;

      const outL = dry * (1 - mix) + wetL * mix;
      const outR = dry * (1 - mix) + wetR * mix;

      if (numOutChannels >= 2) {
        output[0][f] = outL;
        output[1][f] = outR;
      } else {
        output[0][f] = (outL + outR) * 0.5;
      }
    }

    return true;
  }
}

registerProcessor("multi-chorus-processor", MultiChorusProcessor);
