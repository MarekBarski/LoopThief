# LoopThief Foundation Audit — 2026-05-20

**Session 4 inspection of audio pipeline state, fake UI, and foundation gaps.**

This document is the authoritative reference for what's real, what's fake, and what's partial in LoopThief's audio + sequencer foundation as of this date. Use it to plan foundation-first work going forward.

---

## A. Event State Shape

`StepEvent` fields and their actual usage in playback (from `useAppStore.ts:389–415`):

### Live fields (actually affect audio)

- **velocity** — `event.velocity / 127` becomes `gainOverride` in playback. Range 1–127 MIDI. Wired Session 4.
- **timingOffset** — `event.timingOffset * ppqMs` delay/early-fire in `tickStepPlayback`. Edytowalne F2 OFFSET ±24.
- **probability** — `Math.random() * 100 < event.probability` in `shouldPlayStepEvent`. Edytowalne F4 PROB.
- **appliedParameter** — `"VELOCITY"|"TUNE"|"DECAY"|"FILTER"|"ATTACK"`. Live for VELOCITY/TUNE/FILTER (Session 4). DECAY/ATTACK ignored by playback (no ADSR).
- **appliedValue** / **parameterValue** — number, fallback chain (parameterValue preferred). Used as override in playback.
- **appliedFilterType** — `"OFF"|"LOWPASS"|"HIGHPASS"|"BANDPASS"`. Sandbox snapshot dla FILTER events.
- **appliedFilterResonance** — number, sandbox snapshot dla FILTER events.
- **padBank** / **padNumber** — bank-aware pad identity. Used in `playStepEventFromState`.
- **programId** — resolved via fallback chain (event.programId → track.programId → currentProgramId).
- **trackId** — used in `isTrackMuted` w `shouldPlayStepEvent`.
- **step** — `"BBB.B.TT"` format, decoded via `eventStepIndex` w playback.
- **muted** — used in `shouldPlayStepEvent`, **ALE brak UI control który toggle** — wymaga weryfikacji (dead path albo ukryta UI).

### Display-only fields (informational, no audio impact)

- **id** — identifier.
- **pad** — `"P01"..."P16"` string (legacy, `padNumber` preferred).
- **trackName** — tylko UI display.
- **sourcePad**, **sourceAssignment** — bank-aware source name, informational przy recording 16LV.
- **physicalPad** — który fizyczny pad user kliknął (zapisywane przy 16LV recording, nigdzie nie odczytywane w playback).
- **noteRepeatGenerated** — tag "NR" w STEP screen, nie wpływa na audio.
- **variation** — `"REC"/"REPEAT"` tag, informational.
- **type** — hardcoded constant `"NOTE"`, never changes.

### FAKE UI fields (edytowalne ale playback ignoruje)

- **length** — Math.max(1, Math.round((gate/100)*24)) przy recording, default 1. **NIGDZIE NIE UŻYWANE w audio playback.** Engine używa (end - start) * buffer.duration.
- **duration** — identical to length przy recording. Edytowalne F3 DUR w STEP (clamp 1-96). **NIGDZIE NIE UŻYWANE w audio playback.** Critical fake UI w core sequencer flow.

---

## B. PadAssignment / Program State

`PadAssignment` fields (from `useAppStore.ts:369–387`):

### Live (działa w playback)

- **pad** — `"P01"..."P16"` identity
- **assignment** — sample name lub "---", resolved do PlayableSample
- **mode** — `"ONE SHOT" | "NOTE ON"`. NOTE ON wywołuje stopVoiceGroup przy releasePad. (Partial: brak LOOP mode jak w MPC)
- **voiceMode** — `"POLY" | "MONO"`. mono: true → stopVoiceGroup przed nowym voice
- **level** — number 1-127, → mix.level/100 jako gain multiplier
- **tune** — semitones, → tuneToPlaybackRate → source.playbackRate.value
- **fineTune** — cents, drugi arg tuneToPlaybackRate, /100 dodawane do semitones. Math wired, **wymaga audio weryfikacji** czy user faktycznie słyszy ±1 cent change
- **pan** — number -50..50, → mix.pan/64 → StereoPanner
- **filterType** — `"OFF"|"LOWPASS"|"HIGHPASS"|"BANDPASS"`, BiquadFilterNode (bypass when OFF)
- **filterCutoff** — number 0-100, log-mapped 80–18000 Hz
- **filterResonance** — number 0-100, mapped do Q 0.0001–10
- **chokeGroup** — number 0-8, hit innego pada w grupie stopVoiceGroups
- **muteTargets** — string[], używane w getMuteStopGroups w PAIR mode

