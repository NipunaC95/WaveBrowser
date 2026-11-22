import { AudioFileItem, AudioMetadata } from '../types';
import { WaveformEngine } from './waveform';
import { AudioPlayer } from './player';
import { HeaderComponent } from './components/Header';
import { SidebarComponent } from './components/Sidebar';
import { FilterBarComponent, FilterState } from './components/FilterBar';
import { TrackListComponent } from './components/TrackList';
import { MasterPlayerComponent } from './components/MasterPlayer';

export class WaveBrowseApp {
  private waveformEngine: WaveformEngine;
  private player: AudioPlayer;

  // Modular UI Components
  private header: HeaderComponent;
  private sidebar: SidebarComponent;
  private filterBar: FilterBarComponent;
  private trackList: TrackListComponent;
  private masterPlayer: MasterPlayerComponent;

  // App State
  private currentRootFolder: string | null = null;
  private currentSelectedFolder: string | null = null;
  private allTracks: AudioFileItem[] = [];
  private filteredTracks: AudioFileItem[] = [];
  private currentTrackIndex = -1;

  constructor() {
    this.waveformEngine = new WaveformEngine();
    this.player = new AudioPlayer();

    // 1. Initialize Header
    this.header = new HeaderComponent(() => this.loadDemoFolder());

    // 2. Initialize Sidebar
    this.sidebar = new SidebarComponent(
        (path) => this.selectFolder(path),
        () => this.openFolderDialog(),
        (path) => this.openFolder(path)
      );

    // 3. Initialize FilterBar
    this.filterBar = new FilterBarComponent(() => this.applyFilters());

      // 4. Initialize TrackList
      this.trackList = new TrackListComponent(this.waveformEngine, {
        onPlayTrack: (index, ratio) => this.playIndex(index, ratio),
        onPauseTrack: () => this.player.pause(),
        onSelectTrack: (index) => this.selectIndex(index),
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
          onStartDrag: (filePath) => window.api.startDrag(filePath)
        });

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
          const demoPath = await window.api.getDemoPath();
          if (demoPath) {
            await this.openFolder(demoPath);
          }
        }

  async openFolder(folderPath: string): Promise<void> {
          this.currentRootFolder = folderPath;
          this.currentSelectedFolder = folderPath;
          this.header.setBreadcrumbs(folderPath);

          const tree = await window.api.getFolderTree(folderPath);
          this.sidebar.setTree(tree, folderPath);

          await this.scanTracks(folderPath);
        }

  private async selectFolder(folderPath: string): Promise<void> {
          this.currentSelectedFolder = folderPath;
          this.header.setBreadcrumbs(folderPath);
          await this.scanTracks(folderPath);
        }

  private async scanTracks(folderPath: string): Promise<void> {
          const filterState = this.filterBar.getState();
          const tracks = await window.api.scanAudioFiles({
            dirPath: folderPath,
      recursive: filterState.recursive
          });

          this.allTracks = tracks;
          this.applyFilters();
        }

  private applyFilters(): void {
          const { searchQuery, formatFilter, autoPlay } = this.filterBar.getState();
          let list = this.allTracks;

            if (formatFilter !== 'ALL') {
              list = list.filter((t) => t.extension === formatFilter);
            }

              if (searchQuery) {
                list = list.filter((t) => t.name.toLowerCase().includes(searchQuery));
              }

              this.filteredTracks = list;
              this.filterBar.setFileCount(list.length);
              this.trackList.render(list, autoPlay);
            }

  async playIndex(index: number, startRatio = 0): Promise < void> {
            if(index < 0 || index >= this.filteredTracks.length) return;
      this.currentTrackIndex = index;
      const track = this.filteredTracks[index];

      this.trackList.highlightRow(index);

      // Instant pseudo-peaks on WebGL for 0ms response
      const instant = this.waveformEngine.generateInstantPeaks(track.name, track.sizeBytes, 160);
      this.masterPlayer.setTrack(track, instant.peaks);

      // Start playback
      await this.player.playTrack(track, startRatio);

        // High-priority GPU real peaks upload
        const mediaUrl = window.api.toMediaUrl(track.path);
        this.waveformEngine.getPeaks(mediaUrl, 160, true).then((real) => {
          if (this.player.getCurrentTrack()?.path === track.path) {
            this.masterPlayer.setTrack(track, real.peaks);
          }
        });

        // Load metadata asynchronously
        window.api.getMetadata(track.path).then((meta: AudioMetadata | null) => {
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
  new WaveBrowseApp();
});
