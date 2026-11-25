import { AudioFileItem } from '../types';

export interface ParsedQuery {
  positiveTokens: string[];
  negativeTokens: string[];
  orGroups: string[][];
  extFilters: string[];
  dirFilters: string[];
  bpmConstraints: Array<{ op: '=' | '>=' | '<=' | 'range'; min: number; max: number }>;
  requireFavorite: boolean | null;
  channelFilter: number | null;
  highlightTerms: string[];
}

export interface IndexedTrackEntry {
  id: number;
  track: AudioFileItem;
  nameLower: string;
  dirLower: string;
  extLower: string;
  haystack: string;
  bpm: number | null;
}

function tokenizeQuery(raw: string): string[] {
  const tokens: string[] = [];
  const regex = /(-?"[^"]+"|\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    tokens.push(match[1]);
  }
  return tokens;
}

function stripQuotes(token: string): string {
  if (token.startsWith('"') && token.endsWith('"') && token.length >= 2) {
    return token.slice(1, -1);
  }
  return token;
}

export function parseSearchQuery(rawQuery: string): ParsedQuery {
  const parsed: ParsedQuery = {
    positiveTokens: [],
    negativeTokens: [],
    orGroups: [],
    extFilters: [],
    dirFilters: [],
    bpmConstraints: [],
    requireFavorite: null,
    channelFilter: null,
    highlightTerms: []
  };

  const trimmed = rawQuery.trim();
  if (!trimmed) return parsed;

  const tokens = tokenizeQuery(trimmed);

  for (const rawToken of tokens) {
    const isNegated = rawToken.startsWith('-') && rawToken.length > 1;
    const body = stripQuotes(isNegated ? rawToken.slice(1) : rawToken).toLowerCase().trim();
    if (!body) continue;

    if (!isNegated) {
      if (body.startsWith('ext:') || body.startsWith('format:')) {
        const val = body.split(':')[1]?.trim();
        if (val) parsed.extFilters.push(val);
        continue;
      }

      if (body.startsWith('dir:') || body.startsWith('folder:')) {
        const val = body.slice(body.indexOf(':') + 1).trim();
        if (val) parsed.dirFilters.push(val);
        continue;
      }

      if (body === 'is:fav' || body === 'fav:true' || body === 'fav:yes') {
        parsed.requireFavorite = true;
        continue;
      }

      if (body === 'ch:mono' || body === 'is:mono') {
        parsed.channelFilter = 1;
        continue;
      }

      if (body === 'ch:stereo' || body === 'is:stereo') {
        parsed.channelFilter = 2;
        continue;
      }

      const bpmRange = body.match(/^bpm:(\d+)-(\d+)$/);
      if (bpmRange) {
        parsed.bpmConstraints.push({
          op: 'range',
          min: parseInt(bpmRange[1], 10),
          max: parseInt(bpmRange[2], 10)
        });
        continue;
      }

      const bpmComp = body.match(/^bpm(>=|<=|:)(\d+)$/);
      if (bpmComp) {
        const num = parseInt(bpmComp[2], 10);
        const op = bpmComp[1] === '>=' ? '>=' : bpmComp[1] === '<=' ? '<=' : '=';
        parsed.bpmConstraints.push({ op, min: num, max: num });
        continue;
      }

      if (body.includes('|')) {
        const branches = body.split('|').map((b) => b.trim()).filter(Boolean);
        if (branches.length > 0) {
          parsed.orGroups.push(branches);
          parsed.highlightTerms.push(...branches);
        }
        continue;
      }

      parsed.positiveTokens.push(body);
      parsed.highlightTerms.push(body);
    } else {
      parsed.negativeTokens.push(body);
    }
  }

  return parsed;
}

function getTrackBpm(track: AudioFileItem): number | null {
  if (typeof track.bpm === 'number' && track.bpm > 0) {
    return Math.round(track.bpm);
  }
  const match = track.name.match(/(?:^|[_\-\s.])(\d{2,3})\s*bpm(?:$|[_\-\s.])/i);
  return match ? parseInt(match[1], 10) : null;
}

function buildHaystack(track: AudioFileItem): string {
  const parts = [track.name, track.dir, track.extension];
  if (track.bpm) parts.push(`${Math.round(track.bpm)}bpm`);
  if (track.sampleRate) parts.push(`${Math.round(track.sampleRate / 1000)}khz`);
  if (track.numberOfChannels === 1) parts.push('mono');
  if (track.numberOfChannels === 2) parts.push('stereo');
  return parts.join(' ').toLowerCase();
}

function intersectSets(a: Set<number>, b: Set<number>): Set<number> {
  const result = new Set<number>();
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const id of smaller) {
    if (larger.has(id)) {
      result.add(id);
    }
  }
  return result;
}

/**
 * In-memory HashMap-backed search index (trigram inverted map + extension/folder maps)
 * built once when a library folder is loaded for the first time.
 */
export class SearchIndex {
  private entries: IndexedTrackEntry[] = [];
  private pathToId = new Map<string, number>();
  private trigramMap = new Map<string, Set<number>>();
  private extMap = new Map<string, Set<number>>();
  private dirMap = new Map<string, Set<number>>();

