/**
 * React 侧组件注册表 —— 双注册表的第二半（meta 在 core/pageMeta.ts）。
 * 与移动端 registry.ts 同构：import "./pages" 触发副作用完成全部注册。
 */

import type { PageDefinition } from "./definePage";

const definitions = new Map<string, PageDefinition>();

export function registerPageDefinition(definition: PageDefinition): void {
  // 与 pageMeta 注册表同一策略：dev 覆盖告警（HMR）、prod 抛错（真冲突）
  if (definitions.has(definition.key)) {
    if (import.meta.env.DEV) {
      console.warn(`[page] 重复注册组件（HMR 重载？）覆盖：${definition.key}`);
    } else {
      throw new Error(`[page] 重复注册组件：${definition.key}`);
    }
  }
  definitions.set(definition.key, definition);
}

export function getPageDefinition(key: string): PageDefinition | undefined {
  return definitions.get(key);
}

export function listPageDefinitions(): PageDefinition[] {
  return [...definitions.values()];
}
