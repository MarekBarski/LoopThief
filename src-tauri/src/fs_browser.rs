// In-LCD file browser — native filesystem commands (Sub-phase A).
//
// This module exposes a small set of Tauri commands that the future custom
// FileBrowser React component (Sub-phase B+) will call to enumerate drives,
// list directories, and read/write files. The goal is to replace WebView2's
// HTML `<input type="file">` (which renders as a full native Windows file
// dialog and cannot be styled to match the LoopThief LCD aesthetic, nor host
// audio preview) with a self-rendered LCD-viewport dialog.
//
// Scope of this module (Sub-phase A):
//   - fs_list_locations: top-level drives / mount points + Desktop shortcut,
//     cached after first call, manual refresh via `force_refresh = true`.
//   - fs_list_directory: read_dir + extension filter + sort (dirs-first,
//     then files alphabetically). For `.wav` entries, parses the RIFF header
//     inline (~30 LOC, no `hound` dep) to extract duration in milliseconds.
//   - fs_read_file_bytes / fs_write_file_bytes: raw byte I/O for sample
//     preview and save flows.
//   - fs_create_folder: mkdir for SAVE_* "F2 NEW FOLDER" softkey.
//   - fs_path_exists: for overwrite-confirmation overlays in save modes.
//
// Out of scope (Sub-phase D):
//   - Strict path-safety hardening (canonicalise + root-prefix check). The
//     UI in B/C only ever passes paths it received from this module, so a
//     malicious-path scenario doesn't arise from honest UI use; harden
//     before ship.

use std::collections::HashSet;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;

// ---------------------------------------------------------------------------
// Public types — must stay serde-stable for the JS bridge.
// ---------------------------------------------------------------------------

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FsLocation {
    /// Short label shown in the LOCATIONS sidebar ("C:", "Desktop", "/home").
    pub label: String,
    /// Absolute path to navigate into when the location is selected.
    pub path: String,
    /// Origin of the entry — drives nest, mounts root-mount, shortcuts are
    /// resolved user folders.
    pub kind: FsLocationKind,
}

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub enum FsLocationKind {
    Drive,
    // `MountPoint` is only constructed on Linux; suppress the dead-code warning
    // on Windows builds where the linux-only enumerator isn't compiled.
    #[allow(dead_code)]
    MountPoint,
    Shortcut,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    /// File size in bytes. `None` for directories.
    pub size_bytes: Option<u64>,
    /// ISO 8601 (UTC) modified timestamp. `None` for directories or when the
    /// host filesystem doesn't expose mtime (rare).
    pub modified: Option<String>,
    /// For `.wav` files only — duration in milliseconds parsed from the RIFF
    /// header. `None` for non-WAV files or malformed headers.
    pub duration_ms: Option<u64>,
}

// ---------------------------------------------------------------------------
// Locations cache — populated once at first call, manual refresh on demand.
// Held in a Tauri-managed state value so all commands share the same Mutex.
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct LocationsCache {
    inner: Mutex<Option<Vec<FsLocation>>>,
}

impl LocationsCache {
    pub fn new() -> Self {
        Self { inner: Mutex::new(None) }
    }

    fn get_or_build(&self) -> Vec<FsLocation> {
        let mut guard = self.inner.lock().unwrap();
        if let Some(cached) = guard.as_ref() {
            return cached.clone();
        }
        let fresh = enumerate_locations();
        *guard = Some(fresh.clone());
        fresh
    }

    fn refresh(&self) -> Vec<FsLocation> {
        let mut guard = self.inner.lock().unwrap();
        let fresh = enumerate_locations();
        *guard = Some(fresh.clone());
        fresh
    }
}

// ---------------------------------------------------------------------------
// Tauri command surface — all async to keep the WebView event loop free.
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn fs_list_locations(
    force_refresh: Option<bool>,
    cache: tauri::State<'_, LocationsCache>,
) -> Result<Vec<FsLocation>, String> {
    if force_refresh.unwrap_or(false) {
        Ok(cache.refresh())
    } else {
        Ok(cache.get_or_build())
    }
}

