import { ICONS } from '../icons';

export class HeaderComponent {
  private breadcrumbsEl: HTMLElement;
  private btnLoadDemo: HTMLButtonElement;

  constructor(onLoadDemo: () => void) {
    this.breadcrumbsEl = document.getElementById('breadcrumbs')!;
    this.btnLoadDemo = document.getElementById('btnLoadDemo') as HTMLButtonElement;

    this.btnLoadDemo.addEventListener('click', onLoadDemo);
  }

  setBreadcrumbs(path: string, globalSearchRoot?: string): void {
    this.breadcrumbsEl.textContent = '';
    const iconSpan = document.createElement('span');
    iconSpan.className = 'breadcrumb-icon';
    iconSpan.innerHTML = ICONS.folder;

    const textSpan = document.createElement('span');
    textSpan.textContent = globalSearchRoot
      ? `Global Search in ${globalSearchRoot}`
      : (path || 'No folder selected');

    this.breadcrumbsEl.appendChild(iconSpan);
    this.breadcrumbsEl.appendChild(textSpan);
  }
}
