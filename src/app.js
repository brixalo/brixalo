import { themes, loadThemes, applyTheme, savedThemeId, glassSettings, saveGlass } from "./themes.js";
import { kindOf, targetsFor, baseName, buildCommand, outputPath } from "./formats.js";

const T = window.__TAURI__ || null;
const $ = (id) => document.getElementById(id);
let shiftHeld = false;
let lastPos = { x: innerWidth / 2, y: innerHeight / 2 };

addEventListener("keydown", (e) => { if (e.key === "Shift") shiftHeld = true; if (e.key === "Escape") closeWheel(); });
addEventListener("keyup", (e) => { if (e.key === "Shift") shiftHeld = false; });
addEventListener("pointermove", (e) => { lastPos = { x: e.clientX, y: e.clientY }; });

// ---------- wheel ----------
const CX = 170, CY = 170, R_IN = 62, R_OUT = 160;
function pol(r, a) { return [CX + r * Math.cos(a), CY + r * Math.sin(a)]; }
function sector(a0, a1) {
  const [x0, y0] = pol(R_OUT, a0), [x1, y1] = pol(R_OUT, a1), [x2, y2] = pol(R_IN, a1), [x3, y3] = pol(R_IN, a0);
  const big = a1 - a0 > Math.PI ? 1 : 0;
  return `M${x0},${y0} A${R_OUT},${R_OUT} 0 ${big} 1 ${x1},${y1} L${x2},${y2} A${R_IN},${R_IN} 0 ${big} 0 ${x3},${y3} Z`;
}

