// Full conversion matrix with integrity checks, plus failure cases.
// Uses the same command builders as the app. Needs ffmpeg, ffprobe and ImageMagick.
import { spawnSync } from "node:child_process";
import { mkdtempSync, existsSync, statSync, writeFileSync, readFileSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCommand, outputPath, targetsFor, kindOf, extOf } from "../src/formats.js";

const dir = mkdtempSync(join(tmpdir(), "brixalo-"));
const run = (bin, args, timeout = 120000) => spawnSync(bin, args, { encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"] });
const must = (bin, args) => { const r = run(bin, args); if (r.status !== 0) throw new Error(`${bin} ${args.join(" ")}\n${r.stderr}`); return r; };
const im = run("magick", ["-version"]).status === 0 ? "magick" : "convert";
const identify = run("magick", ["-version"]).status === 0 ? ["magick", "identify"] : ["identify"];
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const probe = (f) => JSON.parse(must("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", f]).stdout);
const LAV = ["-nostdin", "-y", "-loglevel", "error", "-f", "lavfi"];

// Source files, one per input extension we accept in the matrix.
const src = {};
const make = (name, args) => { src[name] = join(dir, name); must("ffmpeg", [...LAV, ...args, src[name]]); };
make("pic.png", ["-i", "testsrc=size=160x120:rate=1", "-frames:v", "1"]);
make("pic.jpg", ["-i", "testsrc=size=160x120:rate=1", "-frames:v", "1"]);
make("pic.webp", ["-i", "testsrc=size=160x120:rate=1", "-frames:v", "1"]);
make("anim.gif", ["-i", "testsrc=size=96x72:rate=8:duration=1"]);
make("clip.mp4", ["-i", "testsrc=size=160x120:rate=15:duration=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac"]);
make("clip.mkv", ["-i", "testsrc=size=160x120:rate=15:duration=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac"]);
make("clip.mov", ["-i", "testsrc=size=160x120:rate=15:duration=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac"]);
make("tone.wav", ["-i", "sine=frequency=440:duration=1"]);
make("tone.mp3", ["-i", "sine=frequency=440:duration=1"]);
make("tone.flac", ["-i", "sine=frequency=440:duration=1"]);

const CODEC = { mp3: "mp3", wav: "pcm_s16le", flac: "flac", ogg: "vorbis", opus: "opus", m4a: "aac", mp4: "h264", mkv: "h264", webm: "vp9", gif: "gif" };

function verify(kind, to, input, out) {
  if (kind === "image") {
    const r = run(identify[0], [...identify.slice(1), "-format", "%w x %h\n", out]);
    if (r.status !== 0) return "unreadable output";
    const [w, h] = r.stdout.trim().split("\n")[0].split(" x ").map(Number);
    if (!(w > 0 && h > 0)) return "bad dimensions";
    if (extOf(input) !== "gif") { const d = run(identify[0], [...identify.slice(1), "-format", "%w x %h", input + "[0]"]).stdout.trim(); if (d !== `${w} x ${h}`) return `size changed ${d} -> ${w} x ${h}`; }
    return null;
  }
  const o = probe(out), a = probe(input);
  const dur = Number(o.format.duration), srcDur = Number(a.format.duration);
  if (!(dur > 0.3) || Math.abs(dur - srcDur) > 0.35 + srcDur * 0.2) return `duration ${dur} vs ${srcDur}`;
  const kinds = o.streams.map((s) => s.codec_type);
  const wantVideo = ["mp4", "mkv", "webm", "gif"].includes(to);
  if (wantVideo !== kinds.includes("video")) return `video stream mismatch (${kinds})`;
  const codecs = o.streams.map((s) => s.codec_name);
  if (!codecs.includes(CODEC[to])) return `codec ${codecs} lacks ${CODEC[to]}`;
  return null;
}

let pass = 0, fail = 0;
const check = (ok, label, why = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : "  <- " + why}`); ok ? pass++ : fail++; };

for (const [name, input] of Object.entries(src)) {
  const kind = kindOf(input);
  for (const t of targetsFor(input)) {
    const out = outputPath(input, t.to, existsSync);
    const before = sha(input);
    const { engine, args } = buildCommand(kind, t.to, input, out);
    const r = run(engine === "ffmpeg" ? "ffmpeg" : im, args);
    let why = "";
    if (r.status !== 0) why = (r.stderr || "exit " + r.status).split("\n").slice(0, 2).join(" ");
    else if (!existsSync(out) || statSync(out).size === 0) why = "no output file";
    else why = verify(kind, t.to, input, out) || (sha(input) !== before ? "original changed" : "");
    check(!why, `${name} -> ${t.to}`, why);
  }
}

// Failure cases: must fail cleanly and never touch the original.
const bad = {
  "empty.png": Buffer.alloc(0),
  "fake.mp4": Buffer.from("this is not a video, just text\n"),
  "fake.mp3": Buffer.from("not audio\n"),
};
for (const [name, body] of Object.entries(bad)) {
  const input = join(dir, name); writeFileSync(input, body);
  const kind = kindOf(input), t = targetsFor(input)[0];
  const out = outputPath(input, t.to, existsSync);
  const before = sha(input);
  const { engine, args } = buildCommand(kind, t.to, input, out);
  const r = run(engine === "ffmpeg" ? "ffmpeg" : im, args);
  const clean = r.status !== 0 && sha(input) === before;
  check(clean, `damaged ${name} fails cleanly and original is untouched`, `exit ${r.status}`);
}

// Output naming never overwrites.
copyFileSync(src["pic.png"], join(dir, "dup.png"));
const taken = new Set([join(dir, "dup.jpg"), join(dir, "dup (1).jpg")]);
check(outputPath(join(dir, "dup.png"), "jpg", (p) => taken.has(p)) === join(dir, "dup (2).jpg"), "output name skips taken names");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
