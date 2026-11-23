import { ICONS } from '../icons';

export class HeaderComponent {
  private breadcrumbsEl: HTMLElement;
  private btnLoadDemo: HTMLButtonElement;

  constructor(onLoadDemo: () => void) {
    this.breadcrumbsEl = document.getElementById('breadcrumbs')!;
    this.btnLoadDemo = document.getElementById('btnLoadDemo') as HTMLButtonElement;

    this.btnLoadDemo.addEventListener('click', onLoadDemo);
  }

  setBreadcrumbs(path: string): void {
    this.breadcrumbsEl.innerHTML = `<span class="breadcrumb-icon">${ICONS.folder}</span><span>${path || 'No folder selected'}</span>`;
  }
}
