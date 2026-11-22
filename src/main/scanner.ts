import * as fs from 'fs';
import * as path from 'path';
import { AudioFileItem, FolderNode } from '../types';

export const AUDIO_EXTENSIONS = new Set([
  '.wav', '.mp3', '.aif', '.aiff', '.flac', '.ogg', '.m4a', '.aac', '.opus', '.wma', '.caf'
]);

export function isAudioFile(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return AUDIO_EXTENSIONS.has(ext);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function getDirectoryTree(dirPath: string, maxDepth = 4, currentDepth = 0): FolderNode | null {
  try {
    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) return null;

    const name = path.basename(dirPath) || dirPath;
    const node: FolderNode = {
      name,
      path: dirPath,
      children: [],
      audioCount: 0
    };

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue; // skip hidden files
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (currentDepth < maxDepth) {
          const childNode = getDirectoryTree(fullPath, maxDepth, currentDepth + 1);
          if (childNode) {
            node.children.push(childNode);
            node.audioCount += childNode.audioCount;
          }
        }
      } else if (entry.isFile() && isAudioFile(entry.name)) {
        node.audioCount++;
      }
    }

    return node;
  } catch (err) {
    console.error('Error reading dir tree:', dirPath, err);
    return null;
  }
}

export function scanAudioFiles(dirPath: string, recursive = true, maxFiles = 10000): AudioFileItem[] {
  const results: AudioFileItem[] = [];

  function walk(currentDir: string): void {
    if (results.length >= maxFiles) return;

    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= maxFiles) break;
        if (entry.name.startsWith('.')) continue;

        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory() && recursive) {
          walk(fullPath);
        } else if (entry.isFile() && isAudioFile(entry.name)) {
          try {
            const stats = fs.statSync(fullPath);
            const ext = path.extname(entry.name).toLowerCase().replace('.', '');
            results.push({
              name: entry.name,
              path: fullPath,
              dir: currentDir,
              sizeBytes: stats.size,
              sizeFormatted: formatBytes(stats.size),
              mtime: stats.mtimeMs,
              extension: ext.toUpperCase()
            });
          } catch {
            // Ignore unreadable file
          }
        }
      }
    } catch (err) {
      console.error('Error scanning folder:', currentDir, err);
    }
  }

  walk(dirPath);
  return results;
}

