import { AudioFileItem, AudioMetadata, FolderNode } from '../types';
import { WaveformEngine } from './waveform';
import { AudioPlayer } from './player';
import { parseSearchQuery, matchesParsedSearch, scoreParsedSearch, SearchIndex } from './search';
import { HeaderComponent } from './components/Header';
import { SidebarComponent } from './components/Sidebar';
import { FilterBarComponent, FilterState } from './components/FilterBar';
import { TrackListComponent } from './components/TrackList';
import { MasterPlayerComponent } from './components/MasterPlayer';
import { MoveModalComponent } from './components/MoveModal';

export class WaveBrowserApp {
  private waveformEngine: WaveformEngine;
  private player: AudioPlayer;

  // Modular UI Components
  private header: HeaderComponent;
  private sidebar: SidebarComponent;
  private filterBar: FilterBarComponent;
  private trackList: TrackListComponent;
  private masterPlayer: MasterPlayerComponent;
  private moveModal: MoveModalComponent;
  private toastTimer: number | null = null;

  // App State
  private currentRootFolder: string | null = null;
  private currentRootTree: FolderNode | null = null;
  private currentSelectedFolder: string | null = null;
  private libraryTracks: AudioFileItem[] = [];
  private libraryIndexCache = new Map<string, SearchIndex>();
  private currentSearchIndex: SearchIndex | null = null;
  private activeLoadToken = 0;
  private allTracks: AudioFileItem[] = [];
  private filteredTracks: AudioFileItem[] = [];
  private currentTrackIndex = -1;
  private favorites = new Set<string>();

  constructor() {
    document.documentElement.classList.add(`platform-${window.api.platform}`);
    this.loadFavorites();
    this.waveformEngine = new WaveformEngine();
    this.player = new AudioPlayer();

    // 1. Initialize Header
    this.header = new HeaderComponent(() => this.loadDemoFolder());

    // 2. Initialize Sidebar
    this.sidebar = new SidebarComponent(
        (path) => this.selectFolder(path),
        () => this.openFolderDialog(),
        (path) => this.openFolder(path),
        (filePaths, targetDir) => this.handleDropFilesToFolder(filePaths, targetDir)
      );

    // 3. Initialize FilterBar
    this.filterBar = new FilterBarComponent(() => this.applyFilters());

      // 4. Initialize TrackList
      this.trackList = new TrackListComponent(this.waveformEngine, {
        onPlayTrack: (index, ratio) => this.playIndex(index, ratio),
        onPauseTrack: () => this.player.pause(),
        onSelectTrack: (index) => this.selectIndex(index),
        onToggleFavorite: (filePath) => this.toggleFavorite(filePath),
        onMoveTrack: (track) => this.openMoveModal(track),
        onStartDrag: (filePath) => window.api.startDrag(filePath),
        onRevealFinder: (filePath) => window.api.revealInFinder(filePath)
      });

        // 5. Initialize MasterPlayer with WebGL Waveform
        this.masterPlayer = new MasterPlayerComponent({
          onTogglePlay: () => this.togglePlay(),
          onToggleLoop: () => this.player.toggleLoop(),
          onStop: () => this.player.stop(),
          onSeek: (ratio) => this.seek(ratio),
          onVolumeChange: (vol) => this.player.setVolume(vol),
          onSpeedChange: (speed) => this.player.setPlaybackRate(speed),
          onToggleFavorite: (filePath) => this.toggleFavorite(filePath),
          onStartDrag: (filePath) => window.api.startDrag(filePath)
        });

        // 6. Initialize MoveModal
        this.moveModal = new MoveModalComponent(
          (track, targetDir) => this.handleMoveFile(track.path, targetDir),
          (parentDir, folderName) => this.handleCreateSubfolder(parentDir, folderName)
        );

        this.bindPlayerEvents();
        this.bindKeyboardShortcuts();
        this.loadInitialFolder();
      }

        private async openFolderDialog(): Promise<void> {
          const folder = await window.api.chooseFolder();
          if (folder) {
            await this.openFolder(folder);
          }
        }

