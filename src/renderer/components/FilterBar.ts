export interface FilterState {
  searchQuery: string;
  formatFilter: string;
  favoritesOnly: boolean;
  autoPlay: boolean;
  recursive: boolean;
}

export class FilterBarComponent {
  private searchInput: HTMLInputElement;
  private chkAutoPlay: HTMLInputElement;
  private chkRecursive: HTMLInputElement;
  private fileCountBadge: HTMLElement;
  private btnFilterFavorites: HTMLButtonElement;
  private favCountBadge: HTMLElement;
  private formatChips: NodeListOf<HTMLButtonElement>;

  private state: FilterState = {
    searchQuery: '',
    formatFilter: 'ALL',
    favoritesOnly: false,
    autoPlay: true,
    recursive: true
  };

  private onChangeCallback: (state: FilterState) => void;

  constructor(onChange: (state: FilterState) => void) {
    this.onChangeCallback = onChange;

    this.searchInput = document.getElementById('searchInput') as HTMLInputElement;
    this.chkAutoPlay = document.getElementById('chkAutoPlay') as HTMLInputElement;
    this.chkRecursive = document.getElementById('chkRecursive') as HTMLInputElement;
    this.fileCountBadge = document.getElementById('fileCountBadge')!;
    this.btnFilterFavorites = document.getElementById('btnFilterFavorites') as HTMLButtonElement;
    this.favCountBadge = document.getElementById('favCountBadge')!;
    this.formatChips = document.querySelectorAll('.format-chips .chip') as NodeListOf<HTMLButtonElement>;

    this.bindEvents();
  }

  getState(): FilterState {
    return { ...this.state };
  }

  setFileCount(count: number): void {
    this.fileCountBadge.textContent = `${count} files`;
  }

  setFavoritesCount(count: number): void {
    this.favCountBadge.textContent = `${count}`;
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

    this.btnFilterFavorites.addEventListener('click', () => {
      this.state.favoritesOnly = !this.state.favoritesOnly;
      this.btnFilterFavorites.classList.toggle('active', this.state.favoritesOnly);
      this.onChangeCallback(this.state);
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

