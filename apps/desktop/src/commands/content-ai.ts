import { invoke } from "@/electron";
import type { ContentAiStatus } from "@/types/content-ai";
import { withModule } from "./module-init";

/** 设置页「笔记元信息」进度；当前库未连接时为 null */
export function getContentAiStatus() {
  return withModule("content-ai-queue", () => invoke<ContentAiStatus | null>("content-ai:status"));
}

/** 一批卡片正文的 AI 标题（只含已有 AI 标题的），键为 contentId */
export function getContentAiTitles(contentIds: number[]) {
  return withModule("content-ai-queue", () =>
    invoke<Record<string, string>>("content-ai:titles", contentIds)
  );
}
