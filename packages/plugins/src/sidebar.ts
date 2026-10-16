import type { Disposable } from "./contract";
import type { PluginPageHandle, PluginPageParams } from "./pages";

export const SIDEBAR_GROUPS = Object.freeze({
  daily: "daily",
  knowledge: "knowledge",
  learning: "learning",
  ai: "ai",
  sharing: "sharing",
  plugins: "plugins",
} as const);

export interface PluginSidebarGroupDefinition {
  id: string;
  title: string;
}

export interface PluginSidebarGroupHandle extends Disposable {
  readonly id: string;
}

export interface PluginSidebarItemDefinition {
  id: string;
  title: string;
  /** 缺省或分组不存在时归入默认插件分组。 */
  group?: string;
  page: PluginPageHandle;
  params?: PluginPageParams;
}

export interface PluginSidebar {
  registerGroup(definition: PluginSidebarGroupDefinition): PluginSidebarGroupHandle;
  registerItem(definition: PluginSidebarItemDefinition): Disposable;
}
