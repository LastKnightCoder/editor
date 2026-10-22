import type { Disposable } from "./contract";
import type { PluginIcon } from "./icons";

/** 对象动作可以挂在哪类对象上；document 为项目文档 */
export type PluginActionTargetKind = "card" | "article" | "document";

/** 动作收到的对象：与 PluginEntityRef 相同 */
export interface PluginActionTarget {
  kind: PluginActionTargetKind;
  id: string;
}

export interface PluginActionDefinition {
  id: string;
  /** 菜单里显示的名称 */
  title: string;
  /** 缺省使用插件图标 */
  icon?: PluginIcon;
  targets: readonly PluginActionTargetKind[];
  /**
   * 用户在对象的「⋯」菜单里点击时调用。这个对象之后与 pick 选中的一样，
   * 不需要读取权限就能读标题、显示与关联；读正文仍按权限。
   */
  run(target: PluginActionTarget): unknown;
}

export interface PluginActions {
  /** 只在主窗口的菜单里出现，独立编辑窗口不列插件动作 */
  register(definition: PluginActionDefinition): Disposable;
}

export const PLUGIN_ACTION_TARGET_KINDS: readonly PluginActionTargetKind[] = Object.freeze([
  "card",
  "article",
  "document",
]);
