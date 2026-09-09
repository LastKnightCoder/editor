// React 侧页面注册表：key → PageDefinition（含组件）。
// 页面定义文件（*.page.tsx）经 Vite glob 收集后统一注册。

import type { PageDefinition } from "./definePage";

const pageDefinitionMap = new Map<string, PageDefinition>();

export function registerPageDefinition(definition: PageDefinition): void {
  pageDefinitionMap.set(definition.meta.key, definition);
}

export function getPageDefinition(key: string): PageDefinition | undefined {
  return pageDefinitionMap.get(key);
}

export function listPageDefinitions(): PageDefinition[] {
  return [...pageDefinitionMap.values()];
}

export function clearPageDefinitionsForTest(): void {
  pageDefinitionMap.clear();
}
