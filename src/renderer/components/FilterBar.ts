export interface FilterState {
  searchQuery: string;
  formatFilter: string;
  autoPlay: boolean;
  recursive: boolean;
}

export class FilterBarComponent {
  private searchInput: HTMLInputElement;
  private chkAutoPlay: HTMLInputElement;
  private chkRecursive: HTMLInputElement;
  private fileCountBadge: HTMLElement;
  private formatChips: NodeListOf<HTMLButtonElement>;

  private state: FilterState = {
    searchQuery: '',
    formatFilter: 'ALL',
    autoPlay: true,
    recursive: false
  };

  private onChangeCallback: (state: FilterState) => void;

  constructor(onChange: (state: FilterState) => void) {
    this.onChangeCallback = onChange;

    this.searchInput = document.getElementById('searchInput') as HTMLInputElement;
    this.chkAutoPlay = document.getElementById('chkAutoPlay') as HTMLInputElement;
    this.chkRecursive = document.getElementById('chkRecursive') as HTMLInputElement;
    this.fileCountBadge = document.getElementById('fileCountBadge')!;
    this.formatChips = document.querySelectorAll('.format-chips .chip') as NodeListOf<HTMLButtonElement>;

    this.bindEvents();
  }

  getState(): FilterState {
    return { ...this.state };
  }

  setFileCount(count: number): void {
    this.fileCountBadge.textContent = `${count} files`;
  }

  private bindEvents(): void {
    let debounceTimer: number;
    this.searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        this.state.searchQuery = this.searchInput.value.trim().toLowerCase();
        this.onChangeCallback(this.state);
      }, 60);
    });

    this.chkAutoPlay.addEventListener('change', () => {
      this.state.autoPlay = this.chkAutoPlay.checked;
      this.onChangeCallback(this.state);
    });

    this.chkRecursive.addEventListener('change', () => {
      this.state.recursive = this.chkRecursive.checked;
      this.onChangeCallback(this.state);
    });

    this.formatChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        this.formatChips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        this.state.formatFilter = chip.getAttribute('data-format') || 'ALL';
        this.onChangeCallback(this.state);
      });
    });
  }
}

