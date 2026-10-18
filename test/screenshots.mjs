import http from "node:http";
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { extname, join } from "node:path";
import puppeteer from "puppeteer-core";

const root = new URL("../src/", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const srv = http.createServer((req, res) => {
  const p = req.url.split("?")[0]; const f = join(root, p === "/" ? "index.html" : p);
  try { res.setHeader("content-type", types[extname(f)] || "text/plain"); res.end(readFileSync(f)); } catch { res.statusCode = 404; res.end(); }
}).listen(8765);
const out = new URL("../shots/", import.meta.url).pathname;
mkdirSync(out + "frames", { recursive: true });
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
const pg = await b.newPage(); await pg.setViewport({ width: 900, height: 640 });
await pg.goto("http://localhost:8765/"); await new Promise((r) => setTimeout(r, 300));
await pg.screenshot({ path: out + "1-home.png" });
// simulated drag over + drop of a file named vacation-clip.mov at (330,300)
await pg.evaluate(() => { const d = new DataTransfer(); d.items.add(new File(["x"], "vacation-clip.mov")); window.__dt = d;
  window.dispatchEvent(new DragEvent("dragover", { dataTransfer: d, bubbles: true, cancelable: true, clientX: 330, clientY: 300 })); });
await pg.screenshot({ path: out + "2-drag-over.png" });
let n = 0; const frame = async () => pg.screenshot({ path: `${out}frames/f${String(n++).padStart(3, "0")}.png` });
await pg.mouse.move(330, 300);
await pg.evaluate(() => window.dispatchEvent(new DragEvent("drop", { dataTransfer: window.__dt, bubbles: true, cancelable: true, clientX: 330, clientY: 300 })));
for (let i = 0; i < 8; i++) { await frame(); await new Promise((r) => setTimeout(r, 40)); }
await new Promise((r) => setTimeout(r, 300));
await pg.screenshot({ path: out + "3-wheel-video.png" });
// hover the WebM petal with the real mouse
const box = await (await pg.$('.pg[data-to="webm"]')).boundingBox();
await pg.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
for (let i = 0; i < 6; i++) { await frame(); await new Promise((r) => setTimeout(r, 40)); }
await pg.screenshot({ path: out + "4-hover-webm.png" });
await pg.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
for (let i = 0; i < 6; i++) { await frame(); await new Promise((r) => setTimeout(r, 120)); }
await new Promise((r) => setTimeout(r, 1000)); await frame();
await pg.screenshot({ path: out + "5-job-done.png" });
// image wheel and audio wheel near a corner (edge clamping)
await pg.goto("http://localhost:8765/?open=holiday.png&x=450&y=330&hover=3"); await new Promise((r) => setTimeout(r, 600));
await pg.screenshot({ path: out + "6-wheel-image.png" });
await pg.goto("http://localhost:8765/?open=song.wav&x=880&y=40"); await new Promise((r) => setTimeout(r, 600));
await pg.screenshot({ path: out + "7-wheel-audio-edge.png" });
await pg.goto("http://localhost:8765/?open=notes.txt"); await new Promise((r) => setTimeout(r, 400));
await pg.screenshot({ path: out + "8-unsupported.png" });
await b.close(); srv.close();