#[tauri::command]
pub async fn fs_list_directory(
    path: String,
    extensions: Vec<String>,
) -> Result<Vec<FsEntry>, String> {
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Err(format!("path does not exist: {path}"));
    }
    if !target.is_dir() {
        return Err(format!("not a directory: {path}"));
    }

    // Normalise extensions to lowercase, strip a leading dot if the caller
    // included it. Empty list = no filter (everything passes — used by future
    // "show all files" modes if added).
    let filter_set: HashSet<String> = extensions
        .into_iter()
        .map(|ext| ext.trim_start_matches('.').to_ascii_lowercase())
        .collect();
    let no_filter = filter_set.is_empty();

    let read_dir = fs::read_dir(&target)
        .map_err(|err| format!("read_dir failed: {err}"))?;

    let mut dirs: Vec<FsEntry> = Vec::new();
    let mut files: Vec<FsEntry> = Vec::new();

    for entry_result in read_dir {
        let entry = match entry_result {
            Ok(entry) => entry,
            // Permission errors on individual entries shouldn't kill the whole
            // listing — skip and continue.
            Err(_) => continue,
        };
        let metadata = match entry.metadata() {
            Ok(meta) => meta,
            Err(_) => continue,
        };
        // Skip files that the OS marks as hidden? Not in scope for Sub-phase A.
        // The current decision is: show everything except files that fail
        // metadata read. Hidden-file filtering can be added in Sub-phase D
        // if Marek finds the unfiltered listing noisy.

        let file_name = entry.file_name();
        let name = file_name.to_string_lossy().to_string();
        let full_path = entry.path();
        let path_str = full_path.to_string_lossy().to_string();
        let is_dir = metadata.is_dir();

        if !is_dir {
            // Filter files by extension (case-insensitive). Directories always
            // pass — navigation needs them.
            if !no_filter {
                let ext = full_path
                    .extension()
                    .and_then(|s| s.to_str())
                    .map(|s| s.to_ascii_lowercase());
                match ext {
                    Some(actual) if filter_set.contains(&actual) => {}
                    _ => continue,
                }
            }
        }

        let size_bytes = if is_dir { None } else { Some(metadata.len()) };
        let modified = metadata
            .modified()
            .ok()
            .and_then(format_system_time_iso8601);

        let duration_ms = if !is_dir && is_wav_path(&full_path) {
            read_wav_duration_ms(&full_path).ok()
        } else {
            None
        };

        let row = FsEntry {
            name,
            path: path_str,
            is_dir,
            size_bytes,
            modified,
            duration_ms,
        };
        if is_dir {
            dirs.push(row);
        } else {
            files.push(row);
        }
    }

    // Folders first, then files. Both sorted case-insensitively by name —
    // matches MPC convention and avoids ALL-CAPS files clustering at top.
    dirs.sort_by(|a, b| a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase()));
    files.sort_by(|a, b| a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase()));
    dirs.extend(files);
    Ok(dirs)
}

#[tauri::command]
pub async fn fs_read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|err| format!("read failed: {err}"))
}

#[tauri::command]
pub async fn fs_write_file_bytes(path: String, bytes: Vec<u8>) -> Result<(), String> {
    fs::write(&path, &bytes).map_err(|err| format!("write failed: {err}"))
}

#[tauri::command]
pub async fn fs_create_folder(path: String) -> Result<(), String> {
    // `create_dir` only — refuses to create a missing parent chain. Forces
    // the UI to handle "you're navigating into a non-existent parent" as a
    // distinct error case instead of silently materialising arbitrary depth.
    fs::create_dir(&path).map_err(|err| format!("create_dir failed: {err}"))
}

#[tauri::command]
pub async fn fs_path_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

// ---------------------------------------------------------------------------
// Location enumeration — OS-specific implementations behind a single front.
// ---------------------------------------------------------------------------

