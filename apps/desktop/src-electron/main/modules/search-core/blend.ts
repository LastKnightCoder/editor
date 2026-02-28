import { SearchCoreConfig } from "./types";

export function resolvePositionWeight(
  rank: number,
  config: SearchCoreConfig,
): number {
  if (rank <= 3) {
    return config.blendWeights.top1To3;
  }
  if (rank <= 10) {
    return config.blendWeights.top4To10;
  }
  return config.blendWeights.top11Plus;
}

export function normalizeRerankScores(rawScores: number[]): number[] {
  if (rawScores.length === 0) {
    return [];
  }

  const finiteScores = rawScores.map((score) =>
    Number.isFinite(score) ? score : 0,
  );

  const minScore = Math.min(...finiteScores);
  const maxScore = Math.max(...finiteScores);

  if (minScore >= 0 && maxScore <= 1) {
    return finiteScores;
  }

  return finiteScores.map((score) => 1 / (1 + Math.exp(-score)));
}

export function blendScore(params: {
  rank: number;
  rrfScore: number;
  rerankScore?: number;
  config: SearchCoreConfig;
}): number {
  const { rank, rrfScore, rerankScore, config } = params;
  if (typeof rerankScore !== "number" || !Number.isFinite(rerankScore)) {
    return rrfScore;
  }

  const weight = resolvePositionWeight(rank, config);
  const positionScore = 1 / rank;
  return weight * positionScore + (1 - weight) * rerankScore;
}
