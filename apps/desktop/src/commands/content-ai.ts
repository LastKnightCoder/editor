import { invoke } from "@/electron";
import type { ContentAiStatus } from "@/types/content-ai";
import { withModule } from "./module-init";

/** 设置页「笔记元信息」进度；当前库未连接时为 null */
export function getContentAiStatus() {
  return withModule("content-ai-queue", () => invoke<ContentAiStatus | null>("content-ai:status"));
}
