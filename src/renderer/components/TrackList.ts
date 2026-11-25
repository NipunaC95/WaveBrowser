import { AudioFileItem } from '../../types';
import { WaveformEngine, WaveformPeaks } from '../waveform';
import { ICONS } from '../icons';

export interface TrackListHandlers {
  onPlayTrack: (index: number, seekRatio?: number) => void;
  onPauseTrack: () => void;
  onSelectTrack: (index: number) => void;
  onToggleFavorite: (filePath: string) => boolean;
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

  render(
    tracks: AudioFileItem[],
    autoPlay: boolean,
    favorites: Set<string> = new Set(),
    highlightTerms: string[] = [],
    globalRootFolder: string | null = null
  ): void {
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
      btnPlay.innerHTML = ICONS.play;
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

      // 1b. Favorite Star Button
      const tdFav = document.createElement('td');
      tdFav.style.textAlign = 'center';
      const btnFav = document.createElement('button');
      const isFav = favorites.has(track.path);
      btnFav.className = `btn-row-fav${isFav ? ' active' : ''}`;
      btnFav.title = isFav ? 'Remove from Favorites (F)' : 'Add to Favorites (F)';
      btnFav.innerHTML = isFav ? ICONS.starFilled : ICONS.star;
      btnFav.addEventListener('click', (e) => {
        e.stopPropagation();
        const nextState = this.handlers.onToggleFavorite(track.path);
        this.applyFavButtonState(btnFav, nextState);
      });
      tdFav.appendChild(btnFav);
      tr.appendChild(tdFav);

      // 2. Dedicated Drag Handle
      const tdDrag = document.createElement('td');
      tdDrag.className = 'drag-handle-cell';
      const dragHandle = document.createElement('div');
      dragHandle.className = 'drag-handle';
      dragHandle.setAttribute('draggable', 'true');
      dragHandle.title = 'Drag into DAW or any software';
      dragHandle.innerHTML = ICONS.gripVertical;
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
      this.renderHighlightedText(titleSpan, track.name, highlightTerms);
      titleSpan.title = track.path;
      tdName.appendChild(titleSpan);
      if (globalRootFolder) {
        const relDir = this.getRelativeDirLabel(track.dir, globalRootFolder);
        if (relDir) {
          const folderSub = document.createElement('div');
          folderSub.className = 'track-folder-sub';
          folderSub.textContent = relDir;
          folderSub.title = track.dir;
          tdName.appendChild(folderSub);
        }
      }
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

      // 8. Actions (Reveal in File Explorer / Finder)
      const tdActions = document.createElement('td');
      tdActions.style.textAlign = 'center';
      const btnFinder = document.createElement('button');
      btnFinder.className = 'btn-action-icon';
      btnFinder.title = window.api.platform === 'win32'
        ? 'Reveal in Explorer'
        : window.api.platform === 'darwin'
          ? 'Reveal in Finder'
          : 'Show in File Manager';
      btnFinder.innerHTML = ICONS.externalLink;
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

    try {
      const realPeaks = await this.waveformEngine.getPeaks(trackPath, 50, false);
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
        playBtn.innerHTML = isThis && isPlaying ? ICONS.pause : ICONS.play;
      }
    });
  }

  updateProgress(activePath: string, ratio: number, isPlaying: boolean): void {
    const entry = this.miniCanvases.get(activePath);
    if (entry && entry.peaks) {
      this.waveformEngine.drawMiniWaveform(entry.canvas, entry.peaks.peaks, ratio, isPlaying);
    }
  }

  setFavoriteState(filePath: string, isFavorite: boolean): void {
    const rows = this.tbody.querySelectorAll('.track-row');
    rows.forEach((row, i) => {
      const track = this.currentTracks[i];
      if (track && track.path === filePath) {
        const favBtn = row.querySelector('.btn-row-fav') as HTMLButtonElement | null;
        if (favBtn) {
          this.applyFavButtonState(favBtn, isFavorite);
        }
      }
    });
  }

  private applyFavButtonState(btn: HTMLButtonElement, isFavorite: boolean): void {
    btn.classList.toggle('active', isFavorite);
    btn.innerHTML = isFavorite ? ICONS.starFilled : ICONS.star;
    btn.title = isFavorite ? 'Remove from Favorites (F)' : 'Add to Favorites (F)';
  }

  highlightRow(index: number): void {
    const rows = this.tbody.querySelectorAll('.track-row');
    rows.forEach((r, i) => {
      r.classList.toggle('selected', i === index);
    });
  }

  private getRelativeDirLabel(trackDir: string, rootDir: string): string {
    const cleanTrack = trackDir.replace(/[\\/]+$/, '');
    const cleanRoot = rootDir.replace(/[\\/]+$/, '');
    const isWin = window.api.platform === 'win32';
    const trackCmp = isWin ? cleanTrack.toLowerCase() : cleanTrack;
    const rootCmp = isWin ? cleanRoot.toLowerCase() : cleanRoot;
    if (trackCmp === rootCmp) return '.';
    if (trackCmp.startsWith(rootCmp + '\\') || trackCmp.startsWith(rootCmp + '/')) {
      return cleanTrack.slice(cleanRoot.length + 1);
    }
    return trackDir;
  }

  private renderHighlightedText(container: HTMLElement, text: string, terms: string[]): void {
    const cleanTerms = Array.from(new Set(terms.map((t) => t.trim()).filter((t) => t.length > 0)));
    if (cleanTerms.length === 0) {
      container.textContent = text;
      return;
    }

    const escaped = cleanTerms
      .sort((a, b) => b.length - a.length)
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escaped.join('|')})`, 'ig');

    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      const mark = document.createElement('mark');
      mark.className = 'search-highlight';
      mark.textContent = match[0];
      container.appendChild(mark);
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      container.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
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

