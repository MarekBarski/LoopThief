// FX engine — 4 FX buses + master EQ/Compressor, MPC5000 routing model.
//
// Phase 1 + 2 history: full bus + master graph, all 7 effects implemented.
// Session 27 FX upgrade (sub-phase A onwards) — moving DSP-heavy effects
// onto AudioWorklet processors for quality. Tracked per effect:
//   - REVERB     — to be upgraded (FDN worklet)            [sub-phase B]
//   - DELAY      — to be upgraded (tape sat + ping-pong)   [sub-phase C]
//   - EQ         — unchanged (Biquad chain is fine)
//   - FLANGER    — to be upgraded (Hermite worklet)        [sub-phase B]
//   - CHORUS     — to be upgraded (multi-voice worklet)    [sub-phase B]
//   - BITCRUSHER — UPGRADED to AudioWorklet                [sub-phase A]
//   - COMPRESSOR — explicitly unchanged (Marek decision)
//   - PHASER     — NEW, AudioWorklet                       [sub-phase C]
//
// Routing rules (per MPC5000):
//   - DIRECT ON  (default) = SEND mode: voice dry + voice × sendLevel through bus
//   - DIRECT OFF           = INSERT mode: voice fully through bus, no dry
//   - bypass=true treats the bus as passthrough (input → output, no effect node)
//   - effect=null also treats the bus as passthrough
//
// Per-voice routing is fixed at voice creation; live FX param changes affect
// already-playing voices (because the bus effect node is shared across voices),
// but direct/sendLevel changes only affect future voices.

import { ensureWorklet, isWorkletLoaded } from "./worklets/registry";

// AudioWorklet processor sources live in `public/worklets/`. Vite copies the
// public/ tree to dist root unmodified — files keep their literal paths so
// `audioWorklet.addModule(<absolute URL>)` works in dev, build, and Tauri
// (which serves dist/ as the webview root). `?url` import in src/ would
// inline small files as data URLs which the worklet API can't load.
const bitcrusherWorkletUrl = "/worklets/bitcrusher.worklet.js";
const fdnReverbWorkletUrl = "/worklets/fdn-reverb.worklet.js";
const hermiteFlangerWorkletUrl = "/worklets/hermite-flanger.worklet.js";
const multiChorusWorkletUrl = "/worklets/multi-chorus.worklet.js";
const phaserWorkletUrl = "/worklets/phaser.worklet.js";

export type BusId = 1 | 2 | 3 | 4;

export type EffectType =
  | "REVERB"
  | "DELAY"
  | "EQ"
  | "FLANGER"
  | "CHORUS"
  | "BITCRUSHER"
  | "COMPRESSOR"
  | "PHASER";

export type EffectParamMap = Record<string, number>;

// Default parameter sets per effect (used for state init + reset on effect change).
// Param values are in MPC-style 0..100 unless physical units are required (Hz, ms, dB, ratio).
export const EFFECT_DEFAULTS: Record<EffectType, EffectParamMap> = {
  REVERB: {
    size: 70,        // 0..100  → FDN delay-line length scale
    damping: 50,     // 0..100  → per-line one-pole LP cutoff aggressiveness
    diffusion: 70,   // 0..100  → 4-stage allpass coefficient (smooths early refs)
    wetDry: 100,     // 0..100  → dry/wet crossfade
    preDelay: 20,    // 0..200 ms
    hpCut: 100,      // 20..2000 Hz HP on wet path
    lpCut: 8000,     // 2000..20000 Hz LP on wet path
  },
  DELAY: {
    timeMs: 250,     // 1..2000 ms (used in FREE mode)
    sync: 0,         // 0 = FREE; 1..6 = musical divisions (UI enum)
    mode: 0,         // 0 = MONO, 1 = STEREO, 2 = PING-PONG
    feedback: 30,    // 0..95
    wetDry: 30,      // 0..100
    tone: 8000,      // 200..20000 Hz LP cutoff inside feedback loop (tape voice)
    drive: 0,        // 0..100  → tanh-saturation in feedback loop
    hpCut: 100,      // legacy, kept for back-compat with old saves
    lpCut: 8000,     // legacy, equivalent to `tone` post-migration
  },
  EQ: {
    lowFreq: 100, lowGain: 0, lowQ: 0.7,
    lowMidFreq: 400, lowMidGain: 0, lowMidQ: 1,
    highMidFreq: 2000, highMidGain: 0, highMidQ: 1,
    highFreq: 8000, highGain: 0, highQ: 0.7,
  },
  FLANGER: {
    rate: 0.5,       // Hz
    depth: 50,       // 0..100
    feedback: 30,    // -95..95 (signed; UI shows 0..95 + invert toggle? for now positive only)
    manual: 25,      // 0..100 → center delay 0.5..20 ms
    wetDry: 50,
  },
  CHORUS: {
    rate: 1,         // Hz
    depth: 30,       // 0..100
    voices: 4,       // 2 / 3 / 4 (UI enum)
    width: 50,       // 0..100 → stereo spread
    mix: 50,         // 0..100
  },
  BITCRUSHER: {
    // Musical UI / precise internal:
    //   bits      — quantizer precision (1..16)
    //   srReduce  — division of context sample rate (UI enum 1, 2, 4, 8, 16,
    //               32, 64). Worklet receives ctx.sampleRate / srReduce as
    //               its sampleRateHz AudioParam. SP-1200 was exactly 26040
    //               Hz; with division math at 48 kHz the closest is 1/2
    //               (24 kHz). Acceptable tradeoff for rate-agnostic UI.
    //   drive     — 0..100 % gain into the quantizer (extra grit)
    //   wetDry    — 0..100 % crossfade
    bits: 12,
    srReduce: 4,
    drive: 0,
    wetDry: 100,
  },
  COMPRESSOR: {
    threshold: -20,  // dB
    ratio: 4,
    attack: 5,       // ms
    release: 50,     // ms
    makeupGain: 0,   // dB
  },
  PHASER: {
    rate: 0.5,       // Hz
    depth: 70,       // 0..100 → sweep range scale
    stages: 6,       // 2 / 4 / 6 / 8 (UI enum)
    feedback: 30,    // 0..95
    wetDry: 50,
  },
};

// Default master EQ + Compressor — flat / bypassed.
export const MASTER_EQ_DEFAULTS: EffectParamMap = {
  lowFreq: 100, lowGain: 0, lowQ: 0.7,
  lowMidFreq: 400, lowMidGain: 0, lowMidQ: 1,
  highMidFreq: 2000, highMidGain: 0, highMidQ: 1,
  highFreq: 8000, highGain: 0, highQ: 0.7,
};

export const MASTER_COMP_DEFAULTS: EffectParamMap = {
  threshold: -12,
  ratio: 2,
  attack: 10,
  release: 80,
  makeupGain: 0,
};

export type VoiceFxRouting = {
  busId: 0 | BusId;       // 0 = no FX bus (dry only)
  sendLevel: number;      // 0..100; ignored when bus is INSERT mode
  direct: boolean;        // copy of bus.direct at voice-create time (true = SEND, false = INSERT)
};

