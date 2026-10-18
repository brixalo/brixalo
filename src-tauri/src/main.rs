#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};
use tauri::Manager;
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

fn themes_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?.join("themes");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Returns the text of every *.json file in the user's themes folder (add-on themes).
#[tauri::command]
fn list_user_themes(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let dir = themes_dir(&app)?;
    let mut out = Vec::new();
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            if let Ok(text) = std::fs::read_to_string(&path) {
                out.push(text);
            }
        }
    }
    Ok(out)
}

#[tauri::command]
fn themes_folder(app: tauri::AppHandle) -> Result<String, String> {
    Ok(themes_dir(&app)?.to_string_lossy().to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![engine_status, plan_output, run_engine, list_user_themes, themes_folder])
        .run(tauri::generate_context!())
        .expect("error while running Petal");
}
