// FDN (Feedback Delay Network) reverb processor.
//
// Architecture: 8 delay lines connected through an 8×8 Hadamard orthogonal
// matrix, with per-line one-pole low-pass damping inside each feedback
// loop. Input passes through a 4-stage Schroeder allpass diffusion chain
// before reaching the network so the early reflections aren't comb-filter-
// shaped.
//
// Why FDN over ConvolverNode: ConvolverNode + synthesised IR is cheap but
// the IR is a single recording — no control over decay character, no real
// "darkness" change once it's baked. FDN is dynamic: ROOM SIZE scales the
// delay lengths (longer = longer tail), DAMPING moves the per-line LP
// cutoffs (more = darker tail), DIFFUSION moves the allpass coefficient
// (more = smoother early-reflection density). All in real time.
//
// Reference: Geraint Luff's FDN reverb writeup. Hadamard matrix because
// it's orthogonal (lossless under unit feedback gain — we apply our own
// loss via the feedback scalar so the tail decays cleanly) and trivially
// hand-codable for 8 dimensions.
//
// AudioWorklet alloc-free invariant: every Float32Array / Int32Array used
// inside process() is allocated once in the constructor. No `new Array` or
// `[].map` in the hot loop.
//
// Mono input is downmixed if multi-channel. Output is stereo — even-index
// delay taps feed L, odd-index feed R, normalised by /4 to keep loudness
// in the same ballpark as ConvolverNode.

const N = 8;

// Prime numbers used as base delay lengths (in samples at the worklet's
// context sample rate). Chosen mutually co-prime so modes don't align.
// Scaled by ROOM SIZE at runtime (final length = base * (0.1 + size*0.9)).
const BASE_PRIMES = [743, 941, 1117, 1283, 1487, 1693, 1879, 2063];

// Diffusion stage: 4 allpass filters with small co-prime delays.
const AP_LENGTHS = [7, 11, 13, 17];

// Largest possible delay across all lines * max scale (1.0). Round up to
// a comfortable power-of-two-ish boundary.
const MAX_DELAY = 4096;

// Hadamard 8×8, sign matrix only. Multiplied by 1/sqrt(8) at apply time.
// Rows: H[i][j] is the sign of the j-th input contribution to output i.
const HADAMARD = [
  [+1, +1, +1, +1, +1, +1, +1, +1],
  [+1, -1, +1, -1, +1, -1, +1, -1],
  [+1, +1, -1, -1, +1, +1, -1, -1],
  [+1, -1, -1, +1, +1, -1, -1, +1],
  [+1, +1, +1, +1, -1, -1, -1, -1],
  [+1, -1, +1, -1, -1, +1, -1, +1],
  [+1, +1, -1, -1, -1, -1, +1, +1],
  [+1, -1, -1, +1, -1, +1, +1, -1],
];
const INV_SQRT_8 = 1 / Math.sqrt(8);

class FDNReverbProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "roomSize", defaultValue: 0.7, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "damping", defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "diffusion", defaultValue: 0.7, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    // Pre-allocate every buffer the hot loop touches.
    this._delayBuffers = new Array(N);
    this._writePositions = new Int32Array(N);
    this._dampStates = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      this._delayBuffers[i] = new Float32Array(MAX_DELAY);
    }
    this._dlOut = new Float32Array(N);
    this._damped = new Float32Array(N);
    this._mixed = new Float32Array(N);
    this._effLengths = new Int32Array(N);

    this._apBuffers = new Array(AP_LENGTHS.length);
    this._apWritePositions = new Int32Array(AP_LENGTHS.length);
    for (let a = 0; a < AP_LENGTHS.length; a++) {
      this._apBuffers[a] = new Float32Array(AP_LENGTHS[a]);
    }
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const input = inputs[0];

    const roomSize = parameters.roomSize[0];
    const damping = parameters.damping[0];
    const diffusion = parameters.diffusion[0];

    // Per-line damping coefficient. 0 = no LP, 1 = nearly silent (full
    // smoothing → tail decays into nothing). Cap at 0.85 so even at max
    // damping the LP still passes some energy and the tail audibly fades.
    const dampCoeff = damping * 0.85;
    // Allpass coefficient: 0.4 (subtle smoothing) → 0.8 (heavy diffusion).
    const apCoeff = 0.4 + diffusion * 0.4;
    // Feedback gain (tail length control). 0.5 = very short, 0.95 = long.
    const feedbackGain = 0.5 + roomSize * 0.45;

    // Compute effective delay lengths from current ROOM SIZE.
    for (let i = 0; i < N; i++) {
      const scaled = Math.floor(BASE_PRIMES[i] * (0.1 + roomSize * 0.9));
      this._effLengths[i] = Math.max(2, Math.min(MAX_DELAY - 1, scaled));
    }

    const frameCount = output[0].length;
    const numInChannels = input ? input.length : 0;

    for (let f = 0; f < frameCount; f++) {
      // ---- Mono-sum input ----
      let monoIn = 0;
      if (numInChannels > 0) {
        for (let ch = 0; ch < numInChannels; ch++) {
          monoIn += input[ch][f] || 0;
        }
        monoIn /= numInChannels;
      }

      // ---- 4-stage allpass diffusion ----
      let diffused = monoIn;
      for (let a = 0; a < AP_LENGTHS.length; a++) {
        const buf = this._apBuffers[a];
        const wp = this._apWritePositions[a];
        const len = buf.length;
        const delayed = buf[wp];
        const out = -apCoeff * diffused + delayed;
        buf[wp] = diffused + apCoeff * out;
        this._apWritePositions[a] = (wp + 1) % len;
        diffused = out;
      }

      // ---- Read delay lines ----
      for (let i = 0; i < N; i++) {
        const buf = this._delayBuffers[i];
        const wp = this._writePositions[i];
        const len = this._effLengths[i];
        const rp = (wp - len + MAX_DELAY) % MAX_DELAY;
        this._dlOut[i] = buf[rp];
      }

      // ---- Per-line damping (one-pole LP) ----
      for (let i = 0; i < N; i++) {
        const next = (1 - dampCoeff) * this._dlOut[i] + dampCoeff * this._dampStates[i];
        this._dampStates[i] = next;
        this._damped[i] = next;
      }

      // ---- Hadamard 8×8 mix ----
      for (let i = 0; i < N; i++) {
        let sum = 0;
        const row = HADAMARD[i];
        for (let j = 0; j < N; j++) {
          sum += row[j] * this._damped[j];
        }
        this._mixed[i] = sum * INV_SQRT_8;
      }

      // ---- Write back: scaled input + feedback ----
      const inputScale = 0.5;
      for (let i = 0; i < N; i++) {
        const buf = this._delayBuffers[i];
        buf[this._writePositions[i]] = diffused * inputScale + this._mixed[i] * feedbackGain;
        this._writePositions[i] = (this._writePositions[i] + 1) % MAX_DELAY;
      }

      // ---- Wet output: even taps → L, odd taps → R ----
      let outL = 0;
      let outR = 0;
      for (let i = 0; i < N; i++) {
        if (i % 2 === 0) outL += this._dlOut[i];
        else outR += this._dlOut[i];
      }
      outL *= 0.25;
      outR *= 0.25;

      if (output.length >= 2) {
        output[0][f] = outL;
        output[1][f] = outR;
      } else {
        output[0][f] = (outL + outR) * 0.5;
      }
    }

    return true;
  }
}

registerProcessor("fdn-reverb-processor", FDNReverbProcessor);
