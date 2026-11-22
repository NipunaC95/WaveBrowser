# WaveBrowse 🌊

A lightning-fast music and audio sample manager desktop app built with **TypeScript** and **Electron**. Browse folder trees, preview interactive waveforms instantly, seek on click, and drag audio files directly into **any software** (Ableton Live, FL Studio, Logic Pro, Reaper, Premiere Pro, DaVinci Resolve, macOS Finder, etc.).

---

## 🚀 Features

- **Folder Structure Tree Browser**:
  - Full hierarchical folder tree on the left sidebar.
  - Expand/collapse nested folders with sample count badges.
  - Option to toggle **Include Subfolders** (flat recursive view).
  - Drag and drop any folder directly from Finder into the app to open it immediately.
  - Instant search filtering by sample name, tag, or audio format.

- **Instant Preview & Waveforms**:
  - In-line mini-waveforms for every audio file in the table.
  - **Click anywhere on any waveform** (mini or master) to immediately seek and play from that exact moment.
  - **Large Interactive Master Waveform** in the bottom floating dock with neon glow, playhead cursor, time indicators, and hover seek line.
  - **Auto-Play** mode: cycle through samples with your arrow keys to audition them instantly (essential for sample pack browsing!).
  - Format support: `WAV`, `MP3`, `FLAC`, `AIFF`, `OGG`, `M4A`, `AAC`, `OPUS`.
  - Detailed audio metadata: Sample rate (e.g. 44.1 kHz, 48 kHz), bit depth (24-bit, 16-bit), channels (Mono/Stereo), and BPM.

- **Native Drag-and-Drop to ANY Software**:
  - Each sample row has a dedicated **`⠿` Drag handle** and the entire row is draggable.
  - The bottom player features a prominent **`DRAG TO DAW`** chip.
  - Powered by Electron's native OS drag API (`startDrag`) — when you drop onto **Ableton Live**, **FL Studio**, **Logic Pro**, **Reaper**, **Premiere**, or **Finder**, the software receives the real physical audio file!

- **Keyboard Shortcuts for Speed**:
  - <kbd>Space</kbd>: Play / Pause
  - <kbd>↑</kbd> / <kbd>↓</kbd>: Previous / Next sound (with instant auto-audition)
  - <kbd>Enter</kbd>: Re-trigger current sound from start
  - <kbd>L</kbd>: Toggle seamless looping
  - <kbd>Esc</kbd>: Stop playback

---

## 🛠️ Tech Stack & TypeScript Architecture

Entirely written in **TypeScript**:
```
src/
├── types/
│   └── index.ts          # Unified TypeScript interfaces (AudioFileItem, FolderNode, Metadata, IPC)
├── main/
│   ├── main.ts           # Electron main process & OS native drag-and-drop
│   ├── preload.ts        # Type-safe contextBridge API
│   └── scanner.ts        # Directory tree generator & audio file scanner
└── renderer/
    ├── app.ts            # Main application controller & event coordinator
    ├── waveform.ts       # Web Audio API peak extractor & dual canvas waveform renderer
    ├── player.ts         # HTML5 Audio & Web Audio transport controller
    ├── tree.ts           # Expandable folder hierarchy UI
    ├── style.css         # Dark DAW workstation aesthetic
    └── index.html        # Main window markup
```

---

## 🏃 Getting Started

### 1. Build and Run
```bash
# Run build and start the app
pnpm start
# or with npm
npm start
```

### 2. Type-Checking
```bash
pnpm run typecheck
```

### 3. Production Build
```bash
pnpm run build
```

