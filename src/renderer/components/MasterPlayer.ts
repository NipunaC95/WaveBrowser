import { AudioFileItem, AudioMetadata } from '../../types';
import { WebGLWaveformRenderer } from './WebGLWaveform';

export interface MasterPlayerHandlers {
  onTogglePlay: () => void;
  onToggleLoop: () => boolean;
  onStop: () => void;
  onSeek: (ratio: number) => void;
  onVolumeChange: (vol: number) => void;
  onSpeedChange: (speed: number) => void;
  onStartDrag: (filePath: string) => void;
}

export class MasterPlayerComponent {
  private webglRenderer: WebGLWaveformRenderer;
  private canvas: HTMLCanvasElement;
  private handlers: MasterPlayerHandlers;

  private titleEl: HTMLElement;
  private metaEl: HTMLElement;
  private timeCurrentEl: HTMLElement;
  private timeDurationEl: HTMLElement;
  private btnPlayPause: HTMLButtonElement;
  private btnLoop: HTMLButtonElement;
  private btnStop: HTMLButtonElement;
  private selectSpeed: HTMLSelectElement;
  private volumeSlider: HTMLInputElement;
  private masterDragChip: HTMLElement;

  private currentTrack: AudioFileItem | null = null;
  private isHovering = false;
  private hoverRatio = -1;
  private lastProgress = 0;
  private isPlaying = false;

  constructor(handlers: MasterPlayerHandlers) {
    this.handlers = handlers;

    this.canvas = document.getElementById('masterWaveformCanvas') as HTMLCanvasElement;
    this.webglRenderer = new WebGLWaveformRenderer(this.canvas);

    this.titleEl = document.getElementById('masterTrackTitle')!;
    this.metaEl = document.getElementById('masterTrackMeta')!;
    this.timeCurrentEl = document.getElementById('timeCurrent')!;
    this.timeDurationEl = document.getElementById('timeDuration')!;
    this.btnPlayPause = document.getElementById('btnPlayPause') as HTMLButtonElement;
    this.btnLoop = document.getElementById('btnLoop') as HTMLButtonElement;
    this.btnStop = document.getElementById('btnStop') as HTMLButtonElement;
    this.selectSpeed = document.getElementById('selectSpeed') as HTMLSelectElement;
    this.volumeSlider = document.getElementById('volumeSlider') as HTMLInputElement;
    this.masterDragChip = document.getElementById('masterDragChip')!;

    this.bindEvents();
  }

  setTrack(track: AudioFileItem, peaks: Float32Array): void {
    this.currentTrack = track;
    this.titleEl.textContent = track.name;
    this.metaEl.textContent = `${track.extension} • ${track.sizeFormatted}`;

    // Upload peaks to GPU texture
    this.webglRenderer.setPeaks(peaks);
    this.renderWaveform(0);
  }

  updateMetadata(meta: AudioMetadata | null): void {
    if (!this.currentTrack) return;
    if (meta) {
      const parts: string[] = [this.currentTrack.extension];
      if (meta.bitsPerSample) parts.push(`${meta.bitsPerSample}-bit`);
      if (meta.sampleRate) parts.push(`${(meta.sampleRate / 1000).toFixed(1)} kHz`);
      if (meta.numberOfChannels) parts.push(meta.numberOfChannels === 1 ? 'Mono' : 'Stereo');
      if (meta.bpm) parts.push(`${Math.round(meta.bpm)} BPM`);
      parts.push(this.currentTrack.sizeFormatted);
      this.metaEl.textContent = parts.join(' • ');
    }
  }

  setPlayState(isPlaying: boolean): void {
    this.isPlaying = isPlaying;
    this.btnPlayPause.innerHTML = isPlaying ? '⏸' : '▶';
    this.renderWaveform(this.lastProgress);
  }

  updateTime(currentSec: number, totalSec: number, ratio: number): void {
    this.lastProgress = ratio;
    this.timeCurrentEl.textContent = this.formatTime(currentSec);
    this.timeDurationEl.textContent = this.formatTime(totalSec);
    this.renderWaveform(ratio);
  }

  private renderWaveform(progress: number): void {
    this.webglRenderer.render(progress, this.isHovering ? this.hoverRatio : -1, this.isPlaying);
  }

  private bindEvents(): void {
    // Waveform click to seek
    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.handlers.onSeek(ratio);
    });

    // Waveform hover guideline
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.isHovering = true;
      this.hoverRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.renderWaveform(this.lastProgress);
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.isHovering = false;
      this.hoverRatio = -1;
      this.renderWaveform(this.lastProgress);
    });

    // Native Drag to DAW
    this.masterDragChip.addEventListener('dragstart', (e) => {
      e.preventDefault();
      if (this.currentTrack) {
        this.handlers.onStartDrag(this.currentTrack.path);
      }
    });

    // Transport buttons
    this.btnPlayPause.addEventListener('click', () => this.handlers.onTogglePlay());

    this.btnLoop.addEventListener('click', () => {
      const isLoop = this.handlers.onToggleLoop();
      this.btnLoop.classList.toggle('active', isLoop);
    });

    this.btnStop.addEventListener('click', () => this.handlers.onStop());

    this.volumeSlider.addEventListener('input', () => {
      this.handlers.onVolumeChange(parseFloat(this.volumeSlider.value));
    });

    this.selectSpeed.addEventListener('change', () => {
      this.handlers.onSpeedChange(parseFloat(this.selectSpeed.value));
    });

    window.addEventListener('resize', () => {
      this.webglRenderer.updateViewport();
      this.renderWaveform(this.lastProgress);
    });
  }

  private formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds) || seconds < 0) return '0:00.0';
    const totalSecs = Math.floor(seconds);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const tenths = Math.floor((seconds % 1) * 10);

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${tenths}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`;
  }
}

