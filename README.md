# Brixalo
Offline file converter with a radial wheel. Drop a file, pick a format. Images, video and audio. FFmpeg and ImageMagick do the work on your own computer.

- **Local only.** No uploads, no telemetry, no update checks. `test/offline.test.mjs` checks the code has no network use and the app's security policy blocks remote connections. CI runs the whole conversion matrix with the network switched off.
- **Your original is never touched.** Brixalo writes a hidden temporary file, checks it is not empty, then renames it. It never overwrites an existing file.
- **Tested.** 62 conversions are checked for real output (duration, codec, size), 4 damaged-file cases must fail cleanly, and CI runs the compiled app, converts a file through the wheel and keeps screenshots as evidence.

Prior art: radial menus for file conversion exist (for example the 2026 "Radial Menu" experiment and the Mac app Tangerine). Brixalo does not claim to have invented the idea. It is built from scratch, with its own code and design, as a small cross-platform tool.

See `docs/MANUAL.md` for how to use it and `docs/themes.md` for theme add-ons.
Dev: `npm test`, `node test/offline.test.mjs`, `npm run shots`, `npx tauri dev` (needs Rust).
All rights reserved (see NOTICE.txt).
