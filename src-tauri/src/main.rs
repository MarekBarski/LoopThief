// Suppress the Windows console window in release builds. Without this,
// launching the .exe pops a cmd.exe alongside the main app — fine for dev
// (terminal carries our eprintln! audio diagnostics) but unprofessional in
// the shipped installer. `windows_subsystem = "windows"` tells the linker
// to mark the binary as a GUI app instead of a console app; the cfg_attr
// gating keeps it conditional on release profile (`debug_assertions=false`)
// so dev builds retain the console for terminal output.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    loopthief_lib::run()
}
