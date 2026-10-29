# Motivelium 0.2.0-beta.1 · 30 October 2026

AI-first video creation with a visual studio for manual refinement. The AI creates editable scenes through MCP, receives real preview frames and proposes changes; you review, apply, compare and undo them.

## New since alpha.3
- External stdio MCP: compact object/effect queries, timing recipes, storyboard, visual transition previews, revision checks and a shared iteration/render/time budget.
- Draft preview, Apply, Undo/Redo, version comparison, editable animation keys and direct canvas manipulation.
- Russian/English UI, help and content variants; system/light/dark themes. Your own project text is not automatically translated.
- Four redesigned examples and three templates. Create independent copies; change text, images and music without modifying a template.
- Audio tracks, gain/offset/mute, beat grid and a common preview/export mix. MP4 H.264/AAC and project ZIP with assets.
- Storage selection, safe copy from another local library, dependency diagnostics and illustrated first-run help.
- Alpha/beta/rc/stable package-reader ordering and version-driven Windows metadata. Older compatible alpha ZIPs remain readable.

## Downloads and first run
Setup: install with Windows UAC, then open from Start with ordinary rights. Portable: extract the entire ZIP and open Motivelium.exe. Both include Node and runtime libraries. Open Settings → AI and copy the MCP configuration into your own AI client. The client supplies the model and payment; no author keys are included.

[First video](FIRST_VIDEO.en.md) · [MCP](MCP.en.md) · [Русский первый запуск](FIRST_VIDEO.md) · [Known limitations](KNOWN_ISSUES.md)

## Requirements and honest limits
Windows10/11 x64, .NET Framework4.8 and WebView2 Evergreen. FFprobe for media import; Chrome, FFmpeg with libx264/AAC and FFprobe for MP4. These external components are installed separately; paths and diagnostics are in Settings. Setup/EXE are unsigned, so Windows may show publisher warnings.

Static GLB/GLTF is supported; arbitrary video-clip layers and a general animated-model pipeline are not part of this beta. Project ZIP includes the current document/resources, not the previous Undo history or exported MP4. Existing installed and portable libraries may use different data folders; use Storage or ZIP to copy projects.

Automated tests and the previous full Windows/MP4/ZIP workflow cover specific builds, not every GPU. A real subscription GLM built a12-second film only through MCP, received three preview PNGs, used Apply/Undo/Redo and exported MP4/ZIP; this is integration evidence, not an artistic guarantee. User review remains essential. Please report version/build, OS/GPU, step/frame and the exact error. Do not include keys or private project content in reports.

Own code: MIT. Third-party terms: THIRD_PARTY.md and licenses/. No author profiles, personal projects or QA operating-system images are distributed.
