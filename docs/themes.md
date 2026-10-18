# Themes and add-ons

Petal ships with Light, Dark and Glass. Glass has a transparency slider and a Dark or Light tint.

More looks are free add-ons. An add-on is one `.json` file. Drop it into the Petal themes folder and restart Petal.
It appears in the theme switcher. Add-ons are free and open: copy one and change the colors.

## Where the folder is
- Windows: `%APPDATA%\app.petal.converter\themes`
- macOS: `~/Library/Application Support/app.petal.converter/themes`
- Linux: `~/.config/app.petal.converter/themes`

Petal creates the folder on first start.

## File format
```json
{ "id": "sunset", "name": "Sunset", "vars": { "--ink": "#fff4ee", "--coral": "#ffb347" } }
```
`id` is lowercase letters, digits and dashes. `vars` are the color variables. See `examples/themes/sunset.json`
for every variable. A file that is not valid is skipped. A theme can only set colors, it cannot run code.
