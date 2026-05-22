use serde::Deserialize;
use tauri::{Emitter, Manager, State, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FsExt;

mod audio;

use audio::{AudioConfig, AudioDevice, AudioEngine, AudioEngineState};

// ---------------------------------------------------------------------------
// Custom save dialog command — replaces tauri-plugin-dialog's `save()` for
// the LoopThief save flow. Marek measured a ~2-3 s lag in release builds on
// every `dialog.save()` call (vs instant `dialog.open()`) traced to rfd's
// IFileSaveDialog initialisation. native-dialog crate is a lighter wrapper
// over the same OS APIs and benchmarks instant in release.
//
// Returns:
//   Ok(Some(path))  — user picked a file
//   Ok(None)        — user cancelled
//   Err(message)    — backend failure (permission, missing folder, etc.)
// ---------------------------------------------------------------------------
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveDialogFilter {
    name: String,
    extensions: Vec<String>,
}

#[tauri::command]
async fn save_file_dialog(
    default_path: Option<String>,
    filters: Option<Vec<SaveDialogFilter>>,
) -> Result<Option<String>, String> {
    // native-dialog's show_save_single_file is blocking; run on a dedicated
    // OS thread instead of the tokio runtime worker so we don't stall async tasks.
    tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = native_dialog::FileDialog::new();

        // defaultPath from JS may be absolute (we resolve via documentDir +
        // join on the frontend), so split into directory + filename.
        if let Some(default_path) = &default_path {
            let path = std::path::Path::new(default_path);
            if let Some(parent) = path.parent() {
                if !parent.as_os_str().is_empty() && parent.exists() {
                    dialog = dialog.set_location(parent);
                }
            }
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                dialog = dialog.set_filename(name);
            }
        }

        // native-dialog 0.7 add_filter signature: `description: &'a str, extensions: &'a [&'a str]`.
        // All filter strings must share the FileDialog's lifetime, so pre-collect
        // `&str` slices into stable storage BEFORE the loop (a Vec<&str> built
        // inside the loop would dangle by the next iteration / show call).
        let ext_slices: Vec<Vec<&str>> = match &filters {
            Some(filters) => filters
                .iter()
                .map(|f| f.extensions.iter().map(|s| s.as_str()).collect())
                .collect(),
            None => Vec::new(),
        };
        if let Some(filters) = &filters {
            for (i, filter) in filters.iter().enumerate() {
                dialog = dialog.add_filter(&filter.name, &ext_slices[i]);
            }
        }

        match dialog.show_save_single_file() {
            Ok(Some(path)) => Ok(Some(path.to_string_lossy().to_string())),
            Ok(None) => Ok(None),
            Err(err) => Err(err.to_string()),
        }
    })
    .await
    .map_err(|e| format!("join error: {e}"))?
}

// ---------------------------------------------------------------------------
// Native audio capture commands. Phase 1 (cpal backend + event-channel
// transport). See src-tauri/src/audio/ for implementation.
// ---------------------------------------------------------------------------

#[tauri::command]
async fn audio_list_devices() -> Result<Vec<AudioDevice>, String> {
    // cpal device enumeration is blocking on Windows (it iterates COM
    // endpoints). Run on a blocking thread so we don't stall tokio.
    tauri::async_runtime::spawn_blocking(audio::list_devices_impl)
        .await
        .map_err(|e| format!("join error: {e}"))?
}

#[tauri::command]
fn audio_start_capture(
    app: tauri::AppHandle,
    state: State<'_, AudioEngineState>,
    config: AudioConfig,
) -> Result<(), String> {
    let mut guard = state.engine.lock().map_err(|e| format!("engine lock: {e}"))?;
    if guard.is_some() {
        return Err("capture already running".to_string());
    }
    let engine = AudioEngine::start(app, config)?;
    *guard = Some(engine);
    Ok(())
}

#[tauri::command]
fn audio_stop_capture(state: State<'_, AudioEngineState>) -> Result<(), String> {
    let mut guard = state.engine.lock().map_err(|e| format!("engine lock: {e}"))?;
    *guard = None; // dropping closes streams
    Ok(())
}