  get size(): number {
    return this.entries.length;
  }

  getAllTracks(): AudioFileItem[] {
    return this.entries.map((e) => e.track);
  }

  private addTrigrams(text: string, id: number): void {
    if (text.length < 3) return;
    for (let i = 0; i <= text.length - 3; i++) {
      const tri = text.slice(i, i + 3);
      let bucket = this.trigramMap.get(tri);
      if (!bucket) {
        bucket = new Set<number>();
        this.trigramMap.set(tri, bucket);
      }
      bucket.add(id);
    }
  }

  private indexEntry(track: AudioFileItem, id: number, normalizeDir: (d: string) => string): void {
    const nameLower = track.name.toLowerCase();
    const dirLower = track.dir.toLowerCase();
    const extLower = track.extension.toLowerCase();
    const haystack = buildHaystack(track);
    const bpm = getTrackBpm(track);

    const entry: IndexedTrackEntry = {
      id,
      track,
      nameLower,
      dirLower,
      extLower,
      haystack,
      bpm
    };

    this.entries[id] = entry;
    this.pathToId.set(track.path, id);

    let extBucket = this.extMap.get(extLower);
    if (!extBucket) {
      extBucket = new Set<number>();
      this.extMap.set(extLower, extBucket);
    }
    extBucket.add(id);

    const normDir = normalizeDir(track.dir);
    let dirBucket = this.dirMap.get(normDir);
    if (!dirBucket) {
      dirBucket = new Set<number>();
      this.dirMap.set(normDir, dirBucket);
    }
    dirBucket.add(id);

    this.addTrigrams(haystack, id);
  }

  static async build(
    tracks: AudioFileItem[],
    normalizeDir: (d: string) => string,
    onProgress?: (indexed: number, total: number) => void,
    shouldCancel?: () => boolean
  ): Promise<SearchIndex | null> {
    const index = new SearchIndex();
    const total = tracks.length;
    const chunkSize = 200;

    for (let start = 0; start < total; start += chunkSize) {
      if (shouldCancel?.()) return null;

      const end = Math.min(total, start + chunkSize);
      for (let i = start; i < end; i++) {
        index.indexEntry(tracks[i], i, normalizeDir);
      }

      onProgress?.(end, total);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }

    if (total === 0) {
      onProgress?.(0, 0);
    }

    return shouldCancel?.() ? null : index;
  }

  getFolderTracks(
    folderPath: string,
    recursive: boolean,
    normalizeDir: (d: string) => string
  ): AudioFileItem[] {
    const target = normalizeDir(folderPath);
    if (!recursive) {
      const exactBucket = this.dirMap.get(target);
      if (!exactBucket) return [];
      const results: AudioFileItem[] = [];
      for (const id of exactBucket) {
        results.push(this.entries[id].track);
      }
      return results;
    }

    const results: AudioFileItem[] = [];
    for (const [dirKey, bucket] of this.dirMap.entries()) {
      if (
        dirKey === target ||
        dirKey.startsWith(target + '\\') ||
        dirKey.startsWith(target + '/')
      ) {
        for (const id of bucket) {
          results.push(this.entries[id].track);
        }
      }
    }
    return results;
  }

  refreshTrackMetadata(trackPath: string): void {
    const id = this.pathToId.get(trackPath);
    if (id === undefined) return;
    const entry = this.entries[id];
    if (!entry) return;
    entry.bpm = getTrackBpm(entry.track);
    entry.haystack = buildHaystack(entry.track);
    this.addTrigrams(entry.haystack, id);
  }

  moveTrack(
    oldPath: string,
    newPath: string,
    newDir: string,
    normalizeDir: (d: string) => string
  ): void {
    const id = this.pathToId.get(oldPath);
    if (id === undefined) return;
    const entry = this.entries[id];
    if (!entry) return;

    const oldNormDir = normalizeDir(entry.track.dir);
    const oldDirBucket = this.dirMap.get(oldNormDir);
    if (oldDirBucket) {
      oldDirBucket.delete(id);
      if (oldDirBucket.size === 0) {
        this.dirMap.delete(oldNormDir);
      }
    }

    entry.track.path = newPath;
    entry.track.dir = newDir;
    entry.dirLower = newDir.toLowerCase();
    entry.haystack = buildHaystack(entry.track);

    this.pathToId.delete(oldPath);
    this.pathToId.set(newPath, id);

    const newNormDir = normalizeDir(newDir);
    let newDirBucket = this.dirMap.get(newNormDir);
    if (!newDirBucket) {
      newDirBucket = new Set<number>();
      this.dirMap.set(newNormDir, newDirBucket);
    }
    newDirBucket.add(id);

    this.addTrigrams(entry.haystack, id);
  }

