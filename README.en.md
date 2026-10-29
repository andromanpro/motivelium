# Motivelium

[Русский](README.md) · [Quick start](docs/FIRST_VIDEO.en.md) · [AI connection](docs/MCP.en.md)

Motivelium lets an AI build videos that remain editable. The agent creates scenes, selects effects, inspects rendered frames and proposes changes. You preview the result, refine it in the studio and control Apply, Undo and Redo.

**[0.2.0-beta.1 — first public beta](https://github.com/andromanpro/motivelium/releases/tag/v0.2.0-beta.1)**, build `20261030-beta1`. [Download Windows setup and portable](https://github.com/andromanpro/motivelium/releases/tag/v0.2.0-beta.1) · [Release notes and limitations](docs/RELEASE_BETA1.md). Explore four built-in examples, then connect your own AI over MCP.

## Start with your AI or a template

Open Settings → AI and copy the MCP configuration into your own AI client. MCP provides catalogs, compact object queries, frame-based timing, storyboards, draft previews, real PNGs and short video, Apply/Undo, MP4 and project ZIP export. The bridge does not call a model or require the author's credentials.

Alternatively choose a template or create a storyboard. Applied text, images, groups, cameras and animation keys remain ordinary editable objects. Replace the materials, drag objects and refine the result.

Optional built-in GLM editing can inspect before/after frames and review a selected object within a bounded loop. It needs your own provider profile. Manual work and external MCP are separate connections.

## Languages and appearance

The studio, Help, four examples and three starter templates support English and Russian. A new profile follows the browser language; an explicit choice in Settings → Viewing is saved. System/light/dark appearance is independent of the project.

Examples and templates have separate content-language selectors. Switching UI language never translates your existing project or renames imported model parts. Some original technical diagnostics and asset names retain their source language.

## Windows requirements

The x64 Setup or complete portable package includes Node.js and runtime libraries. Setup requests UAC; the editor runs with ordinary user rights.

- Windows 10/11 x64, .NET Framework 4.8 and Microsoft Edge WebView2 Runtime.
- FFprobe for media import.
- Google Chrome, FFmpeg with libx264/AAC, and FFprobe for MP4.

External tools are installed separately. Check or select executable paths in Settings → Components. The installer is unsigned; Windows can display an unknown-publisher warning.

Installed data lives under %LOCALAPPDATA%/Motivelium, separately from program files. Updates and uninstalling preserve projects. Do not run independent servers against the same data folder. Move projects using ZIP, or inspect/copy another local library in Settings → Storage.

## Export and transfer

Export → MP4 video creates H.264/AAC from an immutable revision snapshot. Preview and export share the renderer and audio mix.

File → Download project creates a ZIP containing editable content and referenced media. Import creates an independent copy. Previous Undo history and finished MP4 files are not transferred.

## Source checkout

Use Node.js 24.12+ in the 24.x branch:

    node tools/setup.mjs
    node launch.mjs --check
    node launch.mjs

Checks:

    npm --prefix studio test
    npm --prefix studio run typecheck
    npm run test:browser
    py -3.14 tools/license-report.py --verify

Browser tests use isolated data and real Chrome/FFmpeg, without calling an LLM. Production is the default build.

This is a beta: static GLB/GLTF is supported; arbitrary video-clip import is not yet complete. Test evidence does not promise identical performance on every GPU. See docs/KNOWN_ISSUES.md and docs/RELEASE_BETA1.md.

Own application code is MIT. Packages, shaders, models and media retain their licenses in THIRD_PARTY.md and licenses/. Personal projects, profiles, credentials and development laboratories are excluded from runtime packages.
