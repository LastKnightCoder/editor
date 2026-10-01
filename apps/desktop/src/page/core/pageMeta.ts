/**
 * Page 元数据注册表（纯数据，无 React）—— 从移动端 router/core/pageMeta.ts 移植。
 *
 * 双注册表的第一半：definePage 在此登记身份/行为（栈机、序列化层可独立查询），
 * React 组件注册在 registry.ts（第二半）。分离是为了让导航核心可脱离 React 单测。
 */

import type { ParamFields } from "./paramsSchema";

export type MatchPolicy = "single" | "params" | "multi";

export interface PageMeta {
  key: string;
  match: MatchPolicy;
  getId?: (params: Record<string, unknown>) => string;
  label: string;
  fields: ParamFields;
}

const metas = new Map<string, PageMeta>();

export function registerPageMeta(meta: PageMeta): void {
  if (metas.has(meta.key)) {
    // dev 下 Vite HMR 会重新执行 page 文件，重复注册按覆盖处理；真冲突留给 prod 抛错兜底
    if (import.meta.env.DEV) {
      console.warn(`[page] 重复注册（HMR 重载？）覆盖：${meta.key}`);
    } else {
      throw new Error(`[page] 重复注册：${meta.key}`);
    }
  }
  metas.set(meta.key, meta);
}

export function getPageMeta(key: string): PageMeta | undefined {
  return metas.get(key);
}

export function listPageMetas(): PageMeta[] {
  return [...metas.values()];
}
