# Themes and add-ons

Brixalo ships with Light, Dark and Glass. Glass has a transparency slider, Dark or Light tint, and Soft / Balanced / Deep shade steps. The same clean layout runs in all three modes. Panels use translucent fills and background blur; desktop effects depend on the OS compositor. This is an original implementation from the requested dark / light / glass direction, not imported from another app.

More looks are free add-ons. An add-on is one `.json` file. Drop it into the Brixalo themes folder and restart Brixalo.
It appears in the theme switcher. Add-ons are free and open: copy one and change the colors.

## Where the folder is
- Windows: `%APPDATA%\app.brixalo.converter\themes`
- macOS: `~/Library/Application Support/app.brixalo.converter/themes`
- Linux: `~/.config/app.brixalo.converter/themes`

Brixalo creates the folder on first start.

## File format
```json
{ "id": "sunset", "name": "Sunset", "vars": { "--ink": "#fff4ee", "--accent": "#ffb347" } }
```
`id` is lowercase letters, digits and dashes. `vars` are the color variables. See `examples/themes/sunset.json`
for every variable. A file that is not valid is skipped. A theme can only set colors, it cannot run code.
