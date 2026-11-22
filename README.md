# WaveBrowse 🌊 | Pro Audio Asset Manager

> A high-performance, desktop **Audio Asset Manager** and sound library browser engineered for **sound designers**, **music producers**, **game audio engineers**, and **video editors**. 

Manage, audition, and integrate massive local libraries of sound effects (SFX), foley, sample packs, loops, stems, and multi-track recordings with **GPU-accelerated WebGL waveforms** and **native drag-and-drop to any DAW, NLE, or game engine**.

---

## 🎧 Purpose-Built for Audio Workflows

Modern audio production requires sorting through tens of thousands of audio assets without sluggish loading times or losing directory organization. **WaveBrowse** preserves your folder taxonomy while providing instant, hardware-accelerated auditioning and seamless drag-and-drop integration into your creative workspace.

### Key Capabilities

- 📁 **Folder Taxonomy & Asset Hierarchy**:
  - Full hierarchical folder tree reflecting your local filesystem structure.
  - Drill into specific sample packs or toggle **"Include Subfolders"** for flat recursive browsing across nested libraries.
  - Ingest any folder instantly by dragging it straight from macOS Finder.
  - Instant zero-latency search across filenames, extensions, and metadata tags.

- ⚡ **GPU-Accelerated WebGL Waveform Engine**:
  - Custom WebGL fragment and vertex shaders render waveforms directly on the GPU in `<0.02 ms`.
  - Zero CPU rasterization or garbage collection hitches during playback.
  - **Instant Audition**: Click anywhere on any waveform (mini list view or master dock) to seek and trigger instant playback from that exact transient.
  - **Auto-Play Mode**: Cycle through kick drums, foley hits, or vocal chops with arrow keys for rapid-fire auditioning.
  - **ProMotion 120Hz/60Hz**: Liquid-smooth playhead animation powered by `requestAnimationFrame`.

- 🚀 **Universal Native Drag-and-Drop Integration**:
  - Dedicated `⠿` drag handles on every asset row plus a prominent **"DRAG TO DAW"** launchpad in the master player dock.
  - Powered by Electron's native OS drag API (`startDrag`) with safe `nativeImage` fallbacks.
  - Drag audio assets directly out of WaveBrowse and drop them into:
    - **DAWs**: Ableton Live, FL Studio, Logic Pro, Reaper, Pro Tools, Studio One, Bitwig, Cubase
    - **Game Engines**: Unreal Engine, Unity, Godot
    - **NLEs**: Adobe Premiere Pro, DaVinci Resolve, Final Cut Pro
    - **Operating System**: macOS Finder, external storage, Discord, Slack

- 📊 **Deep Audio Asset Metadata Inspection**:
  - Inspect sample rate (e.g. `44.1 kHz`, `48 kHz`, `96 kHz`, `192 kHz`), bit depth (`16-bit`, `24-bit`, `32-bit float`), channel format (`Mono` / `Stereo`), and detected `BPM`.
  - Native format support: `WAV`, `AIFF`, `FLAC`, `MP3`, `OGG`, `M4A`, `AAC`, `OPUS`, and `CAF`.

- 🎛️ **Sound Design & Auditioning Tools**:
  - **Playback Speed / Pitch Multiplier**: Audition assets at `0.5x`, `1.0x`, `1.5x`, or `2.0x` speed to evaluate pitched textures or time-stretched dialogue.
  - **Seamless Loop Mode**: Audit ambient beds, synth drones, and rhythmic loops continuously.
  - **Transient Re-triggering**: Hit <kbd>Enter</kbd> to re-trigger samples from the beginning instantly.

---

## ⌨️ Productivity Keyboard Shortcuts

| Key | Action | Workflow Context |
|---|---|---|
| <kbd>Space</kbd> | **Play / Pause** | Toggle playback on active asset |
| <kbd>↓</kbd> / <kbd>↑</kbd> | **Next / Prev Asset** | Rapid auditioning through sound libraries |
| <kbd>Enter</kbd> | **Re-trigger** | Fire sample from start (drum testing) |
| <kbd>L</kbd> | **Toggle Loop** | Test loop points for textures & stems |
| <kbd>Esc</kbd> | **Stop** | Instantly silence all audio |

---

## 🛠️ Architecture & Tech Stack

Built 100% in **TypeScript** with a modular architecture and GPU-driven rendering:

```
music-browse/
├── build.ts                     # TypeScript bundler & Sass compiler pipeline
├── package.json                 # Scripts and dependencies
├── tsconfig.json                # Strict TypeScript configuration
├── assets/
│   └── drag-icon.png            # 32x32 RGBA drag thumbnail for macOS Cocoa
├── demo-samples/                # Bundled kick, snare, and synth loop WAV assets
└── src/
    ├── types/
    │   └── index.ts             # AudioFileItem, FolderNode, AudioMetadata & IPC interfaces
    ├── main/
    │   ├── main.ts              # Electron Main process, protocol handler & safe native startDrag
    │   ├── preload.ts           # Secure ContextBridge API bridge
    │   └── scanner.ts           # Fast directory tree scanner & audio asset indexer
    └── renderer/
        ├── app.ts               # Application coordinator & state coordinator
        ├── waveform.ts          # Peak extractor, concurrency queue & memory cache
        ├── player.ts            # Web Audio / HTML5 transport & 60-120 FPS animation loop
        ├── tree.ts              # Expandable folder hierarchy UI
        ├── components/          # Modular Single-Responsibility UI Components
        │   ├── WebGLWaveform.ts # Hardware-accelerated GPU shader waveform renderer
        │   ├── MasterPlayer.ts  # Bottom floating dock, transport, WebGL canvas & DAW drag
        │   ├── TrackList.ts     # Virtualized asset table & lazy-loaded inline waveforms
        │   ├── Sidebar.ts       # Directory navigator & Finder drop zone
        │   ├── FilterBar.ts     # Real-time search, format filter chips & toggles
        │   └── Header.ts        # Traffic-light padding, breadcrumb bar & demo loader
        └── styles/              # Modular SCSS Architecture
            ├── _variables.scss  # Dark theme tokens, neon gradients & spacing
            ├── _mixins.scss     # Glassmorphism, flex helpers & custom scrollbars
            ├── _base.scss       # Global layouts & typography
            ├── _titlebar.scss   # Header styling & breadcrumb path
            ├── _sidebar.scss    # Tree explorer & dropzone
            ├── _filterbar.scss  # Search input & format chips
            ├── _tracklist.scss  # Table, drag handles, format badges & rows
            ├── _player.scss     # Master dock, WebGL container & transport
            └── main.scss        # SCSS entry point compiled to dist/renderer/style.css
```

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+ recommended)
- [pnpm](https://pnpm.io/) or `npm`

### Installation & Launch

```bash
# Install dependencies
pnpm install

# Run type check
pnpm run typecheck

# Build and start the Audio Asset Manager
pnpm start
```

### Production Build
```bash
pnpm run build
```