### FAKE (UI istnieje, audio ignoruje)

- **attack** — number 0-100. **NIGDZIE NIE CZYTANY w playback path** (grep verified). Engine ma static `gain.gain.value = clamp(options.gain, 0, 2)` — żadnego ramp.
- **decay** — number 0-100. **Tylko 1 użycie:** `setTimeout(..., assignment.decay * 2)` (useAppStore.ts:3203) — to gasi **visual flash triggered pad**, NIE audio. Pure cosmetic.
- **fxSend** — number 0-32. Stored w mix.fxSend, edytowalne MIX screen i PROGRAM. **Brak FX engine** (Phase A3). Wartość nigdzie nie wpływa na audio.

### Partial

- **muteTargetMode** — `"OFF"|"PAIR"|"GROUP"`. PAIR działa (muteTargets array). **GROUP mode nie ma własnego array logic** — cycle softkey przyjmuje wartość ale `getMuteStopGroups` jej nie czyta. Effectively no-op for GROUP. (Już logged w UX_AUDIT.)

---

## C. samplerEngine.play() API

Current signature (`samplerEngine.ts:26–38`):

```typescript
play(sample: PlayableSample, options: {
  gain: number;                          // CLAMP 0-2 w engine
  pan: number;                           // CLAMP -1..1
  channelKey?: string;                   // routing identity
  previewGroup?: string;                 // grupa preview
  voiceGroup?: string;                   // grupa voice (mute targets, mono)
  mono?: boolean;
  filter?: {
    type: BiquadFilterType;
    frequency: number;                   // CLAMP 20 ... sampleRate/2
    q: number;                           // CLAMP 0.0001-30
  };
}): void
```

**What works runtime:** gain, pan, playbackRate (via sample.playbackRate), filter (BiquadFilterNode type/freq/q), mono + voiceGroup, channelKey (mixer updates), previewGroup (CHOP preview, metronome), sampleStart/sampleEnd (trim).

### What's missing from API

- **ADSR envelope** — całkowicie brak. Engine ma static `gain.gain.value = clamp(...)`. Żadnych `setValueAtTime`/`linearRampToValueAtTime`.
- **Velocity-osobny od gain** — nie ma. Velocity musi być pre-mapped na gain w storze (jest).
- **Loop mode** — `mode: "LOOP"` w PadAssignment nie istnieje. Engine `source.start(0, offset, duration)` jest one-shot. Brak `source.loop = true` mechanism.
- **Detune (cents osobno)** — można obejść przez playbackRate (co tuneToPlaybackRate robi). NIE jest pitch-locked timestretch.
- **Sustain/release dla NOTE ON** — sztywne `source.stop()` przy stopVoiceGroup, **brak release ramp** (zero fade).
- **Reverse / playback direction** — brak.
- **FX bus routing** — channelKey istnieje ale tylko mixer-level update, brak FX send outputs (Phase A3).
- **Master FX** — brak.

### Audio pipeline w playInternal (L110–153)

```
source (AudioBufferSourceNode)
  → (filter? BiquadFilterNode)
  → gain (GainNode, static value)
  → pan (StereoPannerNode)
  → masterGain (clamped 0–20 from masterVolume/100)
  → destination
```

**Brak:** envelope GainNode, FX sends, multi-output, busowanie.

---

## D. Sequencer Playback Path

Pipeline od event do dźwięku:

