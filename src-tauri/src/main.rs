// Prevents extra console window on Windows in release build.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    pdfkeeper::run();
}
