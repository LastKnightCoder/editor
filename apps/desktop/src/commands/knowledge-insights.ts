import { invoke, off, on } from "@/electron";
import type { InsightStatus } from "@/types/content-insights";
import type { KnowledgeInsightsPayload, KnowledgeInsightsPhase } from "@/types/knowledge-insights";
import { withModule } from "./module-init";

/** 已有的主题与全局层洞见（后台按变化量生成） */
export function getKnowledgeInsights() {
  return withModule("topic-insights", () =>
    invoke<KnowledgeInsightsPayload>("knowledge-insights:get")
  );
}

/** 立即分析：过时的主题先算，再写全局 */
export function analyzeKnowledgeInsights() {
  return withModule("topic-insights", () =>
    invoke<KnowledgeInsightsPayload>("knowledge-insights:analyze")
  );
}

export function cancelKnowledgeInsights() {
  return withModule("topic-insights", () => invoke<boolean>("knowledge-insights:cancel"));
}

export function setKnowledgeInsightStatus(id: number, itemId: string, status: InsightStatus) {
  return withModule("topic-insights", () =>
    invoke<boolean>("knowledge-insights:set-status", { id, itemId, status })
  );
}

/** 分析过程的阶段；返回取消订阅 */
export function onKnowledgeInsightsPhase(listener: (phase: KnowledgeInsightsPhase) => void) {
  const handler = (_event: unknown, phase: KnowledgeInsightsPhase) => listener(phase);
  on("knowledge-insights:phase", handler);
  return () => off("knowledge-insights:phase", handler);
}