```
tickStepPlayback (useAppStore.ts:2207)
  ↓ filter events at current step + early-next events with negative offset
  ↓ shouldPlayStepEvent: track mute? event.muted? probability roll?

playStepEventFromState(state, event, delayMs)
  ↓ resolve eventBank (event.padBank ?? "A")
  ↓ resolve eventPad (padFromEvent → "PXX")
  ↓ resolve eventProgramId (event.programId ?? track.programId ?? currentProgramId)
  ↓ compute overrides from appliedParameter:
       tuneOverride            = appliedParameter === "TUNE"   ? parameterValue ?? appliedValue : undefined
       filterCutoffOverride    = appliedParameter === "FILTER" ? parameterValue ?? appliedValue : undefined
       filterTypeOverride      = appliedParameter === "FILTER" ? appliedFilterType : undefined
       filterResonanceOverride = appliedParameter === "FILTER" ? appliedFilterResonance : undefined
       gainOverride            = velocity / 127  (ALWAYS, regardless of appliedParameter)
  ↓ if delayMs > 0: window.setTimeout z isPlaying + currentSequence guards

playAssignedPadWithContext(state, context)
  ↓ getProgramForPlayback → padAssignments
  ↓ getMixerChannel → mix.level, mix.pan
  ↓ ASSIGNMENT GUARD: jeśli "---" lub mix audible=false → "UNASSIGNED PAD" message, return
  ↓ resolveAssignedSample → PlayableSample
  ↓ triggeredPads flash + decay-timed off (cosmetic)
  ↓ getMuteStopGroups → stopVoiceGroups (PAIR muteTargets + chokeGroup)
  ↓ tuneToPlaybackRate(tuneOverride ?? assignment.tune, fineTuneOverride ?? assignment.fineTune)

samplerEngine.play(playable, {
  gain: (gainOverride ?? 1) * (mix.level / 100),
  pan: mix.pan / 64,
  channelKey, voiceGroup, mono: voiceMode === "MONO",
  filter: createPadFilterOptions(assignment, overrides),
})
```

### Pipeline cleanness

**Czysty.** 2 hops (resolve → play), readable. Override system działa konsekwentnie przez context object. Dobry baseline do dalszej rozbudowy (ADSR overrides dodać tu).

### Hardcoded values worth flagging

- **state.bpm** używane bezpośrednio w tickStepPlayback — OK dla live BPM ale tempo automation by tu nie zadziałała (sequencer nie ma tempo events)
- **gainOverride = velocity / 127** — linear hardcoded. Hook dla velocity curve (padCurve setting) powinien być tutaj.
- **event.duration / event.length COMPLETELY IGNORED** — voice gra (end - start) * buffer.duration. Foundation gap, see #2 below.

### Overrides vs additions

- **Override (event > assignment):** tune, filterCutoff, filterType, filterResonance (when appropriate appliedParameter)
- **Multiplier (event × assignment):** velocity × mix.level → final gain
- **Hardcoded (no event input):** pan, voiceMode/mono, chokeGroup, muteTargets, fineTune

---

## E. Fake UI Inventory

### Already documented (UX_AUDIT_FINDINGS)

1. **PROGRAM ATTACK** — slider edits value, engine ignores. CRITICAL, Phase A8.
2. **PROGRAM DECAY** — same as above. Engine uses for visual flash timeout only.
3. **16 LEVELS ATTACK/DECAY** — removed from PARAMETER cycle (Session 4). Returns after A8.

### Newly discovered in this audit

4. **StepEvent duration / length** — F3 DUR softkey w STEP screen edytuje wartość (clamp 1-96), playback ignores. Fake UI w core sequencer.

5. **FX SEND wszędzie** — MIX F5 FX SEND, PROGRAM FX SEND, per-channel fxSend in MIX. Brak FX engine (Phase A3). PROGRAM screen ma "VISUAL ONLY" label (uczciwe), **MIX screen NIE pokazuje że fake** (subtle fake).

6. **PAD MUTE / TRACK MUTE — GROUP softkey** — F3 GROUP jest plain string, brak handler. `getMuteStopGroups` patrzy tylko na PAIR muteTargets + chokeGroup. GROUP mode = no-op.

