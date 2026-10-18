// Static checks behind the "files stay on this computer" claim.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

let bad = 0;
const fail = (m) => { console.log("FAIL  " + m); bad++; };
const ok = (m) => console.log("PASS  " + m);

const srcDir = new URL("../src/", import.meta.url).pathname;
const files = readdirSync(srcDir).filter((f) => /\.(js|html|css)$/.test(f));
for (const f of files) {
  const text = readFileSync(join(srcDir, f), "utf8");
  const urls = (text.match(/https?:\/\/[^\s"'`)]+/g) || []).filter((u) => !/w3\.org\/2000\/svg/.test(u));
  urls.length ? fail(`${f} contains URLs: ${urls.join(", ")}`) : ok(`${f}: no URLs`);
  /\b(XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/.test(text) ? fail(`${f} uses a network API`) : ok(`${f}: no network APIs`);
  for (const m of text.matchAll(/fetch\(([^)]*)\)/g)) /^[`"']themes\//.test(m[1].trim()) ? ok(`${f}: fetch only reads bundled ${m[1]}`) : fail(`${f}: fetch(${m[1]})`);
}

const cargo = readFileSync(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8");
const deps = cargo.split("[dependencies]")[1].split("\n").filter((l) => /^[a-z_-]+\s*=/.test(l)).map((l) => l.split("=")[0].trim());
const allowed = ["tauri", "tauri-plugin-dialog", "serde", "serde_json"];
deps.every((d) => allowed.includes(d)) ? ok(`Rust dependencies are only: ${deps.join(", ")}`) : fail(`unexpected Rust dependencies: ${deps}`);

const conf = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
const csp = conf.app.security.csp || "";
/connect-src 'self' ipc: http:\/\/ipc\.localhost/.test(csp) && !/\*|https?:\/\/(?!ipc\.localhost)/.test(csp) ? ok("CSP blocks all remote connections") : fail("CSP is missing or too open: " + csp);
const main = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
/(reqwest|hyper|TcpStream|UdpSocket|ureq)/.test(main) ? fail("main.rs uses a network type") : ok("main.rs: no network code");
console.log(bad ? `\n${bad} failed` : "\nall offline checks passed");
process.exit(bad ? 1 : 0);
