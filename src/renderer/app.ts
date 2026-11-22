import { AudioFileItem, FolderNode, AudioMetadata } from '../types';
import { WaveformEngine, WaveformPeaks } from './waveform';
import { AudioPlayer } from './player';
import { FolderTreeUI } from './tree';

class WaveBrowseApp {
  private waveformEngine: WaveformEngine;
  private player: AudioPlayer;
  private folderTreeUI: FolderTreeUI;

  private currentRootFolder: string | null = null;
  private currentSelectedFolder: string | null = null;
  private allTracks: AudioFileItem[] = [];
  private filteredTracks: AudioFileItem[] = [];
  private currentTrackIndex = -1;

  private autoPlay = true;
  private recursive = false;
  private formatFilter = 'ALL';
  private searchQuery = '';

  private miniCanvases = new Map<string, { canvas: HTMLCanvasElement; peaks: WaveformPeaks | null; durationEl: HTMLElement }>();
  private masterPeaks: WaveformPeaks | null = null;
  private currentMasterCacheKey = '';
  private isMasterHovering = false;
  private masterHoverRatio = -1;

  private intersectionObserver: IntersectionObserver | null = null;

  // DOM Elements
  private treeContainer!: HTMLElement;
  private trackListBody!: HTMLTableSectionElement;
  private emptyState!: HTMLElement;
  private breadcrumbsEl!: HTMLElement;
  private fileCountBadge!: HTMLElement;
  private searchInput!: HTMLInputElement;
  private chkAutoPlay!: HTMLInputElement;
  private chkRecursive!: HTMLInputElement;
  private masterWaveformCanvas!: HTMLCanvasElement;
  private masterTrackTitle!: HTMLElement;
  private masterTrackMeta!: HTMLElement;
  private timeCurrentEl!: HTMLElement;
  private timeDurationEl!: HTMLElement;
  private btnPlayPause!: HTMLButtonElement;
  private btnLoop!: HTMLButtonElement;
  private btnStop!: HTMLButtonElement;
  private selectSpeed!: HTMLSelectElement;
  private volumeSlider!: HTMLInputElement;
  private masterDragChip!: HTMLElement;
  private btnOpenFolder!: HTMLButtonElement;
  private btnLoadDemo!: HTMLButtonElement;
  private folderDropZone!: HTMLElement;

  constructor() {
    this.waveformEngine = new WaveformEngine();
    this.player = new AudioPlayer();

    this.initDOMElements();
    this.folderTreeUI = new FolderTreeUI(this.treeContainer, (path) => this.onSelectFolder(path));

    this.setupIntersectionObserver();
    this.bindEvents();
    this.bindPlayerEvents();
    this.bindKeyboardShortcuts();

    this.loadInitialFolder();
  }

  private initDOMElements(): void {
    this.treeContainer = document.getElementById('treeContainer')!;
    this.trackListBody = document.getElementById('trackListBody') as HTMLTableSectionElement;
    this.emptyState = document.getElementById('emptyState')!;
    this.breadcrumbsEl = document.getElementById('breadcrumbs')!;
    this.fileCountBadge = document.getElementById('fileCountBadge')!;
    this.searchInput = document.getElementById('searchInput') as HTMLInputElement;
    this.chkAutoPlay = document.getElementById('chkAutoPlay') as HTMLInputElement;
    this.chkRecursive = document.getElementById('chkRecursive') as HTMLInputElement;
    this.masterWaveformCanvas = document.getElementById('masterWaveformCanvas') as HTMLCanvasElement;
    this.masterTrackTitle = document.getElementById('masterTrackTitle')!;
    this.masterTrackMeta = document.getElementById('masterTrackMeta')!;
    this.timeCurrentEl = document.getElementById('timeCurrent')!;
    this.timeDurationEl = document.getElementById('timeDuration')!;
    this.btnPlayPause = document.getElementById('btnPlayPause') as HTMLButtonElement;
    this.btnLoop = document.getElementById('btnLoop') as HTMLButtonElement;
    this.btnStop = document.getElementById('btnStop') as HTMLButtonElement;
    this.selectSpeed = document.getElementById('selectSpeed') as HTMLSelectElement;
    this.volumeSlider = document.getElementById('volumeSlider') as HTMLInputElement;
    this.masterDragChip = document.getElementById('masterDragChip')!;
    this.btnOpenFolder = document.getElementById('btnOpenFolder') as HTMLButtonElement;
    this.btnLoadDemo = document.getElementById('btnLoadDemo') as HTMLButtonElement;
    this.folderDropZone = document.getElementById('folderDropZone')!;
  }

