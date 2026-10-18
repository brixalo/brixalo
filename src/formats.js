// Petal format table and command builders. Pure functions, no DOM, no Tauri.
// The same module is used by the app and by the tests.

export const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff", "avif", "heic", "ico"];
export const VIDEO_EXT = ["mp4", "mov", "mkv", "webm", "avi", "m4v", "flv", "wmv", "mpg", "mpeg"];
export const AUDIO_EXT = ["mp3", "wav", "flac", "ogg", "oga", "m4a", "aac", "opus", "wma", "aiff"];

export function extOf(path) {
  const m = /\.([A-Za-z0-9]+)$/.exec(path);
  return m ? m[1].toLowerCase() : "";
}

export function baseName(path) {
  return path.split(/[\\/]/).pop();
}

export function kindOf(path) {
  const e = extOf(path);
  if (IMAGE_EXT.includes(e)) return "image";
  if (VIDEO_EXT.includes(e)) return "video";
  if (AUDIO_EXT.includes(e)) return "audio";
  return null;
}

// Petals shown on the wheel, per kind. `to` is the output extension.
const IMAGE_TARGETS = [
  { to: "png", label: "PNG" },
  { to: "jpg", label: "JPG" },
  { to: "webp", label: "WebP" },
  { to: "gif", label: "GIF" },
  { to: "bmp", label: "BMP" },
  { to: "tiff", label: "TIFF" },
  { to: "avif", label: "AVIF" },
];
const VIDEO_TARGETS = [
  { to: "mp4", label: "MP4" },
  { to: "webm", label: "WebM" },
  { to: "mkv", label: "MKV" },
  { to: "gif", label: "GIF" },
  { to: "mp3", label: "MP3", note: "audio only" },
  { to: "wav", label: "WAV", note: "audio only" },
  { to: "m4a", label: "M4A", note: "audio only" },
];
const AUDIO_TARGETS = [
  { to: "mp3", label: "MP3" },
  { to: "wav", label: "WAV" },
  { to: "flac", label: "FLAC" },
  { to: "ogg", label: "OGG" },
  { to: "m4a", label: "M4A" },
  { to: "opus", label: "Opus" },
];

export function targetsFor(path) {
  const kind = kindOf(path);
  const src = extOf(path);
  const norm = (e) => (e === "jpeg" ? "jpg" : e === "tif" ? "tiff" : e);
  const list = kind === "image" ? IMAGE_TARGETS : kind === "video" ? VIDEO_TARGETS : kind === "audio" ? AUDIO_TARGETS : [];
  // Do not offer converting a file into its own format.
  return list.filter((t) => t.to !== norm(src));
}

// Build the engine call. Returns { engine: "ffmpeg" | "imagemagick", args: string[] }.
export function buildCommand(kind, to, input, output) {
  if (kind === "image") {
    // ImageMagick: the first frame only for formats like gif, unless the output is gif.
    const src = to === "gif" ? input : input + "[0]";
    const args = [src, "-auto-orient"];
    if (to === "jpg" || to === "bmp") args.push("-background", "white", "-alpha", "remove", "-alpha", "off");
    if (to === "jpg") args.push("-quality", "90");
    if (to === "webp") args.push("-quality", "88");
    if (to === "avif") args.push("-quality", "60");
    args.push(output);
    return { engine: "imagemagick", args };
  }
  const base = ["-nostdin", "-y", "-hide_banner", "-loglevel", "error", "-i", input];
  if (kind === "video") {
    switch (to) {
      case "mp4":
        return { engine: "ffmpeg", args: [...base, "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", output] };
      case "webm":
        return { engine: "ffmpeg", args: [...base, "-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-c:a", "libopus", "-b:a", "128k", output] };
      case "mkv":
        return { engine: "ffmpeg", args: [...base, "-c:v", "libx264", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", output] };
      case "gif":
        return { engine: "ffmpeg", args: [...base, "-vf", "fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse", "-an", output] };
      default:
        return { engine: "ffmpeg", args: [...base, "-vn", ...audioCodec(to), output] };
    }
  }
  return { engine: "ffmpeg", args: [...base, "-vn", ...audioCodec(to), output] };
}

function audioCodec(to) {
  switch (to) {
    case "mp3": return ["-c:a", "libmp3lame", "-q:a", "2"];
    case "wav": return ["-c:a", "pcm_s16le"];
    case "flac": return ["-c:a", "flac"];
    case "ogg": return ["-c:a", "libvorbis", "-q:a", "5"];
    case "opus": return ["-c:a", "libopus", "-b:a", "128k"];
    case "m4a": return ["-c:a", "aac", "-b:a", "192k"];
    default: return [];
  }
}

// Output path: same folder, same name, new extension. Adds " (1)", " (2)" if taken.
// `exists` is a function(path) -> boolean supplied by the caller.
export function outputPath(input, to, exists) {
  const sep = input.includes("\\") ? "\\" : "/";
  const dir = input.slice(0, input.lastIndexOf(sep) + 1);
  const name = baseName(input).replace(/\.[^.]+$/, "");
  let candidate = `${dir}${name}.${to}`;
  let n = 1;
  while (exists(candidate)) candidate = `${dir}${name} (${n++}).${to}`;
  return candidate;
}