7. **SETTINGS fake fields:**
   - **bpmSync** — boolean, nigdzie nie używane
   - **midiClock** — brak MIDI engine (Phase A9)
   - **padCurve** — `"SOFT"|"LINEAR"|"HARD"`, hardcoded linear w playback. Easy fix (Foundation Gap #4)
   - **displayBrightness** — wymaga weryfikacji czy CSS hook gdzieś
   - **autoSave** — brak autosave (Phase A4)
   - **audioInputSource** — RECORD używa getDisplayMedia hardcoded, nie czyta tej wartości (grep 0 hits)
   - **latency** — slider 2-24, niewpięty (grep 0 hits)

8. **STEP event.type** — hardcoded constant `"NOTE"`. Tag istnieje, nigdy nie ma innej wartości. Low impact, martwy.

9. **STEP event.muted** — flag live w shouldPlayStepEvent, **brak UI control** toggling. Może być dead path lub ukryta UI — wymaga weryfikacji.

10. **PadAssignment mode** — `"ONE SHOT" | "NOTE ON"` only. MPC ma inne tryby (LOOP, GATE, TRIGGER). Nie fake per se ale niekompletny model.

### Open questions for future verification

- **event.muted** — czy gdziekolwiek toggluje (STEP screen prawym klikiem? F5 DELETE? ERASE flow?)
- **displayBrightness** — czy aplikowane do CSS gdzieś
- **event.type** — czy planowane do rozszerzenia (CC events) lub do usunięcia

---

## F. Foundation Gaps — Priority Ranking

### Gap #1: ADSR Envelope Engine — TOP PRIORITY

- **Impact:** HIGH — unblocks ATTACK/DECAY in PROGRAM (gone fake UI) + 16 LEVELS PARAMETER cycle pełen (5 params) + expressive sample playback (transient shaping, fade-outs, release ramps na NOTE ON)
- **Effort:** MEDIUM — ~200-400 linii. Plan: dodać envelope GainNode w playInternal z setValueAtTime + linearRampToValueAtTime per phase. Rozszerzyć PlayOptions o `envelope: { attackMs, decayMs, sustainLevel, releaseMs }`. Z PadAssignment mapować 0-100 → ms (decyzja: skala liniowa? log? co Akai robił?). NOTE ON musi mieć release path przy stopVoiceGroup zamiast natychmiastowego source.stop().
- **Risk:** MEDIUM — dotyka choke groups (czy choke ma fade-out czy natychmiastowy?), mono voice management (mono replace = natychmiastowy stop, czy attack na nowym voice?), 16 LEVELS APPLIED behavior dla ATTACK/DECAY parameter mode.
- **Blocks:** ATTACK/DECAY fake UI dismissal, 16 LEVELS full parity (5 params), real event.duration semantics, expressive sample playback.

### Gap #2: event.duration Real Implementation — BUNDLE WITH #1

- **Impact:** MEDIUM-HIGH — duration jest na każdym StepEvent, edytowalna F3 DUR, ignorowana. Direct fake UI w core sequencer flow.
- **Effort:** LOW-MEDIUM — zależy od ADSR. Z ADSR: duration kontroluje release point (gate time). Bez ADSR: można policzyć `(duration / 24) * stepMs` i schedule source.stop() po tym czasie. Drugie podejście = quick fix, pierwsze = correct.
- **Risk:** LOW.
- **Blocks:** Step gate time, longer sustained notes vs short staccato hits, real NOTE ON release scheduling.
- **Rekomendacja:** pair z #1 — implementować razem.

### Gap #3: Real Undo/Redo State History

- **Impact:** HIGH — safety net dla wszystkich edits (16 LEVELS APPLY, PROGRAM changes, sequence edits, MIX moves). Obecnie undoHistory to log etykiet bez rollback path. Czyni risky operations bezpieczne.
- **Effort:** HIGH — architecture change. Snapshot-based (clone state per change) lub event-sourcing (replay diffs). Snapshot prostsze, memory-heavy. Event-sourcing elastyczne, complex.
- **Risk:** MEDIUM-HIGH — dotyka każdej action w storze.
- **Blocks:** Phase A11 explicit, user confidence w destructive operacjach.

### Gap #4: Velocity Curve (padCurve wired)

- **Impact:** LOW-MEDIUM — pad-feel tuning. Linear default, SOFT (vel²/127²), HARD (sqrt) byłyby standard.
- **Effort:** LOW — 1 helper function + 1 hook w playStepEventFromState. ~20 linii.
- **Risk:** LOW.
- **Blocks:** Nothing critical.

### Gap #5: event.muted UI

- **Impact:** LOW — feature istnieje w playback, brak UI. Decyzja "expose or remove".
- **Effort:** LOW.
- **Risk:** LOW.

### Gap #6: FX Engine (Phase A3 explicit)

- **Impact:** HIGH dla product completeness — fxSend wszędzie fake.
- **Effort:** HIGH — Roadmap A3 (reverb/delay/flanger/chorus/compressor/EQ/bitcrusher + per-pad insert + sends + master).
- **Risk:** MEDIUM-HIGH.
- **Rekomendacja:** NIE atakować jako foundation work — duży scope, mniej fundament niż ADSR/undo.

### Gap #7: Sequencer Tempo / Time Signature Flexibility

- **Impact:** LOW — beatsPerBar zwraca zawsze 4 (typo `"4\4"` zamiast `"4/4"`). 3/4, 6/8, 7/8 wymagane dla non-4/4.
- **Effort:** MEDIUM — fix beatsPerBar + audit każdego miejsca z hardcoded 4 (PPQ math, step grids, count-in).
- **Risk:** MEDIUM — sequencer timing math.

### Gap #8: Settings Fake Fields Cleanup

- **Impact:** LOW (UX cleanup) — większość czeka na inne phases.
- **Effort:** LOW — label "VISUAL ONLY" lub schować lub "(future)" suffix.
- **Risk:** LOW.

---

## Recommended Order

**Faza 1 (foundation):** Gap #1 ADSR + Gap #2 event.duration BUNDLED. Next session.

**Faza 2 (foundation):** Gap #3 real undo/redo. Architectural session.

**Faza 3 (cleanup pass):** Gap #4 padCurve + Gap #5 event.muted + Gap #7 typo + Gap #8 settings. One quick session.

**Faza 4 (big features):** Gap #6 FX engine. Roadmap A3 dedicated, multiple sessions.

---

## Surface Findings

- **"4\4" typo** w `beatsPerBar` (useAppStore.ts L4127) — backslash zamiast forward slash. Match fails → zawsze fallback 4. Latent bug dla non-4/4.
- **assignment.decay dual purpose** — cosmetic flash timeout AND (planned) audio decay. Naprawiając ADSR: rozłączyć czy unified field z dwoma użyciami?
- **padCurve i velocity → gain** to dwie osobne rzeczy które nigdy się nie spotkały. LOW effort fix gdy dotykamy velocity path.
- **event.type** constant `"NOTE"`. Może być zostawione na rozszerzenie (CC events, parameter automation) lub usunięte. Decision nie pilne.
- **previewGroup w PlayOptions** ("metronome", "chop-trim-loop") to zdrowy mechanism który nieświadomie zastępuje envelope cancellation dla single-shot previews. Nie fake, dobry pattern.

---

## Reference

This document captures the audit conducted in Session 4 (2026-05-20) after closing the 16 LEVELS feature work (iter 2 with TUNE+FILTER+recording+playback) and the related polish (metronome accent, count-in timing fix, double STOP panic).

**Methodology:** AI-assisted code grep + state shape inspection. Marek verified critical findings via live audio tests (ATTACK/DECAY confirmed inaudible, TUNE/FILTER per-pad confirmed audible).

**Next steps:** see Recommended Order above. Foundation-First Development principle (CLAUDE.md) applies to all subsequent feature work.