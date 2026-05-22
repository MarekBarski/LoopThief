// ===========================================================================
// LoopThief native audio capture — Phase 1.
//
// Public API surface (Tauri commands wrap these). Platform-agnostic types;
// implementation in capture.rs (uses cpal which abstracts WASAPI on Windows
// and PipeWire/PulseAudio on Linux).
//
// Lifecycle (single global engine, shared via tauri::State<AudioEngineState>):
//
//   1. App boot: engine is created in Idle state. No capture, no resources.
//   2. JS calls audio_list_devices() to populate SETTINGS dropdowns.
//   3. JS calls audio_start_capture(config) — engine opens input/output
//      streams, starts cpal callback. Pre-roll ring buffer (1 s) fills
//      continuously. Engine state: Capturing.
//   4. JS calls audio_start_recording() — engine atomically flips a flag.
//      cpal callback starts copying frames into the recording accumulator,
//      beginning with the 250 ms of pre-roll already in the ring buffer.
//      Frames are also emitted via Tauri event "audio:frame" so JS can show
//      a live waveform.
//   5. JS calls audio_stop_recording() — engine returns the accumulated
//      Float32 buffer.
//   6. JS calls audio_stop_capture() to shut everything down. Engine
//      returns to Idle.
//
// Pre-roll behaviour: the ring buffer is always filling once Capturing is
// active. When recording starts, the engine drains the most recent 250 ms
// of the ring into the recording accumulator BEFORE allowing the live
// callback to append more frames. This is the MPC/SP-1200 "pre-trigger"
// behaviour: the transient that crossed the threshold (or the moment
// before the user clicked REC) is captured, not lost.
// ===========================================================================

use serde::{Deserialize, Serialize};

pub mod capture;
pub mod devices;

pub use capture::{AudioEngine, AudioEngineState};
pub use devices::{list_devices_impl, AudioDevice};
#[allow(unused_imports)]
pub use devices::DeviceKind;

/// Configuration handed in from JS when starting capture.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioConfig {
    pub input_device_id: Option<String>,
    pub output_device_id: Option<String>,
    pub sample_rate: u32,
    pub buffer_size: u32,
    pub channels: u16,
    /// Windows-only; "shared" or "exclusive". Ignored on other platforms.
    pub wasapi_mode: String,
    /// "off" | "direct" | "throughfx". Phase 2 wires the routing; for now
    /// the engine just stores the requested mode so the config round-trips
    /// cleanly through serde.
    #[serde(default)]
    pub monitor_mode: String,
}

impl Default for AudioConfig {
    fn default() -> Self {
        Self {
            input_device_id: None,
            output_device_id: None,
            sample_rate: 44_100,
            buffer_size: 128,
            channels: 2,
            wasapi_mode: "shared".to_string(),
            monitor_mode: "off".to_string(),
        }
    }
}

/// Monitor routing for live input. Wired into Tauri commands in Phase 2
/// when the SETTINGS AUDIO panel lands; allowed dead_code here so the type
/// stays in the public surface without breaking the build.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[allow(dead_code)]
pub enum MonitorMode {
    Off,
    Direct,
    ThroughFx,
}

impl Default for MonitorMode {
    fn default() -> Self {
        MonitorMode::Off
    }
}

/// Payload emitted on the `audio:frame` Tauri event during recording.
#[derive(Debug, Clone, Serialize)]
pub struct AudioFramePayload {
    pub samples: Vec<f32>,
    pub channels: u16,
    pub sample_rate: u32,
}