export function openWheel(path, x, y) {
  const targets = targetsFor(path);
  if (!targets.length) { toast(path, "fail", "Petal can't convert this file type yet."); return; }
  const layer = $("wheel-layer");
  const gap = 0.05, n = targets.length, step = (2 * Math.PI) / n;
  const px = Math.min(Math.max(x, 200), innerWidth - 200), py = Math.min(Math.max(y, 200), innerHeight - 200);
  let svg = `<svg viewBox="-20 -20 380 380" role="menu" aria-label="Convert to"><defs>
    <radialGradient id="gp" cx="50%" cy="50%" r="60%"><stop offset="0.35" class="stop-a"/><stop offset="1" class="stop-b"/></radialGradient>
    <radialGradient id="gh" cx="50%" cy="50%" r="50%"><stop offset="0" class="stop-h0"/><stop offset="1" class="stop-h1"/></radialGradient></defs>
    <circle cx="${CX}" cy="${CY}" r="${R_OUT + 12}" class="halo"/>`;
  targets.forEach((t, i) => {
    const a0 = -Math.PI / 2 + i * step + gap / 2 - step / 2, a1 = a0 + step - gap;
    const mid = (a0 + a1) / 2, [lx, ly] = pol((R_IN + R_OUT) / 2 + 2, mid);
    const dx = Math.cos(mid) * 7, dy = Math.sin(mid) * 7, cls = i % 2 ? "alt" : "";
    const [ax0, ay0] = pol(R_OUT - 5, a0 + 0.07), [ax1, ay1] = pol(R_OUT - 5, a1 - 0.07);
    svg += `<g class="pg ${cls}" data-to="${t.to}" role="menuitem" tabindex="0" style="--dx:${dx.toFixed(1)}px;--dy:${dy.toFixed(1)}px;animation-delay:${i * 28}ms">
      <path class="petal" d="${sector(a0, a1)}"/>
      <path class="accent" d="M${ax0},${ay0} A${R_OUT - 5},${R_OUT - 5} 0 0 1 ${ax1},${ay1}"/>
      <text class="plabel" x="${lx}" y="${ly + (t.note ? 0 : 5)}">${t.label}</text>
      ${t.note ? `<text class="pnote" x="${lx}" y="${ly + 15}">${t.note}</text>` : ""}</g>`;
  });
  const kind = kindOf(path), icon = kind === "image" ? "▣" : kind === "video" ? "▶" : "♪";
  svg += `<circle class="hub" cx="${CX}" cy="${CY}" r="${R_IN - 6}"/>
    <text class="hubicon" x="${CX}" y="${CY - 14}">${icon}</text>
    <text class="hubsub" x="${CX}" y="${CY + 4}">convert to</text><text class="hubname" x="${CX}" y="${CY + 21}">${esc(shorten(baseName(path), 13))}</text></svg>`;
  layer.innerHTML = `<div id="wheel" style="left:${px}px;top:${py}px">${svg}</div>`;
  layer.style.setProperty("--cx", px + "px"); layer.style.setProperty("--cy", py + "px"); layer.hidden = false;
  layer.onclick = (e) => {
    const p = e.target.closest(".pg");
    if (p) { closeWheel(); runJob(path, p.dataset.to); }
    else if (!e.target.closest("#wheel") || e.target.classList.contains("hub")) closeWheel();
  };
  layer.querySelectorAll(".pg").forEach((p) => p.addEventListener("keydown", (e) => { if (e.key === "Enter") p.dispatchEvent(new MouseEvent("click", { bubbles: true })); }));
}
export function closeWheel() { const l = $("wheel-layer"); l.hidden = true; l.innerHTML = ""; }
function shorten(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function esc(s) { return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// ---------- themes ----------
async function initThemes() {
  await loadThemes(T);
  const bar = document.querySelector(".themes");
  bar.innerHTML = "";
  for (const t of themes.values()) {
    const b = document.createElement("button");
    b.type = "button"; b.dataset.theme = t.id; b.textContent = t.name;
    b.addEventListener("click", () => chooseTheme(t.id));
    bar.append(b);
  }
  const g = glassSettings();
  $("alpha").value = g.alpha; $("tint").value = g.tint;
  $("alpha").addEventListener("input", () => { saveGlass({ ...glassSettings(), alpha: +$("alpha").value }); applyTheme(document.documentElement.dataset.theme); });
  $("tint").addEventListener("change", () => { saveGlass({ ...glassSettings(), tint: $("tint").value }); applyTheme(document.documentElement.dataset.theme); });
  chooseTheme(new URLSearchParams(location.search).get("theme") || savedThemeId());
  const gq = new URLSearchParams(location.search);
  if (gq.get("alpha") || gq.get("tint")) { saveGlass({ alpha: +gq.get("alpha") || glassSettings().alpha, tint: gq.get("tint") || glassSettings().tint }); $("alpha").value = glassSettings().alpha; $("tint").value = glassSettings().tint; chooseTheme(document.documentElement.dataset.theme); }
}
function chooseTheme(id) {
  applyTheme(id);
  document.querySelectorAll(".themes button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.theme === document.documentElement.dataset.theme)));
}
await initThemes();

// ---------- jobs ----------
function toast(path, cls, msg, id) {
  let el = id && $(id);
  if (!el) { el = document.createElement("div"); if (id) el.id = id; $("jobs").prepend(el); }
  el.className = "job " + cls;
  el.innerHTML = `<div><b>${esc(baseName(path))}</b><div class="err">${cls === "fail" ? esc(msg) : ""}</div></div><div class="st">${cls === "fail" ? "failed" : esc(msg)}</div>`;
}
let jobSeq = 0;
async function runJob(path, to) {
  const kind = kindOf(path), id = "job" + ++jobSeq;
  if (!T) { toast(path, "run", `converting to ${to}...`, id); setTimeout(() => toast(path, "done", `preview only, no file written`, id), 900); return; }
  try {
    toast(path, "run", `converting to ${to}...`, id);
    const out = await T.core.invoke("plan_output", { input: path, to });
    const { engine, args } = buildCommand(kind, to, path, out);
    await T.core.invoke("run_engine", { engine, args });
    toast(path, "done", `saved ${baseName(out)}`, id);
  } catch (e) { toast(path, "fail", String(e), id); }
}

// ---------- input ----------
const drop = $("drop");
function handle(path, x, y) { openWheel(path, x ?? lastPos.x, y ?? lastPos.y); }

if (T && T.webview) {
  T.webview.getCurrentWebview().onDragDropEvent((ev) => {
    const p = ev.payload;
    if (p.type === "over" || p.type === "enter") { drop.classList.add("over"); if (p.position) lastPos = { x: p.position.x / devicePixelRatio, y: p.position.y / devicePixelRatio }; }
    else if (p.type === "leave") drop.classList.remove("over");
    else if (p.type === "drop") {
      drop.classList.remove("over");
      const f = p.paths && p.paths[0];
      if (f) handle(f, p.position.x / devicePixelRatio, p.position.y / devicePixelRatio);
    }
  });
  T.core.invoke("engine_status").then((s) => { const e = $("engine"); e.textContent = s; e.className = "engine " + (/missing/.test(s) ? "bad" : "ok"); });
} else {
  $("engine").textContent = "preview mode (no engine)";
  addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  addEventListener("dragleave", () => drop.classList.remove("over"));
  addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) handle(f.name, e.clientX, e.clientY); });
}
$("pick").addEventListener("click", async () => {
  if (T && T.dialog) { const f = await T.dialog.open({ multiple: false }); if (f) handle(f, innerWidth / 2, innerHeight / 2); }
  else if (!T) { handle(new URLSearchParams(location.search).get("file") || "holiday-clip.mov", innerWidth / 2, innerHeight / 2); }
});
// test hook: ?open=name.ext&x=..&y=..
const q = new URLSearchParams(location.search);
if (q.get("open")) handle(q.get("open"), +q.get("x") || innerWidth / 2, +q.get("y") || innerHeight / 2);

if (q.get("hover")) setTimeout(() => { const g = document.querySelectorAll(".pg")[+q.get("hover")]; if (g) g.classList.add("focus"); }, 50);