export type BusBlockId = "A" | "B";
export type ChainPair = "FX1_FX2" | "FX3_FX4";

type BlockNodes = {
  effect: EffectChain | null;
  effectType: EffectType | null;
  bypass: boolean;
};

type BusNodes = {
  input: GainNode;
  mid: GainNode;     // bridges blockA → blockB
  output: GainNode;
  blockA: BlockNodes;
  blockB: BlockNodes;
};

type EffectChain = {
  input: AudioNode;
  output: AudioNode;
  setParam: (key: string, value: number) => void;
  dispose: () => void;
};

export class FxEngine {
  private context: BaseAudioContext | null = null;
  private masterInput: GainNode | null = null;
  private masterEqNodes: BiquadFilterNode[] = [];
  private masterEqBypass = true;
  private masterCompNode: DynamicsCompressorNode | null = null;
  private masterMakeupGain: GainNode | null = null;
  private masterCompBypass = true;
  // Bypass-safe input/output of the master EQ section, so we can reroute when bypass toggles.
  private masterEqInput: GainNode | null = null;
  private masterEqOutput: GainNode | null = null;
  private masterCompInput: GainNode | null = null;
  private masterCompOutput: GainNode | null = null;
  private buses: Map<BusId, BusNodes> = new Map();
  // Track current chain routing so we can reroute bus.output without churning state.
  private chainFX1ToFX2 = false;
  private chainFX3ToFX4 = false;

  /** Initialize FX graph on a given context. Idempotent. Returns the master entry node where voices connect their dry path. */
  ensureReady(context: BaseAudioContext): GainNode {
    if (this.context && this.context === context && this.masterInput) {
      return this.masterInput;
    }
    this.context = context;
    this.buildMasterChain();
    this.buildBusSlots();
    return this.masterInput!;
  }

  /**
   * Preload AudioWorklet processors onto the given context. Must be awaited
   * before any worklet-backed effect is constructed on this context.
   * Callers: samplerEngine at boot, configureOfflineFxFromState at WAV render.
   * Idempotent — already-loaded worklets are skipped via the registry.
   */
  async preloadWorklets(context: BaseAudioContext): Promise<void> {
    await Promise.all([
      ensureWorklet(context, "bitcrusher-processor", bitcrusherWorkletUrl),
      ensureWorklet(context, "fdn-reverb-processor", fdnReverbWorkletUrl),
      ensureWorklet(context, "hermite-flanger-processor", hermiteFlangerWorkletUrl),
      ensureWorklet(context, "multi-chorus-processor", multiChorusWorkletUrl),
      ensureWorklet(context, "phaser-processor", phaserWorkletUrl),
    ]);
  }

  private buildMasterChain() {
    if (!this.context) return;
    const ctx = this.context;
    // Chain: masterInput → masterEqInput → [4 biquads, OR bypass passthrough] → masterEqOutput
    //                                    → masterCompInput → [compressor OR bypass passthrough] → masterCompOutput
    // Note: masterCompOutput is NOT auto-connected to destination here. samplerEngine wires it
    // through its own masterGain (volume control) → AudioContext.destination.
    this.masterInput = ctx.createGain();
    this.masterEqInput = ctx.createGain();
    this.masterEqOutput = ctx.createGain();
    this.masterCompInput = ctx.createGain();
    this.masterCompOutput = ctx.createGain();
    this.masterInput.connect(this.masterEqInput);
    this.masterEqOutput.connect(this.masterCompInput);

    // Build 4 EQ filters; defaults flat. They're created but only wired when bypass is off.
    this.masterEqNodes = [
      this.makeBand(ctx, "lowshelf", MASTER_EQ_DEFAULTS.lowFreq, MASTER_EQ_DEFAULTS.lowGain, MASTER_EQ_DEFAULTS.lowQ),
      this.makeBand(ctx, "peaking", MASTER_EQ_DEFAULTS.lowMidFreq, MASTER_EQ_DEFAULTS.lowMidGain, MASTER_EQ_DEFAULTS.lowMidQ),
      this.makeBand(ctx, "peaking", MASTER_EQ_DEFAULTS.highMidFreq, MASTER_EQ_DEFAULTS.highMidGain, MASTER_EQ_DEFAULTS.highMidQ),
      this.makeBand(ctx, "highshelf", MASTER_EQ_DEFAULTS.highFreq, MASTER_EQ_DEFAULTS.highGain, MASTER_EQ_DEFAULTS.highQ),
    ];

    this.masterCompNode = ctx.createDynamicsCompressor();
    this.masterCompNode.threshold.value = MASTER_COMP_DEFAULTS.threshold;
    this.masterCompNode.ratio.value = MASTER_COMP_DEFAULTS.ratio;
    this.masterCompNode.attack.value = MASTER_COMP_DEFAULTS.attack / 1000;
    this.masterCompNode.release.value = MASTER_COMP_DEFAULTS.release / 1000;
    // Makeup gain stage after the compressor. Phase 1 range: 0..+24 dB (positive-only).
    // dB-to-linear: gain = 10^(dB/20). 0 dB → 1.0 (unity); +6 dB → ~2.0; +24 dB → ~15.85.
    this.masterMakeupGain = ctx.createGain();
    this.masterMakeupGain.gain.value = Math.pow(10, (MASTER_COMP_DEFAULTS.makeupGain ?? 0) / 20);

    // Default state: both bypassed → straight passthrough.
    this.rewireMasterEq();
    this.rewireMasterComp();
  }

  private buildBusSlots() {
    if (!this.context || !this.masterInput) return;
    const ctx = this.context;
    ([1, 2, 3, 4] as BusId[]).forEach((id) => {
      const input = ctx.createGain();
      const mid = ctx.createGain();
      const output = ctx.createGain();
      // Initial routing: input → mid → output (both blocks passthrough), output → master.
      input.connect(mid);
      mid.connect(output);
      output.connect(this.masterInput!);
      this.buses.set(id, {
        input,
        mid,
        output,
        blockA: { effect: null, effectType: null, bypass: false },
        blockB: { effect: null, effectType: null, bypass: false },
      });
    });
  }

  private makeBand(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, gainDb: number, q: number): BiquadFilterNode {
    const node = ctx.createBiquadFilter();
    node.type = type;
    node.frequency.value = freq;
    node.gain.value = gainDb;
    node.Q.value = q;
    return node;
  }

  /** Returns the entry node where a voice's dry path should connect. */
  getMasterInput(): GainNode | null {
    return this.masterInput;
  }

  /** Returns the final node of the FX master chain (post-Comp). samplerEngine bridges this to its volume gain. */
  getMasterOutput(): GainNode | null {
    return this.masterCompOutput;
  }

  /** Returns the input node of a bus (where a voice's wet send connects). */
  getBusInput(busId: BusId): GainNode | null {
    return this.buses.get(busId)?.input ?? null;
  }

