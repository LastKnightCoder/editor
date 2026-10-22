/**
 * 首页面板布局（D-182）：内置与插件面板同一注册表，布局是有序的面板 ID 列表。
 * 保存过的顺序在前（暂时没注册的面板也保留位置，插件重新启用后回到原处），
 * 没保存过的面板按默认顺序追加在末尾。
 */

import type { ComponentType } from "react";
import type { HomeLayoutEntry } from "@/types/home-layout";

/** compact：有最小宽度、可伸展，按可用宽度一行排一到多个；wide：占整行 */
export type HomePanelSize = "compact" | "wide";

export interface HomePanelDefinition {
  id: string;
  /** 「显示已隐藏的面板」里显示的名称 */
  title: string;
  size: HomePanelSize;
  /** 没有内容时返回 null，整块不显示 */
  component: ComponentType;
}

export function mergeLayout(
  defaults: readonly string[],
  saved: readonly HomeLayoutEntry[]
): HomeLayoutEntry[] {
  const known = new Set(saved.map(entry => entry.id));
  return [...saved, ...defaults.filter(id => !known.has(id)).map(id => ({ id, hidden: false }))];
}

export function arrangePanels(
  panels: readonly HomePanelDefinition[],
  saved: readonly HomeLayoutEntry[]
): { shown: HomePanelDefinition[]; hidden: HomePanelDefinition[] } {
  const byId = new Map(panels.map(panel => [panel.id, panel]));
  const shown: HomePanelDefinition[] = [];
  const hidden: HomePanelDefinition[] = [];
  for (const entry of mergeLayout(
    panels.map(panel => panel.id),
    saved
  )) {
    const panel = byId.get(entry.id);
    if (panel) (entry.hidden ? hidden : shown).push(panel);
  }
  return { shown, hidden };
}

/** 把 id 移到 neighbor 之前或之后；neighbor 由调用方取当前显示出来的相邻面板 */
export function movePanel(
  layout: readonly HomeLayoutEntry[],
  id: string,
  neighbor: string,
  where: "before" | "after"
): HomeLayoutEntry[] {
  const moving = layout.find(entry => entry.id === id);
  if (!moving || id === neighbor) return [...layout];
  const rest = layout.filter(entry => entry.id !== id);
  const index = rest.findIndex(entry => entry.id === neighbor);
  if (index < 0) return [...layout];
  rest.splice(where === "before" ? index : index + 1, 0, moving);
  return rest;
}

export function setPanelHidden(
  layout: readonly HomeLayoutEntry[],
  id: string,
  hidden: boolean
): HomeLayoutEntry[] {
  return layout.map(entry => (entry.id === id ? { ...entry, hidden } : entry));
}
