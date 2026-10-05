import { invoke } from "@/electron";
import type { KnowledgeMap, KnowledgeMapItem } from "@/knowledge-map/types";
import { withModule } from "./module-init";

export type KnowledgeMapStatus = "missing" | "stale" | "ready" | "building";

export interface KnowledgeMapPayload {
  status: KnowledgeMapStatus;
  map: KnowledgeMap | null;
  /** 节点的展示信息；地图还没算出来时也有，渲染层据此先画链接图谱 */
  items: KnowledgeMapItem[];
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