  /**
   * Sets (or clears) the effect on a specific block of a bus. Rebuilds the bus routing afterward.
   * Pass type=null to clear the block (passthrough). Pass params=null to use EFFECT_DEFAULTS.
   */
  setBusBlockEffect(busId: BusId, block: BusBlockId, type: EffectType | null, params: EffectParamMap | null) {
    const bus = this.buses.get(busId);
    if (!bus || !this.context) return;
    const blockNodes = block === "A" ? bus.blockA : bus.blockB;
    // Tear down existing effect chain for this block (if any).
    if (blockNodes.effect) {
      try { blockNodes.effect.input.disconnect(); } catch { /* noop */ }
      try { blockNodes.effect.output.disconnect(); } catch { /* noop */ }
      blockNodes.effect.dispose();
      blockNodes.effect = null;
    }
    blockNodes.effectType = type;
    if (type !== null) {
      const chain = this.createEffectChain(type, params ?? EFFECT_DEFAULTS[type]);
      blockNodes.effect = chain ?? null;
    }
    // Rewire entire bus path; block bypass + presence determines routing.
    this.rewireBus(busId);
  }

  setBusBlockBypass(busId: BusId, block: BusBlockId, bypass: boolean) {
    const bus = this.buses.get(busId);
    if (!bus) return;
    const blockNodes = block === "A" ? bus.blockA : bus.blockB;
    blockNodes.bypass = bypass;
    this.rewireBus(busId);
  }

  setBusBlockParam(busId: BusId, block: BusBlockId, key: string, value: number) {
    const bus = this.buses.get(busId);
    if (!bus) return;
    const blockNodes = block === "A" ? bus.blockA : bus.blockB;
    if (!blockNodes.effect) return;
    blockNodes.effect.setParam(key, value);
  }

  /**
   * Rebuilds the bus's internal routing: input → (blockA effect or passthrough) → mid → (blockB effect or passthrough) → output.
   * Block participates if it has an effect AND is not bypassed. Otherwise the bus passes audio through that block stage.
   */
  private rewireBus(busId: BusId) {
    const bus = this.buses.get(busId);
    if (!bus) return;
    try { bus.input.disconnect(); } catch { /* noop */ }
    try { bus.mid.disconnect(); } catch { /* noop */ }
    if (bus.blockA.effect) {
      try { bus.blockA.effect.output.disconnect(); } catch { /* noop */ }
    }
    if (bus.blockB.effect) {
      try { bus.blockB.effect.output.disconnect(); } catch { /* noop */ }
    }
    // Stage A: input → blockA effect → mid (if active), else input → mid.
    if (bus.blockA.effect && !bus.blockA.bypass) {
      bus.input.connect(bus.blockA.effect.input);
      bus.blockA.effect.output.connect(bus.mid);
    } else {
      bus.input.connect(bus.mid);
    }
    // Stage B: mid → blockB effect → output (if active), else mid → output.
    if (bus.blockB.effect && !bus.blockB.bypass) {
      bus.mid.connect(bus.blockB.effect.input);
      bus.blockB.effect.output.connect(bus.output);
    } else {
      bus.mid.connect(bus.output);
    }
    // bus.output remains connected to its chain target (master or downstream bus); rewireBus does NOT touch that.
  }

  /**
   * Toggles bus chaining. When enabled, the upstream bus's output routes into the downstream bus's input
   * (FX1→FX2 or FX3→FX4) instead of directly to master. Per-pad sends to the downstream bus still work
   * (the downstream bus.input receives both the upstream chain and per-pad sendGain connections).
   */
  setFxChain(pair: ChainPair, enabled: boolean) {
    if (!this.masterInput) return;
    if (pair === "FX1_FX2") {
      this.chainFX1ToFX2 = enabled;
      this.rerouteBusOutput(1);
    } else {
      this.chainFX3ToFX4 = enabled;
      this.rerouteBusOutput(3);
    }
  }

  private rerouteBusOutput(busId: BusId) {
    if (!this.masterInput) return;
    const bus = this.buses.get(busId);
    if (!bus) return;
    try { bus.output.disconnect(); } catch { /* noop */ }
    const isChained = (busId === 1 && this.chainFX1ToFX2) || (busId === 3 && this.chainFX3ToFX4);
    if (isChained) {
      const downstream = this.buses.get((busId + 1) as BusId);
      if (downstream) {
        bus.output.connect(downstream.input);
      } else {
        bus.output.connect(this.masterInput);
      }
    } else {
      bus.output.connect(this.masterInput);
    }
  }

  setMasterEqBypass(bypass: boolean) {
    this.masterEqBypass = bypass;
    this.rewireMasterEq();
  }

  setMasterEqBand(bandIndex: 0 | 1 | 2 | 3, key: "freq" | "gain" | "q", value: number) {
    const node = this.masterEqNodes[bandIndex];
    if (!node) return;
    if (key === "freq") node.frequency.value = Math.max(20, Math.min(20000, value));
    else if (key === "gain") node.gain.value = Math.max(-24, Math.min(24, value));
    else if (key === "q") node.Q.value = Math.max(0.1, Math.min(10, value));
  }

  setMasterCompBypass(bypass: boolean) {
    this.masterCompBypass = bypass;
    this.rewireMasterComp();
  }

  setMasterCompParam(key: string, value: number) {
    if (!this.masterCompNode) return;
    switch (key) {
      case "threshold": this.masterCompNode.threshold.value = Math.max(-60, Math.min(0, value)); break;
      case "ratio": this.masterCompNode.ratio.value = Math.max(1, Math.min(20, value)); break;
      case "attack": this.masterCompNode.attack.value = Math.max(0, Math.min(1, value / 1000)); break;
      case "release": this.masterCompNode.release.value = Math.max(0.001, Math.min(1, value / 1000)); break;
      case "makeupGain": {
        if (!this.masterMakeupGain) break;
        // Clamp 0..+24 dB (positive-only makeup). dB-to-linear conversion.
        const db = Math.max(0, Math.min(24, value));
        this.masterMakeupGain.gain.value = Math.pow(10, db / 20);
        break;
      }
      default: break;
    }
  }

  private rewireMasterEq() {
    if (!this.masterEqInput || !this.masterEqOutput) return;
    try { this.masterEqInput.disconnect(); } catch { /* noop */ }
    this.masterEqNodes.forEach((n) => { try { n.disconnect(); } catch { /* noop */ } });
    if (this.masterEqBypass) {
      this.masterEqInput.connect(this.masterEqOutput);
    } else {
      // Chain: input → b0 → b1 → b2 → b3 → output
      let prev: AudioNode = this.masterEqInput;
      this.masterEqNodes.forEach((node) => {
        prev.connect(node);
        prev = node;
      });
      prev.connect(this.masterEqOutput);
    }
  }

