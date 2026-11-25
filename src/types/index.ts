export interface AudioFileItem {
  name: string;
  path: string;
  dir: string;
  sizeBytes: number;
  sizeFormatted: string;
  mtime: number;
  extension: string;
  duration?: number;
  sampleRate?: number;
  bitsPerSample?: number | null;
  numberOfChannels?: number;
  bpm?: number | null;
}

export interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
  audioCount: number;
}

export interface AudioMetadata {
  duration: number;
  sampleRate: number;
  bitsPerSample: number | null;
  numberOfChannels: number;
  bitrate: number;
  codec: string;
  bpm: number | null;
  title: string | null;
  artist: string | null;
}

export interface AudioPeaksData {
  peaks: number[];
  duration: number;
  sampleRate: number;
  channels: number;
}

export interface ScanOptions {
  dirPath: string;
  recursive?: boolean;
}

export interface ElectronApi {
  platform: string;
  chooseFolder(): Promise<string | null>;
  getFolderTree(dirPath: string): Promise<FolderNode | null>;
  scanAudioFiles(options: ScanOptions): Promise<AudioFileItem[]>;
  getMetadata(filePath: string): Promise<AudioMetadata | null>;
  getAudioPeaks(filePath: string, bars?: number): Promise<AudioPeaksData | null>;
  startDrag(filePath: string): void;
  revealInFinder(filePath: string): Promise<boolean>;
  openExternal(filePath: string): Promise<boolean>;
  getDemoPath(): Promise<string | null>;
  getPathForFile(file: File): string;
  toMediaUrl(filePath: string): string;
}

declare global {
  interface Window {
    api: ElectronApi;
  }
}
