import { RrfCandidate, SearchCandidate } from "./types";

export interface RrfOptions {
  k: number;
  topBonus: {
    top1: number;
    top2To3: number;
  };
}

export function reciprocalRankFusion<TPayload extends object>(
  rankedLists: SearchCandidate<TPayload>[][],
  weights: number[],
  options: RrfOptions,
): RrfCandidate<TPayload>[] {
  const scoreMap = new Map<
    string,
    { candidate: SearchCandidate<TPayload>; rrfScore: number; topRank: number }
  >();

  for (let listIndex = 0; listIndex < rankedLists.length; listIndex += 1) {
    const rankedList = rankedLists[listIndex];
    const weight = weights[listIndex] ?? 1;
    for (let rank = 0; rank < rankedList.length; rank += 1) {
      const candidate = rankedList[rank];
      const fusionKey = candidate.dedupeKey;
      if (!fusionKey) continue;
      const contribution = weight / (options.k + rank + 1);
      const existing = scoreMap.get(fusionKey);

      if (existing) {
        existing.rrfScore += contribution;
        existing.topRank = Math.min(existing.topRank, rank);
        if (candidate.text.length > existing.candidate.text.length) {
          existing.candidate = {
            ...candidate,
            key: fusionKey,
          };
        }
      } else {
        scoreMap.set(fusionKey, {
          candidate: {
            ...candidate,
            key: fusionKey,
          },
          rrfScore: contribution,
          topRank: rank,
        });
      }
    }
  }

  const ranked = Array.from(scoreMap.values());
  for (const entry of ranked) {
    if (entry.topRank === 0) {
      entry.rrfScore += options.topBonus.top1;
    } else if (entry.topRank <= 2) {
      entry.rrfScore += options.topBonus.top2To3;
    }
  }

  return ranked
    .sort((left, right) => right.rrfScore - left.rrfScore)
    .map((entry) => ({
      ...entry.candidate,
      key: entry.candidate.dedupeKey,
      rrfScore: entry.rrfScore,
      topRank: entry.topRank,
    }));
}
