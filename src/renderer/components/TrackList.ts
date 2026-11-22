import { AudioFileItem } from '../../types';
import { WaveformEngine, WaveformPeaks } from '../waveform';

export interface TrackListHandlers {
  onPlayTrack: (index: number, seekRatio?: number) => void;
  onPauseTrack: () => void;
  onSelectTrack: (index: number) => void;
  onStartDrag: (filePath: string) => void;
  onRevealFinder: (filePath: string) => void;
}

export class TrackListComponent {
  private tbody: HTMLTableSectionElement;
  private emptyState: HTMLElement;
  private waveformEngine: WaveformEngine;
  private handlers: TrackListHandlers;

  private currentTracks: AudioFileItem[] = [];
  private miniCanvases = new Map<string, { canvas: HTMLCanvasElement; peaks: WaveformPeaks; durationEl: HTMLElement }>();
  private observer: IntersectionObserver | null = null;
  private activeTrackPath: string | null = null;
  private isCurrentlyPlaying = false;

  constructor(waveformEngine: WaveformEngine, handlers: TrackListHandlers) {
    this.waveformEngine = waveformEngine;
    this.handlers = handlers;

    this.tbody = document.getElementById('trackListBody') as HTMLTableSectionElement;
    this.emptyState = document.getElementById('emptyState')!;

    this.initObserver();
  }