  search(
    parsed: ParsedQuery,
    favorites: Set<string>,
    formatFilter: string,
    favoritesOnly: boolean
  ): AudioFileItem[] {
    let candidateIds: Set<number> | null = null;

    // 1. Narrow by exact format chip via HashMap O(1)
    if (formatFilter !== 'ALL') {
      const extBucket = this.extMap.get(formatFilter.toLowerCase());
      if (!extBucket || extBucket.size === 0) return [];
      candidateIds = new Set(extBucket);
    }

    // 2. Narrow by trigram HashMap buckets for positive tokens >= 3 chars
    const trigramBuckets: Set<number>[] = [];
    for (const token of parsed.positiveTokens) {
      if (token.length >= 3) {
        for (let i = 0; i <= token.length - 3; i++) {
          const bucket = this.trigramMap.get(token.slice(i, i + 3));
          if (!bucket || bucket.size === 0) {
            return [];
          }
          trigramBuckets.push(bucket);
        }
      }
    }

    if (trigramBuckets.length > 0) {
      // Intersect smallest buckets first for maximum speed
      trigramBuckets.sort((a, b) => a.size - b.size);
      for (const bucket of trigramBuckets) {
        if (candidateIds === null) {
          candidateIds = new Set(bucket);
        } else {
          candidateIds = intersectSets(candidateIds, bucket);
        }
        if (candidateIds.size === 0) return [];
      }
    }

    const matched: Array<{ track: AudioFileItem; score: number }> = [];

    const checkAndPush = (entry: IndexedTrackEntry) => {
      const isFav = favorites.has(entry.track.path);
      if (favoritesOnly && !isFav) return;
      if (formatFilter !== 'ALL' && entry.track.extension !== formatFilter) return;
      if (!matchesIndexedEntry(entry, parsed, isFav)) return;
      matched.push({
        track: entry.track,
        score: scoreIndexedEntry(entry, parsed)
      });
    };

    if (candidateIds !== null) {
      for (const id of candidateIds) {
        checkAndPush(this.entries[id]);
      }
    } else {
      for (let i = 0; i < this.entries.length; i++) {
        checkAndPush(this.entries[i]);
      }
    }

    matched.sort((a, b) => b.score - a.score);
    return matched.map((m) => m.track);
  }
}

function matchesIndexedEntry(
  entry: IndexedTrackEntry,
  parsed: ParsedQuery,
  isFavorite: boolean
): boolean {
  if (parsed.requireFavorite === true && !isFavorite) {
    return false;
  }

  if (parsed.channelFilter !== null && entry.track.numberOfChannels !== parsed.channelFilter) {
    return false;
  }

  if (parsed.extFilters.length > 0) {
    if (!parsed.extFilters.some((f) => entry.extLower === f || entry.extLower.includes(f))) {
      return false;
    }
  }

  if (parsed.dirFilters.length > 0) {
    if (!parsed.dirFilters.every((f) => entry.dirLower.includes(f))) {
      return false;
    }
  }

  if (parsed.bpmConstraints.length > 0) {
    if (entry.bpm === null) return false;
    for (const c of parsed.bpmConstraints) {
      if (c.op === '=' && entry.bpm !== c.min) return false;
      if (c.op === '>=' && entry.bpm < c.min) return false;
      if (c.op === '<=' && entry.bpm > c.max) return false;
      if (c.op === 'range' && (entry.bpm < c.min || entry.bpm > c.max)) return false;
    }
  }

  for (const neg of parsed.negativeTokens) {
    if (entry.haystack.includes(neg)) {
      return false;
    }
  }

  for (const pos of parsed.positiveTokens) {
    if (!entry.haystack.includes(pos)) {
      return false;
    }
  }

  for (const group of parsed.orGroups) {
    if (!group.some((branch) => entry.haystack.includes(branch))) {
      return false;
    }
  }

  return true;
}

function scoreIndexedEntry(entry: IndexedTrackEntry, parsed: ParsedQuery): number {
  if (parsed.highlightTerms.length === 0) return 0;
  let score = 0;

  for (const term of parsed.highlightTerms) {
    if (entry.nameLower === term) score += 100;
    else if (entry.nameLower.startsWith(term)) score += 60;
    else if (entry.nameLower.includes(term)) score += 35;
    else if (entry.dirLower.includes(term)) score += 15;
    else score += 5;
  }

  return score;
}

export function matchesParsedSearch(
  track: AudioFileItem,
  parsed: ParsedQuery,
  isFavorite: boolean
): boolean {
  const entry: IndexedTrackEntry = {
    id: 0,
    track,
    nameLower: track.name.toLowerCase(),
    dirLower: track.dir.toLowerCase(),
    extLower: track.extension.toLowerCase(),
    haystack: buildHaystack(track),
    bpm: getTrackBpm(track)
  };
  return matchesIndexedEntry(entry, parsed, isFavorite);
}

export function scoreParsedSearch(track: AudioFileItem, parsed: ParsedQuery): number {
  const entry: IndexedTrackEntry = {
    id: 0,
    track,
    nameLower: track.name.toLowerCase(),
    dirLower: track.dir.toLowerCase(),
    extLower: track.extension.toLowerCase(),
    haystack: '',
    bpm: null
  };
  return scoreIndexedEntry(entry, parsed);
}
