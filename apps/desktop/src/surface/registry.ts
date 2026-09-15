/**
 * React 侧组件注册表 —— 双注册表的第二半（meta 在 core/surfaceMeta.ts）。
 * 与移动端 registry.ts 同构：import "./surfaces" 触发副作用完成全部注册。
 */

import type { SurfaceDefinition } from "./defineSurface";

const definitions = new Map<string, SurfaceDefinition>();

export function registerSurfaceDefinition(definition: SurfaceDefinition): void {
  // 与 surfaceMeta 注册表同一策略：dev 覆盖告警（HMR）、prod 抛错（真冲突）
  if (definitions.has(definition.key)) {
    if (import.meta.env.DEV) {
      console.warn(`[surface] 重复注册组件（HMR 重载？）覆盖：${definition.key}`);
    } else {
      throw new Error(`[surface] 重复注册组件：${definition.key}`);
    }
  }
  definitions.set(definition.key, definition);
}

export function getSurfaceDefinition(key: string): SurfaceDefinition | undefined {
  return definitions.get(key);
}

export function listSurfaceDefinitions(): SurfaceDefinition[] {
  return [...definitions.values()];
}
