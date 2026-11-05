# Motivelium 0.2.0-beta.2 — Windows candidate, 31 October 2026

Windows beta.2 is based on the tested build `20261031-beta2-candidate-r3`.
The About section adds the author handle, website and Telegram. The beta.1
assets remain unchanged.

- Native CFR H.264/AAC MP4 video layers: trim, speed, hold/hide, fit and linked audio. Video import is limited to 64 MiB, up to 4096 px / 8.8 MP, 1–120 fps and one hour. VFR, rotation and unsupported codecs are rejected. Speed changes audio pitch.
- ScreenGuide: editable source-time attention points, cursor, click highlights and bounded auto-zoom. Shared renderer in UI, MCP and MP4. Preview, Apply, Undo/Redo and project ZIP keep the settings editable.
- MCP `propose_screen_guide`, compact point queries and the same iteration budget. The external AI client supplies its own model; no author credentials are included.
- Installed-studio MCP configuration carries the active data directory and explicit component paths. Copy the entire configuration, including `env`, so video previews use the configured FFmpeg/Chrome.
- A single capability map distinguishes source implementation, manual UI, MCP and the published release.

Requirements: Windows10/11 x64, .NET4.8 and WebView2. Node and production libraries are bundled. FFmpeg/FFprobe are required for video layers; MP4 export additionally requires Chrome. External tools are configured in Settings and are not bundled. Setup and EXE are unsigned; installation/update/removal use UAC, the editor runs with ordinary rights.

This adds formatting of existing recordings, not screen capture, action recognition or removal of an existing cursor from video pixels. A general animated GLTF pipeline is also outside this candidate. Old reader versions should request an upgrade for ZIPs using `video-clips-v1` or `screen-guide-v1`.

[Установка](INSTALLATION.md) · [Видеослои](VIDEO_CLIPS.md) · [ScreenGuide RU](SCREEN_GUIDE.md) · [ScreenGuide EN](SCREEN_GUIDE.en.md).

Cold video seeks now prepare four Full HD frames per batch (32MiB raster target) and use fast lossless PNG compression. The Windows check exposed a 30-second cold-frame timeout with the previous16-frame batches. Resolution and decoded pixels are unchanged; independent Full HD frame-index tests compare RGBA pixels.