  private rewireMasterComp() {
    if (!this.masterCompInput || !this.masterCompOutput || !this.masterCompNode || !this.masterMakeupGain) return;
    try { this.masterCompInput.disconnect(); } catch { /* noop */ }
    try { this.masterCompNode.disconnect(); } catch { /* noop */ }
    try { this.masterMakeupGain.disconnect(); } catch { /* noop */ }
    if (this.masterCompBypass) {
      // Bypass disables the entire master Comp section (compression AND makeup gain).
      // User expectation: bypass = signal exits the section identical to entry.
      this.masterCompInput.connect(this.masterCompOutput);
    } else {
      // Chain: input → compressor → makeupGain → output
      this.masterCompInput.connect(this.masterCompNode);
      this.masterCompNode.connect(this.masterMakeupGain);
      this.masterMakeupGain.connect(this.masterCompOutput);
    }
  }

  /**
   * Connect a voice's pre-master output (e.g. its pan node) to the FX graph.
   * Returns when the routing is fully wired; voice's pan still also needs to connect dry.
   *
   * Behavior:
   *   - busId=0 or no routing: caller is responsible for connecting voice→master directly.
   *     (This method connects nothing in that case.)
   *   - SEND mode (direct=true): connects voice → sendGain(sendLevel/100) → bus.input,
   *     AND connects voice → dryGain(1) → master directly.
   *   - INSERT mode (direct=false): connects voice → bus.input only (dry path muted).
   *
   * Caller (samplerEngine) reads the return value to know whether it still needs to connect dry.
   */
  routeVoice(voiceOutput: AudioNode, routing: VoiceFxRouting | undefined): { dryConnected: boolean } {
    if (!this.context || !this.masterInput) return { dryConnected: false };

    if (!routing || routing.busId === 0) {
      return { dryConnected: false };
    }
    const bus = this.buses.get(routing.busId);
    if (!bus) return { dryConnected: false };

    if (routing.direct) {
      // SEND mode — both dry and wet paths.
      const sendGain = this.context.createGain();
      sendGain.gain.value = Math.max(0, Math.min(1, routing.sendLevel / 100));
      voiceOutput.connect(sendGain);
      sendGain.connect(bus.input);
      // Dry path also goes to master directly. We return false so caller wires dry.
      return { dryConnected: false };
    } else {
      // INSERT mode — only bus path, no dry.
      voiceOutput.connect(bus.input);
      return { dryConnected: true }; // Mark dry as "consumed" — caller does NOT connect dry path.
    }
  }

  // ====================================================================
  // Effect chain factory
  // ====================================================================

  private createEffectChain(type: EffectType, params: EffectParamMap): EffectChain | null {
    if (!this.context) return null;
    switch (type) {
      case "REVERB": return this.createReverbChain(params);
      case "DELAY": return this.createDelayChain(params);
      case "EQ": return this.createEqChain(params);
      case "FLANGER": return this.createFlangerChain(params);
      case "CHORUS": return this.createChorusChain(params);
      case "BITCRUSHER": return this.createBitCrusherChain(params);
      case "COMPRESSOR": return this.createCompressorChain(params);
      case "PHASER": return this.createPhaserChain(params);
      default: return null;
    }
  }