#[tauri::command]
fn audio_start_recording(state: State<'_, AudioEngineState>) -> Result<(), String> {
    let guard = state.engine.lock().map_err(|e| format!("engine lock: {e}"))?;
    let engine = guard.as_ref().ok_or_else(|| "capture not running".to_string())?;
    engine.start_recording()
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordingResult {
    samples: Vec<f32>,
    sample_rate: u32,
    channels: u16,
}

#[tauri::command]
fn audio_stop_recording(state: State<'_, AudioEngineState>) -> Result<RecordingResult, String> {
    let guard = state.engine.lock().map_err(|e| format!("engine lock: {e}"))?;
    let engine = guard.as_ref().ok_or_else(|| "capture not running".to_string())?;
    let samples = engine.stop_recording()?;
    Ok(RecordingResult {
        samples,
        sample_rate: engine.sample_rate(),
        channels: engine.channels(),
    })
}

#[tauri::command]
fn audio_get_current_level(state: State<'_, AudioEngineState>) -> Result<f32, String> {
    let guard = state.engine.lock().map_err(|e| format!("engine lock: {e}"))?;
    Ok(guard.as_ref().map(|e| e.current_level()).unwrap_or(0.0))
}

#[tauri::command]
fn audio_is_running(state: State<'_, AudioEngineState>) -> Result<bool, String> {
    let guard = state.engine.lock().map_err(|e| format!("engine lock: {e}"))?;
    Ok(guard.is_some())
}

/// Hot-swap the input device by tearing down and rebuilding the input
/// stream. The forwarder thread + recording accumulator are kept across
/// the swap; the user notices a brief glitch (one buffer worth) but no
/// engine restart.
///
/// For Phase 2 simplicity we implement this as a full restart with the
/// updated config — atomic from the JS side, preserves the engine state
/// shape. The previous engine is dropped (closes its stream) before the
/// new one is constructed.
#[tauri::command]
fn audio_set_input_device(
    app: tauri::AppHandle,
    state: State<'_, AudioEngineState>,
    device_id: String,
) -> Result<(), String> {
    let mut guard = state.engine.lock().map_err(|e| format!("engine lock: {e}"))?;
    let current_config = guard
        .as_ref()
        .map(|e| e.config().clone())
        .ok_or_else(|| "capture not running".to_string())?;
    let new_config = AudioConfig {
        input_device_id: Some(device_id),
        ..current_config
    };
    *guard = None;
    *guard = Some(AudioEngine::start(app, new_config)?);
    Ok(())
}

/// Output device swap is a no-op at the audio engine level for now —
/// monitor routing happens JS-side via Web Audio, so the OS output
/// selection is owned by Web Audio's AudioContext, not by cpal. We
/// still expose the command so the JS bridge has a complete surface
/// (Phase 3 may bring native output back here for low-latency monitor).
#[tauri::command]
fn audio_set_output_device(
    _state: State<'_, AudioEngineState>,
    _device_id: String,
) -> Result<(), String> {
    // Intentional no-op for Phase 2. JS-side monitor routing handles output.
    Ok(())
}

/// Monitor mode setter — currently informational only on the Rust side.
/// Actual monitor routing happens in JS via Web Audio (audio:frame
/// events → AudioBuffer → AudioContext destination, optionally via
/// fxEngine for Through FX). Stored so future restart restores it.
#[tauri::command]
fn audio_set_monitor_mode(
    _state: State<'_, AudioEngineState>,
    _mode: String,
) -> Result<(), String> {
    Ok(())
}

/// Full engine restart with new config. Used by the SETTINGS AUDIO
/// "APPLY & RESTART" button when dirty fields (sample rate, buffer
/// size, channels, WASAPI mode) change. Drops the current engine
/// (closes streams) then constructs a fresh one.
#[tauri::command]
fn audio_restart_engine(
    app: tauri::AppHandle,
    state: State<'_, AudioEngineState>,
    config: AudioConfig,
) -> Result<(), String> {
    let mut guard = state.engine.lock().map_err(|e| format!("engine lock: {e}"))?;
    *guard = None;
    let engine = AudioEngine::start(app, config)?;
    *guard = Some(engine);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AudioEngineState::new())
        .invoke_handler(tauri::generate_handler![
            save_file_dialog,
            audio_list_devices,
            audio_start_capture,
            audio_stop_capture,
            audio_start_recording,
            audio_stop_recording,
            audio_get_current_level,
            audio_is_running,
            audio_set_input_device,
            audio_set_output_device,
            audio_set_monitor_mode,
            audio_restart_engine,
        ])
        .setup(|app| {
            let _ = app.dialog();
            let _ = app.fs();

            // Best-effort dialog warmup on a background thread. Marek's
            // timing logs (release .exe) localised the ~3 s freeze inside
            // dialog.save() itself — the cost likely lives in cold-init of
            // the `rfd` crate (COM init / WinRT / IFileSaveDialog plumbing)
            // that tauri-plugin-dialog runs on first invocation. By
            // constructing a FileDialogBuilder here (without ever calling
            // .save_file() / .pick_file()), we try to pre-load rfd's
            // library state without showing UI to the user. This may not
            // warm COM itself (that happens inside the .show() call on the
            // dialog's own thread), but it does at least force any
            // lazily-initialised plugin / crate state to resolve before the
            // user clicks anything.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let _ = handle
                    .dialog()
                    .file()
                    .add_filter("warmup", &["lthief"])
                    .set_file_name("warmup");
            });

            // Auto-open DevTools only in debug builds — keeps release .exe
            // clean for shipping users.
            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Intercept close (title bar X, Alt+F4, system shortcuts) and let
                // the JS layer show the QUIT dialog instead. JS calls `destroy()`
                // when the user confirms — that bypasses this handler.
                api.prevent_close();
                let _ = window.app_handle().emit("close-requested", ());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
