// ===========================================================================
// Audio device enumeration.
//
// Returns a unified list combining:
//   - Physical input endpoints (mics, line-ins, USB audio interfaces)
//   - Output endpoints exposed twice: once as Output, and once as
//     "Loopback: <name>" pseudo-input (for system-audio sampling). On
//     Windows this is implemented through WASAPI loopback; cpal exposes it
//     by allowing build_input_stream on output devices.
//
// Device IDs are platform-specific strings. On Windows cpal uses the
// endpoint friendly name; on Linux it uses the PulseAudio/PipeWire node
// name. JS treats them as opaque tokens — no parsing.
// ===========================================================================

use cpal::traits::{DeviceTrait, HostTrait};
use serde::{Deserialize, Serialize};

/// Get the cpal host explicitly. On Windows we MUST use WASAPI for both
/// input enumeration consistency and loopback support (other hosts like
/// ASIO don't support output-as-input loopback). On Linux cpal picks
/// ALSA/JACK/PipeWire via PulseAudio bridge through default_host().
///
/// Made `pub(crate)` so capture.rs uses the same host as enumeration —
/// otherwise the device returned by enumeration may not be usable by
/// capture (different host = different device list).
pub(crate) fn get_host() -> cpal::Host {
    #[cfg(target_os = "windows")]
    {
        match cpal::host_from_id(cpal::HostId::Wasapi) {
            Ok(host) => host,
            Err(err) => {
                eprintln!("[audio] WASAPI host unavailable ({err}); falling back to default host");
                cpal::default_host()
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        cpal::default_host()
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DeviceKind {
    Input,
    Output,
    Loopback,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub kind: DeviceKind,
    pub is_default: bool,
    pub native_sample_rate: u32,
    pub native_channels: u16,
    pub supports_exclusive_mode: bool,
}

/// Enumerate every device the OS exposes, plus a "Loopback: …" pseudo-input
/// for each output. Order: physical inputs, then loopback pseudo-inputs,
/// then outputs. The default for each category is marked `is_default`.
pub fn list_devices_impl() -> Result<Vec<AudioDevice>, String> {
    let host = get_host();
    let default_input_name = host
        .default_input_device()
        .and_then(|d| d.name().ok())
        .unwrap_or_default();
    let default_output_name = host
        .default_output_device()
        .and_then(|d| d.name().ok())
        .unwrap_or_default();

    let mut devices: Vec<AudioDevice> = Vec::new();

    // ---------- Physical inputs ----------
    if let Ok(input_devices) = host.input_devices() {
        for device in input_devices {
            let name = match device.name() {
                Ok(n) => n,
                Err(_) => continue,
            };
            let id = name.clone();
            let (rate, channels) = default_input_format(&device);
            devices.push(AudioDevice {
                id,
                name: name.clone(),
                kind: DeviceKind::Input,
                is_default: name == default_input_name,
                native_sample_rate: rate,
                native_channels: channels,
                supports_exclusive_mode: cfg!(target_os = "windows"),
            });
        }
    }

    // ---------- Outputs (as Output + Loopback pseudo-inputs) ----------
    if let Ok(output_devices) = host.output_devices() {
        for device in output_devices {
            let name = match device.name() {
                Ok(n) => n,
                Err(_) => continue,
            };
            let (rate, channels) = default_output_format(&device);

            // Loopback pseudo-input first (so user sees the natural default
            // at the top of the input dropdown). On Windows cpal opens this
            // through WASAPI's AUDCLNT_STREAMFLAGS_LOOPBACK flag when an
            // input stream is requested on an output device.
            devices.push(AudioDevice {
                id: format!("loopback::{name}"),
                name: format!("Loopback: {name}"),
                kind: DeviceKind::Loopback,
                is_default: name == default_output_name,
                native_sample_rate: rate,
                native_channels: channels,
                supports_exclusive_mode: cfg!(target_os = "windows"),
            });

            // Output endpoint itself.
            devices.push(AudioDevice {
                id: name.clone(),
                name: name.clone(),
                kind: DeviceKind::Output,
                is_default: name == default_output_name,
                native_sample_rate: rate,
                native_channels: channels,
                supports_exclusive_mode: cfg!(target_os = "windows"),
            });
        }
    }

    Ok(devices)
}

fn default_input_format(device: &cpal::Device) -> (u32, u16) {
    match device.default_input_config() {
        Ok(cfg) => (cfg.sample_rate().0, cfg.channels()),
        Err(_) => (44_100, 2),
    }
}

fn default_output_format(device: &cpal::Device) -> (u32, u16) {
    match device.default_output_config() {
        Ok(cfg) => (cfg.sample_rate().0, cfg.channels()),
        Err(_) => (44_100, 2),
    }
}

/// Locate a device by the ID returned from `list_devices_impl`. Handles the
/// "loopback::" prefix transparently and returns the wrapped device + a
/// flag indicating whether to open it as a loopback input.
pub fn resolve_device(id: &str) -> Result<(cpal::Device, bool), String> {
    let host = get_host();
    let (target_name, want_loopback) = if let Some(rest) = id.strip_prefix("loopback::") {
        (rest.to_string(), true)
    } else {
        (id.to_string(), false)
    };

    let search_iter = if want_loopback {
        host.output_devices().map_err(|e| e.to_string())?
    } else {
        // Try inputs first, then outputs (some interfaces appear in both
        // when used for monitoring).
        let mut combined: Vec<cpal::Device> = host
            .input_devices()
            .map_err(|e| e.to_string())?
            .collect();
        combined.extend(host.output_devices().map_err(|e| e.to_string())?);
        return combined
            .into_iter()
            .find(|d| d.name().map(|n| n == target_name).unwrap_or(false))
            .map(|d| (d, false))
            .ok_or_else(|| format!("device not found: {target_name}"));
    };

    search_iter
        .into_iter()
        .find(|d| d.name().map(|n| n == target_name).unwrap_or(false))
        .map(|d| (d, want_loopback))
        .ok_or_else(|| format!("loopback target not found: {target_name}"))
}

/// Default input device for first-boot config (prefer system default output
/// as loopback so the user's "sample YouTube" workflow works without any
/// manual setup).
pub fn default_input_id() -> Option<String> {
    let host = get_host();
    let name = host.default_output_device()?.name().ok()?;
    Some(format!("loopback::{name}"))
}

#[allow(dead_code)]
pub fn default_output_id() -> Option<String> {
    let host = get_host();
    host.default_output_device()?.name().ok()
}
