// 页面元数据注册表：纯数据（无 React 依赖），供栈机与序列化层查询。
// definePage 声明的元信息最终注册到这里；组件等 React 部分在 L2/L3 侧。
// 类型推导（params schema → 参数类型）在 definePage 层完成，此处存放擦除泛型后的元数据。

import type { ParamFields } from "./paramsSchema";

export type PageLayer = "screen" | "overlay";
export type MatchPolicy = "single" | "params" | "multi";
/**
 * keep：Activity 保活（state+DOM 保留，effect 自动停止）
 * data：非激活即卸载内容，数据留在 query 缓存（重激活缓存秒显 + 后台刷新）；
 *       “每次全新”由页面 data 声明 staleTime: 0 / refetchOnResume: "always" 表达
 */
export type KeepAlivePolicy = "keep" | "data";
export type TransitionPreset = "slideRight" | "sheetUp" | "none";

export type TransitionConfig = {
  preset: TransitionPreset;
  enterMs: number;
  exitMs: number;
};

export type PageMeta = {
  key: string;
  layer: PageLayer;
  match: MatchPolicy;
  /** match === "params" 时以参数派生页面身份（如 contentId），同身份复用已有实例 */
  getId?: (params: Record<string, unknown>) => string;
  keepAlive: KeepAlivePolicy;
  transition: TransitionConfig;
  paramsSchema: ParamFields;
};

const pageMetaMap = new Map<string, PageMeta>();

export function registerPageMeta(meta: PageMeta): void {
  pageMetaMap.set(meta.key, meta);
}

export function getPageMeta(key: string): PageMeta | undefined {
  return pageMetaMap.get(key);
}

export function listPageMetas(): PageMeta[] {
  return [...pageMetaMap.values()];
}

export function clearPageMetasForTest(): void {
  pageMetaMap.clear();
}

/** 推导页面实例身份：single 用 key，params 用 getId，multi 用实例 id */
export function resolveEntryIdentity(meta: PageMeta, params: Record<string, unknown>): string {
  if (meta.match === "single") return meta.key;
  if (meta.match === "params" && meta.getId) {
    return `${meta.key}::${meta.getId(params)}`;
  }
  return "";
}
