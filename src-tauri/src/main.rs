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
        "This file looks damaged, or it is not a file Brixalo can read.".into()
    } else if low.contains("permission denied") || low.contains("read-only file system") {
        "Brixalo is not allowed to write in this folder. Move the file somewhere else and try again.".into()
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
        "ffmpeg" => find_bin(&["ffmpeg"]).ok_or("FFmpeg was not found. Install it or place it next to Brixalo.")?,
        "imagemagick" => magick_bin().ok_or("ImageMagick was not found. Install it or place it next to Brixalo.")?,
        _ => return Err("unknown engine".into()),
    };
    let out_path = PathBuf::from(&output);
    if out_path.exists() {
        return Err("A file with that name already exists. Brixalo never overwrites files.".into());
    }
    let dir = out_path.parent().ok_or("bad output path")?;
    let ext = out_path.extension().and_then(|e| e.to_str()).ok_or("bad output path")?;
    let n = JOB_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let tmp = dir.join(format!(".brixalo-{}-{}.part.{}", std::process::id(), n, ext));
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
            let published = std::fs::hard_link(&tmp, &out_path).map_err(|e| {
                let _ = std::fs::remove_file(&tmp);
                format!("Could not save the result without overwriting: {}", e)
            });
            let _ = std::fs::remove_file(&tmp);
            published
        }
    }
}

/// Used by the automated end-to-end test in CI: a file path to open at start-up.
#[tauri::command]
fn e2e_request() -> Option<Vec<String>> {
    let file = std::env::var("BRIXALO_E2E_FILE").ok()?;
    let to = std::env::var("BRIXALO_E2E_TO").unwrap_or_default();
    let delay = std::env::var("BRIXALO_E2E_DELAY_MS").unwrap_or_else(|_| "1500".into());
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

/// Real glass: asks the operating system to blur what is behind the window.
/// Windows: Mica (Win 11) or Acrylic. macOS: vibrancy. Linux: the window is transparent and the
/// desktop compositor decides whether it also blurs. Returns what was applied.
#[cfg(target_os = "windows")]
fn glass_impl(window: &tauri::WebviewWindow, on: bool, dark: bool) -> &'static str {
    use window_vibrancy::*;
    if !on {
        let _ = clear_mica(window);
        let _ = clear_acrylic(window);
        return "off";
    }
    if apply_mica(window, Some(dark)).is_ok() {
        "mica"
    } else if apply_acrylic(window, Some((18, 21, 28, 60))).is_ok() {
        "acrylic"
    } else {
        "none"
    }
}

#[cfg(target_os = "macos")]
fn glass_impl(window: &tauri::WebviewWindow, on: bool, _dark: bool) -> &'static str {
    use window_vibrancy::*;
    if !on {
        let _ = clear_vibrancy(window);
        return "off";
    }
    if apply_vibrancy(window, NSVisualEffectMaterial::HudWindow, None, None).is_ok() { "vibrancy" } else { "none" }
}

#[cfg(target_os = "linux")]
fn glass_impl(window: &tauri::WebviewWindow, on: bool, _dark: bool) -> &'static str {
    use gtk::prelude::*;
    // KDE blur hint: an empty region means "blur behind the whole window". KWin (and picom)
    // honour it; compositors that do not know it simply ignore it.
    if let Ok(w) = window.gtk_window() {
        if let Some(gw) = w.window() {
            let atom = gtk::gdk::Atom::intern("_KDE_NET_WM_BLUR_BEHIND_REGION");
            if on {
                gtk::gdk::property_change(
                    &gw,
                    &atom,
                    &gtk::gdk::Atom::intern("CARDINAL"),
                    32,
                    gtk::gdk::PropMode::Replace,
                    gtk::gdk::ChangeData::ULongs(&[]),
                );
            } else {
                gtk::gdk::property_delete(&gw, &atom);
            }
        }
    }
    if on { "transparent+blur-hint" } else { "off" }
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn glass_impl(_window: &tauri::WebviewWindow, on: bool, _dark: bool) -> &'static str {
    if on { "transparent" } else { "off" }
}

#[tauri::command]
fn set_glass(window: tauri::WebviewWindow, on: bool, dark: bool) -> String {
    glass_impl(&window, on, dark).to_string()
}