  private initObserver(): void {
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const trackPath = (entry.target as HTMLElement).dataset.trackPath;
            if (trackPath) {
              this.loadRealPeaksLazy(trackPath);
              this.observer?.unobserve(entry.target);
            }
          }
        }
      },
      { root: document.querySelector('.track-table-container'), rootMargin: '120px' }
    );
  }

  render(tracks: AudioFileItem[], autoPlay: boolean): void {
    this.currentTracks = tracks;
    this.tbody.innerHTML = '';
    this.miniCanvases.clear();

    if (tracks.length === 0) {
      this.emptyState.style.display = 'flex';
      return;
    }
    this.emptyState.style.display = 'none';

    const fragment = document.createDocumentFragment();

    tracks.forEach((track, index) => {
      const tr = document.createElement('tr');
      tr.className = 'track-row';
      tr.setAttribute('draggable', 'true');
      tr.dataset.index = index.toString();
      tr.dataset.trackPath = track.path;

      // Native drag-and-drop to ANY software
      tr.addEventListener('dragstart', (e) => {
        e.preventDefault();
        this.handlers.onStartDrag(track.path);
      });

      // 1. Play Button
      const tdPlay = document.createElement('td');
      tdPlay.style.textAlign = 'center';
      const btnPlay = document.createElement('button');
      btnPlay.className = 'btn-row-play';
      btnPlay.innerHTML = '▶';
      btnPlay.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.activeTrackPath === track.path && this.isCurrentlyPlaying) {
          this.handlers.onPauseTrack();
        } else {
          this.handlers.onPlayTrack(index);
        }
      });
      tdPlay.appendChild(btnPlay);
      tr.appendChild(tdPlay);

      // 2. Dedicated Drag Handle
      const tdDrag = document.createElement('td');
      tdDrag.className = 'drag-handle-cell';
      const dragHandle = document.createElement('div');
      dragHandle.className = 'drag-handle';
      dragHandle.setAttribute('draggable', 'true');
      dragHandle.title = 'Drag into DAW or any software';
      dragHandle.innerHTML = '::';
      dragHandle.addEventListener('dragstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handlers.onStartDrag(track.path);
      });
      tdDrag.appendChild(dragHandle);
      tr.appendChild(tdDrag);

      // 3. Track Title
      const tdName = document.createElement('td');
      const titleSpan = document.createElement('div');
      titleSpan.className = 'track-title';
      titleSpan.textContent = track.name;
      titleSpan.title = track.path;
      tdName.appendChild(titleSpan);
      tr.appendChild(tdName);

      // 4. Format Tag
      const tdType = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = `format-tag ${track.extension.toLowerCase()}`;
      badge.textContent = track.extension;
      tdType.appendChild(badge);
      tr.appendChild(tdType);

      // 5. Waveform Canvas (Click to Seek & Audition)
      const tdWave = document.createElement('td');
      tdWave.className = 'waveform-cell';
      const canvas = document.createElement('canvas');
      canvas.className = 'mini-waveform-canvas';
      canvas.title = 'Click anywhere on waveform to seek & play';

      canvas.addEventListener('click', (e) => {
        e.stopPropagation();
        const rect = canvas.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        this.handlers.onPlayTrack(index, ratio);
      });
      tdWave.appendChild(canvas);
      tr.appendChild(tdWave);

      // 6. Duration
      const tdDur = document.createElement('td');
      tdDur.textContent = track.duration ? this.formatTime(track.duration) : '--:--';
      tdDur.className = 'duration-cell';
      tr.appendChild(tdDur);

      // 7. Size
      const tdSize = document.createElement('td');
      tdSize.textContent = track.sizeFormatted;
      tdSize.style.color = 'var(--text-dim)';
      tr.appendChild(tdSize);

      // 8. Actions (Finder)
      const tdActions = document.createElement('td');
      tdActions.style.textAlign = 'center';
      const btnFinder = document.createElement('button');
      btnFinder.className = 'btn-action-icon';
      btnFinder.title = 'Reveal in Finder';
      btnFinder.innerHTML = '↗';
      btnFinder.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handlers.onRevealFinder(track.path);
      });
      tdActions.appendChild(btnFinder);
      tr.appendChild(tdActions);

      // Row Selection
      tr.addEventListener('click', () => {
        if (autoPlay) {
          this.handlers.onPlayTrack(index);
        } else {
          this.handlers.onSelectTrack(index);
        }
      });

      fragment.appendChild(tr);

      // Instant 0ms pseudo waveform preview
      const instantPeaks = this.waveformEngine.generateInstantPeaks(track.name, track.sizeBytes, 50);
      this.waveformEngine.drawMiniWaveform(canvas, instantPeaks.peaks, 0, false);
      this.miniCanvases.set(track.path, { canvas, peaks: instantPeaks, durationEl: tdDur });

      // Observe for real peak decode on view
      this.observer?.observe(tr);
    });

    this.tbody.appendChild(fragment);

    if (this.activeTrackPath) {
      this.setPlaybackState(this.activeTrackPath, this.isCurrentlyPlaying);
    }
  }

  private async loadRealPeaksLazy(trackPath: string): Promise<void> {
    const entry = this.miniCanvases.get(trackPath);
    if (!entry) return;

    const mediaUrl = window.api.toMediaUrl(trackPath);
    try {
      const realPeaks = await this.waveformEngine.getPeaks(mediaUrl, 50, false);
      entry.peaks = realPeaks;

      const track = this.currentTracks.find((t) => t.path === trackPath);
      if (track && realPeaks.duration > 0 && !track.duration) {
        track.duration = realPeaks.duration;
        entry.durationEl.textContent = this.formatTime(realPeaks.duration);
      }

      const isThisActive = this.activeTrackPath === trackPath;
      this.waveformEngine.drawMiniWaveform(entry.canvas, realPeaks.peaks, 0, isThisActive && this.isCurrentlyPlaying);
    } catch {
      // Keep instant preview
    }
  }

  setPlaybackState(activePath: string | null, isPlaying: boolean): void {
    this.activeTrackPath = activePath;
    this.isCurrentlyPlaying = isPlaying;

    const rows = this.tbody.querySelectorAll('.track-row');
    rows.forEach((row, i) => {
      const track = this.currentTracks[i];
      const isThis = activePath && track && track.path === activePath;
      row.classList.toggle('playing', !!(isThis && isPlaying));

      const playBtn = row.querySelector('.btn-row-play');
      if (playBtn) {
        playBtn.innerHTML = isThis && isPlaying ? '⏸' : '▶';
      }
    });
  }

  updateProgress(activePath: string, ratio: number, isPlaying: boolean): void {
    const entry = this.miniCanvases.get(activePath);
    if (entry && entry.peaks) {
      this.waveformEngine.drawMiniWaveform(entry.canvas, entry.peaks.peaks, ratio, isPlaying);
    }
  }

  highlightRow(index: number): void {
    const rows = this.tbody.querySelectorAll('.track-row');
    rows.forEach((r, i) => {
      r.classList.toggle('selected', i === index);
    });
  }

  private formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds) || seconds <= 0) return '--:--';
    const totalSecs = Math.floor(seconds);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    const tenths = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`;
  }
}

