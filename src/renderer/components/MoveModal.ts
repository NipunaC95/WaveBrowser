import { AudioFileItem, FolderNode } from '../../types';
import { ICONS } from '../icons';

interface FlatFolderItem {
  path: string;
  name: string;
  relativePath: string;
  depth: number;
  audioCount: number;
}

export class MoveModalComponent {
  private backdrop: HTMLElement;
  private titleEl: HTMLElement;
  private sourcePathEl: HTMLElement;
  private searchInput: HTMLInputElement;
  private listEl: HTMLElement;
  private newFolderInput: HTMLInputElement;
  private btnCreateFolder: HTMLButtonElement;
  private errorEl: HTMLElement;
  private btnClose: HTMLButtonElement;
  private btnCancel: HTMLButtonElement;
  private btnConfirm: HTMLButtonElement;

  private activeTrack: AudioFileItem | null = null;
  private rootFolder: string | null = null;
  private allFolders: FlatFolderItem[] = [];
  private filteredFolders: FlatFolderItem[] = [];
  private selectedTargetPath: string | null = null;
  private isBusy = false;

  private onConfirmMove: (track: AudioFileItem, targetDir: string) => Promise<{ ok: boolean; error?: string }>;
  private onCreateSubfolder: (parentDir: string, folderName: string) => Promise<{ ok: boolean; path?: string; error?: string }>;

  constructor(
    onConfirmMove: (track: AudioFileItem, targetDir: string) => Promise<{ ok: boolean; error?: string }>,
    onCreateSubfolder: (parentDir: string, folderName: string) => Promise<{ ok: boolean; path?: string; error?: string }>
  ) {
    this.onConfirmMove = onConfirmMove;
    this.onCreateSubfolder = onCreateSubfolder;

    this.backdrop = document.getElementById('moveModalBackdrop')!;
    this.titleEl = document.getElementById('moveModalTrackName')!;
    this.sourcePathEl = document.getElementById('moveModalSourceDir')!;
    this.searchInput = document.getElementById('moveFolderSearch') as HTMLInputElement;
    this.listEl = document.getElementById('moveFolderList')!;
    this.newFolderInput = document.getElementById('moveNewFolderInput') as HTMLInputElement;
    this.btnCreateFolder = document.getElementById('btnCreateSubfolder') as HTMLButtonElement;
    this.errorEl = document.getElementById('moveModalError')!;
    this.btnClose = document.getElementById('btnCloseMoveModal') as HTMLButtonElement;
    this.btnCancel = document.getElementById('btnCancelMoveModal') as HTMLButtonElement;
    this.btnConfirm = document.getElementById('btnConfirmMoveModal') as HTMLButtonElement;

    this.bindEvents();
  }

  isOpen(): boolean {
    return !this.backdrop.hidden;
  }

  open(track: AudioFileItem, rootTree: FolderNode | null, rootFolder: string | null): void {
    this.activeTrack = track;
    this.rootFolder = rootFolder;
    this.allFolders = this.flattenTree(rootTree, rootFolder);
    this.selectedTargetPath = null;
    this.errorEl.textContent = '';
    this.errorEl.hidden = true;
    this.searchInput.value = '';
    this.newFolderInput.value = '';

    this.titleEl.textContent = track.name;
    this.sourcePathEl.textContent = `Current: ${this.formatRelative(track.dir, rootFolder)}`;

    this.applyFolderFilter();
    this.backdrop.hidden = false;
    setTimeout(() => this.searchInput.focus(), 0);
  }

  updateTree(rootTree: FolderNode | null, rootFolder: string | null): void {
    this.rootFolder = rootFolder;
    this.allFolders = this.flattenTree(rootTree, rootFolder);
    this.applyFolderFilter();
  }

  close(): void {
    this.backdrop.hidden = true;
    this.activeTrack = null;
    this.isBusy = false;
  }

  private flattenTree(node: FolderNode | null, rootFolder: string | null, depth = 0): FlatFolderItem[] {
    if (!node) return [];
    const items: FlatFolderItem[] = [
      {
        path: node.path,
        name: node.name,
        relativePath: this.formatRelative(node.path, rootFolder),
        depth,
        audioCount: node.audioCount
      }
    ];
    for (const child of node.children) {
      items.push(...this.flattenTree(child, rootFolder, depth + 1));
    }
    return items;
  }

  private formatRelative(dirPath: string, rootFolder: string | null): string {
    if (!rootFolder) return dirPath;
    const cleanDir = dirPath.replace(/[\\/]+$/, '');
    const cleanRoot = rootFolder.replace(/[\\/]+$/, '');
    const isWin = window.api.platform === 'win32';
    const cmpDir = isWin ? cleanDir.toLowerCase() : cleanDir;
    const cmpRoot = isWin ? cleanRoot.toLowerCase() : cleanRoot;
    if (cmpDir === cmpRoot) return `${cleanRoot.split(/[/\\]/).pop() || cleanRoot} (Root)`;
    if (cmpDir.startsWith(cmpRoot + '\\') || cmpDir.startsWith(cmpRoot + '/')) {
      return cleanDir.slice(cleanRoot.length + 1);
    }
    return dirPath;
  }

