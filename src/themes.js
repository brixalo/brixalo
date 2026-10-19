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
  try { const s=JSON.parse(localStorage.getItem(GLASS_STORE)||"{}"); return {alpha: Math.min(95,Math.max(20,Number(s.alpha)||50)), foreground: Math.min(100,Math.max(70,Number(s.foreground)||100))}; }
  catch {return {alpha:50,foreground:100};}
}
export function saveGlass(s) {try {localStorage.setItem(GLASS_STORE,JSON.stringify(s));} catch {}}

// PANOPTES values, implemented independently. Opacity affects surfaces and text separately.
export function applyTheme(id, settings=glassSettings()) {
  const t=themes.get(id)||themes.get("glass"), root=document.documentElement;
  for(const k of [...root.style]) if(k.startsWith("--"))root.style.removeProperty(k);
  const a=Math.min(.95,Math.max(.2,settings.alpha/100)), f=Math.min(1,Math.max(.7,settings.foreground/100));
  const small=matchMedia('(max-width:899px)').matches;
  const panelAlpha=t.id==='glass'&&!small?a*.62:a;
  const panel=t.panelRGB?`rgba(${t.panelRGB},${panelAlpha})`:t.vars['--card'];
  const vars={...t.vars};
  if(t.panelRGB)Object.assign(vars,{'--card':panel,'--p0':panel,'--p1':panel,'--hub0':panel,'--hub1':panel,'--blur':small?'none':`blur(${t.blur}px)`,
    '--ink':`color-mix(in srgb, ${t.vars['--ink']} ${f*100}%, transparent)`,
    '--mute':`color-mix(in srgb, ${t.vars['--mute']} ${f*100}%, transparent)`});
  for(const [k,v]of Object.entries(vars))if(KNOWN_VARS.test(k))root.style.setProperty(k,v);
  root.style.colorScheme=t.scheme==='light'?'light':'dark';
  root.dataset.theme=t.id;root.dataset.glass=t.id==='glass'?'1':'';
  const T=typeof window!=='undefined'&&window.__TAURI__;
  if(T){root.dataset.native='1';T.core.invoke('set_glass',{on:t.id==='glass',dark:true}).then(m=>root.dataset.glassMode=m).catch(()=>{});}
  try{localStorage.setItem(STORE,t.id);}catch{}
}
export function savedThemeId() {
  try { return localStorage.getItem(STORE) || "glass"; } catch { return "glass"; }
}
