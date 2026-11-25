import { AudioFileItem } from '../types';

export type PlaybackStateChangeCallback = (isPlaying: boolean, track: AudioFileItem | null) => void;
export type TimeUpdateCallback = (currentTime: number, duration: number, progressRatio: number) => void;

export class AudioPlayer {
  private audio: HTMLAudioElement;
  private currentTrack: AudioFileItem | null = null;
  private isLooping = false;
  private playbackRate = 1.0;
  private animFrameId: number | null = null;
  private pendingStartRatio = 0;

  public onPlayStateChange: PlaybackStateChangeCallback | null = null;
  public onTimeUpdate: TimeUpdateCallback | null = null;
  public onEnded: (() => void) | null = null;

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';

    this.audio.addEventListener('play', () => {
      this.startAnimLoop();
      if (this.onPlayStateChange) this.onPlayStateChange(true, this.currentTrack);
    });

    this.audio.addEventListener('pause', () => {
      this.stopAnimLoop();
      if (this.onPlayStateChange) this.onPlayStateChange(false, this.currentTrack);
    });

    this.audio.addEventListener('ended', () => {
      this.stopAnimLoop();
      this.dispatchCurrentTime();
      if (!this.isLooping) {
        if (this.onPlayStateChange) this.onPlayStateChange(false, this.currentTrack);
        if (this.onEnded) this.onEnded();
      }
    });

    this.audio.addEventListener('loadedmetadata', () => {
      const dur = this.getDuration();
      if (this.pendingStartRatio > 0 && dur > 0) {
        this.audio.currentTime = Math.max(0, Math.min(dur, this.pendingStartRatio * dur));
        this.pendingStartRatio = 0;
      }
      this.dispatchCurrentTime();
    });

    this.audio.addEventListener('canplay', () => {
      const dur = this.getDuration();
      if (this.pendingStartRatio > 0 && dur > 0) {
        this.audio.currentTime = Math.max(0, Math.min(dur, this.pendingStartRatio * dur));
        this.pendingStartRatio = 0;
      }
      this.dispatchCurrentTime();
    });

    this.audio.addEventListener('seeked', () => {
      this.dispatchCurrentTime();
    });

    this.audio.addEventListener('error', () => {
      console.warn('HTML5 Audio playback notice:', this.audio.error);
    });
  }

  // 60-120 FPS render loop for liquid smooth playhead animation
  private startAnimLoop(): void {
    this.stopAnimLoop();
    const tick = () => {
      if (!this.audio.paused && !this.audio.ended) {
        this.dispatchCurrentTime();
        this.animFrameId = requestAnimationFrame(tick);
      }
    };
    this.animFrameId = requestAnimationFrame(tick);
  }

  private stopAnimLoop(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private dispatchCurrentTime(): void {
    const cur = this.audio.currentTime || 0;
    const dur = this.getDuration();
    const ratio = dur > 0 ? Math.max(0, Math.min(1, cur / dur)) : 0;
    if (this.onTimeUpdate) {
      this.onTimeUpdate(cur, dur, ratio);
    }
  }

  getCurrentTrack(): AudioFileItem | null {
    return this.currentTrack;
  }

  isPlaying(): boolean {
    return !this.audio.paused && !this.audio.ended && this.audio.currentTime > 0;
  }

  getDuration(): number {
    const rawDur = this.audio.duration;
    if (isFinite(rawDur) && rawDur > 0) {
      return rawDur;
    }
    return this.currentTrack?.duration || 0;
  }

  getCurrentTime(): number {
    return this.audio.currentTime || 0;
  }

  async playTrack(track: AudioFileItem, startRatio = 0): Promise<void> {
    const isSameTrack = this.currentTrack?.path === track.path;
    this.currentTrack = track;

    if (!isSameTrack) {
      const mediaUrl = window.api.toMediaUrl(track.path);
      this.audio.src = mediaUrl;
      this.audio.load();
    }

    this.audio.playbackRate = this.playbackRate;
    this.audio.loop = this.isLooping;

    const dur = this.getDuration();
    if (startRatio > 0) {
      if (dur > 0) {
        this.audio.currentTime = Math.max(0, Math.min(dur, startRatio * dur));
        this.pendingStartRatio = 0;
      } else {
        this.pendingStartRatio = startRatio;
      }
    }

    try {
      await this.audio.play();
    } catch (err) {
      console.warn('Playback interrupted or failed:', err);
    }
  }

  togglePlay(): void {
    if (!this.currentTrack) return;
    if (this.audio.paused) {
      this.audio.play().catch(console.warn);
    } else {
      this.audio.pause();
    }
  }

  pause(): void {
    this.audio.pause();
    this.stopAnimLoop();
  }

  seek(ratio: number): void {
    const dur = this.getDuration();
    if (dur > 0) {
      this.audio.currentTime = Math.max(0, Math.min(dur, ratio * dur));
      this.dispatchCurrentTime();
    } else {
      this.pendingStartRatio = ratio;
    }
  }

  setVolume(vol: number): void {
    this.audio.volume = Math.max(0, Math.min(1, vol));
  }

  getVolume(): number {
    return this.audio.volume;
  }

  toggleLoop(): boolean {
    this.isLooping = !this.isLooping;
    this.audio.loop = this.isLooping;
    return this.isLooping;
  }

  getLoop(): boolean {
    return this.isLooping;
  }

  setPlaybackRate(rate: number): void {
    this.playbackRate = rate;
    this.audio.playbackRate = rate;
  }

  getPlaybackRate(): number {
    return this.playbackRate;
  }

  stop(): void {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.stopAnimLoop();
    this.dispatchCurrentTime();
    if (this.onPlayStateChange) this.onPlayStateChange(false, this.currentTrack);
  }
}
