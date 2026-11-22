# WaveBrowse 🌊

A lightning-fast music and audio sample manager desktop app built with **TypeScript**, **WebGL**, **SCSS**, and **Electron**. Browse folder trees, preview GPU-accelerated waveforms instantly, seek on click, and drag audio files directly into **any software** (Ableton Live, FL Studio, Logic Pro, Reaper, Premiere Pro, DaVinci Resolve, macOS Finder, etc.).

---

## ⚡ High-Performance Features

- **Hardware-Accelerated WebGL Waveform Shader**:
  - Custom vertex & fragment shaders running directly on the GPU.
  - Zero CPU rasterization; rendering time is `<0.02ms` on the GPU.
  - Neon cyan/blue/violet gradient, interactive glowing playhead cursor, and hover guide line.
  - Full Retina/HiDPI display support with 60–120Hz ProMotion smoothness.

- **Modular SCSS Architecture**:
  - Organized modular styles under `src/renderer/styles/` (`_variables.scss`, `_mixins.scss`, `_base.scss`, `_titlebar.scss`, `_sidebar.scss`, `_filterbar.scss`, `_tracklist.scss`, `_player.scss`, and `main.scss`).
  - Compiled directly with Sass into minified CSS.

- **Modular UI Component Architecture**:
  - Decoupled, single-responsibility TypeScript components under `src/renderer/components/`:
    - `WebGLWaveform.ts`: Pure WebGL GPU shader engine.
    - `MasterPlayer.ts`: Bottom floating transport dock and master WebGL waveform.
    - `TrackList.ts`: Track table, inline waveforms, and drag handles.
    - `Sidebar.ts`: Expandable folder hierarchy and Finder drop zone.
    - `FilterBar.ts`: Search, format chips, auto-play, and subfolder recursion toggles.
    - `Header.ts`: Window drag bar, breadcrumb navigation, and demo loader.

- **Native Drag-and-Drop to ANY Software (Bug-Free)**:
  - Powered by Electron's native `startDrag` with safe `nativeImage` fallbacks.
  - Drop files directly into **Ableton Live**, **FL Studio**, **Logic Pro**, **Reaper**, **Premiere Pro**, or **Finder**.

---

## 📁 Project Structure

```
music-browse/
├── build.ts                     # TypeScript & Sass compilation pipeline
├── package.json                 # Build & run scripts
├── tsconfig.json                # Strict TypeScript configuration
├── assets/
│   └── drag-icon.png            # Native OS drag icon
├── demo-samples/                # Sample audio files (Kicks, Snares, Synths)
└── src/
    ├── types/
    │   └── index.ts             # Unified TypeScript interfaces
    ├── main/
    │   ├── main.ts              # Electron Main process & native OS drag handler
    │   ├── preload.ts           # Type-safe ContextBridge IPC
    │   └── scanner.ts           # Folder scanner & directory tree generator
    └── renderer/
        ├── app.ts               # Main application coordinator
        ├── waveform.ts          # Peak extraction & cache manager
        ├── player.ts            # Audio transport & 60-120 FPS animation loop
        ├── tree.ts              # Tree data structure renderer
        ├── components/          # Modular UI Components
        │   ├── WebGLWaveform.ts # WebGL GPU shader renderer
        │   ├── MasterPlayer.ts  # Bottom dock & WebGL waveform controls
        │   ├── TrackList.ts     # Table rows & lazy in-line waveforms
        │   ├── Sidebar.ts       # Directory explorer & drop zone
        │   ├── FilterBar.ts     # Search & format filters
        │   └── Header.ts        # Window header & breadcrumbs
        └── styles/              # Modular SCSS
            ├── _variables.scss  # Colors, typography, spacing
            ├── _mixins.scss     # Flex, glassmorphism, scrollbars
            ├── _base.scss       # Global layouts & reset
            ├── _titlebar.scss   # Header bar & breadcrumbs
            ├── _sidebar.scss    # Folder tree styling
            ├── _filterbar.scss  # Search & filter chips
            ├── _tracklist.scss  # Table, badges, waveforms
            ├── _player.scss     # Master player dock
            └── main.scss        # SCSS entry point
```

---

## 🏃 How to Run Anytime

```bash
# Type check:
pnpm run typecheck

# Build and start:
pnpm start
```
