import { ParsedQuery, SearchCandidate } from "./types";

export function normalizeCandidateList<TPayload extends object>(
  candidates: SearchCandidate<TPayload>[]
): SearchCandidate<TPayload>[] {
  const orderedUnique = new Map<string, SearchCandidate<TPayload>>();
  for (const candidate of candidates) {
    const dedupeKey = candidate.dedupeKey?.trim();
    if (!dedupeKey) continue;
    if (!orderedUnique.has(dedupeKey)) {
      orderedUnique.set(dedupeKey, {
        ...candidate,
        key: candidate.key || dedupeKey,
      });
    }
  }
  return Array.from(orderedUnique.values());
}

export function calculateLexicalScore(query: ParsedQuery, text: string): number {
  const normalizedText = text.trim().toLowerCase();
  if (!normalizedText || query.isEmpty) {
    return 0;
  }

  const normalizedQuery = query.normalized.toLowerCase();
  if (normalizedQuery && normalizedText.includes(normalizedQuery)) {
    return 1;
  }

  if (query.tokens.length === 0) {
    return 0;
  }

  let overlapCount = 0;
  for (const token of query.tokens) {
    if (token.length <= 1) continue;
    if (normalizedText.includes(token)) {
      overlapCount += 1;
    }
  }

  if (overlapCount === 0) {
    return 0;
  }

  const ratio = overlapCount / Math.max(1, query.tokens.length);
  return Math.min(0.95, ratio);
}

export function ensureScoreInRange(score: number | undefined): number | undefined {
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return undefined;
  }
  if (score < 0) return 0;
  if (score > 1) return 1;
  return score;
}