  private isSameDir(a: string, b: string): boolean {
    const ca = a.replace(/[\\/]+$/, '');
    const cb = b.replace(/[\\/]+$/, '');
    return window.api.platform === 'win32' ? ca.toLowerCase() === cb.toLowerCase() : ca === cb;
  }

  private applyFolderFilter(): void {
    const query = this.searchInput.value.trim().toLowerCase();
    this.filteredFolders = query
      ? this.allFolders.filter((f) => f.relativePath.toLowerCase().includes(query) || f.name.toLowerCase().includes(query))
      : this.allFolders;

    if (!this.selectedTargetPath || !this.filteredFolders.some((f) => f.path === this.selectedTargetPath)) {
      const firstValid = this.filteredFolders.find(
        (f) => !this.activeTrack || !this.isSameDir(f.path, this.activeTrack.dir)
      );
      this.selectedTargetPath = firstValid ? firstValid.path : null;
    }

    this.renderList();
  }

  private renderList(): void {
    this.listEl.innerHTML = '';

    if (this.filteredFolders.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'move-folder-empty';
      empty.textContent = 'No matching folders';
      this.listEl.appendChild(empty);
      this.btnConfirm.disabled = true;
      return;
    }

    for (const folder of this.filteredFolders) {
      const isCurrent = !!(this.activeTrack && this.isSameDir(folder.path, this.activeTrack.dir));
      const isSelected = this.selectedTargetPath === folder.path;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `move-folder-item${isSelected ? ' selected' : ''}${isCurrent ? ' current' : ''}`;
      btn.style.paddingLeft = `${12 + (this.searchInput.value.trim() ? 0 : folder.depth * 16)}px`;
      btn.disabled = isCurrent;
      btn.dataset.folderPath = folder.path;

      const icon = document.createElement('span');
      icon.className = 'move-folder-icon';
      icon.innerHTML = ICONS.folder;

      const label = document.createElement('span');
      label.className = 'move-folder-label';
      label.textContent = this.searchInput.value.trim() ? folder.relativePath : folder.name;
      label.title = folder.path;

      const meta = document.createElement('span');
      meta.className = 'move-folder-meta';
      meta.textContent = isCurrent ? 'CURRENT' : `${folder.audioCount}`;

      btn.appendChild(icon);
      btn.appendChild(label);
      btn.appendChild(meta);

      btn.addEventListener('click', () => {
        if (isCurrent) return;
        this.selectedTargetPath = folder.path;
        this.renderList();
      });

      btn.addEventListener('dblclick', () => {
        if (!isCurrent) {
          this.selectedTargetPath = folder.path;
          this.confirmSelection();
        }
      });

      this.listEl.appendChild(btn);
    }

    this.btnConfirm.disabled = !this.selectedTargetPath || this.isBusy;
  }

  private async confirmSelection(): Promise<void> {
    if (!this.activeTrack || !this.selectedTargetPath || this.isBusy) return;
    this.isBusy = true;
    this.btnConfirm.disabled = true;
    this.errorEl.hidden = true;

    const result = await this.onConfirmMove(this.activeTrack, this.selectedTargetPath);
    this.isBusy = false;

    if (result.ok) {
      this.close();
    } else {
      this.errorEl.textContent = result.error || 'Failed to move file.';
      this.errorEl.hidden = false;
      this.btnConfirm.disabled = false;
    }
  }

  private async handleCreateSubfolder(): Promise<void> {
    const name = this.newFolderInput.value.trim();
    if (!name || this.isBusy) return;
    const parentDir = this.selectedTargetPath || this.rootFolder;
    if (!parentDir) return;

    this.isBusy = true;
    this.errorEl.hidden = true;
    const res = await this.onCreateSubfolder(parentDir, name);
    this.isBusy = false;

    if (res.ok && res.path) {
      this.newFolderInput.value = '';
      this.selectedTargetPath = res.path;
      this.searchInput.value = '';
      this.applyFolderFilter();
    } else {
      this.errorEl.textContent = res.error || 'Failed to create folder.';
      this.errorEl.hidden = false;
    }
  }

  private bindEvents(): void {
    this.btnClose.addEventListener('click', () => this.close());
    this.btnCancel.addEventListener('click', () => this.close());
    this.btnConfirm.addEventListener('click', () => this.confirmSelection());

    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) {
        this.close();
      }
    });

    this.searchInput.addEventListener('input', () => this.applyFolderFilter());
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.confirmSelection();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const selectable = this.filteredFolders.filter(
          (f) => !this.activeTrack || !this.isSameDir(f.path, this.activeTrack.dir)
        );
        if (selectable.length === 0) return;
        const curIdx = selectable.findIndex((f) => f.path === this.selectedTargetPath);
        const nextIdx = e.key === 'ArrowDown'
          ? (curIdx + 1) % selectable.length
          : (curIdx - 1 + selectable.length) % selectable.length;
        this.selectedTargetPath = selectable[nextIdx].path;
        this.renderList();
      }
    });

    this.btnCreateFolder.addEventListener('click', () => this.handleCreateSubfolder());
    this.newFolderInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleCreateSubfolder();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
  }
}
