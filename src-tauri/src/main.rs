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

static JOB_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn friendly_error(stderr: &str) -> String {
    let low = stderr.to_lowercase();
    if low.contains("invalid data found") || low.contains("no decode delegate") || low.contains("moov atom not found") || low.contains("corrupt") {
        "This file looks damaged, or it is not a file Petal can read.".into()
    } else if low.contains("permission denied") || low.contains("read-only file system") {
        "Petal is not allowed to write in this folder. Move the file somewhere else and try again.".into()
    } else if low.contains("no space left") {
        "The disk is full.".into()
    } else if low.contains("unknown encoder") || low.contains("no encode delegate") || low.contains("unable to find a suitable output format") {
        "Your copy of FFmpeg or ImageMagick cannot make this format. Install a full version.".into()
    } else {
        stderr.lines().filter(|l| !l.trim().is_empty()).take(2).collect::<Vec<_>>().join(" ")
    }
}

/// Runs the engine into a hidden temporary file next to the target, checks the result is
/// not empty, and only then renames it to the final name. The original is never touched
/// and an existing file is never overwritten. Success is reported only after the rename.
#[tauri::command]
fn run_engine(engine: String, args: Vec<String>, output: String) -> Result<(), String> {
    let bin = match engine.as_str() {
        "ffmpeg" => find_bin(&["ffmpeg"]).ok_or("FFmpeg was not found. Install it or place it next to Petal.")?,
        "imagemagick" => magick_bin().ok_or("ImageMagick was not found. Install it or place it next to Petal.")?,
        _ => return Err("unknown engine".into()),
    };
    let out_path = PathBuf::from(&output);
    if out_path.exists() {
        return Err("A file with that name already exists. Petal never overwrites files.".into());
    }
    let dir = out_path.parent().ok_or("bad output path")?;
    let ext = out_path.extension().and_then(|e| e.to_str()).ok_or("bad output path")?;
    let n = JOB_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let tmp = dir.join(format!(".petal-{}-{}.part.{}", std::process::id(), n, ext));
    let tmp_s = tmp.to_string_lossy().to_string();
    let args: Vec<String> = args.into_iter().map(|a| if a == output { tmp_s.clone() } else { a }).collect();
    let result = Command::new(&bin).args(&args).output();
    let fail = |msg: String| -> Result<(), String> {
        let _ = std::fs::remove_file(&tmp);
        Err(msg)
    };
    match result {
        Err(e) => fail(e.to_string()),
        Ok(o) if !o.status.success() => fail(friendly_error(&String::from_utf8_lossy(&o.stderr))),
        Ok(_) => {
            let size = std::fs::metadata(&tmp).map(|m| m.len()).unwrap_or(0);
            if size == 0 {
                return fail("The converter finished but produced an empty file.".into());
            }
            std::fs::rename(&tmp, &out_path).map_err(|e| {
                let _ = std::fs::remove_file(&tmp);
                format!("Could not save the result: {}", e)
            })
        }
    }
}

/// Used by the automated end-to-end test in CI: a file path to open at start-up.
#[tauri::command]
fn e2e_request() -> Option<Vec<String>> {
    let file = std::env::var("PETAL_E2E_FILE").ok()?;
    let to = std::env::var("PETAL_E2E_TO").unwrap_or_default();
    let delay = std::env::var("PETAL_E2E_DELAY_MS").unwrap_or_else(|_| "1500".into());
    Some(vec![file, to, delay])
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
        .invoke_handler(tauri::generate_handler![engine_status, plan_output, run_engine, e2e_request, list_user_themes, themes_folder])
        .run(tauri::generate_context!())
        .expect("error while running Petal");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("petal-test-{}-{}", std::process::id(), name));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn plan_output_never_picks_an_existing_name() {
        let d = tmp("plan");
        fs::write(d.join("a.mov"), b"x").unwrap();
        fs::write(d.join("a.mp4"), b"x").unwrap();
        let out = plan_output(d.join("a.mov").to_string_lossy().to_string(), "mp4".into());
        assert!(out.ends_with("a (1).mp4"), "{}", out);
    }

    #[test]
    fn run_engine_converts_and_leaves_original_alone() {
        let d = tmp("ok");
        let input = d.join("tone.wav");
        let ok = Command::new("ffmpeg").args(["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=duration=1"]).arg(&input).status().unwrap();
        assert!(ok.success());
        let before = fs::read(&input).unwrap();
        let out = d.join("tone.mp3").to_string_lossy().to_string();
        let args = vec!["-y".into(), "-loglevel".into(), "error".into(), "-i".into(), input.to_string_lossy().to_string(), "-c:a".into(), "libmp3lame".into(), out.clone()];
        run_engine("ffmpeg".into(), args, out.clone()).unwrap();
        assert!(fs::metadata(&out).unwrap().len() > 0);
        assert_eq!(before, fs::read(&input).unwrap());
        let leftovers: Vec<_> = fs::read_dir(&d).unwrap().filter_map(|e| e.ok()).filter(|e| e.file_name().to_string_lossy().contains(".part.")).collect();
        assert!(leftovers.is_empty());
    }

    #[test]
    fn run_engine_refuses_to_overwrite() {
        let d = tmp("exists");
        let out = d.join("x.mp3");
        fs::write(&out, b"precious").unwrap();
        let r = run_engine("ffmpeg".into(), vec![], out.to_string_lossy().to_string());
        assert!(r.is_err());
        assert_eq!(fs::read(&out).unwrap(), b"precious");
    }

    #[test]
    fn run_engine_cleans_up_after_a_bad_file() {
        let d = tmp("bad");
        let input = d.join("fake.mp4");
        fs::write(&input, b"not a video").unwrap();
        let out = d.join("fake.webm").to_string_lossy().to_string();
        let args = vec!["-y".into(), "-loglevel".into(), "error".into(), "-i".into(), input.to_string_lossy().to_string(), out.clone()];
        let r = run_engine("ffmpeg".into(), args, out.clone());
        assert!(r.is_err());
        assert!(!Path::new(&out).exists());
        assert!(fs::read_dir(&d).unwrap().filter_map(|e| e.ok()).all(|e| !e.file_name().to_string_lossy().contains(".part.")));
    }
}
