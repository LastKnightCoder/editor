import { ModuleGroup } from "./types";
import { MODULE_CONFIGS } from "./module-config";

/**
 * 窗口类型
 */
export type WindowType =
  | "main"
  | "markdown"
  | "editor"
  | "todo"
  | "pomodoro"
  | "pomodoro-mini"
  | "pomodoro-immersive"
  | "quick-card";

/**
 * 窗口类型到需要的模块组的映射
 */
export const WINDOW_MODULE_GROUPS: Record<WindowType, ModuleGroup[]> = {
  // 主窗口需要所有模块
  main: [
    ModuleGroup.ESSENTIAL,
    ModuleGroup.CORE,
    ModuleGroup.DATABASE,
    ModuleGroup.SERVER,
    ModuleGroup.RENDER,
    ModuleGroup.CACHE,
    ModuleGroup.CLOUD,
    ModuleGroup.AI,
    ModuleGroup.INTEGRATION,
    ModuleGroup.FEATURE,
  ],

  // Markdown 编辑器只需要基本模块（不需要数据库）
  markdown: [ModuleGroup.ESSENTIAL, ModuleGroup.CORE],

  // 内容编辑窗口（卡片 / 文章 / 项目文档）
  editor: [
    ModuleGroup.ESSENTIAL,
    ModuleGroup.CORE,
    ModuleGroup.DATABASE,
    ModuleGroup.SERVER,
    ModuleGroup.RENDER,
    ModuleGroup.CACHE,
    ModuleGroup.AI,
  ],

  // 任务清单窗口
  todo: [
    ModuleGroup.ESSENTIAL,
    ModuleGroup.CORE,
    ModuleGroup.DATABASE,
    ModuleGroup.SERVER,
    ModuleGroup.FEATURE,
  ],

  // 番茄专注窗口
  pomodoro: [
    ModuleGroup.ESSENTIAL,
    ModuleGroup.CORE,
    ModuleGroup.DATABASE,
    ModuleGroup.SERVER,
    ModuleGroup.FEATURE,
  ],

  // 番茄小窗
  "pomodoro-mini": [ModuleGroup.ESSENTIAL, ModuleGroup.CORE, ModuleGroup.SERVER],

  // 番茄沉浸模式
  "pomodoro-immersive": [ModuleGroup.ESSENTIAL, ModuleGroup.CORE, ModuleGroup.SERVER],

  // 快速卡片窗口
  "quick-card": [ModuleGroup.ESSENTIAL, ModuleGroup.CORE, ModuleGroup.DATABASE, ModuleGroup.SERVER],
};

/**
 * 获取窗口类型需要的模块组列表
 */
export function getRequiredGroupsForWindow(windowType: WindowType): ModuleGroup[] {
  return WINDOW_MODULE_GROUPS[windowType] || WINDOW_MODULE_GROUPS.main;
}

/**
 * 获取窗口类型需要的模块名称列表
 */
export function getRequiredModulesForWindow(windowType: WindowType): string[] {
  const requiredGroups = getRequiredGroupsForWindow(windowType);

  return MODULE_CONFIGS.filter(config => requiredGroups.includes(config.group)).map(
    config => config.name
  );
}

/**
 * 检查窗口类型是否需要数据库
 */
export function windowNeedsDatabase(windowType: WindowType): boolean {
  const groups = getRequiredGroupsForWindow(windowType);
  return groups.includes(ModuleGroup.DATABASE);
}

/**
 * 检查窗口类型是否可以跳过加载等待
 * Markdown 编辑器不需要等待任何模块
 */
export function canSkipLoading(windowType: WindowType): boolean {
  return windowType === "markdown";
}