  // ----- Reverb (FDN — Feedback Delay Network worklet) -----
  // Replaced ConvolverNode + synthesised IR with the fdn-reverb-processor
  // worklet (8 delay lines, Hadamard 8×8 feedback, per-line damping, 4-stage
  // allpass diffusion). All real-time controllable — ROOM SIZE scales delay
  // lengths, DAMPING moves per-line LP cutoffs, DIFFUSION scales the allpass
  // coefficient.
  //
  // Signal flow:
  //   input → dryGain ─────────────────────────────────────────────→ output
  //         └→ preDelay → HP → LP → fdnNode → wetGain ──────────────→ output
  //
  // Pre-delay + HP + LP stay as outboard WebAudio nodes (no reason to move
  // them inside the worklet — BiquadFilter and DelayNode are professional-
  // grade as-is).
  private createReverbChain(initial: EffectParamMap): EffectChain | null {
    const ctx = this.context;
    if (!ctx) return null;
    if (!isWorkletLoaded(ctx, "fdn-reverb-processor")) {
      console.warn("[fxEngine] fdn-reverb-processor not loaded; passthrough");
      return passthroughChain(ctx);
    }

    const input = ctx.createGain();
    const output = ctx.createGain();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const preDelay = ctx.createDelay(1);
    const hp = ctx.createBiquadFilter();
    const lp = ctx.createBiquadFilter();
    hp.type = "highpass";
    lp.type = "lowpass";

    const node = new AudioWorkletNode(ctx, "fdn-reverb-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    const roomSizeParam = node.parameters.get("roomSize");
    const dampingParam = node.parameters.get("damping");
    const diffusionParam = node.parameters.get("diffusion");

    const apply = (p: EffectParamMap) => {
      preDelay.delayTime.value = Math.max(0, Math.min(1, (p.preDelay ?? 20) / 1000));
      hp.frequency.value = Math.max(20, Math.min(20000, p.hpCut ?? 100));
      lp.frequency.value = Math.max(20, Math.min(20000, p.lpCut ?? 8000));
      if (roomSizeParam) roomSizeParam.value = Math.max(0, Math.min(1, (p.size ?? 70) / 100));
      if (dampingParam) dampingParam.value = Math.max(0, Math.min(1, (p.damping ?? 50) / 100));
      if (diffusionParam) diffusionParam.value = Math.max(0, Math.min(1, (p.diffusion ?? 70) / 100));
      const wet = Math.max(0, Math.min(1, (p.wetDry ?? 100) / 100));
      wetGain.gain.value = wet;
      dryGain.gain.value = 1 - wet;
    };
    apply(initial);

    input.connect(dryGain).connect(output);
    input.connect(preDelay).connect(hp).connect(lp).connect(node).connect(wetGain).connect(output);

    return {
      input,
      output,
      setParam: (key, value) => {
        switch (key) {
          case "size":
            if (roomSizeParam) roomSizeParam.value = Math.max(0, Math.min(1, value / 100));
            initial.size = value;
            break;
          case "damping":
            if (dampingParam) dampingParam.value = Math.max(0, Math.min(1, value / 100));
            initial.damping = value;
            break;
          case "diffusion":
            if (diffusionParam) diffusionParam.value = Math.max(0, Math.min(1, value / 100));
            initial.diffusion = value;
            break;
          case "preDelay":
            preDelay.delayTime.value = Math.max(0, Math.min(1, value / 1000));
            initial.preDelay = value;
            break;
          case "hpCut":
            hp.frequency.value = Math.max(20, Math.min(20000, value));
            initial.hpCut = value;
            break;
          case "lpCut":
            lp.frequency.value = Math.max(20, Math.min(20000, value));
            initial.lpCut = value;
            break;
          case "wetDry": {
            const wet = Math.max(0, Math.min(1, value / 100));
            wetGain.gain.value = wet;
            dryGain.gain.value = 1 - wet;
            initial.wetDry = value;
            break;
          }
          default: break;
        }
      },
      dispose: () => {
        [input, output, dryGain, wetGain, preDelay, hp, lp, node].forEach((n) => {
          try { (n as AudioNode).disconnect(); } catch { /* noop */ }
        });
      },
    };
  }

  // ----- Delay (tape voice + ping-pong + tempo sync) -----
  // Pure WebAudio — DelayNode + WaveShaper (tanh saturation) + BiquadFilter
  // (LP "tone") inside the feedback loop give the tape/BBD repeat character.
  // PING-PONG uses two delay lines panned hard L/R with cross-feedback.
  //
  // Topology (MONO / STEREO):
  //   input → HP → delayMain → wetGain → output
  //                   ↓
  //                 saturate → tone → feedbackGain ─→ back into delayMain
  //
  // Topology (PING-PONG):
  //   inputL → delayL → panL → wetGain
  //   delayL.out → saturate → tone → fbGain → delayR
  //   inputR → delayR → panR → wetGain
  //   delayR.out → saturate → tone → fbGain → delayL
  //   (Cross-feedback creates the L→R→L bouncing repeats.)
  //
  // SYNC enum:
  //   0 = FREE (uses timeMs verbatim)
  //   1 = 1/4, 2 = 1/8, 3 = 1/8T, 4 = 1/16, 5 = 1/16T, 6 = 1/32
  // Live BPM tracking is NOT implemented in this pass — SYNC reads BPM via
  // a static getter passed from the store on setParam("sync", ...). Tempo
  // changes do not auto-update active delays. User re-selects SYNC after
  // BPM change. Documented in SESSION_LOG.
  //
  // DRIVE: 0..100% scales the WaveShaper input level. The tanh curve does
  // the saturation; cranking drive pushes deeper into compression/softer
  // clip, perfect for tape-style "darkening" repeats.
  private createDelayChain(initial: EffectParamMap): EffectChain | null {
    const ctx = this.context;
    if (!ctx) return null;

    const input = ctx.createGain();
    const output = ctx.createGain();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";

    // Two delay lines — used together for PING-PONG, only `delayMain` in
    // MONO/STEREO. delayR built lazy semantics: always created, just wired
    // differently per mode.
    const delayMain = ctx.createDelay(2.5);
    const delayR = ctx.createDelay(2.5);
    const fbMain = ctx.createGain();
    const fbR = ctx.createGain();
    const satMain = ctx.createWaveShaper();
    const satR = ctx.createWaveShaper();
    const toneMain = ctx.createBiquadFilter();
    const toneR = ctx.createBiquadFilter();
    toneMain.type = "lowpass";
    toneR.type = "lowpass";
    const panL = ctx.createStereoPanner();
    const panR = ctx.createStereoPanner();
    panL.pan.value = -1;
    panR.pan.value = +1;

    const driveInput = ctx.createGain();
    const driveInputR = ctx.createGain();

    // tanh saturation curve. Steeper curve = more clipping. Drive scales
    // input, so the curve itself stays constant; we adjust driveInput gain.
    const buildTanhCurve = () => {
      const n = 4096;
      const curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = Math.tanh(x * 1.5);
      }
      return curve;
    };
    satMain.curve = buildTanhCurve();
    satR.curve = buildTanhCurve();

    // Track current mode so rewiring can clear correctly.
    let currentMode = -1;
    let currentBpm = 120;

    const computeDelaySeconds = (timeMsValue: number, syncDiv: number): number => {
      if (syncDiv <= 0) return Math.max(0.001, Math.min(2.5, timeMsValue / 1000));
      // Sync divisions (beat = quarter note at currentBpm):
      const beatSec = 60 / Math.max(20, currentBpm);
      const map: Record<number, number> = {
        1: beatSec,                // 1/4
        2: beatSec / 2,            // 1/8
        3: (beatSec * 2) / 3,      // 1/8T
        4: beatSec / 4,            // 1/16
        5: beatSec / 3,            // 1/16T
        6: beatSec / 8,            // 1/32
      };
      return Math.max(0.001, Math.min(2.5, map[syncDiv] ?? beatSec / 2));
    };

    const rewireMode = (mode: number) => {
      if (currentMode === mode) return;
      // Disconnect all routing nodes so we can rebuild fresh.
      [input, hp, delayMain, delayR, fbMain, fbR, satMain, satR, toneMain, toneR, panL, panR, driveInput, driveInputR, dryGain, wetGain]
        .forEach((n) => { try { (n as AudioNode).disconnect(); } catch { /* noop */ } });

      // Dry always goes through.
      input.connect(dryGain).connect(output);

      if (mode === 2) {
        // PING-PONG: cross-feedback between L and R delay lines.
        input.connect(hp);
        hp.connect(delayMain);
        hp.connect(delayR);
        // L tap: delayMain → panL
        delayMain.connect(panL).connect(wetGain);
        // R tap: delayR → panR
        delayR.connect(panR).connect(wetGain);
        // Feedback paths cross-feed.
        delayMain.connect(driveInput).connect(satMain).connect(toneMain).connect(fbMain).connect(delayR);
        delayR.connect(driveInputR).connect(satR).connect(toneR).connect(fbR).connect(delayMain);
      } else if (mode === 1) {
        // STEREO: two parallel delays, NO cross-feedback.
        input.connect(hp);
        hp.connect(delayMain);
        hp.connect(delayR);
        delayMain.connect(panL).connect(wetGain);
        delayR.connect(panR).connect(wetGain);
        delayMain.connect(driveInput).connect(satMain).connect(toneMain).connect(fbMain).connect(delayMain);
        delayR.connect(driveInputR).connect(satR).connect(toneR).connect(fbR).connect(delayR);
      } else {
        // MONO (default).
        input.connect(hp).connect(delayMain).connect(wetGain);
        delayMain.connect(driveInput).connect(satMain).connect(toneMain).connect(fbMain).connect(delayMain);
      }
      wetGain.connect(output);
      currentMode = mode;
    };

    const apply = (p: EffectParamMap) => {
      const mode = Math.max(0, Math.min(2, Math.floor(p.mode ?? 0)));
      rewireMode(mode);

      const syncDiv = Math.max(0, Math.floor(p.sync ?? 0));
      const seconds = computeDelaySeconds(p.timeMs ?? 250, syncDiv);
      delayMain.delayTime.value = seconds;
      delayR.delayTime.value = mode === 2 ? seconds : seconds * 0.66;

      const fb = Math.max(0, Math.min(0.95, (p.feedback ?? 30) / 100));
      fbMain.gain.value = fb;
      fbR.gain.value = fb;

      const wet = Math.max(0, Math.min(1, (p.wetDry ?? 30) / 100));
      wetGain.gain.value = wet;
      dryGain.gain.value = 1 - wet;

      hp.frequency.value = Math.max(20, Math.min(20000, p.hpCut ?? 100));
      // `tone` is the new param name; old `lpCut` saves map onto it.
      const toneCut = p.tone ?? p.lpCut ?? 8000;
      toneMain.frequency.value = Math.max(20, Math.min(20000, toneCut));
      toneR.frequency.value = Math.max(20, Math.min(20000, toneCut));

      // DRIVE: 0..100 → input gain into tanh shaper. 0 ≈ unity (clean),
      // 100 ≈ +12 dB so the shaper actually saturates audibly.
      const driveGain = 1 + (p.drive ?? 0) / 100 * 3;
      driveInput.gain.value = driveGain;
      driveInputR.gain.value = driveGain;
    };
    apply(initial);

    return {
      input,
      output,
      setParam: (key, value) => {
        switch (key) {
          case "timeMs": {
            initial.timeMs = value;
            const sec = computeDelaySeconds(value, Math.floor(initial.sync ?? 0));
            delayMain.delayTime.value = sec;
            delayR.delayTime.value = currentMode === 2 ? sec : sec * 0.66;
            break;
          }
          case "sync": {
            initial.sync = value;
            const sec = computeDelaySeconds(initial.timeMs ?? 250, Math.floor(value));
            delayMain.delayTime.value = sec;
            delayR.delayTime.value = currentMode === 2 ? sec : sec * 0.66;
            break;
          }
          case "mode": {
            initial.mode = value;
            rewireMode(Math.max(0, Math.min(2, Math.floor(value))));
            const sec = computeDelaySeconds(initial.timeMs ?? 250, Math.floor(initial.sync ?? 0));
            delayMain.delayTime.value = sec;
            delayR.delayTime.value = currentMode === 2 ? sec : sec * 0.66;
            break;
          }
          case "feedback": {
            const fb = Math.max(0, Math.min(0.95, value / 100));
            fbMain.gain.value = fb;
            fbR.gain.value = fb;
            initial.feedback = value;
            break;
          }
          case "wetDry": {
            const w = Math.max(0, Math.min(1, value / 100));
            wetGain.gain.value = w;
            dryGain.gain.value = 1 - w;
            initial.wetDry = value;
            break;
          }
          case "hpCut":
            hp.frequency.value = Math.max(20, Math.min(20000, value));
            initial.hpCut = value;
            break;
          case "tone":
          case "lpCut": {
            const cut = Math.max(20, Math.min(20000, value));
            toneMain.frequency.value = cut;
            toneR.frequency.value = cut;
            initial.tone = value;
            initial.lpCut = value;
            break;
          }
          case "drive": {
            const dg = 1 + value / 100 * 3;
            driveInput.gain.value = dg;
            driveInputR.gain.value = dg;
            initial.drive = value;
            break;
          }
          case "bpm":
            // Module-level call from store.setBpm walks active delays and
            // pokes this so SYNC mode delays auto-update on BPM change.
            // Not currently wired (no walker yet); accept the param for
            // forward compat. Recompute time using new BPM.
            currentBpm = value;
            if ((initial.sync ?? 0) > 0) {
              const sec = computeDelaySeconds(initial.timeMs ?? 250, Math.floor(initial.sync ?? 0));
              delayMain.delayTime.value = sec;
              delayR.delayTime.value = currentMode === 2 ? sec : sec * 0.66;
            }
            break;
          default: break;
        }
      },
      dispose: () => {
        [input, output, dryGain, wetGain, hp, delayMain, delayR, fbMain, fbR, satMain, satR, toneMain, toneR, panL, panR, driveInput, driveInputR]
          .forEach((n) => { try { (n as AudioNode).disconnect(); } catch { /* noop */ } });
      },
    };
  }