  // Lazy Intersection Observer: only process waveforms when visible in viewport
  private setupIntersectionObserver(): void {
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const trackPath = (entry.target as HTMLElement).dataset.trackPath;
            if (trackPath) {
              this.loadTrackPeaksLazy(trackPath);
              this.intersectionObserver?.unobserve(entry.target);
            }
          }
        }
      },
      { root: document.querySelector('.track-table-container'), rootMargin: '100px' }
    );
  }

  private bindEvents(): void {
    // Open Folder Dialog
    this.btnOpenFolder.addEventListener('click', async () => {
      const folder = await window.api.chooseFolder();
      if (folder) {
        this.openFolder(folder);
      }
    });

    // Load Demo Button
    this.btnLoadDemo.addEventListener('click', async () => {
      const demoPath = await window.api.getDemoPath();
      if (demoPath) {
        this.openFolder(demoPath);
      }
    });

    // Search input
    let searchDebounce: number;
    this.searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = window.setTimeout(() => {
        this.searchQuery = this.searchInput.value.trim().toLowerCase();
        this.applyFilters();
      }, 80);
    });

    // Auto-play toggle
    this.chkAutoPlay.addEventListener('change', () => {
      this.autoPlay = this.chkAutoPlay.checked;
    });

    // Recursive subfolders toggle
    this.chkRecursive.addEventListener('change', () => {
      this.recursive = this.chkRecursive.checked;
      if (this.currentSelectedFolder) {
        this.scanTracks(this.currentSelectedFolder);
      }
    });

    // Format Filter chips
    const chips = document.querySelectorAll('.format-chips .chip');
    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        chips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        this.formatFilter = chip.getAttribute('data-format') || 'ALL';
        this.applyFilters();
      });
    });

    this.setupFolderDrop();

    // Master Drag Chip -> Native OS Drag to DAW
    this.masterDragChip.addEventListener('dragstart', (e) => {
      e.preventDefault();
      const currentTrack = this.player.getCurrentTrack();
      if (currentTrack) {
        window.api.startDrag(currentTrack.path);
      }
    });

    // Master Waveform Click and Seek
    this.masterWaveformCanvas.addEventListener('click', (e) => {
      const rect = this.masterWaveformCanvas.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const currentTrack = this.player.getCurrentTrack();

      if (currentTrack) {
        if (!this.player.isPlaying()) {
          this.player.playTrack(currentTrack, ratio);
        } else {
          this.player.seek(ratio);
        }
      }
    });

    // Master Waveform Hover
    this.masterWaveformCanvas.addEventListener('mousemove', (e) => {
      const rect = this.masterWaveformCanvas.getBoundingClientRect();
      this.isMasterHovering = true;
      this.masterHoverRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.redrawMasterWaveform();
    });

    this.masterWaveformCanvas.addEventListener('mouseleave', () => {
      this.isMasterHovering = false;
      this.masterHoverRatio = -1;
      this.redrawMasterWaveform();
    });

    // Transport buttons
    this.btnPlayPause.addEventListener('click', () => {
      const currentTrack = this.player.getCurrentTrack();
      if (!currentTrack && this.filteredTracks.length > 0) {
        this.playIndex(0);
      } else {
        this.player.togglePlay();
      }
    });

    this.btnLoop.addEventListener('click', () => {
      const isLoop = this.player.toggleLoop();
      this.btnLoop.classList.toggle('active', isLoop);
    });

    this.btnStop.addEventListener('click', () => {
      this.player.stop();
    });

    this.volumeSlider.addEventListener('input', () => {
      this.player.setVolume(parseFloat(this.volumeSlider.value));
    });

    this.selectSpeed.addEventListener('change', () => {
      this.player.setPlaybackRate(parseFloat(this.selectSpeed.value));
    });

    window.addEventListener('resize', () => {
      this.redrawMasterWaveform();
    });
  }

  private setupFolderDrop(): void {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.folderDropZone.classList.add('dragover');
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.folderDropZone.classList.remove('dragover');
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.folderDropZone.classList.remove('dragover');

      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        const physicalPath = (file as unknown as { path: string }).path;
        if (physicalPath) {
          this.openFolder(physicalPath);
        }
      }
    };

    this.folderDropZone.addEventListener('dragover', handleDragOver);
    this.folderDropZone.addEventListener('dragleave', handleDragLeave);
    this.folderDropZone.addEventListener('drop', handleDrop);

    document.body.addEventListener('dragover', (e) => e.preventDefault());
    document.body.addEventListener('drop', (e) => {
      if (e.target && (e.target as HTMLElement).closest('.track-table-container')) {
        return;
      }
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        const physicalPath = (file as unknown as { path: string }).path;
        if (physicalPath) {
          this.openFolder(physicalPath);
        }
      }
    });
  }

  private bindPlayerEvents(): void {
    this.player.onPlayStateChange = (isPlaying, track) => {
      this.btnPlayPause.innerHTML = isPlaying ? '⏸' : '▶';
      this.updateTrackRowStates(track, isPlaying);
      this.redrawMasterWaveform();
    };

    // Called on every animation frame (60-120 FPS)
    this.player.onTimeUpdate = (currentTime, duration, ratio) => {
      this.timeCurrentEl.textContent = this.formatTime(currentTime);
      this.timeDurationEl.textContent = this.formatTime(duration);
      this.redrawMasterWaveform();

      // Update active row mini waveform progress
      const currentTrack = this.player.getCurrentTrack();
      if (currentTrack) {
        const miniItem = this.miniCanvases.get(currentTrack.path);
        if (miniItem && miniItem.peaks) {
          this.waveformEngine.drawMiniWaveform(
            miniItem.canvas,
            miniItem.peaks.peaks,
            ratio,
            this.player.isPlaying()
          );
        }
      }
    };

    this.player.onEnded = () => {
      if (this.currentTrackIndex < this.filteredTracks.length - 1) {
        this.playIndex(this.currentTrackIndex + 1);
      }
    };
  }

  private bindKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.player.togglePlay();
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        if (this.currentTrackIndex < this.filteredTracks.length - 1) {
          this.playIndex(this.currentTrackIndex + 1);
        }
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        if (this.currentTrackIndex > 0) {
          this.playIndex(this.currentTrackIndex - 1);
        }
      } else if (e.code === 'KeyL') {
        const isLoop = this.player.toggleLoop();
        this.btnLoop.classList.toggle('active', isLoop);
      } else if (e.code === 'Escape') {
        this.player.stop();
      } else if (e.code === 'Enter') {
        const currentTrack = this.player.getCurrentTrack();
        if (currentTrack) {
          this.player.playTrack(currentTrack, 0);
        }
      }
    });
  }

  private async loadInitialFolder(): Promise<void> {
    const demoPath = await window.api.getDemoPath();
    if (demoPath) {
      this.openFolder(demoPath);
    }
  }

  async openFolder(folderPath: string): Promise<void> {
    this.currentRootFolder = folderPath;
    this.currentSelectedFolder = folderPath;
    this.breadcrumbsEl.textContent = folderPath;

    const tree = await window.api.getFolderTree(folderPath);
    this.folderTreeUI.setRoot(tree, folderPath);

    await this.scanTracks(folderPath);
  }

  private async onSelectFolder(folderPath: string): Promise<void> {
    this.currentSelectedFolder = folderPath;
    this.breadcrumbsEl.textContent = folderPath;
    await this.scanTracks(folderPath);
  }

  private async scanTracks(folderPath: string): Promise<void> {
    this.trackListBody.innerHTML = '';
    this.miniCanvases.clear();

    const tracks = await window.api.scanAudioFiles({
      dirPath: folderPath,
      recursive: this.recursive
    });

    this.allTracks = tracks;
    this.applyFilters();
  }

  private applyFilters(): void {
    let list = this.allTracks;

    if (this.formatFilter !== 'ALL') {
      list = list.filter((t) => t.extension === this.formatFilter);
    }

    if (this.searchQuery) {
      list = list.filter((t) => t.name.toLowerCase().includes(this.searchQuery));
    }

    this.filteredTracks = list;
    this.fileCountBadge.textContent = `${list.length} files`;

    this.renderTrackList();
  }

  private renderTrackList(): void {
    this.trackListBody.innerHTML = '';
    this.miniCanvases.clear();

    if (this.filteredTracks.length === 0) {
      this.emptyState.style.display = 'flex';
      return;
    }

    this.emptyState.style.display = 'none';

    // Fragment batch insertion to avoid reflow thrashing
    const fragment = document.createDocumentFragment();

    this.filteredTracks.forEach((track, index) => {
      const tr = document.createElement('tr');
      tr.className = 'track-row';
      tr.setAttribute('draggable', 'true');
      tr.dataset.index = index.toString();
      tr.dataset.trackPath = track.path;

      // Native drag-and-drop to ANY software (Ableton, FL Studio, Logic, Finder, etc.)
      tr.addEventListener('dragstart', (e) => {
        e.preventDefault();
        window.api.startDrag(track.path);
      });

      // 1. Play Button Cell
      const tdPlay = document.createElement('td');
      tdPlay.style.textAlign = 'center';
      const btnPlay = document.createElement('button');
      btnPlay.className = 'btn-row-play';
      btnPlay.innerHTML = '▶';
      btnPlay.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.currentTrackIndex === index && this.player.isPlaying()) {
          this.player.pause();
        } else {
          this.playIndex(index);
        }
      });
      tdPlay.appendChild(btnPlay);
      tr.appendChild(tdPlay);

      // 2. Dedicated Drag Handle Cell
      const tdDrag = document.createElement('td');
      tdDrag.className = 'drag-handle-cell';
      const dragHandle = document.createElement('div');
      dragHandle.className = 'drag-handle';
      dragHandle.setAttribute('draggable', 'true');
      dragHandle.title = 'Drag into DAW / any software';
      dragHandle.innerHTML = '⠿';
      dragHandle.addEventListener('dragstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.api.startDrag(track.path);
      });
      tdDrag.appendChild(dragHandle);
      tr.appendChild(tdDrag);

      // 3. Name Cell
      const tdName = document.createElement('td');
      const titleSpan = document.createElement('div');
      titleSpan.className = 'track-title';
      titleSpan.textContent = track.name;
      titleSpan.title = track.path;
      tdName.appendChild(titleSpan);
      tr.appendChild(tdName);

      // 4. Format Badge Cell
      const tdType = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = `format-tag ${track.extension.toLowerCase()}`;
      badge.textContent = track.extension;
      tdType.appendChild(badge);
      tr.appendChild(tdType);

      // 5. Waveform Canvas Cell
      const tdWave = document.createElement('td');
      tdWave.className = 'waveform-cell';
      const canvas = document.createElement('canvas');
      canvas.className = 'mini-waveform-canvas';
      canvas.title = 'Click anywhere on waveform to preview';

      canvas.addEventListener('click', (e) => {
        e.stopPropagation();
        const rect = canvas.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        this.playIndex(index, ratio);
      });

      tdWave.appendChild(canvas);
      tr.appendChild(tdWave);

      // 6. Duration Cell
      const tdDur = document.createElement('td');
      tdDur.textContent = track.duration ? this.formatTime(track.duration) : '--:--';
      tdDur.className = 'duration-cell';
      tr.appendChild(tdDur);

      // 7. Size Cell
      const tdSize = document.createElement('td');
      tdSize.textContent = track.sizeFormatted;
      tdSize.style.color = 'var(--text-dim)';
      tr.appendChild(tdSize);

      // 8. Actions Cell (Finder / Menu)
      const tdActions = document.createElement('td');
      tdActions.style.textAlign = 'center';
      const btnFinder = document.createElement('button');
      btnFinder.className = 'btn-action-icon';
      btnFinder.title = 'Reveal in Finder';
      btnFinder.innerHTML = '📂';
      btnFinder.addEventListener('click', (e) => {
        e.stopPropagation();
        window.api.revealInFinder(track.path);
      });
      tdActions.appendChild(btnFinder);
      tr.appendChild(tdActions);

      tr.addEventListener('click', () => {
        if (this.autoPlay) {
          this.playIndex(index);
        } else {
          this.selectIndex(index);
        }
      });

      fragment.appendChild(tr);

      // 0ms instant pseudo-peaks rendered immediately
      const instantPeaks = this.waveformEngine.generateInstantPeaks(track.name, track.sizeBytes, 50);
      this.waveformEngine.drawMiniWaveform(canvas, instantPeaks.peaks, 0, false);

      this.miniCanvases.set(track.path, { canvas, peaks: instantPeaks, durationEl: tdDur });

      // Observe for lazy real peak extraction when scrolled into view
      this.intersectionObserver?.observe(tr);
    });

    this.trackListBody.appendChild(fragment);

    const activeTrack = this.player.getCurrentTrack();
    if (activeTrack) {
      this.updateTrackRowStates(activeTrack, this.player.isPlaying());
    }
  }

  // Loaded on-demand when visible in viewport
  private async loadTrackPeaksLazy(trackPath: string): Promise<void> {
    const entry = this.miniCanvases.get(trackPath);
    if (!entry) return;

    const mediaUrl = window.api.toMediaUrl(trackPath);
    try {
      const realPeaks = await this.waveformEngine.getPeaks(mediaUrl, 50, false);
      entry.peaks = realPeaks;

      const track = this.filteredTracks.find((t) => t.path === trackPath);
      if (track && realPeaks.duration > 0 && !track.duration) {
        track.duration = realPeaks.duration;
        entry.durationEl.textContent = this.formatTime(realPeaks.duration);
      }

      const activeTrack = this.player.getCurrentTrack();
      const isThisPlaying = activeTrack && activeTrack.path === trackPath && this.player.isPlaying();
      const progress = isThisPlaying && realPeaks.duration > 0
        ? this.player.getCurrentTime() / realPeaks.duration
        : 0;

      this.waveformEngine.drawMiniWaveform(entry.canvas, realPeaks.peaks, progress, !!isThisPlaying);
    } catch {
      // Keep instant fallback
    }
  }

  private selectIndex(index: number): void {
    this.currentTrackIndex = index;
    const rows = this.trackListBody.querySelectorAll('.track-row');
    rows.forEach((r, i) => {
      r.classList.toggle('selected', i === index);
    });
  }

  async playIndex(index: number, startRatio = 0): Promise<void> {
    if (index < 0 || index >= this.filteredTracks.length) return;
    this.currentTrackIndex = index;
    const track = this.filteredTracks[index];

    this.selectIndex(index);
    this.updateMasterTrackInfo(track);

    // Fast high-priority load for master waveform
    const mediaUrl = window.api.toMediaUrl(track.path);
    this.currentMasterCacheKey = track.path;
    this.masterPeaks = this.waveformEngine.generateInstantPeaks(track.name, track.sizeBytes, 160);
    this.redrawMasterWaveform();

    // Start playing audio
    await this.player.playTrack(track, startRatio);

    // High priority real peaks fetch for master waveform
    this.waveformEngine.getPeaks(mediaUrl, 160, true).then((real) => {
      if (this.currentMasterCacheKey === track.path) {
        this.masterPeaks = real;
        this.redrawMasterWaveform();
      }
    });
  }

  private async updateMasterTrackInfo(track: AudioFileItem): Promise<void> {
    this.masterTrackTitle.textContent = track.name;
    this.masterTrackMeta.textContent = `${track.extension} • ${track.sizeFormatted}`;

    const meta: AudioMetadata | null = await window.api.getMetadata(track.path);
    if (meta && this.currentMasterCacheKey === track.path) {
      const parts: string[] = [track.extension];
      if (meta.bitsPerSample) parts.push(`${meta.bitsPerSample}-bit`);
      if (meta.sampleRate) parts.push(`${(meta.sampleRate / 1000).toFixed(1)} kHz`);
      if (meta.numberOfChannels) parts.push(meta.numberOfChannels === 1 ? 'Mono' : 'Stereo');
      if (meta.bpm) parts.push(`${Math.round(meta.bpm)} BPM`);
      parts.push(track.sizeFormatted);
      this.masterTrackMeta.textContent = parts.join(' • ');
    }
  }

  private redrawMasterWaveform(): void {
    if (!this.masterPeaks) return;
    const curTime = this.player.getCurrentTime();
    const duration = this.player.getDuration() || this.masterPeaks.duration || 1;
    const ratio = Math.max(0, Math.min(1, curTime / duration));

    this.waveformEngine.drawMasterWaveformFast(
      this.masterWaveformCanvas,
      this.currentMasterCacheKey,
      this.masterPeaks.peaks,
      ratio,
      this.isMasterHovering ? this.masterHoverRatio : -1
    );
  }

  private updateTrackRowStates(activeTrack: AudioFileItem | null, isPlaying: boolean): void {
    const rows = this.trackListBody.querySelectorAll('.track-row');
    rows.forEach((row, i) => {
      const track = this.filteredTracks[i];
      const isThisTrack = activeTrack && track && track.path === activeTrack.path;
      row.classList.toggle('playing', !!(isThisTrack && isPlaying));

      const playBtn = row.querySelector('.btn-row-play');
      if (playBtn) {
        playBtn.innerHTML = isThisTrack && isPlaying ? '⏸' : '▶';
      }
    });
  }

  private formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '0:00.0';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const tenths = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new WaveBrowseApp();
});
