import { FolderNode } from '../types';
import { ICONS } from './icons';

export class FolderTreeUI {
  private container: HTMLElement;
  private onSelectFolder: (folderPath: string) => void;
  private selectedPath: string | null = null;
  private expandedPaths = new Set<string>();

  constructor(container: HTMLElement, onSelectFolder: (folderPath: string) => void) {
    this.container = container;
    this.onSelectFolder = onSelectFolder;
  }

  render(rootNode: FolderNode | null, currentSelectedPath: string): void {
    this.selectedPath = currentSelectedPath;
    this.container.innerHTML = '';

    if (!rootNode) {
      this.container.innerHTML = `
        <div class="empty-tree-state">
          <p>No folder selected</p>
        </div>
      `;
      return;
    }

    // Auto-expand root
    this.expandedPaths.add(rootNode.path);

    const treeList = document.createElement('ul');
    treeList.className = 'tree-root-list';
    treeList.appendChild(this.createTreeNode(rootNode, 0));
    this.container.appendChild(treeList);
  }

  private createTreeNode(node: FolderNode, depth: number): HTMLElement {
    const li = document.createElement('li');
    li.className = 'tree-item';
    li.style.paddingLeft = `${depth * 14}px`;

    const row = document.createElement('div');
    row.className = 'tree-row';
    if (this.selectedPath === node.path) {
      row.classList.add('selected');
    }

    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = this.expandedPaths.has(node.path);

    // Expand arrow (Lucide Chevron)
    const arrow = document.createElement('span');
    arrow.className = `tree-arrow ${hasChildren ? (isExpanded ? 'expanded' : 'collapsed') : 'leaf'}`;
    arrow.innerHTML = hasChildren ? (isExpanded ? ICONS.chevronDown : ICONS.chevronRight) : '';
    arrow.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!hasChildren) return;
      if (this.expandedPaths.has(node.path)) {
        this.expandedPaths.delete(node.path);
      } else {
        this.expandedPaths.add(node.path);
      }
      this.renderCurrent();
    });
    row.appendChild(arrow);

    // Folder icon (Lucide Folder)
    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.innerHTML = isExpanded ? ICONS.folderOpen : ICONS.folder;
    row.appendChild(icon);

    // Folder name
    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = node.name;
    label.title = node.path;
    row.appendChild(label);

    // Audio file count badge
    if (node.audioCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'tree-badge';
      badge.textContent = `${node.audioCount}`;
      row.appendChild(badge);
    }

    // Click row -> select folder
    row.addEventListener('click', () => {
      this.selectedPath = node.path;
      this.highlightSelectedRow(row);
      this.onSelectFolder(node.path);
    });

    li.appendChild(row);

    // Render children if expanded
    if (hasChildren && isExpanded) {
      const childUl = document.createElement('ul');
      childUl.className = 'tree-children';
      for (const child of node.children) {
        childUl.appendChild(this.createTreeNode(child, depth + 1));
      }
      li.appendChild(childUl);
    }

    return li;
  }

  private highlightSelectedRow(targetRow: HTMLElement): void {
    const prev = this.container.querySelectorAll('.tree-row.selected');
    prev.forEach((el) => el.classList.remove('selected'));
    targetRow.classList.add('selected');
  }

  private currentRoot: FolderNode | null = null;
  setRoot(root: FolderNode | null, selectedPath: string): void {
    this.currentRoot = root;
    this.render(root, selectedPath);
  }

  private renderCurrent(): void {
    if (this.currentRoot && this.selectedPath) {
      this.render(this.currentRoot, this.selectedPath);
    }
  }
}

