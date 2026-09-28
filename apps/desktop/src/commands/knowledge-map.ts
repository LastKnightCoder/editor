import { invoke } from "@/electron";
import type { KnowledgeMap } from "@/knowledge-map/types";
import { withModule } from "./module-init";

export type KnowledgeMapStatus = "missing" | "stale" | "ready" | "building";

export interface KnowledgeMapPayload {
  status: KnowledgeMapStatus;
  map: KnowledgeMap | null;
}

const call = <T>(channel: string, ...args: unknown[]) =>
  withModule("knowledge-map-builder", () => invoke<T>(channel, ...args));

/**
 * 读离线知识地图，并对账新增/删除的卡片。
 * 没有地图就同步算一次（真实库约 1 秒）；过时则先返回旧的、后台重算。
 */
export function getKnowledgeMap(options?: { rebuild?: boolean }) {
  return call<KnowledgeMapPayload>("knowledge-map:get", options);
}