/// Reads metadata only. Paths and metadata remain local.
#[tauri::command]
fn inspect_file(input: String) -> Result<serde_json::Value, String> {
    let path = Path::new(&input);
    if !path.is_file() { return Err("Choose a local file.".into()); }
    let size = std::fs::metadata(path).map_err(|e| e.to_string())?.len();
    let probe = Command::new("ffprobe").args(["-v", "error", "-show_format", "-show_streams", "-of", "json", &input]).output();
    // Prefer ImageMagick for images so a still image is not mistaken for a video.
    let extension = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
    let is_image = ["png","jpg","jpeg","webp","gif","bmp","tif","tiff","avif","heic","heif","ico","jp2","j2k","jxl","tga","pcx","ppm","pgm","pbm","pam","pnm","exr","hdr","dpx","psd","qoi","svg","dds","xcf","cr2","nef","dng","arw"].contains(&extension.as_str());
    if is_image {
        let bin = magick_bin().ok_or("ImageMagick was not found.")?;
        let mut cmd = Command::new(&bin);
        if Path::new(&bin).file_stem().and_then(|s|s.to_str()) == Some("magick") { cmd.arg("identify"); }
        else { cmd = Command::new("identify"); }
        let first = format!("{}[0]", input);
        let result = cmd.args(["-ping", "-format", "%m|%w|%h|%z|%Q|%[compression]", &first]).output().map_err(|e|e.to_string())?;
        if !result.status.success() { return Err("Image cannot be read by your ImageMagick build or is blocked by its security policy.".into()); }
        let text=String::from_utf8_lossy(&result.stdout);
        let fields: Vec<&str>=text.trim().split('|').collect();
        return Ok(serde_json::json!({"image":true,"size_bytes":size,"image_format":fields.first(),"width":fields.get(1),"height":fields.get(2),"bit_depth":fields.get(3),"quality_tag":fields.get(4),"compression":fields.get(5)}));
    }
    let result = probe.map_err(|_|"FFprobe was not found. Install FFmpeg with FFprobe.")?;
    if !result.status.success() { return Err("FFprobe cannot read this file. It may be damaged, unsupported, or not media.".into()); }
    let mut value: serde_json::Value=serde_json::from_slice(&result.stdout).map_err(|e|e.to_string())?;
    value["size_bytes"]=serde_json::json!(size);
    Ok(value)
}

#[tauri::command]
fn media_capabilities() -> serde_json::Value {
    let mut encoders=Vec::new();
    if let Some(bin)=find_bin(&["ffmpeg"]) {
        if let Ok(o)=Command::new(bin).args(["-hide_banner","-encoders"]).output() {
            for line in String::from_utf8_lossy(&o.stdout).lines() {
                let parts: Vec<&str>=line.split_whitespace().collect();
                if parts.len()>1 && parts[0].len()==6 && ["V","A","S"].iter().any(|c|parts[0].starts_with(*c)) { encoders.push(parts[1].to_string()); }
            }
        }
    }
    let mut image_write=Vec::new();
    if let Some(bin)=magick_bin() {
        if let Ok(o)=Command::new(bin).args(["-list","format"]).output() {
            for line in String::from_utf8_lossy(&o.stdout).lines() {
                let parts: Vec<&str>=line.split_whitespace().collect();
                if parts.len()>2 && parts[2].contains('w') { image_write.push(parts[0].trim_end_matches('*').to_string()); }
            }
        }
    }
    serde_json::json!({"encoders":encoders,"image_write":image_write,"ffprobe":find_bin(&["ffprobe"]).is_some()})
}

/// Bounded previews only. No scripts, active HTML, macros or embedded PDF actions are run.
#[tauri::command]
fn preview_file(input: String, page: Option<u32>) -> Result<serde_json::Value, String> {
    use std::io::Read;
    let path=Path::new(&input);
    let size=std::fs::metadata(path).map_err(|e|e.to_string())?.len();
    if !path.is_file() { return Err("Choose a local file.".into()); }
    let ext=path.extension().and_then(|x|x.to_str()).unwrap_or("").to_lowercase();
    let preview_dir=std::env::temp_dir().join(format!("brixalo-preview-{}",std::process::id()));
    std::fs::create_dir_all(&preview_dir).map_err(|e|e.to_string())?;
    if ext=="pdf" {
        let page=page.unwrap_or(1);if page==0||page>10000{return Err("Page must be 1-10000.".into());}
        let serial=JOB_COUNTER.fetch_add(1,std::sync::atomic::Ordering::SeqCst);
        let prefix=preview_dir.join(format!("page-{}",serial));let dest=prefix.with_extension("png");
        let output=Command::new("pdftoppm").args(["-f",&page.to_string(),"-l",&page.to_string(),"-scale-to","1400","-singlefile","-png"]).arg(path).arg(&prefix).output().map_err(|_|"PDF preview needs Poppler (pdftoppm) installed locally.")?;
        if !output.status.success(){return Err("PDF page cannot be rendered. It may be encrypted, damaged or outside the page range.".into());}
        let data=std::fs::read(&dest).map_err(|e|e.to_string())?;let _=std::fs::remove_file(dest);
        return Ok(serde_json::json!({"kind":"image","mime":"image/png","bytes":data,"size_bytes":size,"page":page,"pdf":true}));
    }
    let image_ext=["png","jpg","jpeg","webp","gif","bmp","tif","tiff","avif","heic","heif","ico","jp2","jxl","pcx","tga","ppm","pgm","pbm","pam","pnm","exr","hdr","dpx","psd","qoi","dds"];
    if image_ext.contains(&ext.as_str()) {
        let serial=JOB_COUNTER.fetch_add(1,std::sync::atomic::Ordering::SeqCst);
        let dest=preview_dir.join(format!("image-{}.png",serial));let bin=magick_bin().ok_or("Image preview needs ImageMagick.")?;
        let result=Command::new(bin).args(["-limit","memory","128MiB","-limit","map","256MiB","-limit","time","30"]).arg(format!("{}[0]",input)).args(["-thumbnail","1400x1400>"]).arg(&dest).output().map_err(|e|e.to_string())?;
        if !result.status.success(){return Err("Image is unsupported by your installed ImageMagick build.".into());}
        let data=std::fs::read(&dest).map_err(|e|e.to_string())?;let _=std::fs::remove_file(dest);
        return Ok(serde_json::json!({"kind":"image","mime":"image/png","bytes":data,"size_bytes":size}));
    }
    let mime=match ext.as_str(){"mp4"=>"video/mp4","webm"=>"video/webm","ogv"=>"video/ogg","mp3"=>"audio/mpeg","wav"=>"audio/wav","ogg"=>"audio/ogg","flac"=>"audio/flac","m4a"=>"audio/mp4",_=>""};
    if !mime.is_empty()&&size<=32*1024*1024 {
        return Ok(serde_json::json!({"kind":"media","mime":mime,"bytes":std::fs::read(path).map_err(|e|e.to_string())?,"size_bytes":size}));
    }
    let mut data=Vec::new();std::fs::File::open(path).map_err(|e|e.to_string())?.take(256*1024).read_to_end(&mut data).map_err(|e|e.to_string())?;
    Ok(serde_json::json!({"kind":"bytes","bytes":data,"size_bytes":size,"truncated":size>data.len() as u64}))
}