  private async loadDemoFolder(): Promise<void> {
          const demoPath = await window.api.getDemoPath();
          if (demoPath) {
            await this.openFolder(demoPath);
          }
        }

  private async loadInitialFolder(): Promise<void> {
    const lastDir = localStorage.getItem('wavebrowser_last_directory') || localStorage.getItem('wavebrowse_last_directory');
    if (lastDir) {
      try {
        const tree = await window.api.getFolderTree(lastDir);
        if (tree) {
          await this.openFolder(lastDir);
          return;
        }
      } catch {
        // Fallback to demo
      }
    }
    const demoPath = await window.api.getDemoPath();
    if (demoPath) {
      await this.openFolder(demoPath);
    }
  }

  async openFolder(folderPath: string): Promise<void> {
    const loadToken = ++this.activeLoadToken;
    this.currentRootFolder = folderPath;
    this.currentSelectedFolder = folderPath;
    this.filterBar.clearSearch(true);
    this.header.setBreadcrumbs(folderPath);
    localStorage.setItem('wavebrowser_last_directory', folderPath);

    const normRoot = this.normalizeDir(folderPath);
    const cachedIndex = this.libraryIndexCache.get(normRoot);

    if (cachedIndex) {
      this.currentSearchIndex = cachedIndex;
      this.libraryTracks = cachedIndex.getAllTracks();
      const tree = await window.api.getFolderTree(folderPath);
      if (loadToken !== this.activeLoadToken) return;
      this.currentRootTree = tree;
      this.sidebar.setTree(tree, folderPath);
      this.allTracks = this.getFolderTracks(folderPath);
      this.applyFilters();
      return;
    }

    // First time loading this folder: show Indexing loading animation while scanning + building HashMap index
    const startedAt = performance.now();
    this.trackList.setIndexingState(true, 'Scanning audio directory...', 0.15);

    try {
      const [tree, scannedTracks] = await Promise.all([
        window.api.getFolderTree(folderPath),
        window.api.scanAudioFiles({
          dirPath: folderPath,
          recursive: true
        })
      ]);

      if (loadToken !== this.activeLoadToken) return;

      this.currentRootTree = tree;
      this.sidebar.setTree(tree, folderPath);
      this.libraryTracks = scannedTracks;

      this.trackList.setIndexingState(
        true,
        `Indexing 0 / ${scannedTracks.length} assets...`,
        0.3
      );

      const builtIndex = await SearchIndex.build(
        scannedTracks,
        (d) => this.normalizeDir(d),
        (indexed, total) => {
          if (loadToken !== this.activeLoadToken) return;
          const ratio = total > 0 ? 0.3 + (indexed / total) * 0.7 : 1;
          this.trackList.setIndexingState(
            true,
            `Indexing ${indexed} / ${total} assets...`,
            ratio
          );
        },
        () => loadToken !== this.activeLoadToken
      );

      if (!builtIndex || loadToken !== this.activeLoadToken) return;

      // Ensure the indexing animation is cleanly visible even on small folders
      const elapsed = performance.now() - startedAt;
      if (elapsed < 260) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 260 - elapsed));
      }
      if (loadToken !== this.activeLoadToken) return;

      this.libraryIndexCache.set(normRoot, builtIndex);
      this.currentSearchIndex = builtIndex;
    } finally {
      if (loadToken === this.activeLoadToken) {
        this.trackList.setIndexingState(false);
      }
    }

    this.allTracks = this.getFolderTracks(folderPath);
    this.applyFilters();
  }

  private async selectFolder(folderPath: string): Promise<void> {
    this.currentSelectedFolder = folderPath;
    this.filterBar.clearSearch(true);
    this.header.setBreadcrumbs(folderPath);
    this.allTracks = this.getFolderTracks(folderPath);
    this.applyFilters();
  }

  private normalizeDir(dir: string): string {
    const stripped = dir.replace(/[\\/]+$/, '');
    return window.api.platform === 'win32' ? stripped.toLowerCase() : stripped;
  }

  private getFolderTracks(folderPath: string): AudioFileItem[] {
    const recursive = this.filterBar.getState().recursive !== false;
    if (this.currentSearchIndex) {
      return this.currentSearchIndex.getFolderTracks(
        folderPath,
        recursive,
        (d) => this.normalizeDir(d)
      );
    }
    const target = this.normalizeDir(folderPath);
    return this.libraryTracks.filter((track) => {
      const trackDir = this.normalizeDir(track.dir);
      if (trackDir === target) return true;
      if (!recursive) return false;
      return trackDir.startsWith(target + '\\') || trackDir.startsWith(target + '/');
    });
  }

  private loadFavorites(): void {
    try {
      const raw = localStorage.getItem('wavebrowser_favorites') ?? localStorage.getItem('wavebrowse_favorites');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.favorites = new Set(parsed.filter((item): item is string => typeof item === 'string'));
        }
      }
    } catch {
      this.favorites = new Set();
    }
  }

  private saveFavorites(): void {
    try {
      localStorage.setItem('wavebrowser_favorites', JSON.stringify(Array.from(this.favorites)));
    } catch {
      // Ignore storage quota errors
    }
  }

  private toggleFavorite(filePath: string): boolean {
    const isNowFavorite = !this.favorites.has(filePath);
    if (isNowFavorite) {
      this.favorites.add(filePath);
    } else {
      this.favorites.delete(filePath);
    }
    this.saveFavorites();
    this.updateFavoritesCount();

    if (this.player.getCurrentTrack()?.path === filePath) {
      this.masterPlayer.setFavoriteState(isNowFavorite);
    }

    if (this.filterBar.getState().favoritesOnly) {
      this.applyFilters();
    } else {
      this.trackList.setFavoriteState(filePath, isNowFavorite);
    }

    return isNowFavorite;
  }

  private updateFavoritesCount(scopeTracks: AudioFileItem[] = this.allTracks): void {
    const count = scopeTracks.filter((t) => this.favorites.has(t.path)).length;
    this.filterBar.setFavoritesCount(count);
  }

  private applyFilters(): void {
          const { searchQuery, formatFilter, favoritesOnly, autoPlay } = this.filterBar.getState();
          const isGlobalSearch = searchQuery.length > 0;
          if (!isGlobalSearch && this.currentSelectedFolder) {
            this.allTracks = this.getFolderTracks(this.currentSelectedFolder);
          }

          const baseScope = isGlobalSearch ? this.libraryTracks : this.allTracks;
          let list = baseScope;
          let highlightTerms: string[] = [];

          this.header.setBreadcrumbs(
            this.currentSelectedFolder || '',
            isGlobalSearch ? (this.currentRootFolder || 'Library') : undefined
          );

            if (isGlobalSearch) {
              const parsed = parseSearchQuery(searchQuery);
              highlightTerms = parsed.highlightTerms;
              if (this.currentSearchIndex) {
                list = this.currentSearchIndex.search(parsed, this.favorites, formatFilter, favoritesOnly);
              } else {
                if (favoritesOnly) {
                  list = list.filter((t) => this.favorites.has(t.path));
                }
                if (formatFilter !== 'ALL') {
                  list = list.filter((t) => t.extension === formatFilter);
                }
                list = list
                  .filter((t) => matchesParsedSearch(t, parsed, this.favorites.has(t.path)))
                  .sort((a, b) => scoreParsedSearch(b, parsed) - scoreParsedSearch(a, parsed));
              }
            } else {
              if (favoritesOnly) {
                list = list.filter((t) => this.favorites.has(t.path));
              }

              if (formatFilter !== 'ALL') {
                list = list.filter((t) => t.extension === formatFilter);
              }
            }

              this.filteredTracks = list;
              const playingPath = this.player.getCurrentTrack()?.path;
              this.currentTrackIndex = playingPath
                ? list.findIndex((t) => t.path === playingPath)
                : -1;
              this.updateFavoritesCount(baseScope);
              this.filterBar.setFileCount(list.length);
              this.trackList.render(
                list,
                autoPlay,
                this.favorites,
                highlightTerms,
                isGlobalSearch ? this.currentRootFolder : null
              );
              if (this.currentTrackIndex >= 0) {
                this.trackList.highlightRow(this.currentTrackIndex);
              }
            }

  async playIndex(index: number, startRatio = 0): Promise < void> {
            if(index < 0 || index >= this.filteredTracks.length) return;
      this.currentTrackIndex = index;
      const track = this.filteredTracks[index];

      this.trackList.highlightRow(index);

      // Instant pseudo-peaks on WebGL for 0ms response
      const instant = this.waveformEngine.generateInstantPeaks(track.name, track.sizeBytes, 160);
      this.masterPlayer.setTrack(track, instant.peaks, this.favorites.has(track.path));

      // Start playback
      await this.player.playTrack(track, startRatio);

      // High-priority GPU real peaks upload
      this.waveformEngine.getPeaks(track.path, 160, true).then((real) => {
        if (real.duration > 0 && !track.duration) {
          track.duration = real.duration;
        }
        if (this.player.getCurrentTrack()?.path === track.path) {
          this.masterPlayer.setTrack(track, real.peaks, this.favorites.has(track.path));
        }
      });

      // Load metadata asynchronously
      window.api.getMetadata(track.path).then((meta: AudioMetadata | null) => {
        if (meta) {
          if (meta.duration > 0 && !track.duration) track.duration = meta.duration;
          if (meta.sampleRate > 0) track.sampleRate = meta.sampleRate;
          if (meta.bitsPerSample) track.bitsPerSample = meta.bitsPerSample;
          if (meta.numberOfChannels) track.numberOfChannels = meta.numberOfChannels;
          if (meta.bpm) track.bpm = meta.bpm;
          this.currentSearchIndex?.refreshTrackMetadata(track.path);
        }
        if (this.player.getCurrentTrack()?.path === track.path) {
          this.masterPlayer.updateMetadata(meta);
        }
      });
  }

  private selectIndex(index: number): void {
    this.currentTrackIndex = index;
    this.trackList.highlightRow(index);
  }

  private togglePlay(): void {
    const cur = this.player.getCurrentTrack();
    if (!cur && this.filteredTracks.length > 0) {
      this.playIndex(0);
    } else {
      this.player.togglePlay();
    }
  }

  private seek(ratio: number): void {
  const cur = this.player.getCurrentTrack();
  if(cur) {
    if (!this.player.isPlaying()) {
      this.player.playTrack(cur, ratio);
    } else {
      this.player.seek(ratio);
    }
    }
  }

  private bindPlayerEvents(): void {
    this.player.onPlayStateChange = (isPlaying, track) => {
      this.masterPlayer.setPlayState(isPlaying);
      this.trackList.setPlaybackState(track?.path || null, isPlaying);
    };

    // Buttery-smooth 60-120 FPS playhead updates
    this.player.onTimeUpdate = (currentTime, duration, ratio) => {
    this.masterPlayer.updateTime(currentTime, duration, ratio);

    const cur = this.player.getCurrentTrack();
    if (cur) {
      this.trackList.updateProgress(cur.path, ratio, this.player.isPlaying());
    }
  };

  this.player.onEnded = () => {
    if (!this.filterBar.getState().autoNext) {
      return;
    }
    if (this.currentTrackIndex < this.filteredTracks.length - 1) {
      this.playIndex(this.currentTrackIndex + 1);
    }
  };
}

  private openMoveModal(track: AudioFileItem): void {
    this.moveModal.open(track, this.currentRootTree, this.currentRootFolder);
  }

  private async handleCreateSubfolder(
    parentDir: string,
    folderName: string
  ): Promise<{ ok: boolean; path?: string; error?: string }> {
    const res = await window.api.createFolder(parentDir, folderName, this.currentRootFolder || undefined);
    if (res.ok && this.currentRootFolder) {
      const tree = await window.api.getFolderTree(this.currentRootFolder);
      this.currentRootTree = tree;
      this.sidebar.setTree(tree, this.currentSelectedFolder || this.currentRootFolder);
      this.moveModal.updateTree(tree, this.currentRootFolder);
    }
    return res;
  }

  private async handleDropFilesToFolder(filePaths: string[], targetDir: string): Promise<void> {
    let movedCount = 0;
    let lastError: string | undefined;

    for (const filePath of filePaths) {
      const res = await this.handleMoveFile(filePath, targetDir, true);
      if (res.ok) {
        movedCount++;
      } else {
        lastError = res.error;
      }
    }

    if (movedCount > 0) {
      const folderName = targetDir.split(/[/\\]/).pop() || targetDir;
      this.showToast(`Moved ${movedCount} ${movedCount === 1 ? 'file' : 'files'} → ${folderName}`);
    } else if (lastError) {
      this.showToast(lastError, true);
    }
  }

  private async handleMoveFile(
    sourcePath: string,
    targetDir: string,
    suppressToast = false
  ): Promise<{ ok: boolean; error?: string }> {
    const releaseState = this.player.releaseIfMatching(sourcePath);

    const res = await window.api.moveFile(
      sourcePath,
      targetDir,
      this.currentRootFolder || undefined
    );

    if (!res.ok || !res.newPath || !res.newDir) {
      if (releaseState.wasActive) {
        const originalTrack = this.libraryTracks.find((t) => t.path === sourcePath);
        if (originalTrack) {
          this.player.updateMovedTrack(originalTrack, releaseState.currentTime, false);
        }
      }
      if (!suppressToast && res.error) {
        this.showToast(res.error, true);
      }
      return { ok: false, error: res.error || 'Move failed.' };
    }

    const newPath = res.newPath;
    const newDir = res.newDir;

    const track = this.libraryTracks.find((t) => t.path === sourcePath);
    if (track) {
      track.path = newPath;
      track.dir = newDir;
    }

    this.currentSearchIndex?.moveTrack(sourcePath, newPath, newDir, (d) => this.normalizeDir(d));

    if (this.favorites.has(sourcePath)) {
      this.favorites.delete(sourcePath);
      this.favorites.add(newPath);
      this.saveFavorites();
    }

    this.waveformEngine.renameCachedPath(sourcePath, newPath);

    if (releaseState.wasActive && track) {
      this.player.updateMovedTrack(track, releaseState.currentTime, releaseState.wasPlaying);
    }

    if (this.currentRootFolder) {
      const tree = await window.api.getFolderTree(this.currentRootFolder);
      this.currentRootTree = tree;
      this.sidebar.setTree(tree, this.currentSelectedFolder || this.currentRootFolder);
    }

    this.applyFilters();

    if (!suppressToast) {
      const fileName = newPath.split(/[/\\]/).pop() || newPath;
      const folderName = newDir.split(/[/\\]/).pop() || newDir;
      this.showToast(`Moved ${fileName} → ${folderName}`);
    }

    return { ok: true };
  }

  private showToast(message: string, isError = false): void {
    const toast = document.getElementById('appToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    toast.classList.add('visible');

    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => {
      toast.classList.remove('visible');
      this.toastTimer = null;
    }, 2600);
  }

  private bindKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      if (this.moveModal.isOpen()) return;

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyF') {
        e.preventDefault();
        this.filterBar.focusSearch();
        return;
      }

      if (e.target instanceof HTMLInputElement) return;

      if (e.key === '/') {
        e.preventDefault();
        this.filterBar.focusSearch();
        return;
      }

        if (e.code === 'Space') {
          e.preventDefault();
          this.togglePlay();
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
        } else if (e.code === 'KeyF') {
          const targetTrack = this.player.getCurrentTrack() || this.filteredTracks[this.currentTrackIndex];
          if (targetTrack) {
            this.toggleFavorite(targetTrack.path);
          }
        } else if (e.code === 'KeyM') {
          const targetTrack = this.player.getCurrentTrack() || this.filteredTracks[this.currentTrackIndex];
          if (targetTrack) {
            this.openMoveModal(targetTrack);
          }
        } else if (e.code === 'KeyL') {
          this.player.toggleLoop();
        } else if (e.code === 'Escape') {
          this.player.stop();
        } else if (e.code === 'Enter') {
          const cur = this.player.getCurrentTrack();
          if (cur) {
            this.player.playTrack(cur, 0);
          }
        }
      });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new WaveBrowserApp();
});
