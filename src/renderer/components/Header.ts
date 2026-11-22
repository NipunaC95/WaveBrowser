export class HeaderComponent {
  private breadcrumbsEl: HTMLElement;
  private btnLoadDemo: HTMLButtonElement;

  constructor(onLoadDemo: () => void) {
    this.breadcrumbsEl = document.getElementById('breadcrumbs')!;
    this.btnLoadDemo = document.getElementById('btnLoadDemo') as HTMLButtonElement;

    this.btnLoadDemo.addEventListener('click', onLoadDemo);
  }

  setBreadcrumbs(path: string): void {
    this.breadcrumbsEl.textContent = path || 'No folder selected';
  }
}

