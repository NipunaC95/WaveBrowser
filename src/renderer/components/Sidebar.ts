import { FolderNode } from '../../types';
import { FolderTreeUI } from '../tree';

export class SidebarComponent {
  private treeContainer: HTMLElement;
  private btnOpenFolder: HTMLButtonElement;
  private folderDropZone: HTMLElement;
  private folderTreeUI: FolderTreeUI;

  constructor(
    onSelectFolder: (path: string) => void,
    onChooseFolderClick: () => void,
    onDropFolder: (path: string) => void,
    onDropFilesToFolder?: (filePaths: string[], targetFolderPath: string) => void
  ) {
    this.treeContainer = document.getElementById('treeContainer')!;
    this.btnOpenFolder = document.getElementById('btnOpenFolder') as HTMLButtonElement;
    this.folderDropZone = document.getElementById('folderDropZone')!;

    this.folderTreeUI = new FolderTreeUI(this.treeContainer, onSelectFolder, onDropFilesToFolder);

    this.btnOpenFolder.addEventListener('click', onChooseFolderClick);
    this.initDropZone(onDropFolder);
  }

  setTree(rootNode: FolderNode | null, selectedPath: string): void {
    this.folderTreeUI.setRoot(rootNode, selectedPath);
  }

  private initDropZone(onDropFolder: (path: string) => void): void {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.folderDropZone.classList.add('dragover');
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.folderDropZone.classList.remove('dragover');
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.folderDropZone.classList.remove('dragover');

      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        const physicalPath = window.api.getPathForFile(file);
        if (physicalPath) {
          onDropFolder(physicalPath);
        }
      }
    };

    this.folderDropZone.addEventListener('dragover', handleDragOver);
    this.folderDropZone.addEventListener('dragleave', handleDragLeave);
    this.folderDropZone.addEventListener('drop', handleDrop);
  }
}

