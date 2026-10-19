# Brixalo

A free desktop file converter with a radial wheel. Choose a file or drop it onto the app, then click an output format. Conversion runs on your computer using FFmpeg and ImageMagick.

**Early prototype, version 0.1.0.** Windows, macOS and Linux builds are configured in GitHub Actions. There is no published release yet. The app and installers are unsigned; expect operating-system warnings. Use copies of important files while testing.

![Brixalo conversion wheel](docs/img/04-wheel.png)

## What it does

- Converts images, video and audio. Video can also be converted to audio only.
- Saves results beside the input, using a numbered name if the target name is already taken.
- Writes conversion output to a temporary file before moving it to the chosen destination.
- Includes Light, Dark and Glass themes, with free JSON theme add-ons.
- Has no account, telemetry or automatic update check. The app's source has offline checks and a restrictive connection policy. Installing dependencies and building require internet access.

| Input family | Output formats |
| --- | --- |
| Images | PNG, JPG, WebP, GIF, BMP, TIFF, AVIF |
| Video | MP4, WebM, MKV, GIF, MP3, WAV, M4A |
| Audio | MP3, WAV, FLAC, OGG, M4A, Opus |

The app hides the input's own format. Support depends on the codecs and delegates in your installed tools. PDF, office documents, batch conversion and system-wide drag shortcuts are not supported. The wheel opens inside the Brixalo window, not over other apps.

## Run from source

Install Node.js 20 or later, npm, Rust and the platform prerequisites for Tauri 2. Install FFmpeg and ImageMagick separately and make them available on `PATH`.

```sh
npm ci
npx tauri icon assets/icon.png
npx tauri dev
```

For an installer, run `npx tauri build` after the same setup. Linux also needs the WebKitGTK 4.1, GTK 3 and other native development packages listed in `.github/workflows/build.yml`. Windows needs the Tauri-required Microsoft C++ build tools; macOS needs Apple's command-line developer tools.

FFmpeg and ImageMagick are not bundled by this repository. Their licences and codec support are separate from Brixalo's source licence. Do not assume every FFmpeg build has the same licence or supported encoders.

## Use

1. Open Brixalo. Check that FFmpeg and ImageMagick are detected.
2. Click **Choose a file** or drop a file into the window.
3. Click a format on the wheel. The result appears next to the original.

Press **Esc** or click outside the wheel to close it. Tab and Enter also work. See the [user manual](docs/MANUAL.md) and [theme guide](docs/themes.md).

## Glass effects

Glass transparency and background blur depend on the operating system and compositor. The code requests Windows Mica/Acrylic, macOS vibrancy, or a Linux blur hint. Windows and macOS blur have not been visually verified. On Linux, a compositor may ignore the blur hint. The included screenshots illustrate the UI, not a guarantee of native blur on every desktop.

## Tests

```sh
npm test
```

This runs static offline checks and the conversion matrix. FFmpeg, FFprobe and ImageMagick are required. The matrix includes 62 checks for conversions, damaged files and output naming. CI also runs Rust file-safety tests and a Linux end-to-end conversion. Passing engine tests does not establish that every installer or desktop effect works on every machine.

## Origins

Radial menus for file conversion already exist. Brixalo does not claim to have invented that interaction. This is a separate Tauri/Rust and JavaScript implementation, not a Filee fork or plugin. Its name, icon, themes and source are maintained in this repository.

## Licence

Brixalo source is available under the [MIT License](LICENSE). You may use, modify, redistribute and sell it under those terms; there is no resale royalty. Third-party tools and dependencies keep their own licences.

## Experimental format / quality / viewer branch

This branch is work in progress and is not the main release. Use **Inspect quality / all formats** for locally detected input metadata and all compatible output recipes, including recompression to the same format. Only encoders advertised by your installed tools are offered. A listed encoder is not proof that every possible input, profile or delegate will work.

