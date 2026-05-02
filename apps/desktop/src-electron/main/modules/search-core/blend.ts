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
  structureLevel?: "resource" | "summary" | "section" | "chapter" | "passage";
}): number {
  const { rank, rrfScore, rerankScore, config, structureLevel } = params;
  if (typeof rerankScore !== "number" || !Number.isFinite(rerankScore)) {
    return applyStructureBonus(rrfScore, structureLevel, config);
  }

  const weight = resolvePositionWeight(rank, config);
  const positionScore = 1 / rank;
  const baseScore = weight * positionScore + (1 - weight) * rerankScore;
  return applyStructureBonus(baseScore, structureLevel, config);
}

function applyStructureBonus(
  score: number,
  structureLevel:
    | "resource"
    | "summary"
    | "section"
    | "chapter"
    | "passage"
    | undefined,
  config: SearchCoreConfig,
) {
  if (structureLevel === "section") {
    return score + config.structureBonus.section;
  }
  if (structureLevel === "chapter") {
    return score + config.structureBonus.chapter;
  }
  if (structureLevel === "summary") {
    return score + config.structureBonus.summary;
  }
  return score;
}
