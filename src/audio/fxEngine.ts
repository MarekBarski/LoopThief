// FX engine — 4 FX buses + master EQ/Compressor, MPC5000 routing model.
//
// Phase 1a scope: full bus + master graph skeleton, Reverb effect implemented.
// Other 6 effect types (DELAY/EQ/FLANGER/CHORUS/BITCRUSHER/COMPRESSOR) accept
// state but currently route as passthrough — they will be implemented in Phase 1b.
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

export type BusId = 1 | 2 | 3 | 4;

export type EffectType =
  | "REVERB"
  | "DELAY"
  | "EQ"
  | "FLANGER"
  | "CHORUS"
  | "BITCRUSHER"
  | "COMPRESSOR";

export type EffectParamMap = Record<string, number>;

// Default parameter sets per effect (used for state init + reset on effect change).
// Param values are in MPC-style 0..100 unless physical units are required (Hz, ms, dB, ratio).
export const EFFECT_DEFAULTS: Record<EffectType, EffectParamMap> = {
  REVERB: {
    size: 70,        // 0..100  → IR duration 0.1..3.5s
    damping: 50,     // 0..100  → wet-path lowpass aggressiveness
    wetDry: 100,     // 0..100  → 100 = wet-only (typical SEND); reduce for INSERT mix
    preDelay: 20,    // 0..200 ms
    hpCut: 100,      // 20..2000 Hz HP on wet path
    lpCut: 8000,     // 2000..20000 Hz LP on wet path
  },
  DELAY: {
    timeMs: 250,     // 1..2000 ms
    feedback: 30,    // 0..95
    wetDry: 30,      // 0..100
    hpCut: 100,
    lpCut: 8000,
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
    feedback: 30,    // 0..95
    wetDry: 50,
  },
  CHORUS: {
    rate: 1,         // Hz
    depth: 30,       // 0..100
    mix: 50,         // 0..100
  },
  BITCRUSHER: {
    bits: 8,         // 1..16
    sampleRateReduction: 4,  // 1..32 — keep every Nth sample
    wetDry: 100,
  },
  COMPRESSOR: {
    threshold: -20,  // dB
    ratio: 4,
    attack: 5,       // ms
    release: 50,     // ms
    makeupGain: 0,   // dB
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

class FxEngine {
  private context: AudioContext | null = null;
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
  ensureReady(context: AudioContext): GainNode {
    if (this.context && this.context === context && this.masterInput) {
      return this.masterInput;
    }
    this.context = context;
    this.buildMasterChain();
    this.buildBusSlots();
    return this.masterInput!;
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

  private makeBand(ctx: AudioContext, type: BiquadFilterType, freq: number, gainDb: number, q: number): BiquadFilterNode {
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
      default: return null;
    }
  }

  // ----- Reverb -----
  // Procedural reverb using a synthesized impulse response (exp-decay noise) in a ConvolverNode.
  // Signal flow:
  //   input → dryGain ─────────────────────────────────────────→ output
  //         └→ preDelay → HP → LP → convolver → wetGain ────────→ output
  private createReverbChain(initial: EffectParamMap): EffectChain | null {
    const ctx = this.context;
    if (!ctx) return null;

    const input = ctx.createGain();
    const output = ctx.createGain();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const preDelay = ctx.createDelay(1); // up to 1s
    const hp = ctx.createBiquadFilter();
    const lp = ctx.createBiquadFilter();
    const convolver = ctx.createConvolver();

    hp.type = "highpass";
    lp.type = "lowpass";

    // Build initial IR + apply params
    const applyAll = (p: EffectParamMap) => {
      preDelay.delayTime.value = Math.max(0, Math.min(1, (p.preDelay ?? 0) / 1000));
      hp.frequency.value = Math.max(20, Math.min(20000, p.hpCut ?? 100));
      lp.frequency.value = Math.max(20, Math.min(20000, p.lpCut ?? 8000));
      const wet = Math.max(0, Math.min(1, (p.wetDry ?? 100) / 100));
      wetGain.gain.value = wet;
      dryGain.gain.value = 1 - wet;
      convolver.buffer = generateReverbImpulse(ctx, p.size ?? 70, p.damping ?? 50);
    };
    applyAll(initial);

    // Wire
    input.connect(dryGain).connect(output);
    input.connect(preDelay).connect(hp).connect(lp).connect(convolver).connect(wetGain).connect(output);

    return {
      input,
      output,
      setParam: (key: string, value: number) => {
        switch (key) {
          case "size":
          case "damping":
            // Regenerate IR
            convolver.buffer = generateReverbImpulse(
              ctx,
              key === "size" ? value : (initial.size ?? 70),
              key === "damping" ? value : (initial.damping ?? 50),
            );
            initial[key] = value;
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
        try { input.disconnect(); } catch { /* noop */ }
        try { output.disconnect(); } catch { /* noop */ }
        try { preDelay.disconnect(); } catch { /* noop */ }
        try { hp.disconnect(); } catch { /* noop */ }
        try { lp.disconnect(); } catch { /* noop */ }
        try { convolver.disconnect(); } catch { /* noop */ }
        try { dryGain.disconnect(); } catch { /* noop */ }
        try { wetGain.disconnect(); } catch { /* noop */ }
      },
    };
  }

  // ----- Delay (mono ping with feedback loop) -----
  // Signal flow:
  //   input → dryGain ────────────────────────────────────────────────────→ output
  //         └→ HP → LP → delay → wetGain ─────────────────────────────────→ output
  //                          └→ feedbackGain ─→ back into delay input
  private createDelayChain(initial: EffectParamMap): EffectChain | null {
    const ctx = this.context;
    if (!ctx) return null;
    const input = ctx.createGain();
    const output = ctx.createGain();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const delay = ctx.createDelay(2.5);
    const hp = ctx.createBiquadFilter();
    const lp = ctx.createBiquadFilter();
    const feedback = ctx.createGain();
    hp.type = "highpass";
    lp.type = "lowpass";

    const apply = (p: EffectParamMap) => {
      delay.delayTime.value = Math.max(0.001, Math.min(2, (p.timeMs ?? 250) / 1000));
      feedback.gain.value = Math.max(0, Math.min(0.95, (p.feedback ?? 30) / 100));
      const wet = Math.max(0, Math.min(1, (p.wetDry ?? 30) / 100));
      wetGain.gain.value = wet;
      dryGain.gain.value = 1 - wet;
      hp.frequency.value = Math.max(20, Math.min(20000, p.hpCut ?? 100));
      lp.frequency.value = Math.max(20, Math.min(20000, p.lpCut ?? 8000));
    };
    apply(initial);

    input.connect(dryGain).connect(output);
    input.connect(hp).connect(lp).connect(delay).connect(wetGain).connect(output);
    delay.connect(feedback).connect(delay);

    return {
      input,
      output,
      setParam: (key, value) => {
        switch (key) {
          case "timeMs": delay.delayTime.value = Math.max(0.001, Math.min(2, value / 1000)); initial.timeMs = value; break;
          case "feedback": feedback.gain.value = Math.max(0, Math.min(0.95, value / 100)); initial.feedback = value; break;
          case "wetDry": {
            const w = Math.max(0, Math.min(1, value / 100));
            wetGain.gain.value = w;
            dryGain.gain.value = 1 - w;
            initial.wetDry = value;
            break;
          }
          case "hpCut": hp.frequency.value = Math.max(20, Math.min(20000, value)); initial.hpCut = value; break;
          case "lpCut": lp.frequency.value = Math.max(20, Math.min(20000, value)); initial.lpCut = value; break;
          default: break;
        }
      },
      dispose: () => {
        [input, output, dryGain, wetGain, delay, hp, lp, feedback].forEach((n) => {
          try { n.disconnect(); } catch { /* noop */ }
        });
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

  // ----- Flanger (short modulated delay + feedback) -----
  private createFlangerChain(initial: EffectParamMap): EffectChain | null {
    const ctx = this.context;
    if (!ctx) return null;
    const input = ctx.createGain();
    const output = ctx.createGain();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const delay = ctx.createDelay(0.02);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const feedback = ctx.createGain();

    const baseDelay = 0.005; // 5ms
    delay.delayTime.value = baseDelay;
    lfo.type = "sine";

    const apply = (p: EffectParamMap) => {
      lfo.frequency.value = Math.max(0.05, Math.min(10, p.rate ?? 0.5));
      lfoGain.gain.value = Math.max(0, Math.min(0.0045, (p.depth ?? 50) / 100 * 0.0045));
      feedback.gain.value = Math.max(0, Math.min(0.95, (p.feedback ?? 30) / 100));
      const wet = Math.max(0, Math.min(1, (p.wetDry ?? 50) / 100));
      wetGain.gain.value = wet;
      dryGain.gain.value = 1 - wet;
    };
    apply(initial);

    input.connect(dryGain).connect(output);
    input.connect(delay).connect(wetGain).connect(output);
    delay.connect(feedback).connect(delay);
    lfo.connect(lfoGain).connect(delay.delayTime);
    lfo.start();

    return {
      input,
      output,
      setParam: (key, value) => {
        switch (key) {
          case "rate": lfo.frequency.value = Math.max(0.05, Math.min(10, value)); initial.rate = value; break;
          case "depth": lfoGain.gain.value = Math.max(0, Math.min(0.0045, value / 100 * 0.0045)); initial.depth = value; break;
          case "feedback": feedback.gain.value = Math.max(0, Math.min(0.95, value / 100)); initial.feedback = value; break;
          case "wetDry": {
            const w = Math.max(0, Math.min(1, value / 100));
            wetGain.gain.value = w;
            dryGain.gain.value = 1 - w;
            initial.wetDry = value;
            break;
          }
          default: break;
        }
      },
      dispose: () => {
        try { lfo.stop(); } catch { /* noop */ }
        [input, output, dryGain, wetGain, delay, lfo, lfoGain, feedback].forEach((n) => {
          try { (n as AudioNode).disconnect(); } catch { /* noop */ }
        });
      },
    };
  }

  // ----- Chorus (3 detuned modulated delays in parallel) -----
  private createChorusChain(initial: EffectParamMap): EffectChain | null {
    const ctx = this.context;
    if (!ctx) return null;
    const input = ctx.createGain();
    const output = ctx.createGain();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const voices = [0, 1, 2].map((i) => {
      const delay = ctx.createDelay(0.05);
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      delay.delayTime.value = 0.015 + i * 0.005; // 15/20/25 ms base
      lfo.type = "sine";
      lfo.frequency.value = 0.5 + i * 0.3;
      lfo.connect(lfoGain).connect(delay.delayTime);
      lfo.start();
      return { delay, lfo, lfoGain };
    });
    const apply = (p: EffectParamMap) => {
      const rate = Math.max(0.05, Math.min(10, p.rate ?? 1));
      const depth = Math.max(0, Math.min(0.008, (p.depth ?? 30) / 100 * 0.008));
      voices.forEach((v, i) => {
        v.lfo.frequency.value = rate + i * 0.15;
        v.lfoGain.gain.value = depth;
      });
      const wet = Math.max(0, Math.min(1, (p.mix ?? 50) / 100));
      wetGain.gain.value = wet;
      dryGain.gain.value = 1 - wet;
    };
    apply(initial);

    input.connect(dryGain).connect(output);
    voices.forEach((v) => {
      input.connect(v.delay).connect(wetGain);
    });
    wetGain.connect(output);

    return {
      input,
      output,
      setParam: (key, value) => {
        switch (key) {
          case "rate":
            voices.forEach((v, i) => { v.lfo.frequency.value = Math.max(0.05, Math.min(10, value + i * 0.15)); });
            initial.rate = value; break;
          case "depth": {
            const d = Math.max(0, Math.min(0.008, value / 100 * 0.008));
            voices.forEach((v) => { v.lfoGain.gain.value = d; });
            initial.depth = value; break;
          }
          case "mix": {
            const w = Math.max(0, Math.min(1, value / 100));
            wetGain.gain.value = w;
            dryGain.gain.value = 1 - w;
            initial.mix = value; break;
          }
          default: break;
        }
      },
      dispose: () => {
        voices.forEach((v) => {
          try { v.lfo.stop(); } catch { /* noop */ }
          try { v.delay.disconnect(); } catch { /* noop */ }
          try { v.lfo.disconnect(); } catch { /* noop */ }
          try { v.lfoGain.disconnect(); } catch { /* noop */ }
        });
        [input, output, dryGain, wetGain].forEach((n) => {
          try { n.disconnect(); } catch { /* noop */ }
        });
      },
    };
  }

  // ----- Bit Crusher (WaveShaperNode for bit-depth reduction; sample-rate reduction via ScriptProcessor) -----
  // Phase 1b note: ScriptProcessorNode is deprecated but trivially functional in Chrome/Edge/Firefox.
  // AudioWorklet would require an external worklet file + module setup; deferring to Phase 2.
  private createBitCrusherChain(initial: EffectParamMap): EffectChain | null {
    const ctx = this.context;
    if (!ctx) return null;
    const input = ctx.createGain();
    const output = ctx.createGain();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const shaper = ctx.createWaveShaper();
    // ScriptProcessor for sample-rate reduction (sample-and-hold)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proc = (ctx as unknown as { createScriptProcessor: (bufSize: number, inCh: number, outCh: number) => ScriptProcessorNode }).createScriptProcessor(512, 1, 1);

    let holdLength = Math.max(1, Math.floor(initial.sampleRateReduction ?? 4));
    let counter = 0;
    let held = 0;
    proc.onaudioprocess = (event: AudioProcessingEvent) => {
      const inBuf = event.inputBuffer.getChannelData(0);
      const outBuf = event.outputBuffer.getChannelData(0);
      for (let i = 0; i < inBuf.length; i += 1) {
        if (counter % holdLength === 0) held = inBuf[i];
        outBuf[i] = held;
        counter += 1;
      }
    };

    const updateCurve = (bits: number) => {
      const steps = Math.pow(2, Math.max(1, Math.min(16, bits)));
      const curve = new Float32Array(4096);
      for (let i = 0; i < curve.length; i += 1) {
        const x = (i / curve.length) * 2 - 1;
        curve[i] = Math.round(x * steps) / steps;
      }
      shaper.curve = curve;
    };
    updateCurve(initial.bits ?? 8);

    const wet = Math.max(0, Math.min(1, (initial.wetDry ?? 100) / 100));
    wetGain.gain.value = wet;
    dryGain.gain.value = 1 - wet;

    input.connect(dryGain).connect(output);
    input.connect(shaper).connect(proc).connect(wetGain).connect(output);

    return {
      input,
      output,
      setParam: (key, value) => {
        switch (key) {
          case "bits": updateCurve(value); initial.bits = value; break;
          case "sampleRateReduction":
            holdLength = Math.max(1, Math.floor(value));
            initial.sampleRateReduction = value;
            break;
          case "wetDry": {
            const w = Math.max(0, Math.min(1, value / 100));
            wetGain.gain.value = w;
            dryGain.gain.value = 1 - w;
            initial.wetDry = value;
            break;
          }
          default: break;
        }
      },
      dispose: () => {
        try { proc.onaudioprocess = null; } catch { /* noop */ }
        [input, output, dryGain, wetGain, shaper, proc].forEach((n) => {
          try { (n as AudioNode).disconnect(); } catch { /* noop */ }
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

function generateReverbImpulse(ctx: AudioContext, size: number, damping: number): AudioBuffer {
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

export const fxEngine = new FxEngine();
