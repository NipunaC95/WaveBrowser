import { contextBridge, ipcRenderer } from 'electron';
import { ElectronApi, ScanOptions } from '../types';

const api: ElectronApi = {
  chooseFolder: () => ipcRenderer.invoke('dialog:chooseFolder'),
  getFolderTree: (dirPath: string) => ipcRenderer.invoke('fs:getFolderTree', dirPath),
  scanAudioFiles: (options: ScanOptions) => ipcRenderer.invoke('fs:scanAudioFiles', options),
  getMetadata: (filePath: string) => ipcRenderer.invoke('fs:getMetadata', filePath),
  startDrag: (filePath: string) => ipcRenderer.send('start-drag', filePath),
  revealInFinder: (filePath: string) => ipcRenderer.invoke('shell:revealInFinder', filePath),
  openExternal: (filePath: string) => ipcRenderer.invoke('shell:openExternal', filePath),
  getDemoPath: () => ipcRenderer.invoke('app:getDemoPath'),
  toMediaUrl: (filePath: string) => {
    const cleanPath = filePath.startsWith('/') ? filePath : '/' + filePath;
    return `media://${encodeURI(cleanPath)}`;
  }
};

contextBridge.exposeInMainWorld('api', api);

