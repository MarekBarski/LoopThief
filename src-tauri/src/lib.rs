use serde::Deserialize;
use tauri::{Emitter, Manager, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FsExt;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![save_file_dialog])
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
