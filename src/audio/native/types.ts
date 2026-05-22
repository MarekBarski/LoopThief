// Shared types between the Rust audio module (src-tauri/src/audio/) and the
// JS bridge. Field names mirror the camelCase serde renames on the Rust
// structs so Tauri command (de)serialisation is transparent.

export type DeviceKind = "input" | "output" | "loopback";

export interface AudioDevice {
  id: string;
  name: string;
  kind: DeviceKind;
  isDefault: boolean;
  nativeSampleRate: number;
  nativeChannels: number;
  supportsExclusiveMode: boolean;
}

export type MonitorMode = "off" | "direct" | "throughfx";

export interface AudioConfig {
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  sampleRate: number;
  bufferSize: number;
  channels: number;
  /** "shared" | "exclusive" — Windows only. */
  wasapiMode: "shared" | "exclusive";
  monitorMode: MonitorMode;
}

export interface AudioFramePayload {
  samples: number[];
  channels: number;
  sampleRate: number;
}

export interface NativeRecordingResult {
  samples: number[];
  sampleRate: number;
  channels: number;
}

export function defaultAudioConfig(): AudioConfig {
  return {
    inputDeviceId: null,
    outputDeviceId: null,
    sampleRate: 44_100,
    bufferSize: 128,
    channels: 2,
    wasapiMode: "shared",
    monitorMode: "off",
  };
}