- Images: recipes for PNG, JPEG, WebP, GIF, BMP, TIFF, AVIF, HEIC, ICO, JPEG 2000, JPEG XL, TGA, PCX, PPM/PGM/PBM/PAM/PNM, EXR, HDR, DPX, PSD and QOI. Availability varies. ICO is capped at 256 px. Most image conversions use the first frame/page; this is not a layered-image editor.
- Audio: MP3, PCM WAV, FLAC, Ogg Vorbis, Opus, AAC/M4A, AIFF/AIF, ALAC-in-M4A, WMA, AC3, MP2 and CAF. Lossless-codec mode does not restore previously lost detail or promise preservation through bit-depth conversion.
- Video: MP4, MKV, WebM, MOV, AVI, MPEG/MPG, FLV, WMV, OGV, MPEG-TS, M4V and GIF; audio extraction is available when a usable audio stream exists. MKV can use FFV1/FLAC as a lossless-codec option. Audio-only files cannot become meaningful videos without a visual track.
- Controls: format-appropriate quality, audio bitrate, maximum dimensions and best-effort target size. Quality-mode output sizes cannot be predicted from metadata. Bitrate-budget size targets are estimates, not hard caps. Check the actual output size before uploading to a site with a limit.
- Inspector: file size, duration, codec, bitrate, sample rate/channels, bit depth and resolution when reported. Lossless is a codec classification, not a perceptual quality score. Image quality tags are metadata, not a trustworthy measure of original quality.
- Local viewer: text/code shown as inert UTF-8 text; hex/binary byte preview for arbitrary files (first 256 KiB); first-frame raster previews for ImageMagick-supported images; PDF page raster preview with separately installed Poppler (`pdftoppm`); audio/video playback for formats/codecs supported by the operating system WebView, limited to 32 MiB. Unsupported playback explains the limitation. No HTML/scripts/macros or PDF actions are executed. Large text previews are truncated and are not complete-file conversions.
- Text/binary/hex tool: UTF-8 text to/from 8-bit binary or hex representation, with malformed input rejected. This is byte encoding, not a promise to convert arbitrary binary files into readable documents. Copy the result to save it.

Not implemented: office-document conversion/rendering, archives, CAD/3D, every historical proprietary format, OCR, general file repair, guaranteed size caps, or a universal media decoder. Files needing unsupported delegates remain unsupported. No ads, accounts, telemetry or remote preview service are added.

Tests on the development Linux environment: 62 existing checks and 66 extra real conversions passed. JXL and QOI were unavailable and were excluded, not counted as passing. Browser UI tests use real FFprobe fixture metadata via a test adapter; they do not replace native Tauri/OS tests. New Rust code and installers require CI validation before merging.

### Experimental file encryption and decode workbench

**Real encryption:** optional standard `age` executable, X25519 public recipients and local identity files. Choose an input file and a new output filename. Encryption/decryption is local and authenticated by age; no key upload or custom cryptography is used. Verify the recipient public key through a trusted channel. Losing the private identity can make recovery impossible. Decrypted files are plaintext and need protection. Back up identities securely. This does not authenticate the sender or supply a messaging transport, enterprise audit/compliance or key-management service. Password mode, key generation UI and interactive passphrase-protected identities are not implemented. Install a maintained age release separately. `npm run test:age` needs `age` and `age-keygen` on PATH.

**Decode workbench:** bounded 16 KiB input; candidate UTF-8 decodes for Base64/Base32/Base58, hex, 8-bit binary, URL/HTML entities, Morse, Caesar shifts and Atbash. Outputs are ranked with a simple readability/English-word heuristic and may be wrong, especially for non-English text. Hash-length patterns are only hints, not proof or reversal. Vigenere key search, nested magic decoding and general cryptanalysis are not implemented. Modern encryption cannot be broken by this workbench without the key.

**Brixalo toy cipher:** openly documented ROT13 plus reversed hex bytes, labelled NOT SECURE in the interface. It is decorative obfuscation, not cryptography. Never use it for private files, passwords or corporate secrets. Base64, hex, Morse and the other classic transforms are encodings/toys, not security.
