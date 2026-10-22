import type { ComponentType } from "react";
import type { Disposable, PluginContext } from "./contract";

/** 详情区块可以挂在哪类对象的详情里；document 为项目文档 */
export type PluginEntityPanelKind = "card" | "article" | "document";

/** 详情区块收到的对象：只是引用，读标题、正文仍按现有权限 */
export type PluginEntityPanelTarget = {
  [K in PluginEntityPanelKind]: { kind: K; id: string };
}[PluginEntityPanelKind];

export interface PluginEntityPanelProps {
  readonly context: PluginContext;
  readonly target: PluginEntityPanelTarget;
}

export interface PluginEntityPanelDefinition {
  id: string;
  kinds: readonly PluginEntityPanelKind[];
  /** 渲染在详情正文上方；返回 null 时不占位。外框与标题由插件决定，宜小而轻 */
  component: ComponentType<PluginEntityPanelProps>;
}

export interface PluginViews {
  /** 只在主窗口的详情页出现，独立编辑窗口不显示 */
  registerEntityPanel(definition: PluginEntityPanelDefinition): Disposable;
}

export const PLUGIN_ENTITY_PANEL_KINDS: readonly PluginEntityPanelKind[] = Object.freeze([
  "card",
  "article",
  "document",
]);