fn enumerate_locations() -> Vec<FsLocation> {
    let mut out: Vec<FsLocation> = Vec::new();

    #[cfg(target_os = "windows")]
    {
        out.extend(enumerate_windows_drives());
    }

    #[cfg(target_os = "linux")]
    {
        out.extend(enumerate_linux_mounts());
    }

    // Desktop shortcut — same affordance on both OSes. Skipped if the host
    // doesn't have a discoverable Desktop dir (rare on Windows, possible on
    // headless Linux).
    if let Some(desktop) = dirs::desktop_dir() {
        if desktop.exists() {
            out.push(FsLocation {
                label: "Desktop".to_string(),
                path: desktop.to_string_lossy().to_string(),
                kind: FsLocationKind::Shortcut,
            });
        }
    }

    out
}

#[cfg(target_os = "windows")]
fn enumerate_windows_drives() -> Vec<FsLocation> {
    // Raw kernel32 extern instead of pulling `windows-sys` (~MB of bindings)
    // for one bitmask read. `GetLogicalDrives` returns a u32 where bit `i`
    // set means drive letter ('A' + i) is present.
    extern "system" {
        fn GetLogicalDrives() -> u32;
    }
    let bitmask = unsafe { GetLogicalDrives() };
    if bitmask == 0 {
        return Vec::new();
    }
    let mut out: Vec<FsLocation> = Vec::new();
    for i in 0..26u32 {
        if bitmask & (1 << i) == 0 {
            continue;
        }
        let letter = (b'A' + i as u8) as char;
        let path = format!("{}:\\", letter);
        // Probe each drive for accessibility — read_dir is the cheapest probe
        // that catches "drive letter exists but no media inserted" cases
        // (CD-ROM, card reader). On inaccessible drives, skip the entry.
        if Path::new(&path).read_dir().is_err() {
            continue;
        }
        out.push(FsLocation {
            label: format!("{}:", letter),
            path,
            kind: FsLocationKind::Drive,
        });
    }
    out
}

#[cfg(target_os = "linux")]
fn enumerate_linux_mounts() -> Vec<FsLocation> {
    // Parse /proc/mounts. Each line is "device mountpoint fstype options 0 0".
    // We surface "user-visible" mounts: skip pseudo-filesystems (proc, sys,
    // tmpfs of size <100MB, cgroup, etc.) and keep "/" plus anything under
    // /home, /media, /mnt, /run/media.
    let contents = match std::fs::read_to_string("/proc/mounts") {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let skip_prefixes: &[&str] = &["/proc", "/sys", "/dev", "/run/lock", "/run/user", "/snap"];
    let skip_fs_types: HashSet<&str> = [
        "proc", "sysfs", "devtmpfs", "devpts", "cgroup", "cgroup2", "tmpfs",
        "fusectl", "fuse.gvfsd-fuse", "bpf", "tracefs", "debugfs",
        "configfs", "pstore", "autofs", "ramfs", "overlay", "squashfs",
        "binfmt_misc", "mqueue", "hugetlbfs", "rpc_pipefs", "nsfs",
    ]
    .into_iter()
    .collect();

    let mut seen: HashSet<String> = HashSet::new();
    let mut out: Vec<FsLocation> = Vec::new();

    for line in contents.lines() {
        let mut parts = line.split_whitespace();
        let _device = parts.next();
        let mount_point = match parts.next() {
            Some(mp) => mp,
            None => continue,
        };
        let fs_type = parts.next().unwrap_or("");

        if skip_fs_types.contains(fs_type) {
            continue;
        }
        if skip_prefixes.iter().any(|p| mount_point.starts_with(p)) {
            continue;
        }
        if !seen.insert(mount_point.to_string()) {
            continue;
        }
        // Confirm we can actually read the mount — handles permission-denied
        // mounts that show up in /proc/mounts but are unusable.
        if Path::new(mount_point).read_dir().is_err() {
            continue;
        }
        // Label = last path segment, or "/" for root.
        let label = if mount_point == "/" {
            "/".to_string()
        } else {
            mount_point
                .rsplit('/')
                .next()
                .filter(|s| !s.is_empty())
                .unwrap_or(mount_point)
                .to_string()
        };
        out.push(FsLocation {
            label,
            path: mount_point.to_string(),
            kind: FsLocationKind::MountPoint,
        });
    }
    out
}

// macOS / other Unixes — empty for now. dirs::desktop_dir() still works.
#[cfg(not(any(target_os = "windows", target_os = "linux")))]
fn enumerate_unix_other() -> Vec<FsLocation> {
    Vec::new()
}

// ---------------------------------------------------------------------------
// WAV header parse — extract duration_ms from RIFF/fmt /data chunks.
// 30-ish LOC. Not using `hound` because we'd otherwise need it just for this.
// ---------------------------------------------------------------------------

fn is_wav_path(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|s| s.to_str()).map(|s| s.to_ascii_lowercase()).as_deref(),
        Some("wav") | Some("wave"),
    )
}

