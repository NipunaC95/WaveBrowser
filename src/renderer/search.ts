import { AudioFileItem } from '../types';

interface ParsedQuery {
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

function getSearchableHaystack(track: AudioFileItem): string {
  const parts = [
    track.name,
    track.dir,
    track.extension
  ];
  if (track.bpm) parts.push(`${Math.round(track.bpm)}bpm`);
  if (track.sampleRate) parts.push(`${Math.round(track.sampleRate / 1000)}khz`);
  if (track.numberOfChannels === 1) parts.push('mono');
  if (track.numberOfChannels === 2) parts.push('stereo');
  return parts.join(' ').toLowerCase();
}

export function matchesParsedSearch(
  track: AudioFileItem,
  parsed: ParsedQuery,
  isFavorite: boolean
): boolean {
  if (parsed.requireFavorite === true && !isFavorite) {
    return false;
  }

  if (parsed.channelFilter !== null && track.numberOfChannels !== parsed.channelFilter) {
    return false;
  }

  if (parsed.extFilters.length > 0) {
    const ext = track.extension.toLowerCase();
    if (!parsed.extFilters.some((f) => ext === f || ext.includes(f))) {
      return false;
    }
  }

  if (parsed.dirFilters.length > 0) {
    const dir = track.dir.toLowerCase();
    if (!parsed.dirFilters.every((f) => dir.includes(f))) {
      return false;
    }
  }

  if (parsed.bpmConstraints.length > 0) {
    const bpm = getTrackBpm(track);
    if (bpm === null) return false;
    for (const c of parsed.bpmConstraints) {
      if (c.op === '=' && bpm !== c.min) return false;
      if (c.op === '>=' && bpm < c.min) return false;
      if (c.op === '<=' && bpm > c.max) return false;
      if (c.op === 'range' && (bpm < c.min || bpm > c.max)) return false;
    }
  }

  const haystack = getSearchableHaystack(track);

  for (const neg of parsed.negativeTokens) {
    if (haystack.includes(neg)) {
      return false;
    }
  }

  for (const pos of parsed.positiveTokens) {
    if (!haystack.includes(pos)) {
      return false;
    }
  }

  for (const group of parsed.orGroups) {
    if (!group.some((branch) => haystack.includes(branch))) {
      return false;
    }
  }

  return true;
}

export function scoreParsedSearch(track: AudioFileItem, parsed: ParsedQuery): number {
  if (parsed.highlightTerms.length === 0) return 0;
  const nameLower = track.name.toLowerCase();
  const dirLower = track.dir.toLowerCase();
  let score = 0;

  for (const term of parsed.highlightTerms) {
    if (nameLower === term) score += 100;
    else if (nameLower.startsWith(term)) score += 60;
    else if (nameLower.includes(term)) score += 35;
    else if (dirLower.includes(term)) score += 15;
    else score += 5;
  }

  return score;
}
