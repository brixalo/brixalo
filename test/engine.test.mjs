// Real conversions with the same command builders the app uses.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCommand, outputPath, targetsFor, kindOf } from "../src/formats.js";

const dir = mkdtempSync(join(tmpdir(), "petal-"));
const sh = (bin, args) => { const r = spawnSync(bin, args, { encoding: "utf8" }); if (r.status !== 0) throw new Error(`${bin} ${args.join(" ")}\n${r.stderr}`); };
const imBin = spawnSync("magick", ["-version"]).status === 0 ? "magick" : "convert";

const png = join(dir, "pic.png"), mp4 = join(dir, "clip.mp4"), wav = join(dir, "tone.wav");
sh("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=15:duration=1", "-frames:v", "1", png]);
sh("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=15:duration=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", mp4]);
sh("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", wav]);

let pass = 0, fail = 0;
for (const input of [png, mp4, wav]) {
  const kind = kindOf(input);
  for (const t of targetsFor(input)) {
    const out = outputPath(input, t.to, existsSync);
    const { engine, args } = buildCommand(kind, t.to, input, out);
    const bin = engine === "ffmpeg" ? "ffmpeg" : imBin;
    const r = spawnSync(bin, args, { encoding: "utf8" });
    const ok = r.status === 0 && existsSync(out) && statSync(out).size > 0;
    console.log(`${ok ? "PASS" : "FAIL"}  ${kind} -> ${t.to}${ok ? "  " + statSync(out).size + " bytes" : "\n" + (r.stderr || "").split("\n").slice(0, 3).join("\n")}`);
    ok ? pass++ : fail++;
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
// collision naming
const a = outputPath(png, "png", () => true); void a;
process.exit(fail ? 1 : 0);
