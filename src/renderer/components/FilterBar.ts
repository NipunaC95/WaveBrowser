export interface FilterState {
  searchQuery: string;
  formatFilter: string;
  favoritesOnly: boolean;
  autoPlay: boolean;
  autoNext: boolean;
  recursive: boolean;
}

export class FilterBarComponent {
  private searchInput: HTMLInputElement;
  private btnClearSearch: HTMLButtonElement;
  private chkAutoPlay: HTMLInputElement;
  private chkAutoNext: HTMLInputElement;
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
    autoNext: true,
    recursive: true
  };

  private onChangeCallback: (state: FilterState) => void;

  constructor(onChange: (state: FilterState) => void) {
    this.onChangeCallback = onChange;

    this.searchInput = document.getElementById('searchInput') as HTMLInputElement;
    this.btnClearSearch = document.getElementById('btnClearSearch') as HTMLButtonElement;
    this.chkAutoPlay = document.getElementById('chkAutoPlay') as HTMLInputElement;
    this.chkAutoNext = document.getElementById('chkAutoNext') as HTMLInputElement;
    this.chkRecursive = document.getElementById('chkRecursive') as HTMLInputElement;
    this.fileCountBadge = document.getElementById('fileCountBadge')!;
    this.btnFilterFavorites = document.getElementById('btnFilterFavorites') as HTMLButtonElement;
    this.favCountBadge = document.getElementById('favCountBadge')!;
    this.formatChips = document.querySelectorAll('.format-chips .chip') as NodeListOf<HTMLButtonElement>;

    const savedAutoNext = localStorage.getItem('wavebrowser_auto_next') ?? localStorage.getItem('wavebrowse_auto_next');
    if (savedAutoNext !== null) {
      this.state.autoNext = savedAutoNext === 'true';
      this.chkAutoNext.checked = this.state.autoNext;
    }

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

  focusSearch(): void {
    this.searchInput.focus();
    this.searchInput.select();
  }

  clearSearch(silent = false): void {
    if (!this.searchInput.value && !this.state.searchQuery) return;
    this.searchInput.value = '';
    this.btnClearSearch.hidden = true;
    this.state.searchQuery = '';
    if (!silent) {
      this.onChangeCallback(this.state);
    }
  }

  private bindEvents(): void {
    let debounceTimer: number;
    this.searchInput.addEventListener('input', () => {
      const rawVal = this.searchInput.value;
      this.btnClearSearch.hidden = rawVal.length === 0;
      clearTimeout(debounceTimer);
      const trimmed = rawVal.trim();
      if (trimmed.length === 0) {
        this.state.searchQuery = '';
        this.onChangeCallback(this.state);
        return;
      }
      debounceTimer = window.setTimeout(() => {
        this.state.searchQuery = trimmed;
        this.onChangeCallback(this.state);
      }, 100);
    });

    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.searchInput.value.length > 0) {
          e.preventDefault();
          this.clearSearch();
        } else {
          this.searchInput.blur();
        }
      }
    });

    this.btnClearSearch.addEventListener('click', () => {
      this.clearSearch();
      this.searchInput.focus();
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

    this.chkAutoNext.addEventListener('change', () => {
      this.state.autoNext = this.chkAutoNext.checked;
      localStorage.setItem('wavebrowser_auto_next', String(this.state.autoNext));
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