  // ----- 4-band parametric EQ (bus effect, distinct from master EQ instance) -----
  private createEqChain(initial: EffectParamMap): EffectChain | null {
    const ctx = this.context;
    if (!ctx) return null;
    const input = ctx.createGain();
    const output = ctx.createGain();
    const low = this.makeBand(ctx, "lowshelf", initial.lowFreq ?? 100, initial.lowGain ?? 0, initial.lowQ ?? 0.7);
    const lowMid = this.makeBand(ctx, "peaking", initial.lowMidFreq ?? 400, initial.lowMidGain ?? 0, initial.lowMidQ ?? 1);
    const highMid = this.makeBand(ctx, "peaking", initial.highMidFreq ?? 2000, initial.highMidGain ?? 0, initial.highMidQ ?? 1);
    const high = this.makeBand(ctx, "highshelf", initial.highFreq ?? 8000, initial.highGain ?? 0, initial.highQ ?? 0.7);
    input.connect(low).connect(lowMid).connect(highMid).connect(high).connect(output);

    const bands: Record<string, BiquadFilterNode> = {
      lowFreq: low, lowGain: low, lowQ: low,
      lowMidFreq: lowMid, lowMidGain: lowMid, lowMidQ: lowMid,
      highMidFreq: highMid, highMidGain: highMid, highMidQ: highMid,
      highFreq: high, highGain: high, highQ: high,
    };

    return {
      input,
      output,
      setParam: (key, value) => {
        const node = bands[key];
        if (!node) return;
        if (key.endsWith("Freq")) node.frequency.value = Math.max(20, Math.min(20000, value));
        else if (key.endsWith("Gain")) node.gain.value = Math.max(-24, Math.min(24, value));
        else if (key.endsWith("Q")) node.Q.value = Math.max(0.1, Math.min(10, value));
        initial[key] = value;
      },
      dispose: () => {
        [input, output, low, lowMid, highMid, high].forEach((n) => {
          try { n.disconnect(); } catch { /* noop */ }
        });
      },
    };
  }

