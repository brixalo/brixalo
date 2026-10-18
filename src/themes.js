// Theme loader. Built-in themes live in src/themes/*.json. Add-ons are more JSON files in
// the user's Brixalo themes folder (see docs/themes.md). A theme is only a set of CSS variables.

const BUILT_IN = ["light", "dark", "glass"];
const STORE = "brixalo-theme";
const GLASS_STORE = "brixalo-glass";
const KNOWN_VARS = /^--[a-z0-9-]+$/;

export const themes = new Map();

export async function loadThemes(tauri) {
  for (const id of BUILT_IN) themes.set(id, await (await fetch(`themes/${id}.json`)).json());
  if (tauri) {
    try {
      for (const text of await tauri.core.invoke("list_user_themes")) {
        const t = JSON.parse(text);
        if (validTheme(t) && !BUILT_IN.includes(t.id)) themes.set(t.id, t);
      }
    } catch (e) { console.warn("add-on themes skipped:", e); }
  }
  return themes;
}

function validTheme(t) {
  if (!t || typeof t.id !== "string" || !/^[a-z0-9-]+$/.test(t.id) || typeof t.name !== "string") return false;
  const sets = t.glass ? Object.values(t.tints || {}) : [t.vars];
  return sets.length > 0 && sets.every((s) => s && Object.keys(s).every((k) => KNOWN_VARS.test(k)));
}

export function glassSettings() {
  try { return { alpha: 50, tint: "dark", ...JSON.parse(localStorage.getItem(GLASS_STORE) || "{}") }; } catch { return { alpha: 50, tint: "dark" }; }
}

export function saveGlass(s) {
  try { localStorage.setItem(GLASS_STORE, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

// Apply a theme by setting its variables on <html>. Glass themes build their translucent
// fills from the chosen tint and the transparency slider (alpha 0 = clear, 100 = solid).
export function applyTheme(id, glass = glassSettings()) {
  const t = themes.get(id) || themes.get("glass");
  const root = document.documentElement;
  for (const k of [...root.style]) if (k.startsWith("--")) root.style.removeProperty(k);
  let vars = t.vars || {};
  if (t.glass) {
    const tint = t.tints[glass.tint] || t.tints.dark;
    const a = Math.min(1, Math.max(0.15, glass.alpha / 100));
    vars = {
      ...tint,
      "--p0": `rgba(${tint["--rgb0"]},${a})`, "--p1": `rgba(${tint["--rgb1"]},${a})`,
      "--hub0": `rgba(${tint["--hub-rgb0"]},${Math.min(1, a + 0.2)})`, "--hub1": `rgba(${tint["--hub-rgb1"]},${Math.min(1, a + 0.2)})`,
      "--veil": `radial-gradient(circle at var(--cx, 50%) var(--cy, 50%), rgba(${tint["--veil-rgb"]},${0.2 + a * 0.25}), rgba(${tint["--veil-rgb"]},${0.45 + a * 0.4}))`,
      "--blur": `blur(${Math.round(2 + (1 - a) * 8)}px)`,
      // Window fill: the lower the slider, the more of the desktop shows through.
      "--page": `radial-gradient(700px 420px at 12% -8%, rgba(255,122,107,${(0.16 * a).toFixed(3)}), transparent), linear-gradient(160deg, rgba(${tint["--rgb1"]},${(0.08 + 0.8 * a).toFixed(3)}), rgba(${tint["--hub-rgb1"]},${(0.1 + 0.8 * a).toFixed(3)}))`,
      "--card": `rgba(${tint["--rgb0"]},${(0.2 + 0.5 * a).toFixed(3)})`,
    };
  }
  for (const [k, v] of Object.entries(vars)) if (KNOWN_VARS.test(k)) root.style.setProperty(k, v);
  root.style.colorScheme = (t.glass ? glass.tint : t.scheme) === "light" ? "light" : "dark";
  root.dataset.theme = t.id;
  root.dataset.glass = t.glass ? "1" : "";
  const T = typeof window !== "undefined" && window.__TAURI__;
  if (T) {
    root.dataset.native = "1";
    T.core.invoke("set_glass", { on: !!t.glass, dark: glass.tint !== "light" }).then((m) => { root.dataset.glassMode = m; }).catch(() => {});
  }
  try { localStorage.setItem(STORE, t.id); } catch { /* storage unavailable */ }
}

export function savedThemeId() {
  try { return localStorage.getItem(STORE) || "glass"; } catch { return "glass"; }
}
