import { SearchCoreConfig } from "./types";

export function blendScore(params: {
  rrfScore: number;
  config: SearchCoreConfig;
  structureLevel?: "resource" | "summary" | "section" | "chapter" | "passage";
}): number {
  const { rrfScore, config, structureLevel } = params;
  if (structureLevel === "section") {
    return rrfScore + config.structureBonus.section;
  }
  if (structureLevel === "chapter") {
    return rrfScore + config.structureBonus.chapter;
  }
  if (structureLevel === "summary") {
    return rrfScore + config.structureBonus.summary;
  }
  return rrfScore;
}
