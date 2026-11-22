import { app, BrowserWindow, protocol, net, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import * as mm from 'music-metadata';
import { getDirectoryTree, scanAudioFiles } from './scanner';
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

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 920,
    minHeight: 620,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: '#0c0e14',
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
  // Protocol handler for media:// URLs
  protocol.handle('media', (request) => {
    try {
      const urlPath = request.url.replace(/^media:\/\/(\/)?/, '/');
      const decodedPath = decodeURIComponent(urlPath);
      return net.fetch(pathToFileURL(decodedPath).toString());
    } catch (err) {
      console.error('Error handling media protocol:', err);
      return new Response('Not found', { status: 404 });
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
  return scanAudioFiles(options.dirPath, options.recursive ?? false);
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
  const iconPath = path.join(__dirname, '..', 'assets', 'drag-icon.png');
  event.sender.startDrag({
    file: filePath,
    icon: fs.existsSync(iconPath) ? iconPath : ''
  });
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

