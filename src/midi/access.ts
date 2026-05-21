/**
 * Web MIDI API wrapper. Handles permission request, device enumeration,
 * input message dispatch, and output send. Single module owns the live
 * `MIDIAccess` instance + the currently-subscribed input.
 *
 * All higher-level concerns (pad triggering, CC routing, clock sync) live in
 * the store. This module only translates between raw bytes and structured
 * messages.
 */

export type MidiInputDevice = { id: string; name: string };
export type MidiOutputDevice = { id: string; name: string };

export type MidiMessage =
  | { type: "NOTE_ON"; channel: number; note: number; velocity: number }
  | { type: "NOTE_OFF"; channel: number; note: number; velocity: number }
  | { type: "CC"; channel: number; controller: number; value: number }
  | { type: "CLOCK" }
  | { type: "START" }
  | { type: "CONTINUE" }
  | { type: "STOP" }
  | { type: "OTHER"; status: number };

type MidiAccessLike = {
  inputs: Map<string, MIDIInput>;
  outputs: Map<string, MIDIOutput>;
  onstatechange: ((event: MIDIConnectionEvent) => void) | null;
};

type MidiInputLike = {
  id: string;
  name: string | null;
  onmidimessage: ((event: { data: Uint8Array }) => void) | null;
};

type MidiOutputLike = {
  id: string;
  name: string | null;
  send: (data: number[] | Uint8Array, timestamp?: number) => void;
};

// Reference Web MIDI types for clarity. They are declared globally by `lib.dom`.
type MIDIInput = MidiInputLike;
type MIDIOutput = MidiOutputLike;
type MIDIConnectionEvent = { port: { id: string; name: string | null; type: "input" | "output" } };

let access: MidiAccessLike | null = null;
let subscribedInputId: string | null = null;
let messageHandler: ((message: MidiMessage) => void) | null = null;
let stateChangeHandler: (() => void) | null = null;

export function isMidiSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.requestMIDIAccess === "function";
}

export async function requestMidiAccess(): Promise<boolean> {
  if (!isMidiSupported()) return false;
  try {
    access = (await navigator.requestMIDIAccess({ sysex: false })) as unknown as MidiAccessLike;
    access.onstatechange = () => {
      stateChangeHandler?.();
    };
    return true;
  } catch {
    access = null;
    return false;
  }
}

export function onMidiStateChange(handler: (() => void) | null): void {
  stateChangeHandler = handler;
}

export function listInputs(): MidiInputDevice[] {
  if (!access) return [];
  const out: MidiInputDevice[] = [];
  access.inputs.forEach((input) => {
    out.push({ id: input.id, name: input.name ?? input.id });
  });
  return out;
}

export function listOutputs(): MidiOutputDevice[] {
  if (!access) return [];
  const out: MidiOutputDevice[] = [];
  access.outputs.forEach((output) => {
    out.push({ id: output.id, name: output.name ?? output.id });
  });
  return out;
}

function parseMidi(data: Uint8Array): MidiMessage {
  const status = data[0] ?? 0;
  // Real-time / system common messages have status >= 0xF0.
  if (status === 0xf8) return { type: "CLOCK" };
  if (status === 0xfa) return { type: "START" };
  if (status === 0xfb) return { type: "CONTINUE" };
  if (status === 0xfc) return { type: "STOP" };
  const high = status & 0xf0;
  const channel = (status & 0x0f) + 1; // 1-16
  if (high === 0x90) {
    const velocity = data[2] ?? 0;
    if (velocity === 0) {
      return { type: "NOTE_OFF", channel, note: data[1] ?? 0, velocity: 0 };
    }
    return { type: "NOTE_ON", channel, note: data[1] ?? 0, velocity };
  }
  if (high === 0x80) {
    return { type: "NOTE_OFF", channel, note: data[1] ?? 0, velocity: data[2] ?? 0 };
  }
  if (high === 0xb0) {
    return { type: "CC", channel, controller: data[1] ?? 0, value: data[2] ?? 0 };
  }
  return { type: "OTHER", status };
}

export function subscribeToInput(
  deviceId: string | null,
  handler: ((message: MidiMessage) => void) | null,
): void {
  if (!access) return;
  // Detach previous subscription.
  if (subscribedInputId) {
    const previous = access.inputs.get(subscribedInputId);
    if (previous) previous.onmidimessage = null;
  }
  subscribedInputId = deviceId;
  messageHandler = handler;
  if (!deviceId || !handler) return;
  const input = access.inputs.get(deviceId);
  if (!input) return;
  input.onmidimessage = (event) => {
    handler(parseMidi(event.data));
  };
}

export function sendMessage(deviceId: string | null, bytes: number[]): void {
  if (!access || !deviceId) return;
  const output = access.outputs.get(deviceId);
  if (!output) return;
  try {
    output.send(bytes);
  } catch {
    /* device may have been unplugged between enumeration and send */
  }
}

// Convenience helpers for common messages. Channel here is 1-16.
export function noteOn(deviceId: string | null, channel: number, note: number, velocity: number): void {
  const ch = Math.max(0, Math.min(15, channel - 1));
  sendMessage(deviceId, [0x90 | ch, note & 0x7f, velocity & 0x7f]);
}

export function noteOff(deviceId: string | null, channel: number, note: number): void {
  const ch = Math.max(0, Math.min(15, channel - 1));
  sendMessage(deviceId, [0x80 | ch, note & 0x7f, 0]);
}

export function sendClock(deviceId: string | null): void {
  sendMessage(deviceId, [0xf8]);
}

export function sendTransport(deviceId: string | null, kind: "START" | "STOP" | "CONTINUE"): void {
  const byte = kind === "START" ? 0xfa : kind === "STOP" ? 0xfc : 0xfb;
  sendMessage(deviceId, [byte]);
}

// Unused-locals guards so TS doesn't complain about the deliberate single-state model.
void messageHandler;