fn read_wav_duration_ms(path: &Path) -> Result<u64, String> {
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut header = [0u8; 12];
    file.read_exact(&mut header).map_err(|e| e.to_string())?;
    if &header[0..4] != b"RIFF" || &header[8..12] != b"WAVE" {
        return Err("not a RIFF/WAVE file".to_string());
    }

    // Walk chunks looking for "fmt " (16+ bytes) and "data" (variable). Some
    // WAVs interleave LIST/INFO/etc. chunks between fmt and data; iterate.
    let mut sample_rate: Option<u32> = None;
    let mut byte_rate: Option<u32> = None;
    let mut data_size: Option<u32> = None;

    loop {
        let mut chunk_header = [0u8; 8];
        if file.read_exact(&mut chunk_header).is_err() {
            break;
        }
        let chunk_id = &chunk_header[0..4];
        let chunk_size = u32::from_le_bytes([
            chunk_header[4], chunk_header[5], chunk_header[6], chunk_header[7],
        ]);

        if chunk_id == b"fmt " {
            // fmt chunk: parse audio_format (2), num_channels (2),
            // sample_rate (4), byte_rate (4), block_align (2), bits (2),
            // plus optional extensible block ignored.
            let mut fmt_buf = vec![0u8; chunk_size as usize];
            file.read_exact(&mut fmt_buf).map_err(|e| e.to_string())?;
            if fmt_buf.len() >= 16 {
                sample_rate = Some(u32::from_le_bytes([
                    fmt_buf[4], fmt_buf[5], fmt_buf[6], fmt_buf[7],
                ]));
                byte_rate = Some(u32::from_le_bytes([
                    fmt_buf[8], fmt_buf[9], fmt_buf[10], fmt_buf[11],
                ]));
            }
        } else if chunk_id == b"data" {
            data_size = Some(chunk_size);
            break;
        } else {
            // Skip unknown chunk. WAV chunk size is always padded to even
            // bytes — handle the implicit byte if size is odd.
            let pad: u64 = (chunk_size as u64) + (chunk_size as u64 & 1);
            file.seek(SeekFrom::Current(pad as i64)).map_err(|e| e.to_string())?;
        }
    }

    match (data_size, byte_rate, sample_rate) {
        (Some(d), Some(br), _) if br > 0 => {
            // Most reliable: data bytes / byte_rate = seconds.
            let ms = (d as u64) * 1000 / (br as u64);
            Ok(ms)
        }
        (Some(d), _, Some(sr)) if sr > 0 => {
            // Fallback: estimate from sample count (assume 16-bit mono — best
            // we can do without more fmt context). Marginal accuracy.
            let ms = (d as u64) * 1000 / (sr as u64 * 2);
            Ok(ms)
        }
        _ => Err("missing fmt or data chunk".to_string()),
    }
}

// ---------------------------------------------------------------------------
// SystemTime → ISO 8601 (UTC) without pulling `chrono`. Manual UTC conversion
// since Rust's std doesn't have a built-in formatter.
// ---------------------------------------------------------------------------

fn format_system_time_iso8601(t: std::time::SystemTime) -> Option<String> {
    let dur = t.duration_since(std::time::UNIX_EPOCH).ok()?;
    let secs = dur.as_secs();

    // days since 1970-01-01 (Thursday). Algorithm: Howard Hinnant's
    // civil-from-days, public domain.
    let days = (secs / 86_400) as i64;
    let secs_of_day = (secs % 86_400) as u32;

    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };

    let hour = secs_of_day / 3600;
    let minute = (secs_of_day % 3600) / 60;
    let second = secs_of_day % 60;

    Some(format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, m, d, hour, minute, second
    ))
}
