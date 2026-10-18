#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};
use std::process::Command;

fn find_bin(names: &[&str]) -> Option<String> {
    // Prefer a copy next to the app (bundled), then fall back to PATH.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for n in names {
                for suffix in ["", ".exe"] {
                    let p = dir.join(format!("{}{}", n, suffix));
                    if p.exists() {
                        return Some(p.to_string_lossy().to_string());
                    }
                }
            }
        }
    }
    for n in names {
        if Command::new(n).arg("-version").output().is_ok() {
            return Some(n.to_string());
        }
    }
    None
}

fn magick_bin() -> Option<String> {
    find_bin(&["magick", "convert"])
}

#[tauri::command]
fn engine_status() -> String {
    let ff = find_bin(&["ffmpeg"]).is_some();
    let im = magick_bin().is_some();
    match (ff, im) {
        (true, true) => "FFmpeg + ImageMagick ready".into(),
        (true, false) => "ImageMagick missing (images off)".into(),
        (false, true) => "FFmpeg missing (video/audio off)".into(),
        _ => "FFmpeg and ImageMagick missing".into(),
    }
}

#[tauri::command]
fn plan_output(input: String, to: String) -> String {
    let p = Path::new(&input);
    let dir = p.parent().map(|d| d.to_path_buf()).unwrap_or_else(|| PathBuf::from("."));
    let stem = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "output".into());
    let mut cand = dir.join(format!("{}.{}", stem, to));
    let mut n = 1;
    while cand.exists() {
        cand = dir.join(format!("{} ({}).{}", stem, n, to));
        n += 1;
    }
    cand.to_string_lossy().to_string()
}

#[tauri::command]
fn run_engine(engine: String, args: Vec<String>) -> Result<(), String> {
    let bin = match engine.as_str() {
        "ffmpeg" => find_bin(&["ffmpeg"]).ok_or("FFmpeg was not found. Install it or place it next to Petal.")?,
        "imagemagick" => magick_bin().ok_or("ImageMagick was not found. Install it or place it next to Petal.")?,
        _ => return Err("unknown engine".into()),
    };
    let out = Command::new(&bin).args(&args).output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        let msg = String::from_utf8_lossy(&out.stderr);
        Err(msg.lines().take(3).collect::<Vec<_>>().join(" "))
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![engine_status, plan_output, run_engine])
        .run(tauri::generate_context!())
        .expect("error while running Petal");
}
