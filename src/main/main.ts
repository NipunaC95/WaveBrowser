import { app, BrowserWindow, protocol, ipcMain, dialog, shell, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { Readable } from 'stream';
import * as mm from 'music-metadata';
import { getDirectoryTree, scanAudioFiles } from './scanner';
import { extractAudioPeaks } from './peaks';
import { AudioMetadata, ScanOptions } from '../types';

// Register custom media scheme for direct and range-capable audio streaming
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      standard: true,
      secure: true,
      bypassCSP: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

let mainWindow: BrowserWindow | null = null;

// Embedded 32x32 transparent PNG for guaranteed fail-safe drag icon
const DEFAULT_DRAG_ICON_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAA7SURBVFhH7c6xEQAgCMRAw/6r74cKWQATb+5Lq1rnTq3H+g/8CjABJjAJMIExAZMAB8AE/k2AExyAF67XAw8/Fp8VAAAAAElFTkSuQmCC';
let cachedDragIcon: Electron.NativeImage | null = null;

function getSafeDragIcon(): Electron.NativeImage {
  if (cachedDragIcon && !cachedDragIcon.isEmpty()) {
    return cachedDragIcon;
  }

  const iconPath = path.join(__dirname, '..', 'assets', 'drag-icon.png');
  if (fs.existsSync(iconPath)) {
    try {
      const img = nativeImage.createFromPath(iconPath);
      if (!img.isEmpty()) {
        cachedDragIcon = img;
        return cachedDragIcon;
      }
    } catch {
      // Fallback below
    }
  }

  cachedDragIcon = nativeImage.createFromDataURL(DEFAULT_DRAG_ICON_DATA_URL);
  return cachedDragIcon;
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.oga': 'audio/ogg',
    '.opus': 'audio/opus',
    '.aif': 'audio/aiff',
    '.aiff': 'audio/aiff',
    '.caf': 'audio/x-caf',
    '.wma': 'audio/x-ms-wma'
  };
  return mimeMap[ext] || 'audio/octet-stream';
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1260,
    height: 840,
    minWidth: 920,
    minHeight: 620,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: '#000000',
    title: 'WaveBrowse',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Advanced Range-aware protocol handler for media:// URLs
  // Enables smooth, instantaneous streaming and seeking for large and 1hr+ audio files
  protocol.handle('media', (request) => {
    try {
      const urlPath = request.url.replace(/^media:\/\/(\/)?/, '/');
      const decodedPath = decodeURIComponent(urlPath);

      if (!fs.existsSync(decodedPath)) {
        return new Response('File not found', { status: 404 });
      }

      const stat = fs.statSync(decodedPath);
      const fileSize = stat.size;
      const contentType = getMimeType(decodedPath);

      // Support HEAD request (used by media player engines for size / range discovery)
      if (request.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Content-Length': fileSize.toString(),
            'Accept-Ranges': 'bytes'
          }
        });
      }

      const rangeHeader = request.headers.get('range');
      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d+)-(\d+)?/);
        if (match) {
          const start = parseInt(match[1], 10);
          let end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
          if (end >= fileSize) end = fileSize - 1;

          if (start > end || start >= fileSize) {
            return new Response('Requested Range Not Satisfiable', {
              status: 416,
              headers: {
                'Content-Range': `bytes */${fileSize}`,
                'Accept-Ranges': 'bytes'
              }
            });
          }

          const chunkLength = end - start + 1;
          const nodeStream = fs.createReadStream(decodedPath, { start, end });
          const webStream = Readable.toWeb(nodeStream) as ReadableStream;

          return new Response(webStream, {
            status: 206,
            statusText: 'Partial Content',
            headers: {
              'Content-Type': contentType,
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunkLength.toString()
            }
          });
        }
      }

      // Stream entire file with Accept-Ranges declared
      const fullNodeStream = fs.createReadStream(decodedPath);
      const fullWebStream = Readable.toWeb(fullNodeStream) as ReadableStream;

      return new Response(fullWebStream, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': fileSize.toString(),
          'Accept-Ranges': 'bytes'
        }
      });
    } catch (err) {
      console.error('Error handling media protocol:', err);
      return new Response('Internal media error', { status: 500 });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC: Open folder picker
ipcMain.handle('dialog:chooseFolder', async (): Promise<string | null> => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Music or Sample Folder'
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// IPC: Get folder structure tree
ipcMain.handle('fs:getFolderTree', async (_event, dirPath: string) => {
  if (!dirPath || !fs.existsSync(dirPath)) return null;
  return getDirectoryTree(dirPath);
});

// IPC: Scan audio files in directory
ipcMain.handle('fs:scanAudioFiles', async (_event, options: ScanOptions) => {
  if (!options?.dirPath || !fs.existsSync(options.dirPath)) return [];
  return scanAudioFiles(options.dirPath, options.recursive ?? true);
});

// IPC: Fast peak extraction (sub-5ms for multi-hour files)
ipcMain.handle('fs:getAudioPeaks', async (_event, filePath: string, bars = 160) => {
  return extractAudioPeaks(filePath, bars);
});

// IPC: Read audio metadata with music-metadata
ipcMain.handle('fs:getMetadata', async (_event, filePath: string): Promise<AudioMetadata | null> => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const metadata = await mm.parseFile(filePath, { duration: true, skipCovers: true });
    return {
      duration: metadata.format.duration || 0,
      sampleRate: metadata.format.sampleRate || 0,
      bitsPerSample: metadata.format.bitsPerSample || null,
      numberOfChannels: metadata.format.numberOfChannels || 0,
      bitrate: metadata.format.bitrate || 0,
      codec: metadata.format.codec || '',
      bpm: metadata.common.bpm || null,
      title: metadata.common.title || null,
      artist: metadata.common.artist || null
    };
  } catch {
    return null;
  }
});

// IPC: Native drag and drop to ANY external software (DAWs, Finder, Premiere, etc.)
ipcMain.on('start-drag', (event, filePath: string) => {
  if (!filePath || !fs.existsSync(filePath)) return;
  try {
    const icon = getSafeDragIcon();
    event.sender.startDrag({
      file: filePath,
      icon
    });
  } catch (err) {
    console.error('Safe drag start error handled:', err);
  }
});

// IPC: Reveal in macOS Finder
ipcMain.handle('shell:revealInFinder', async (_event, filePath: string): Promise<boolean> => {
  if (fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return true;
  }
  return false;
});

// IPC: Open with default OS audio application
ipcMain.handle('shell:openExternal', async (_event, filePath: string): Promise<boolean> => {
  if (fs.existsSync(filePath)) {
    await shell.openPath(filePath);
    return true;
  }
  return false;
});

// IPC: Get demo samples path
ipcMain.handle('app:getDemoPath', async (): Promise<string | null> => {
  const demoPath = path.join(__dirname, '..', 'demo-samples');
  return fs.existsSync(demoPath) ? demoPath : null;
});
