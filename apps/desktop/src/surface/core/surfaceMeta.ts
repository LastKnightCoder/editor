/**
 * Surface 元数据注册表（纯数据，无 React）—— 从移动端 router/core/pageMeta.ts 移植。
 *
 * 双注册表的第一半：defineSurface 在此登记身份/行为（栈机、序列化层可独立查询），
 * React 组件注册在 registry.ts（第二半）。分离是为了让导航核心可脱离 React 单测。
 */

import type { ParamFields } from "./paramsSchema";

export type SurfaceKind = "page" | "dialog" | "drawer";
export type MatchPolicy = "single" | "params" | "multi";
export type KeepAlivePolicy = "keep" | "data";
export type SurfaceStatus = "new" | "migrating" | "legacy";

export interface SurfaceMeta {
  key: string;
  kind: SurfaceKind;
  match: MatchPolicy;
  getId?: (params: Record<string, unknown>) => string;
  keepAlive: KeepAlivePolicy;
  label: string;
  status: SurfaceStatus;
  fields: ParamFields;
}

const metas = new Map<string, SurfaceMeta>();

export function registerSurfaceMeta(meta: SurfaceMeta): void {
  if (metas.has(meta.key)) {
    // dev 下 Vite HMR 会重新执行 surface 文件，重复注册按覆盖处理；真冲突留给 prod 抛错兜底
    if (import.meta.env.DEV) {
      console.warn(`[surface] 重复注册（HMR 重载？）覆盖：${meta.key}`);
    } else {
      throw new Error(`[surface] 重复注册：${meta.key}`);
    }
  }
  metas.set(meta.key, meta);
}

export function getSurfaceMeta(key: string): SurfaceMeta | undefined {
  return metas.get(key);
}

export function listSurfaceMetas(): SurfaceMeta[] {
  return [...metas.values()];
}