/// Interoperable authenticated encryption delegated to the age executable.
#[tauri::command]
fn age_file(input: String, output: String, recipient: Option<String>, identity: Option<String>, action: String) -> Result<(), String> {
    let source=Path::new(&input);let out=Path::new(&output);
    if !source.is_file(){return Err("Input must be a local file.".into());}
    if out.exists(){return Err("Destination exists. Choose a new filename.".into());}
    if action!="encrypt"&&action!="decrypt"{return Err("Unknown age action.".into());}
    if action=="encrypt"&&recipient.is_none(){return Err("Recipient public key is required.".into());}
    if action=="decrypt"&&identity.is_none(){return Err("Local identity file is required.".into());}
    let n=JOB_COUNTER.fetch_add(1,std::sync::atomic::Ordering::SeqCst);
    let tmp=out.with_file_name(format!(".brixalo-age-{}-{}.part",std::process::id(),n));
    // Reserve the output without following symlinks. Keep private plaintext owner-only on Unix.
    let mut options=std::fs::OpenOptions::new();options.write(true).create_new(true);
    #[cfg(unix)] {use std::os::unix::fs::OpenOptionsExt;options.mode(0o600);}
    let file=options.open(&tmp).map_err(|e|e.to_string())?;
    let mut cmd=Command::new("age");
    if action=="encrypt" {
        let key=recipient.ok_or("Recipient public key is required.")?;
        if !key.starts_with("age1")||key.len()!=62||!key.chars().all(|c|c.is_ascii_lowercase()||c.is_ascii_digit()){let _=std::fs::remove_file(&tmp);return Err("Invalid X25519 age recipient.".into());}
        cmd.args(["-r",&key]);
    }else{
        let key_path=identity.ok_or("Local identity file is required.")?;
        if !Path::new(&key_path).is_file(){let _=std::fs::remove_file(&tmp);return Err("Identity file was not found.".into());}
        cmd.args(["-d","-i",&key_path]);
    }
    let result=cmd.arg("--").arg(source).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::from(file)).stderr(std::process::Stdio::piped()).status();
    match result {
        Ok(status) if status.success()=>{
            // Atomic no-clobber publication: hard_link fails if another file took the destination.
            let r=std::fs::hard_link(&tmp,out).map_err(|_|"Could not save without overwriting. Choose a new destination on this filesystem.".to_string());
            let _=std::fs::remove_file(&tmp);r
        }
        _=>{let _=std::fs::remove_file(&tmp);Err("age failed. Check that age is installed, the key matches and the file is valid. Encrypted/passphrase-protected identity files needing an interactive prompt are not supported.".into())}
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![engine_status, plan_output, run_engine, e2e_request, list_user_themes, themes_folder, set_glass, inspect_file, media_capabilities, preview_file, age_file])
        .run(tauri::generate_context!())
        .expect("error while running Brixalo");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("brixalo-test-{}-{}", std::process::id(), name));
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
        let args = vec!["-nostdin".into(), "-y".into(), "-loglevel".into(), "error".into(), "-i".into(), input.to_string_lossy().to_string(), "-c:a".into(), "libmp3lame".into(), out.clone()];
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
        let args = vec!["-nostdin".into(), "-y".into(), "-loglevel".into(), "error".into(), "-i".into(), input.to_string_lossy().to_string(), out.clone()];
        let r = run_engine("ffmpeg".into(), args, out.clone());
        assert!(r.is_err());
        assert!(!Path::new(&out).exists());
        assert!(fs::read_dir(&d).unwrap().filter_map(|e| e.ok()).all(|e| !e.file_name().to_string_lossy().contains(".part.")));
    }
}