  // ----- Flanger (Hermite-interpolated worklet) -----
  // Modulated delay with fractional readout via 4-point cubic Hermite
  // interpolation. The naive WebAudio DelayNode + LFO approach sounds
  // metallic because its underlying interpolation is linear — Hermite
  // smooths the spectrum across the modulation sweep.
  private createFlangerChain(initial: EffectParamMap): EffectChain | null {
    const ctx = this.context;
    if (!ctx) return null;
    if (!isWorkletLoaded(ctx, "hermite-flanger-processor")) {
      console.warn("[fxEngine] hermite-flanger-processor not loaded; passthrough");
      return passthroughChain(ctx);
    }

    const input = ctx.createGain();
    const output = ctx.createGain();
    const node = new AudioWorkletNode(ctx, "hermite-flanger-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    const rateParam = node.parameters.get("rate");
    const depthParam = node.parameters.get("depth");
    const feedbackParam = node.parameters.get("feedback");
    const manualParam = node.parameters.get("manual");
    const mixParam = node.parameters.get("mix");

    const apply = (p: EffectParamMap) => {
      if (rateParam) rateParam.value = Math.max(0.01, Math.min(10, p.rate ?? 0.5));
      if (depthParam) depthParam.value = Math.max(0, Math.min(1, (p.depth ?? 50) / 100));
      if (feedbackParam) feedbackParam.value = Math.max(-0.95, Math.min(0.95, (p.feedback ?? 30) / 100));
      if (manualParam) manualParam.value = Math.max(0, Math.min(1, (p.manual ?? 25) / 100));
      if (mixParam) mixParam.value = Math.max(0, Math.min(1, (p.wetDry ?? 50) / 100));
    };
    apply(initial);

    input.connect(node).connect(output);

    return {
      input,
      output,
      setParam: (key, value) => {
        switch (key) {
          case "rate":
            if (rateParam) rateParam.value = Math.max(0.01, Math.min(10, value));
            initial.rate = value;
            break;
          case "depth":
            if (depthParam) depthParam.value = Math.max(0, Math.min(1, value / 100));
            initial.depth = value;
            break;
          case "feedback":
            if (feedbackParam) feedbackParam.value = Math.max(-0.95, Math.min(0.95, value / 100));
            initial.feedback = value;
            break;
          case "manual":
            if (manualParam) manualParam.value = Math.max(0, Math.min(1, value / 100));
            initial.manual = value;
            break;
          case "wetDry":
            if (mixParam) mixParam.value = Math.max(0, Math.min(1, value / 100));
            initial.wetDry = value;
            break;
          default: break;
        }
      },
      dispose: () => {
        try { node.disconnect(); } catch { /* noop */ }
        [input, output].forEach((n) => { try { n.disconnect(); } catch { /* noop */ } });
      },
    };
  }

  // ----- Chorus (multi-voice stereo worklet) -----
  // 4 phase-offset Hermite-interpolated voices share one delay buffer,
  // panned across the stereo field by WIDTH. VOICES enum (2/3/4) controls
  // how many are active. Lush analog-style chorus character.
  private createChorusChain(initial: EffectParamMap): EffectChain | null {
    const ctx = this.context;
    if (!ctx) return null;
    if (!isWorkletLoaded(ctx, "multi-chorus-processor")) {
      console.warn("[fxEngine] multi-chorus-processor not loaded; passthrough");
      return passthroughChain(ctx);
    }

    const input = ctx.createGain();
    const output = ctx.createGain();
    const node = new AudioWorkletNode(ctx, "multi-chorus-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    const rateParam = node.parameters.get("rate");
    const depthParam = node.parameters.get("depth");
    const voicesParam = node.parameters.get("voices");
    const widthParam = node.parameters.get("width");
    const mixParam = node.parameters.get("mix");

    const apply = (p: EffectParamMap) => {
      if (rateParam) rateParam.value = Math.max(0.05, Math.min(5, p.rate ?? 1));
      if (depthParam) depthParam.value = Math.max(0, Math.min(1, (p.depth ?? 30) / 100));
      if (voicesParam) voicesParam.value = Math.max(2, Math.min(4, Math.round(p.voices ?? 4)));
      if (widthParam) widthParam.value = Math.max(0, Math.min(1, (p.width ?? 50) / 100));
      if (mixParam) mixParam.value = Math.max(0, Math.min(1, (p.mix ?? 50) / 100));
    };
    apply(initial);

    input.connect(node).connect(output);

    return {
      input,
      output,
      setParam: (key, value) => {
        switch (key) {
          case "rate":
            if (rateParam) rateParam.value = Math.max(0.05, Math.min(5, value));
            initial.rate = value;
            break;
          case "depth":
            if (depthParam) depthParam.value = Math.max(0, Math.min(1, value / 100));
            initial.depth = value;
            break;
          case "voices":
            if (voicesParam) voicesParam.value = Math.max(2, Math.min(4, Math.round(value)));
            initial.voices = value;
            break;
          case "width":
            if (widthParam) widthParam.value = Math.max(0, Math.min(1, value / 100));
            initial.width = value;
            break;
          case "mix":
            if (mixParam) mixParam.value = Math.max(0, Math.min(1, value / 100));
            initial.mix = value;
            break;
          default: break;
        }
      },
      dispose: () => {
        try { node.disconnect(); } catch { /* noop */ }
        [input, output].forEach((n) => { try { n.disconnect(); } catch { /* noop */ } });
      },
    };
  }

  // ----- Phaser (Schroeder 1st-order allpass cascade worklet) -----
  // N×allpass chain (2/4/6/8 stages) with shared LFO modulating cutoff,
  // feedback path from last stage to input. Phase 90 / Small Stone style.
  private createPhaserChain(initial: EffectParamMap): EffectChain | null {
    const ctx = this.context;
    if (!ctx) return null;
    if (!isWorkletLoaded(ctx, "phaser-processor")) {
      console.warn("[fxEngine] phaser-processor not loaded; passthrough");
      return passthroughChain(ctx);
    }

    const input = ctx.createGain();
    const output = ctx.createGain();
    const node = new AudioWorkletNode(ctx, "phaser-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    const rateParam = node.parameters.get("rate");
    const depthParam = node.parameters.get("depth");
    const stagesParam = node.parameters.get("stages");
    const feedbackParam = node.parameters.get("feedback");
    const mixParam = node.parameters.get("mix");

    const apply = (p: EffectParamMap) => {
      if (rateParam) rateParam.value = Math.max(0.05, Math.min(10, p.rate ?? 0.5));
      if (depthParam) depthParam.value = Math.max(0, Math.min(1, (p.depth ?? 70) / 100));
      if (stagesParam) stagesParam.value = Math.max(2, Math.min(8, Math.round(p.stages ?? 6)));
      if (feedbackParam) feedbackParam.value = Math.max(0, Math.min(0.95, (p.feedback ?? 30) / 100));
      if (mixParam) mixParam.value = Math.max(0, Math.min(1, (p.wetDry ?? 50) / 100));
    };
    apply(initial);

    input.connect(node).connect(output);

    return {
      input,
      output,
      setParam: (key, value) => {
        switch (key) {
          case "rate":
            if (rateParam) rateParam.value = Math.max(0.05, Math.min(10, value));
            initial.rate = value;
            break;
          case "depth":
            if (depthParam) depthParam.value = Math.max(0, Math.min(1, value / 100));
            initial.depth = value;
            break;
          case "stages":
            if (stagesParam) stagesParam.value = Math.max(2, Math.min(8, Math.round(value)));
            initial.stages = value;
            break;
          case "feedback":
            if (feedbackParam) feedbackParam.value = Math.max(0, Math.min(0.95, value / 100));
            initial.feedback = value;
            break;
          case "wetDry":
            if (mixParam) mixParam.value = Math.max(0, Math.min(1, value / 100));
            initial.wetDry = value;
            break;
          default: break;
        }
      },
      dispose: () => {
        try { node.disconnect(); } catch { /* noop */ }
        [input, output].forEach((n) => { try { n.disconnect(); } catch { /* noop */ } });
      },
    };
  }

  // ----- Bit Crusher (AudioWorklet — SP-1200 / MPC-style) -----
  // Session 27 sub-phase A + UI fix:
  //   - Replaced WaveShaper + ScriptProcessorNode with AudioWorkletProcessor.
  //   - Hybrid UI / internal parameter design (Marek's call):
  //       UI parameter `srReduce` is a division of the context sample rate.
  //       Discrete UI enum: 1, 2, 4, 8, 16, 32, 64. Stored in state as the
  //       division integer. The worklet's `sampleRateHz` AudioParam is
  //       computed at instantiation / on setParam from
  //       `ctx.sampleRate / srReduce`.
  //   - Rationale: musicians think "amount of crushing", not Hz. 1/4 always
  //     means "quarter rate" regardless of whether ctx is 44.1 / 48 / 88.2
  //     / 96 kHz. Side effect: the exact SP-1200 26040 Hz is not directly
  //     reachable at any common context rate via pure division — closest at
  //     48 kHz is 1/2 = 24 kHz. Acceptable tradeoff for rate-agnostic UI.
  //
  // Back-compat for saved projects: legacy `sampleRateReduction` is mapped
  // 1:1 onto `srReduce` (same semantic — both are integer divisions). Any
  // raw `sampleRateHz` field in older saves is ignored (it was a Session 27
  // transitional name that never shipped).
  //
  // If the worklet hasn't been loaded for this context (preloadWorklets
  // not awaited yet), fall back to a passthrough gain so the bus doesn't
  // die — log once so the gap is visible during dev.
  private createBitCrusherChain(initial: EffectParamMap): EffectChain | null {
    const ctx = this.context;
    if (!ctx) return null;

    if (!isWorkletLoaded(ctx, "bitcrusher-processor")) {
      console.warn(
        "[fxEngine] bitcrusher-processor not loaded for this context; using passthrough. Call preloadWorklets(ctx) before constructing bitcrusher.",
      );
      return passthroughChain(ctx);
    }

    const input = ctx.createGain();
    const output = ctx.createGain();
    const node = new AudioWorkletNode(ctx, "bitcrusher-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    const computeHz = (division: number): number => {
      const div = Math.max(1, Math.floor(division));
      return Math.max(100, Math.min(192000, ctx.sampleRate / div));
    };

    const bitsParam = node.parameters.get("bits");
    const sampleRateParam = node.parameters.get("sampleRateHz");
    const driveParam = node.parameters.get("drive");
    const mixParam = node.parameters.get("mix");

    // Resolve initial srReduce — prefer new key, fall back to legacy.
    const initialDivision = (() => {
      if (typeof initial.srReduce === "number") return initial.srReduce;
      if (typeof initial.sampleRateReduction === "number") return initial.sampleRateReduction;
      return 4;
    })();

    const apply = (p: EffectParamMap) => {
      if (bitsParam) bitsParam.value = Math.max(1, Math.min(16, p.bits ?? 12));
      if (sampleRateParam) {
        const div = typeof p.srReduce === "number"
          ? p.srReduce
          : (p.sampleRateReduction ?? initialDivision);
        sampleRateParam.value = computeHz(div);
      }
      if (driveParam) driveParam.value = Math.max(0, Math.min(1, (p.drive ?? 0) / 100));
      if (mixParam) mixParam.value = Math.max(0, Math.min(1, (p.wetDry ?? 100) / 100));
    };
    apply(initial);

    input.connect(node).connect(output);

    return {
      input,
      output,
      setParam: (key, value) => {
        switch (key) {
          case "bits":
            if (bitsParam) bitsParam.value = Math.max(1, Math.min(16, value));
            initial.bits = value;
            break;
          case "srReduce":
            if (sampleRateParam) sampleRateParam.value = computeHz(value);
            initial.srReduce = value;
            break;
          case "sampleRateReduction":
            // Legacy alias — same semantic as srReduce.
            if (sampleRateParam) sampleRateParam.value = computeHz(value);
            initial.sampleRateReduction = value;
            initial.srReduce = value;
            break;
          case "drive":
            if (driveParam) driveParam.value = Math.max(0, Math.min(1, value / 100));
            initial.drive = value;
            break;
          case "wetDry":
            if (mixParam) mixParam.value = Math.max(0, Math.min(1, value / 100));
            initial.wetDry = value;
            break;
          default:
            break;
        }
      },
      dispose: () => {
        try { node.disconnect(); } catch { /* noop */ }
        [input, output].forEach((n) => {
          try { n.disconnect(); } catch { /* noop */ }
        });
      },
    };
  }

  // ----- Compressor (bus effect, distinct from master Comp instance) -----
  private createCompressorChain(initial: EffectParamMap): EffectChain | null {
    const ctx = this.context;
    if (!ctx) return null;
    const input = ctx.createGain();
    const output = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    const makeup = ctx.createGain();

    const apply = (p: EffectParamMap) => {
      comp.threshold.value = Math.max(-60, Math.min(0, p.threshold ?? -20));
      comp.ratio.value = Math.max(1, Math.min(20, p.ratio ?? 4));
      comp.attack.value = Math.max(0, Math.min(1, (p.attack ?? 5) / 1000));
      comp.release.value = Math.max(0.001, Math.min(1, (p.release ?? 50) / 1000));
      makeup.gain.value = Math.pow(10, (p.makeupGain ?? 0) / 20); // dB to linear
    };
    apply(initial);

    input.connect(comp).connect(makeup).connect(output);

    return {
      input,
      output,
      setParam: (key, value) => {
        switch (key) {
          case "threshold": comp.threshold.value = Math.max(-60, Math.min(0, value)); initial.threshold = value; break;
          case "ratio": comp.ratio.value = Math.max(1, Math.min(20, value)); initial.ratio = value; break;
          case "attack": comp.attack.value = Math.max(0, Math.min(1, value / 1000)); initial.attack = value; break;
          case "release": comp.release.value = Math.max(0.001, Math.min(1, value / 1000)); initial.release = value; break;
          case "makeupGain": makeup.gain.value = Math.pow(10, value / 20); initial.makeupGain = value; break;
          default: break;
        }
      },
      dispose: () => {
        [input, output, comp, makeup].forEach((n) => {
          try { (n as AudioNode).disconnect(); } catch { /* noop */ }
        });
      },
    };
  }
}

// Legacy ConvolverNode IR generator. Retained for reference / potential
// future "IR reverb" mode (e.g. user-loaded impulse response files).
// NOT used by the runtime — the active reverb is the FDN worklet above.
// Session 27 sub-phase B replaced this with the FDN approach per Marek's
// quality bar.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function generateReverbImpulse(ctx: BaseAudioContext, size: number, damping: number): AudioBuffer {
  // size 0..100 → duration 0.1..3.5 seconds
  const seconds = 0.1 + (Math.max(0, Math.min(100, size)) / 100) * 3.4;
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(seconds * sampleRate));
  const buffer = ctx.createBuffer(2, length, sampleRate);
  // damping 0..100 → exponent 1..6 (higher damping = faster decay)
  const decayExponent = 1 + (Math.max(0, Math.min(100, damping)) / 100) * 5;
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const t = i / length;
      const envelope = Math.pow(1 - t, decayExponent);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
  }
  return buffer;
}

/**
 * Defensive passthrough chain. Used when a worklet effect is requested but
 * its processor module hasn't been loaded onto this context yet (i.e. the
 * caller skipped `preloadWorklets`). The bus stays alive — audio passes
 * unmodified through input→output — instead of throwing.
 */
function passthroughChain(ctx: BaseAudioContext): EffectChain {
  const input = ctx.createGain();
  const output = ctx.createGain();
  input.connect(output);
  return {
    input,
    output,
    setParam: () => { /* noop until upgrade */ },
    dispose: () => {
      try { input.disconnect(); } catch { /* noop */ }
      try { output.disconnect(); } catch { /* noop */ }
    },
  };
}

export const fxEngine = new FxEngine();
