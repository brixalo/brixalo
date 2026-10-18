// Takes the screenshots used in docs/MANUAL.md. A drawn arrow shows where the cursor is.
import http from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import puppeteer from "puppeteer-core";

const root = new URL("../src/", import.meta.url).pathname;
const out = new URL("../docs/img/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const srv = http.createServer((req, res) => {
  const p = req.url.split("?")[0]; const f = join(root, p === "/" ? "index.html" : p);
  try { res.setHeader("content-type", types[extname(f)] || "text/plain"); res.end(readFileSync(f)); } catch { res.statusCode = 404; res.end(); }
}).listen(8766);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
const pg = await b.newPage(); await pg.setViewport({ width: 900, height: 600 });
const base = "http://localhost:8766/";

async function cursor(x, y, label) {
  await pg.evaluate((x, y, label) => {
    document.getElementById("fakecursor")?.remove();
    const d = document.createElement("div"); d.id = "fakecursor";
    d.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:99;pointer-events:none`;
    d.innerHTML = `<svg width="30" height="36" viewBox="0 0 30 36" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))"><path d="M2 2 L2 28 L9 21 L14 33 L19 31 L14 19 L24 19 Z" fill="#fff" stroke="#111" stroke-width="2" stroke-linejoin="round"/></svg>` +
      (label ? `<div style="position:absolute;left:26px;top:30px;background:#111;color:#fff;font:600 13px system-ui;padding:4px 9px;border-radius:8px;white-space:nowrap">${label}</div>` : "");
    document.body.append(d);
  }, x, y, label);
}
const shot = async (name) => pg.screenshot({ path: out + name });

await pg.goto(base + "?theme=glass"); await wait(400);
await shot("01-home.png");
await cursor(450, 392, "Choose a file"); await shot("02-choose.png");
await pg.evaluate(() => { const d = new DataTransfer(); d.items.add(new File(["x"], "birthday.mov")); window.__dt = d; window.dispatchEvent(new DragEvent("dragover", { dataTransfer: d, bubbles: true, cancelable: true })); });
await cursor(400, 300, "birthday.mov"); await shot("03-drag.png");
await pg.mouse.move(400, 300);
await pg.evaluate(() => window.dispatchEvent(new DragEvent("drop", { dataTransfer: window.__dt, bubbles: true, cancelable: true, clientX: 400, clientY: 300 })));
await wait(600); await cursor(400, 300, "the wheel opens here"); await shot("04-wheel.png");
const box = await (await pg.$('.pg[data-to="mp4"]')).boundingBox();
const mx = box.x + box.width / 2, my = box.y + box.height / 2;
await pg.mouse.move(mx, my, { steps: 5 }); await wait(300); await cursor(mx - 5, my + 8, "click MP4"); await shot("05-hover.png");
await pg.mouse.click(mx, my); await wait(1400); await cursor(450, 150, ""); await shot("06-done.png");
await pg.goto(base + "?theme=glass"); await wait(400);
await cursor(374, 40, "pick a theme here"); await shot("07-themes.png");
await pg.goto(base + "?theme=dark"); await wait(400); await cursor(609, 40, "Dark"); await shot("08-dark.png");
await pg.goto(base + "?theme=light"); await wait(400); await cursor(549, 40, "Light"); await shot("09-light.png");
await pg.goto(base + "?theme=glass&alpha=40&tint=dark"); await wait(400); await cursor(493, 42, "drag the slider"); await shot("10-glass-controls.png");
await pg.goto(base + "?open=holiday.png&x=450&y=330&theme=glass&alpha=30&tint=light&hover=2"); await wait(700); await shot("11-glass-light.png");
await b.close(); srv.close();
