import { invoke, off, on } from "@/electron";
import type { EntityRef } from "@/entity/ref";
import type {
  ContentInsights,
  ContentInsightsPhase,
  InsightStatus,
} from "@/types/content-insights";
import { withModule } from "./module-init";

/** 已有的 AI 洞见；没分析过为 null */
export function getContentInsights(ref: EntityRef) {
  return withModule("content-insights", () =>
    invoke<ContentInsights | null>("content-insights:get", ref)
  );
}

/** 分析一次（同一篇同时只跑一次，重复调用拿到同一个结果）；seed 为一定进入候选的实体 */
export function analyzeContentInsights(ref: EntityRef, seed: EntityRef[] = []) {
  return withModule("content-insights", () =>
    invoke<ContentInsights>("content-insights:analyze", ref, { seed })
  );
}

export function cancelContentInsights(ref: EntityRef) {
  return withModule("content-insights", () => invoke<boolean>("content-insights:cancel", ref));
}

export function setContentInsightStatus(contentId: number, itemId: string, status: InsightStatus) {
  return withModule("content-insights", () =>
    invoke<boolean>("content-insights:set-status", { contentId, itemId, status })
  );
}

/** 分析过程的阶段（本地候选数、模型判断中）；返回取消订阅 */
export function onContentInsightsPhase(listener: (phase: ContentInsightsPhase) => void) {
  const handler = (_event: unknown, phase: ContentInsightsPhase) => listener(phase);
  on("content-insights:phase", handler);
  return () => off("content-insights:phase", handler);
}
