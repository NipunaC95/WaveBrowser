import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { ElectronApi, ScanOptions } from '../types';

const api: ElectronApi = {
  platform: process.platform,
  chooseFolder: () => ipcRenderer.invoke('dialog:chooseFolder'),
  getFolderTree: (dirPath: string) => ipcRenderer.invoke('fs:getFolderTree', dirPath),
  scanAudioFiles: (options: ScanOptions) => ipcRenderer.invoke('fs:scanAudioFiles', options),
  getMetadata: (filePath: string) => ipcRenderer.invoke('fs:getMetadata', filePath),
  getAudioPeaks: (filePath: string, bars = 160) => ipcRenderer.invoke('fs:getAudioPeaks', filePath, bars),
  startDrag: (filePath: string) => ipcRenderer.send('start-drag', filePath),
  revealInFinder: (filePath: string) => ipcRenderer.invoke('shell:revealInFinder', filePath),
  openExternal: (filePath: string) => ipcRenderer.invoke('shell:openExternal', filePath),
  getDemoPath: () => ipcRenderer.invoke('app:getDemoPath'),
  getPathForFile: (file: File) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return (file as unknown as { path?: string }).path || '';
    }
  },
  toMediaUrl: (filePath: string) => {
    const fileName = filePath.split(/[/\\]/).pop() || 'audio';
    return `media://local/${encodeURIComponent(fileName)}?path=${encodeURIComponent(filePath)}`;
  }
};

contextBridge.exposeInMainWorld('api', api);
