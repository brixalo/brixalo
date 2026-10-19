# Themes and add-ons

Brixalo ships with Liquid Glass, Black and White using the user's PANOPTES colour values. Background opacity runs from 20% to 95% (default 50%), foreground from 70% to 100% (default 100%). Glass desktop panels use 62% of the background setting, 17px blur and 145% saturation. Black uses 7px blur; White 10px. Below 900px blur is disabled and Glass uses the full background setting. Desktop transparency also depends on the OS compositor. Layout and implementation remain Brixalo's own.

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
