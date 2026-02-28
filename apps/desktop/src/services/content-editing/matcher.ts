import { registerRangeCandidates } from "./snapshot-store";
import type { ContentSnapshot, RangeCandidate } from "./types";

type MatchMode = "exact" | "normalized" | "fuzzy";

interface FindRangesOptions {
  queryText: string;
  matchMode?: MatchMode;
  occurrence?: number;
  beforeHint?: string;
  afterHint?: string;
  maxCandidates?: number;
}

interface RawRange {
  start: number;
  end: number;
  confidence: number;
}

const collapseWhitespace = (text: string) =>
  text.replace(/\s+/g, " ").trim().toLowerCase();

const normalizeWithMap = (text: string) => {
  const chars: string[] = [];
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      pendingSpace = chars.length > 0;
      continue;
    }
    if (pendingSpace) {
      chars.push(" ");
      map.push(i);
      pendingSpace = false;
    }
    chars.push(ch.toLowerCase());
    map.push(i);
  }
  return {
    normalized: chars.join(""),
    map,
  };
};

const findAllIndexes = (text: string, query: string): number[] => {
  const result: number[] = [];
  if (!query) return result;
  let from = 0;
  while (from <= text.length) {
    const index = text.indexOf(query, from);
    if (index < 0) break;
    result.push(index);
    from = index + Math.max(1, query.length);
  }
  return result;
};

const findExactRanges = (
  snapshot: ContentSnapshot,
  queryText: string,
): RawRange[] => {
  return findAllIndexes(snapshot.markdown, queryText).map((start) => ({
    start,
    end: start + queryText.length,
    confidence: 1,
  }));
};

const findNormalizedRanges = (
  snapshot: ContentSnapshot,
  queryText: string,
): RawRange[] => {
  const normalizedSource = normalizeWithMap(snapshot.markdown);
  const normalizedQuery = collapseWhitespace(queryText);
  if (!normalizedQuery) return [];

  const indexes = findAllIndexes(normalizedSource.normalized, normalizedQuery);
  return indexes.map((startInNormalized) => {
    const endInNormalized = startInNormalized + normalizedQuery.length;
    const start = normalizedSource.map[startInNormalized] ?? 0;
    const end =
      endInNormalized >= normalizedSource.map.length
        ? snapshot.markdown.length
        : normalizedSource.map[endInNormalized - 1] + 1;
    return {
      start,
      end,
      confidence: 0.95,
    };
  });
};

const toBigrams = (text: string): Set<string> => {
  const normalized = collapseWhitespace(text);
  const grams = new Set<string>();
  if (normalized.length < 2) {
    if (normalized.length === 1) grams.add(normalized);
    return grams;
  }
  for (let i = 0; i < normalized.length - 1; i += 1) {
    grams.add(normalized.slice(i, i + 2));
  }
  return grams;
};

const diceCoefficient = (a: string, b: string): number => {
  const gramsA = toBigrams(a);
  const gramsB = toBigrams(b);
  if (gramsA.size === 0 || gramsB.size === 0) return 0;
  let intersection = 0;
  gramsA.forEach((gram) => {
    if (gramsB.has(gram)) intersection += 1;
  });
  return (2 * intersection) / (gramsA.size + gramsB.size);
};

const buildParagraphRanges = (
  markdown: string,
): Array<{ start: number; end: number }> => {
  const ranges: Array<{ start: number; end: number }> = [];
  let start = 0;
  for (let i = 0; i < markdown.length; i += 1) {
    if (markdown[i] === "\n" && markdown[i + 1] === "\n") {
      ranges.push({ start, end: i });
      start = i + 2;
      i += 1;
    }
  }
  if (start <= markdown.length) {
    ranges.push({ start, end: markdown.length });
  }
  return ranges.filter((item) => item.end > item.start);
};

const findFuzzyRanges = (
  snapshot: ContentSnapshot,
  queryText: string,
): RawRange[] => {
  const ranges = buildParagraphRanges(snapshot.markdown);
  const normalizedQuery = collapseWhitespace(queryText);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const candidates: RawRange[] = [];
  ranges.forEach((range) => {
    const text = snapshot.markdown.slice(range.start, range.end);
    const normalizedText = collapseWhitespace(text);
    const dice = diceCoefficient(queryText, text);
    const tokenHitCount = queryTokens.filter((token) =>
      normalizedText.includes(token),
    ).length;
    const tokenScore =
      queryTokens.length > 0 ? tokenHitCount / queryTokens.length : 0;
    const score = Math.max(dice, tokenScore * 0.75);
    if (score < 0.2) return;
    candidates.push({
      start: range.start,
      end: range.end,
      confidence: Number(score.toFixed(4)),
    });
  });
  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates;
};

const scoreHint = (payload: {
  markdown: string;
  candidate: RawRange;
  beforeHint?: string;
  afterHint?: string;
}) => {
  const { markdown, candidate, beforeHint, afterHint } = payload;
  let extra = 0;
  const window = 200;
  if (beforeHint) {
    const beforeStart = Math.max(0, candidate.start - window);
    const beforeText = markdown.slice(beforeStart, candidate.start);
    if (beforeText.includes(beforeHint)) extra += 0.05;
  }
  if (afterHint) {
    const afterEnd = Math.min(markdown.length, candidate.end + window);
    const afterText = markdown.slice(candidate.end, afterEnd);
    if (afterText.includes(afterHint)) extra += 0.05;
  }
  return extra;
};

const buildExcerpt = (markdown: string, start: number, end: number) => {
  const radius = 40;
  const from = Math.max(0, start - radius);
  const to = Math.min(markdown.length, end + radius);
  return markdown.slice(from, to);
};

export const findContentRanges = (
  snapshot: ContentSnapshot,
  options: FindRangesOptions,
): RangeCandidate[] => {
  const {
    queryText,
    matchMode = "exact",
    occurrence,
    beforeHint,
    afterHint,
    maxCandidates = 10,
  } = options;

  if (!queryText?.trim()) {
    return [];
  }

  let rawRanges: RawRange[] = [];
  if (matchMode === "exact") {
    rawRanges = findExactRanges(snapshot, queryText);
  } else if (matchMode === "normalized") {
    rawRanges = findNormalizedRanges(snapshot, queryText);
  } else {
    rawRanges = findFuzzyRanges(snapshot, queryText);
  }

  if (rawRanges.length === 0) return [];

  const scored = rawRanges.map((candidate) => ({
    ...candidate,
    confidence: Number(
      Math.min(
        1,
        candidate.confidence +
          scoreHint({
            markdown: snapshot.markdown,
            candidate,
            beforeHint,
            afterHint,
          }),
      ).toFixed(4),
    ),
  }));

  const byDocumentOrder = [...scored].sort((a, b) => a.start - b.start);
  let selected = [...scored];
  if (typeof occurrence === "number" && occurrence > 0) {
    const picked = byDocumentOrder[occurrence - 1];
    selected = picked ? [picked] : [];
  } else {
    selected.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return a.start - b.start;
    });
    selected = selected.slice(0, Math.max(1, maxCandidates));
  }

  const candidates = selected.map((candidate, index) => ({
    matchId: `match_${snapshot.id}_${index}_${candidate.start}_${candidate.end}`,
    snapshotId: snapshot.id,
    start: candidate.start,
    end: candidate.end,
    excerpt: buildExcerpt(snapshot.markdown, candidate.start, candidate.end),
    confidence: candidate.confidence,
  }));

  registerRangeCandidates(candidates);
  return candidates;
};
